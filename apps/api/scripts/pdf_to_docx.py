#!/usr/bin/env python3
"""PDF -> DOCX conversion for the coDF API.

Runs as a short-lived subprocess so a crash or an out-of-memory kill inside
PyMuPDF takes down only this process, never the Node server.

Usage:
    pdf_to_docx.py --selfcheck
    pdf_to_docx.py <input.pdf> <output.docx> [--max-pages N]
"""

import argparse
import json
import sys


def _package_version(name: str) -> str:
    """Best-effort version lookup. pdf2docx exposes no __version__ attribute."""
    try:
        from importlib.metadata import version

        return version(name)
    except Exception:  # noqa: BLE001 - a missing version is not worth failing over
        return "unknown"


def selfcheck() -> int:
    """Imports the engine and prints its version. Used by the capability probe."""
    try:
        import fitz  # PyMuPDF, pulled in by pdf2docx
        import pdf2docx  # noqa: F401 - imported for the side effect of proving it loads
    except Exception as error:  # noqa: BLE001 - report any import failure verbatim
        print(f"pdf2docx unavailable: {error}", file=sys.stderr)
        return 1

    pymupdf_version = getattr(fitz, "__version__", None) or _package_version("PyMuPDF")
    print(f"pdf2docx {_package_version('pdf2docx')} (PyMuPDF {pymupdf_version})")
    return 0


def convert(input_pdf: str, output_docx: str, max_pages: int) -> int:
    try:
        import fitz
        from pdf2docx import Converter
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"error": f"pdf2docx is not installed: {error}"}), file=sys.stderr)
        return 1

    try:
        with fitz.open(input_pdf) as document:
            if document.is_encrypted and not document.authenticate(""):
                print(
                    json.dumps({"error": "This PDF is password protected and cannot be converted."}),
                    file=sys.stderr,
                )
                return 2

            page_count = document.page_count

        if page_count == 0:
            print(json.dumps({"error": "The PDF contains no pages."}), file=sys.stderr)
            return 2

        # Page cap keeps peak memory inside the free instance's budget.
        if page_count > max_pages:
            print(
                json.dumps(
                    {
                        "error": (
                            f"This PDF has {page_count} pages; the limit is {max_pages}. "
                            "Split it into smaller files and try again."
                        )
                    }
                ),
                file=sys.stderr,
            )
            return 2
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"error": f"Unable to read the PDF: {error}"}), file=sys.stderr)
        return 2

    converter = None

    try:
        converter = Converter(input_pdf)
        # multi_processing stays off on purpose: extra worker processes are the
        # fastest route to an OOM kill on a small instance.
        converter.convert(output_docx, start=0, end=page_count, multi_processing=False)
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"error": f"Conversion failed: {error}"}), file=sys.stderr)
        return 1
    finally:
        if converter is not None:
            try:
                converter.close()
            except Exception:  # noqa: BLE001 - close errors are not actionable
                pass

    print(json.dumps({"ok": True, "pages": page_count}))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(add_help=True, description="Convert a PDF into a .docx file.")
    parser.add_argument("input", nargs="?", help="Path to the source PDF")
    parser.add_argument("output", nargs="?", help="Path for the generated .docx")
    parser.add_argument("--max-pages", type=int, default=60, help="Reject PDFs longer than this")
    parser.add_argument("--selfcheck", action="store_true", help="Verify the engine is importable")

    args = parser.parse_args()

    if args.selfcheck:
        return selfcheck()

    if not args.input or not args.output:
        parser.print_usage(sys.stderr)
        return 64

    return convert(args.input, args.output, args.max_pages)


if __name__ == "__main__":
    sys.exit(main())

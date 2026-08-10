#!/usr/bin/env python3
"""
Text extraction from PDFs, with OCR only where it is actually needed.

A PDF exported from Word or LaTeX already carries its text. Running OCR over
it would be slower *and* less accurate than simply reading it — OCR guesses at
glyphs the file already names exactly. So each page is read first, and only
pages that come back empty (scans, photos of pages, image-only exports) are
rendered and passed to Tesseract.

That distinction matters on a 512 MB instance: reading text costs nothing,
while rasterising and OCRing a page costs a second or two and a few hundred
megabytes.

Usage:
    extract_text.py <input.pdf> [--max-pages N] [--lang eng] [--force-ocr]
    extract_text.py --selfcheck

Writes JSON to stdout: { text, pages, ocrPages, textPages, characters }
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

# Below this many characters a page is treated as having no real text layer.
# A scanned page often still carries a stray header or page number, so zero is
# too strict a threshold.
MIN_PAGE_CHARS = 24

# Tesseract reads best around 300 dpi. PDF pages are described at 72 dpi, so
# this is the zoom applied when rasterising a page for OCR.
OCR_DPI = 300

# A hard ceiling on rasterised size. A large-format page at 300 dpi can exceed
# the memory budget on its own.
MAX_OCR_PIXELS = 40_000_000


def fail(message, code=2):
    print(json.dumps({"error": message}), file=sys.stderr)
    return code


def tesseract_path():
    return os.environ.get("TESSERACT_PATH") or shutil.which("tesseract")


def selfcheck():
    """Reports what this host can do, for the capability probe."""
    try:
        import pymupdf  # noqa: F401
    except Exception as error:  # noqa: BLE001
        print(f"PyMuPDF unavailable: {error}", file=sys.stderr)
        return 1

    binary = tesseract_path()

    if not binary:
        print("tesseract not found", file=sys.stderr)
        return 1

    try:
        version = subprocess.run(
            [binary, "--version"], capture_output=True, text=True, timeout=20, check=True
        ).stdout.splitlines()[0]
    except Exception as error:  # noqa: BLE001
        print(f"tesseract not runnable: {error}", file=sys.stderr)
        return 1

    print(version.strip())
    return 0


def run_tesseract(image_path, lang, psm):
    """Runs Tesseract over one image and returns its text."""
    binary = tesseract_path()
    if not binary:
        raise RuntimeError("tesseract is not installed")

    result = subprocess.run(
        [
            binary,
            image_path,
            "stdout",
            "-l",
            lang,
            "--psm",
            str(psm),
            # LSTM engine only: markedly better than the legacy matcher on the
            # photographed and screenshotted text people actually upload.
            "--oem",
            "1",
        ],
        capture_output=True,
        text=True,
        timeout=120,
        env={**os.environ, "OMP_THREAD_LIMIT": "1"},
    )

    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip()[:200] or "tesseract failed")

    return result.stdout


def tidy(text):
    """Collapses the ragged whitespace OCR tends to produce."""
    lines = [line.rstrip() for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n")]

    out = []
    blanks = 0

    for line in lines:
        if line.strip():
            out.append(line)
            blanks = 0
        else:
            blanks += 1
            # Keep paragraph breaks, drop the rest.
            if blanks == 1 and out:
                out.append("")

    while out and not out[-1].strip():
        out.pop()

    return "\n".join(out)


def extract(pdf_path, max_pages, lang, force_ocr, psm):
    import pymupdf

    try:
        document = pymupdf.open(pdf_path)
    except Exception as error:  # noqa: BLE001
        return None, fail(f"This file could not be opened as a PDF: {error}")

    with document:
        if document.needs_pass:
            return None, fail("This PDF is password protected. Remove the password and try again.")

        if document.page_count == 0:
            return None, fail("This PDF has no pages.")

        if max_pages and document.page_count > max_pages:
            return None, fail(
                f"This PDF has {document.page_count} pages; the limit is {max_pages}. "
                "Split it and extract the parts separately."
            )

        chunks = []
        ocr_pages = 0
        text_pages = 0

        for index in range(document.page_count):
            page = document[index]
            native = "" if force_ocr else page.get_text().strip()

            if len(native) >= MIN_PAGE_CHARS:
                chunks.append(native)
                text_pages += 1
                continue

            # No usable text layer — rasterise and read it.
            if not tesseract_path():
                # Without OCR available, keep whatever little text there was
                # rather than silently dropping the page.
                if native:
                    chunks.append(native)
                continue

            zoom = OCR_DPI / 72.0
            rect = page.rect

            if rect.width * rect.height * zoom * zoom > MAX_OCR_PIXELS:
                zoom = (MAX_OCR_PIXELS / (rect.width * rect.height)) ** 0.5

            pixmap = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), colorspace=pymupdf.csGRAY)

            with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as handle:
                temp_path = handle.name

            try:
                pixmap.save(temp_path)
                del pixmap
                chunks.append(run_tesseract(temp_path, lang, psm).strip())
                ocr_pages += 1
            except Exception as error:  # noqa: BLE001
                print(f"OCR failed on page {index + 1}: {error}", file=sys.stderr)
                if native:
                    chunks.append(native)
            finally:
                try:
                    os.unlink(temp_path)
                except OSError:
                    pass

        text = tidy("\n\n".join(chunk for chunk in chunks if chunk))

        return {
            "text": text,
            "pages": document.page_count,
            "textPages": text_pages,
            "ocrPages": ocr_pages,
            "characters": len(text),
        }, 0


def main():
    parser = argparse.ArgumentParser(description="Extract text from a PDF, using OCR where needed.")
    parser.add_argument("input", nargs="?")
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument("--lang", default="eng")
    parser.add_argument("--psm", type=int, default=3)
    parser.add_argument("--force-ocr", action="store_true")
    parser.add_argument("--selfcheck", action="store_true")

    args = parser.parse_args()

    if args.selfcheck:
        return selfcheck()

    if not args.input:
        parser.error("an input path is required")

    result, code = extract(args.input, args.max_pages, args.lang, args.force_ocr, args.psm)

    if result is None:
        return code

    if not result["text"]:
        return fail(
            "No text could be read from this PDF. If it is a scan, the pages may be too "
            "blurred or low-contrast to recognise."
        )

    json.dump(result, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())

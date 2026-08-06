#!/usr/bin/env python3
"""
PDF -> DOCX for text documents: resumes, reports, essays, cover letters.

Why this exists alongside pdf2docx
----------------------------------
pdf2docx reconstructs a page by absolutely positioning text frames, which is
the right call for forms and heavy tables. It falls apart on LaTeX output —
the format most student resumes are built in — because TeX positions each word
individually instead of emitting space characters, and pdf2docx's word handling
drops them. A resume comes back reading "ComputerScienceundergraduate".

PyMuPDF's structured extraction reconstructs those spaces correctly, and also
hands over the font weight, size, colour and geometry needed to rebuild the
document as *real* Word content: headings, paragraphs, bullet lists and tab
stops. The result is editable rather than a picture of a page, which is what
someone converting a resume actually wants.

Usage:
    pdf_to_docx_text.py <input.pdf> <output.docx> [--max-pages N]
    pdf_to_docx_text.py --selfcheck
"""

import argparse
import json
import sys

# Flags reported per span by PyMuPDF.
FLAG_SUPERSCRIPT = 1
FLAG_ITALIC = 2
FLAG_SERIF = 4
FLAG_MONOSPACE = 8
FLAG_BOLD = 16

# Font families that exist on every Word install, chosen per detected class so
# the document stays editable rather than depending on the PDF's embedded
# subsets (which are usually not installable anyway).
FONT_SERIF = "Times New Roman"
FONT_SANS = "Calibri"
FONT_MONO = "Consolas"

BULLET_CHARS = ("•", "●", "▪", "‣", "⁃", "·", "-", "–")

# Two lines belong to the same visual row when their vertical centres are
# within this fraction of the taller line's height.
ROW_TOLERANCE = 0.6

# A horizontal gap wider than this (in points) separates columns on one row —
# the "Job Title .......... 2023-2027" pattern.
COLUMN_GAP = 24.0

# A rule drawn within this distance below a line marks it as a section heading,
# which is how most resume templates delineate sections.
RULE_PROXIMITY = 10.0


def _package_version(name: str) -> str:
    try:
        from importlib.metadata import version

        return version(name)
    except Exception:  # noqa: BLE001
        return "unknown"


def selfcheck() -> int:
    """Imports the engine and prints its version, for the capability probe."""
    try:
        import fitz
        import docx  # noqa: F401
    except Exception as error:  # noqa: BLE001
        print(f"text extractor unavailable: {error}", file=sys.stderr)
        return 1

    pymupdf = getattr(fitz, "__version__", None) or _package_version("PyMuPDF")
    print(f"native text extractor (PyMuPDF {pymupdf}, python-docx {_package_version('python-docx')})")
    return 0


def fail(message: str) -> int:
    """Reports a user-facing reason on stderr as JSON; exit 2 means 'their input'."""
    print(json.dumps({"error": message}), file=sys.stderr)
    return 2


def span_style(span):
    """Normalises a PyMuPDF span into the styling Word needs."""
    flags = span.get("flags", 0)
    font = span.get("font", "")

    # The flags are reliable for TeX subsets; the name is the fallback for
    # producers that do not set them (many Word and Canva exports).
    lowered = font.lower()
    bold = bool(flags & FLAG_BOLD) or "bold" in lowered or "black" in lowered or "heavy" in lowered
    italic = bool(flags & FLAG_ITALIC) or "italic" in lowered or "oblique" in lowered

    if flags & FLAG_MONOSPACE:
        family = FONT_MONO
    elif flags & FLAG_SERIF:
        family = FONT_SERIF
    else:
        family = FONT_SANS

    colour = span.get("color", 0)
    return {
        "bold": bold,
        "italic": italic,
        "family": family,
        "size": round(span.get("size", 10.0), 1),
        "color": (colour >> 16 & 255, colour >> 8 & 255, colour & 255),
        "superscript": bool(flags & FLAG_SUPERSCRIPT),
    }


def collect_images(page):
    """
    Pulls embedded raster images out with their position.

    A text-only rebuild silently drops photos, logos and figures, which is a
    surprising way to lose content from a report or a resume with a headshot.
    """
    images = []

    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 1:
            continue

        data = block.get("image")
        if not data:
            continue

        bbox = block["bbox"]
        images.append(
            {
                "data": data,
                "bbox": bbox,
                "y0": bbox[1],
                "width": max(bbox[2] - bbox[0], 1.0),
                "ext": block.get("ext", "png"),
            }
        )

    return images


def collect_lines(page):
    """Flattens a page into lines of styled text, dropping empties."""
    lines = []

    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue

        for line in block.get("lines", []):
            spans = [s for s in line.get("spans", []) if s.get("text")]
            if not spans or not "".join(s["text"] for s in spans).strip():
                continue

            lines.append(
                {
                    "bbox": line["bbox"],
                    "spans": spans,
                    "block": block["number"],
                }
            )

    lines.sort(key=lambda item: (round(item["bbox"][1], 1), item["bbox"][0]))
    return lines


def group_rows(lines):
    """Groups lines sharing a baseline into one visual row."""
    rows = []

    for line in lines:
        y0, y1 = line["bbox"][1], line["bbox"][3]
        centre = (y0 + y1) / 2
        height = max(y1 - y0, 1.0)

        placed = False
        for row in rows:
            if abs(row["centre"] - centre) <= height * ROW_TOLERANCE:
                row["lines"].append(line)
                row["centre"] = (row["centre"] * (len(row["lines"]) - 1) + centre) / len(row["lines"])
                row["y0"] = min(row["y0"], y0)
                row["y1"] = max(row["y1"], y1)
                placed = True
                break

        if not placed:
            rows.append({"centre": centre, "y0": y0, "y1": y1, "lines": [line]})

    for row in rows:
        row["lines"].sort(key=lambda item: item["bbox"][0])
        row["cells"] = split_columns(row["lines"])

    rows.sort(key=lambda row: row["y0"])
    return rows


def split_columns(lines):
    """Splits a row wherever a wide horizontal gap suggests separate columns."""
    cells = []
    current = []

    for line in lines:
        if current:
            previous_right = current[-1]["bbox"][2]
            if line["bbox"][0] - previous_right > COLUMN_GAP:
                cells.append(current)
                current = []
        current.append(line)

    if current:
        cells.append(current)

    return cells


def horizontal_rules(page):
    """Y positions of full-width horizontal rules (section underlines)."""
    rules = []
    page_width = page.rect.width

    for drawing in page.get_drawings():
        rect = drawing["rect"]
        if rect.height <= 2.0 and rect.width > page_width * 0.4:
            rules.append(rect.y0)

    return sorted(rules)


def cell_text(cell):
    return "".join(span["text"] for line in cell for span in line["spans"])


def is_bullet(text):
    stripped = text.lstrip()
    return stripped.startswith(BULLET_CHARS) and len(stripped) > 1


def strip_bullet(cell):
    """
    Removes the leading bullet glyph so Word can supply its own.

    The glyph and the space after it are usually separate spans (TeX sets the
    marker in a symbol font), so this has to keep eating leading whitespace
    across spans until real text starts. Stopping at the first span leaves the
    paragraph indented from Word's own bullet by a stray space.
    """
    found = False

    for line in cell:
        for span in line["spans"]:
            text = span["text"]

            if not found:
                stripped = text.lstrip()
                if not stripped:
                    span["text"] = ""
                    continue
                if stripped.startswith(BULLET_CHARS):
                    span["text"] = stripped[1:].lstrip()
                    found = True
                    if span["text"]:
                        return
                    continue
                return

            span["text"] = text.lstrip()
            if span["text"]:
                return


def join_wrapped(runs):
    """
    Rejoins a line that was wrapped in the PDF onto the one before it.

    A trailing hyphen gets no space after it. Most such breaks in real
    documents fall inside genuine compounds — "back-end", "problem-solving",
    "user-generated" — so keeping the hyphen and closing the gap is right far
    more often than not. It is wrong only where the typesetter hyphenated a
    single word ("algo-rithms"), and telling those apart needs a dictionary,
    which is not worth carrying to fix the rarer case.
    """
    tail = runs[-1]["text"]

    if tail.endswith("-"):
        return
    if not tail.endswith(" "):
        runs[-1]["text"] += " "


def merge_runs(cell):
    """Coalesces adjacent spans that share styling into single Word runs."""
    runs = []

    for index, line in enumerate(cell):
        if index > 0 and runs:
            join_wrapped(runs)

        for span in line["spans"]:
            style = span_style(span)
            text = span["text"]

            if runs and runs[-1]["style"] == style:
                runs[-1]["text"] += text
            else:
                runs.append({"text": text, "style": style})

    for run in runs:
        run["text"] = run["text"].replace(" ", " ")

    return [run for run in runs if run["text"]]


def looks_like_footer(row, page_rect, body_size):
    """Page numbers and running footers add noise to an editable document."""
    text = "".join(cell_text(cell) for cell in row["cells"]).strip()

    if not text:
        return True
    if row["y0"] < page_rect.height * 0.90:
        return False

    return len(text) <= 6 and any(character.isdigit() for character in text)


def body_font_size(rows):
    """Most common span size, used as the baseline for heading detection."""
    counts = {}

    for row in rows:
        for cell in row["cells"]:
            for line in cell:
                for span in line["spans"]:
                    size = round(span.get("size", 10.0), 1)
                    counts[size] = counts.get(size, 0) + len(span.get("text", ""))

    if not counts:
        return 10.0

    return max(counts.items(), key=lambda item: item[1])[0]


def add_bottom_border(paragraph, colour):
    """Draws a rule under a paragraph, the way a section heading is underlined."""
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn

    properties = paragraph._p.get_or_add_pPr()
    borders = OxmlElement("w:pBdr")
    bottom = OxmlElement("w:bottom")

    bottom.set(qn("w:val"), "single")
    bottom.set(qn("w:sz"), "6")  # eighths of a point
    bottom.set(qn("w:space"), "2")
    bottom.set(qn("w:color"), "%02X%02X%02X" % colour)

    borders.append(bottom)
    properties.append(borders)


def insert_image(doc, image, max_width_pt):
    """Places an extracted image inline, capped to the text column width."""
    import io

    from docx.shared import Pt

    try:
        width = Pt(min(image["width"], max_width_pt))
        doc.add_picture(io.BytesIO(image["data"]), width=width)
    except Exception:  # noqa: BLE001
        # An unsupported or corrupt embedded image should cost us that image,
        # not the whole conversion.
        pass


def build_document(doc, page, rows, rules, body_size, images=()):
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_TAB_ALIGNMENT
    from docx.shared import Pt, RGBColor

    page_rect = page.rect
    text_right = max((cell[-1]["bbox"][2] for row in rows for cell in row["cells"]), default=page_rect.width)
    text_left = min((cell[0]["bbox"][0] for row in rows for cell in row["cells"]), default=0.0)

    previous = None
    previous_row = None
    pending_images = sorted(images, key=lambda item: item["y0"])
    column_width = text_right - text_left

    for row in rows:
        # Emit any image that sits above this row, so figures keep their place
        # in the flow rather than all piling up at the end.
        while pending_images and pending_images[0]["y0"] <= row["y0"]:
            insert_image(doc, pending_images.pop(0), column_width)
            previous = None
            previous_row = None

        if looks_like_footer(row, page_rect, body_size):
            continue

        cells = row["cells"]
        first_text = cell_text(cells[0]).strip()
        if not first_text:
            continue

        max_size = max(
            (round(span.get("size", 10.0), 1) for cell in cells for line in cell for span in line["spans"]),
            default=body_size,
        )
        all_bold = all(
            span_style(span)["bold"]
            for cell in cells
            for line in cell
            for span in line["spans"]
            if span["text"].strip()
        )

        # A rule immediately below, or noticeably larger type, marks a heading.
        underlined = any(0 <= rule - row["y1"] <= RULE_PROXIMITY for rule in rules)
        heading = (underlined and all_bold) or max_size >= body_size * 1.35

        bullet = is_bullet(first_text)
        if bullet:
            strip_bullet(cells[0])

        style = "List Bullet" if bullet else None
        paragraph = doc.add_paragraph(style=style)
        fmt = paragraph.paragraph_format
        fmt.space_before = Pt(0)
        fmt.space_after = Pt(0)
        fmt.line_spacing = 1.0

        # Continuation of a justified paragraph: fold it into the previous one
        # rather than emitting a hard line break Word would keep forever.
        continues_previous = False

        if (
            previous is not None
            and not heading
            and not bullet
            and len(cells) == 1
            and previous_row is not None
            and len(previous_row["cells"]) == 1
            and not previous_row.get("heading")
            and previous_row["cells"][0][-1]["bbox"][2] >= text_right - 12
            and 0 < row["y0"] - previous_row["y1"] < body_size * 1.2
        ):
            own_left = cells[0][0]["bbox"][0]
            previous_left = previous_row["cells"][0][0]["bbox"][0]

            # A wrapped body line resumes at the same margin; a wrapped bullet
            # resumes indented to clear the marker. Both are continuations, and
            # treating the bullet case as a new paragraph is what split every
            # long bullet in two.
            continues_previous = abs(own_left - previous_left) < 6 or (
                previous_row.get("bullet") and 0 < own_left - previous_left <= 24
            )

        if continues_previous:
            paragraph._p.getparent().remove(paragraph._p)
            paragraph = previous
            if paragraph.runs:
                tail = paragraph.runs[-1].text
                if not tail.endswith("-") and not tail.endswith(" "):
                    paragraph.runs[-1].text += " "
        else:
            if row["y0"] - (previous_row["y1"] if previous_row else row["y0"]) > body_size * 0.9:
                fmt.space_before = Pt(6 if not heading else 10)

        # Extra columns become right-aligned tab stops, which is how the
        # "Role .......... Dates" line in every resume is actually built.
        if len(cells) > 1:
            right_inches = (text_right - text_left) / 72.0
            fmt.tab_stops.add_tab_stop(Pt((text_right - text_left)), WD_TAB_ALIGNMENT.RIGHT)
            del right_inches

        for cell_index, cell in enumerate(cells):
            if cell_index > 0:
                paragraph.add_run("\t")

            for run_spec in merge_runs(cell):
                run = paragraph.add_run(run_spec["text"])
                style_spec = run_spec["style"]
                run.bold = style_spec["bold"]
                run.italic = style_spec["italic"]
                run.font.name = style_spec["family"]
                run.font.size = Pt(style_spec["size"])
                colour = style_spec["color"]
                if colour != (0, 0, 0):
                    run.font.color.rgb = RGBColor(*colour)

        if heading:
            fmt.space_before = Pt(10)
            fmt.space_after = Pt(2)
            paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT

            # Most resume templates rule off their sections. Redrawing that as
            # a real paragraph border keeps the look and stays editable, rather
            # than losing it or pasting in a picture of a line.
            if underlined:
                colour = next(
                    (
                        span_style(span)["color"]
                        for cell in cells
                        for line in cell
                        for span in line["spans"]
                        if span["text"].strip()
                    ),
                    (0, 0, 0),
                )
                add_bottom_border(paragraph, colour)

        row["heading"] = heading
        row["bullet"] = bullet
        previous = paragraph
        previous_row = row

    for image in pending_images:
        insert_image(doc, image, column_width)

    return doc


def convert(pdf_path, docx_path, max_pages):
    import fitz
    from docx import Document
    from docx.shared import Pt

    try:
        source = fitz.open(pdf_path)
    except Exception as error:  # noqa: BLE001
        return fail(f"This file could not be opened as a PDF: {error}")

    with source:
        if source.needs_pass:
            return fail("This PDF is password protected. Remove the password and try again.")

        if source.page_count == 0:
            return fail("This PDF has no pages.")

        if max_pages and source.page_count > max_pages:
            return fail(
                f"This PDF has {source.page_count} pages; the limit is {max_pages}. "
                "Split it and convert the parts separately."
            )

        document = Document()

        first = source[0]
        section = document.sections[0]
        section.page_width = Pt(first.rect.width)
        section.page_height = Pt(first.rect.height)

        total_characters = 0
        total_images = 0

        for index in range(source.page_count):
            page = source[index]
            lines = collect_lines(page)
            images = collect_images(page)
            total_characters += sum(
                len(span["text"]) for line in lines for span in line["spans"]
            )
            total_images += len(images)

            if index > 0:
                document.add_page_break()

            rows = group_rows(lines)
            if not rows:
                for image in images:
                    insert_image(document, image, first.rect.width - 108)
                continue

            base = body_font_size(rows)
            margin = min((cell[0]["bbox"][0] for row in rows for cell in row["cells"]), default=54.0)
            section.left_margin = Pt(max(margin, 18.0))
            section.right_margin = Pt(max(page.rect.width - max(
                (cell[-1]["bbox"][2] for row in rows for cell in row["cells"]), default=page.rect.width - 54.0
            ), 18.0))
            section.top_margin = Pt(max(rows[0]["y0"], 18.0))
            section.bottom_margin = Pt(36.0)

            build_document(document, page, rows, horizontal_rules(page), base, images)

        if total_characters < 20 and total_images == 0:
            return fail(
                "No selectable text was found — this looks like a scanned or image-only PDF. "
                "Converting those needs OCR, which this tool does not do."
            )

        try:
            document.save(docx_path)
        except Exception as error:  # noqa: BLE001
            print(f"Failed to write the document: {error}", file=sys.stderr)
            return 1

    return 0


def main():
    parser = argparse.ArgumentParser(description="Convert a text PDF into an editable Word document.")
    parser.add_argument("input", nargs="?", help="Path to the source PDF")
    parser.add_argument("output", nargs="?", help="Path to write the .docx to")
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument("--selfcheck", action="store_true")

    args = parser.parse_args()

    if args.selfcheck:
        return selfcheck()

    if not args.input or not args.output:
        parser.error("input and output paths are required")

    return convert(args.input, args.output, args.max_pages)


if __name__ == "__main__":
    sys.exit(main())

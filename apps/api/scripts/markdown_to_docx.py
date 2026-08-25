#!/usr/bin/env python3
"""
Builds a Word document from a parsed Markdown plan.

The parsing is not done here. Node already lexes the Markdown with `marked` —
the same lexer that feeds the PDF renderer — and hands over a flat list of
blocks, so both outputs agree about what the document means. This script only
renders, which keeps the one genuinely tricky part (Markdown's ambiguities)
in a single place.

The output uses Word's own built-in styles — Heading 1..6, List Bullet, List
Number, Quote — rather than hand-applied formatting. That is what makes the
result editable: the recipient can restyle the whole document from Word's
style gallery, which is the entire reason to want .docx over a PDF.

Usage:
    markdown_to_docx.py <plan.json> <output.docx>

Writes JSON to stdout: { paragraphs, headings, tables, listItems }
"""

import json
import sys

# A4 and US Letter in EMU-friendly units; python-docx takes Length objects.
PAGE_SIZES = {
    "a4": (21.0, 29.7, "cm"),
    "letter": (8.5, 11.0, "in"),
}

MONO = "Consolas"
CODE_SHADE = "F2F2F2"


def fail(message, code=2):
    print(json.dumps({"error": message}), file=sys.stderr)
    return code


def shade(paragraph, colour):
    """Paints a paragraph background — python-docx has no API for this."""
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    element = OxmlElement("w:shd")
    element.set(qn("w:val"), "clear")
    element.set(qn("w:fill"), colour)
    paragraph._p.get_or_add_pPr().append(element)


def add_hyperlink(paragraph, url, runs_spec, add_run):
    """
    Inserts a real Word hyperlink.

    python-docx cannot create these, so the relationship is added to the part
    directly and the runs are moved inside a `w:hyperlink` element. Without
    this a link would come across as plain text and lose its address.
    """
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement
    from docx.opc.constants import RELATIONSHIP_TYPE as RT

    part = paragraph.part
    r_id = part.relate_to(url, RT.HYPERLINK, is_external=True)

    link = OxmlElement("w:hyperlink")
    link.set(qn("r:id"), r_id)

    for spec in runs_spec:
        run = add_run(paragraph, spec, link_style=True)
        link.append(run._r)

    paragraph._p.append(link)


def make_run_adder(document):
    def add_run(paragraph, spec, link_style=False):
        run = paragraph.add_run(spec.get("text", ""))

        if spec.get("bold"):
            run.bold = True
        if spec.get("italic"):
            run.italic = True
        if spec.get("strike"):
            run.font.strike = True

        if spec.get("code"):
            run.font.name = MONO

        if link_style:
            from docx.shared import RGBColor

            run.font.color.rgb = RGBColor(0x05, 0x63, 0xC1)
            run.font.underline = True

        return run

    return add_run


def write_runs(paragraph, runs, add_run):
    """
    Writes runs, keeping consecutive runs of one hyperlink together.

    Grouping matters: emitting each run as its own `w:hyperlink` would give a
    bold word inside a link its own separate relationship, and Word renders
    that as several adjacent links rather than one.
    """
    buffer = []
    current = None

    def flush():
        if not buffer:
            return
        if current:
            add_hyperlink(paragraph, current, buffer, add_run)
        else:
            for spec in buffer:
                add_run(paragraph, spec)
        buffer.clear()

    for spec in runs or []:
        link = spec.get("link")

        if link != current:
            flush()
            current = link

        buffer.append(spec)

    flush()


def style_or_none(document, name):
    """Built-in styles only exist once used; missing ones must not be fatal."""
    try:
        document.styles[name]
        return name
    except KeyError:
        return None


def render(plan, output_path):
    import docx
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Cm, Inches, Pt

    document = docx.Document()
    add_run = make_run_adder(document)

    width, height, unit = PAGE_SIZES.get(str(plan.get("pageSize", "a4")).lower(), PAGE_SIZES["a4"])
    measure = Cm if unit == "cm" else Inches

    for section in document.sections:
        section.page_width = measure(width)
        section.page_height = measure(height)

    counts = {"paragraphs": 0, "headings": 0, "tables": 0, "listItems": 0}

    title = (plan.get("title") or "").strip()
    subtitle = (plan.get("subtitle") or "").strip()

    if title:
        document.add_paragraph(title, style=style_or_none(document, "Title") or None)
        counts["headings"] += 1

    if subtitle:
        paragraph = document.add_paragraph()
        run = paragraph.add_run(subtitle)
        run.italic = True
        paragraph.alignment = WD_ALIGN_PARAGRAPH.LEFT
        counts["paragraphs"] += 1

    bullet_style = style_or_none(document, "List Bullet")
    number_style = style_or_none(document, "List Number")
    quote_style = style_or_none(document, "Quote") or style_or_none(document, "Intense Quote")

    for block in plan.get("blocks", []):
        kind = block.get("type")

        if kind == "heading":
            level = min(6, max(1, int(block.get("level", 1))))
            paragraph = document.add_paragraph(style=f"Heading {level}")
            write_runs(paragraph, block.get("runs"), add_run)
            counts["headings"] += 1

        elif kind == "paragraph":
            paragraph = document.add_paragraph()
            write_runs(paragraph, block.get("runs"), add_run)
            if block.get("indent"):
                paragraph.paragraph_format.left_indent = Cm(0.75 * int(block["indent"]))
            counts["paragraphs"] += 1

        elif kind == "list":
            ordered = bool(block.get("ordered"))
            level = min(4, int(block.get("level", 0)))

            # Word ships "List Bullet 2", "List Bullet 3" and so on for nested
            # levels, each with its own indent and bullet glyph. Using them
            # beats setting a left indent by hand: the nesting is then real
            # structure that Word's own list tools understand, rather than a
            # paragraph that merely looks indented.
            base = "List Number" if ordered else "List Bullet"
            style = style_or_none(document, f"{base} {level + 1}") if level else None
            style = style or (number_style if ordered else bullet_style)

            paragraph = document.add_paragraph(style=style) if style else document.add_paragraph()

            if level and style in (number_style, bullet_style):
                # The numbered variant for this depth was not in the template.
                paragraph.paragraph_format.left_indent = Cm(0.75 * (level + 1))

            if not style:
                # No built-in list style in this template — fall back to a
                # literal marker so the list is still a list to a reader.
                paragraph.add_run(f"{block.get('number', 1)}. " if ordered else "• ")

            if block.get("task"):
                paragraph.add_run(f"{block['task']} ")

            write_runs(paragraph, block.get("runs"), add_run)
            counts["listItems"] += 1

        elif kind == "code":
            # One paragraph per line, not one paragraph with line breaks:
            # Word keeps shading and indentation per paragraph, and a single
            # shaded paragraph containing breaks loses its background on every
            # line after the first.
            for line in str(block.get("text", "")).split("\n"):
                paragraph = document.add_paragraph()
                paragraph.paragraph_format.space_after = Pt(0)
                paragraph.paragraph_format.left_indent = Cm(0.5)
                run = paragraph.add_run(line or " ")
                run.font.name = MONO
                run.font.size = Pt(9.5)
                shade(paragraph, CODE_SHADE)
                counts["paragraphs"] += 1

        elif kind == "quote":
            paragraph = document.add_paragraph(style=quote_style) if quote_style else document.add_paragraph()
            if not quote_style:
                paragraph.paragraph_format.left_indent = Cm(1)
            write_runs(paragraph, block.get("runs"), add_run)
            counts["paragraphs"] += 1

        elif kind == "table":
            header = block.get("header") or []
            rows = block.get("rows") or []
            columns = max([len(header)] + [len(row) for row in rows] or [0])

            if not columns:
                continue

            table = document.add_table(rows=0, cols=columns)
            table.style = style_or_none(document, "Table Grid") or table.style

            if header:
                cells = table.add_row().cells
                for index in range(columns):
                    paragraph = cells[index].paragraphs[0]
                    write_runs(paragraph, header[index] if index < len(header) else [], add_run)
                    for run in paragraph.runs:
                        run.bold = True

            for row in rows:
                cells = table.add_row().cells
                for index in range(columns):
                    write_runs(cells[index].paragraphs[0], row[index] if index < len(row) else [], add_run)

            counts["tables"] += 1

        elif kind == "hr":
            paragraph = document.add_paragraph()
            paragraph.add_run("─" * 40)
            counts["paragraphs"] += 1

    document.save(output_path)
    return counts


def main():
    if len(sys.argv) != 3:
        return fail("usage: markdown_to_docx.py <plan.json> <output.docx>")

    plan_path, output_path = sys.argv[1], sys.argv[2]

    try:
        with open(plan_path, "r", encoding="utf-8") as handle:
            plan = json.load(handle)
    except Exception as error:  # noqa: BLE001
        return fail(f"Could not read the conversion plan: {error}")

    try:
        counts = render(plan, output_path)
    except Exception as error:  # noqa: BLE001
        return fail(f"Could not build the Word document: {error}", code=1)

    json.dump(counts, sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main())

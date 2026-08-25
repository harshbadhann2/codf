#!/usr/bin/env python3
"""
PDF / Word → Markdown.

Two very different problems behind one output format.

A .docx already knows its own structure. Word records "this paragraph is
Heading 2", "this one is a bullet at depth 1", "this run is bold", and the job
is mostly to walk the document in order without losing any of it. The traps
are that paragraphs and tables live in separate collections — so iterating
`document.paragraphs` silently drops every table and scrambles the order — and
that lists created with the toolbar carry no style name at all, only numbering
properties buried in the XML.

A PDF knows none of that. A PDF is positioned glyphs; "heading" is not a
concept the format can express. Structure has to be inferred from what is
actually measurable: font size relative to the document's own body size,
weight, horizontal position, and the shape of each line. That inference is the
entire job on the PDF side, which is why this file is mostly heuristics with
their reasoning attached.

Usage:
    to_markdown.py <input.pdf|input.docx> [--max-pages N]
    to_markdown.py --selfcheck

Writes JSON to stdout:
    { markdown, characters, words, headings, tables, listItems,
      codeBlocks, pages, source, truncated }
"""

import argparse
import contextlib
import json
import os
import re
import sys
from collections import Counter

# A guard against a pathological input turning into a string large enough to
# matter on a 512 MB instance. Well past any real document.
MAX_CHARS = 400_000

# Markdown characters that change meaning if left alone. `_` is handled
# separately because intra-word underscores (snake_case) are not emphasis in
# CommonMark, and escaping them turns ordinary technical prose into noise.
INLINE_ESCAPE = re.compile(r"([*`\[\]])")
LONE_UNDERSCORE = re.compile(r"(?<![A-Za-z0-9])_")

# A line that begins with any of these would be read as structure rather than
# text, so it gets escaped when it is only prose that happens to start that way.
LINE_START_ESCAPE = re.compile(r"^(\s*)([#>|]|[-+*](?=\s)|\d{1,9}[.)](?=\s))")


def fail(message, code=2):
    print(json.dumps({"error": message}), file=sys.stderr)
    return code


def escape_md(text):
    """Escapes text so it survives a Markdown round trip without gaining markup."""
    text = text.replace("\\", "\\\\")
    text = INLINE_ESCAPE.sub(r"\\\1", text)
    text = LONE_UNDERSCORE.sub(r"\\_", text)
    return text


def escape_line_start(text):
    return LINE_START_ESCAPE.sub(r"\1\\\2", text)


def wrap(text, marker):
    """
    Wraps text in an emphasis marker, keeping the surrounding spaces outside.

    `** bold **` is not emphasis in any Markdown parser — the marker has to sit
    flush against the word.
    """
    stripped = text.strip()

    if not stripped:
        return text

    lead = text[: len(text) - len(text.lstrip())]
    trail = text[len(text.rstrip()) :]

    return f"{lead}{marker}{stripped}{marker}{trail}"


def collapse(text):
    """One line, single-spaced — for table cells and headings."""
    return re.sub(r"\s+", " ", text).strip()


def assemble(blocks):
    """
    Joins classified blocks into a document.

    Everything is separated by a blank line except consecutive list items,
    which have to stay tight or Markdown renders each one as its own loose
    list with paragraph spacing between the bullets.
    """
    parts = []
    previous = None

    for kind, text in blocks:
        if not text.strip():
            continue

        if parts:
            tight = kind == "list" and previous == "list"
            parts.append("\n" if tight else "\n\n")

        parts.append(text)
        previous = kind

    return "".join(parts)


def summarise(blocks, markdown, pages, source):
    counts = Counter(kind for kind, text in blocks if text.strip())
    truncated = len(markdown) > MAX_CHARS

    if truncated:
        markdown = markdown[:MAX_CHARS].rstrip() + "\n\n*(truncated — the document was too long to convert in full)*"

    return {
        "markdown": markdown,
        "characters": len(markdown),
        "words": len(markdown.split()),
        "headings": counts.get("heading", 0),
        "tables": counts.get("table", 0),
        "listItems": counts.get("list", 0),
        "codeBlocks": counts.get("code", 0),
        "pages": pages,
        "source": source,
        "truncated": truncated,
    }


# ─────────────────────────── Word (.docx) ───────────────────────────

W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

LITERAL_BULLET = re.compile(r"^\s*[•·▪◦‣⁃∙●○]\s*(.+)$")


def docx_heading_level(paragraph):
    """
    Maps a Word paragraph style to (level, is_title).

    Both the display name and the style id are checked: the name is localised
    in non-English copies of Word, while the id stays "Heading2".

    `is_title` is kept separate from the level because Word's Title style and
    its Heading 1 style are different things that would otherwise both become
    `#`. Which one a document uses is only knowable once the whole document has
    been read, so the decision is deferred to the caller.
    """
    style = paragraph.style

    if style is None:
        return 0, False

    name = (style.name or "").strip().lower()
    style_id = (style.style_id or "").strip().lower()

    if name == "title" or style_id == "title":
        return 1, True

    if name == "subtitle" or style_id == "subtitle":
        return 2, False

    for candidate in (name, style_id):
        match = re.match(r"heading\s*(\d+)$", candidate)
        if match:
            return min(6, int(match.group(1))), False

    return 0, False


def docx_numbering_formats(document):
    """
    Reads numbering.xml into {(numId, level): format}.

    Without this there is no way to tell an ordered list from a bulleted one:
    both are just `numPr` on the paragraph, and the actual marker lives in a
    separate part of the archive.
    """
    formats = {}

    try:
        numbering = document.part.numbering_part.element
    except Exception:  # noqa: BLE001 — a document with no lists has no numbering part
        return formats

    abstract = {}

    for node in numbering.findall(f"{W_NS}abstractNum"):
        abstract_id = node.get(f"{W_NS}abstractNumId")

        for level in node.findall(f"{W_NS}lvl"):
            ilvl = level.get(f"{W_NS}ilvl")
            fmt = level.find(f"{W_NS}numFmt")
            abstract[(abstract_id, ilvl)] = fmt.get(f"{W_NS}val") if fmt is not None else None

    for node in numbering.findall(f"{W_NS}num"):
        num_id = node.get(f"{W_NS}numId")
        link = node.find(f"{W_NS}abstractNumId")

        if link is None:
            continue

        abstract_id = link.get(f"{W_NS}val")

        for (candidate_abstract, ilvl), fmt in abstract.items():
            if candidate_abstract == abstract_id:
                formats[(num_id, ilvl)] = fmt

    return formats


def docx_list_info(paragraph, formats):
    """Returns (level, ordered) when the paragraph is a list item, else None."""
    properties = paragraph._p.pPr
    num_pr = properties.numPr if properties is not None else None

    if num_pr is not None and num_pr.numId is not None:
        num_id = str(num_pr.numId.val)

        # numId 0 is Word's way of explicitly removing list formatting.
        if num_id != "0":
            level = int(num_pr.ilvl.val) if num_pr.ilvl is not None else 0
            fmt = formats.get((num_id, str(level))) or formats.get((num_id, "0"))
            return level, fmt not in (None, "bullet", "none")

    # Documents built from styles rather than the numbering toolbar.
    name = (paragraph.style.name or "").lower() if paragraph.style else ""

    if "list number" in name:
        return 0, True

    if "list bullet" in name or name == "list paragraph":
        return 0, False

    return None


def docx_inline(paragraph):
    """
    Renders a paragraph's runs as inline Markdown.

    `iter_inner_content` is used rather than `.runs` because hyperlinks are
    siblings of runs, not runs themselves — reading `.runs` alone drops every
    link's text entirely.
    """
    try:
        items = list(paragraph.iter_inner_content())
    except AttributeError:
        items = list(paragraph.runs)

    # Collected first, then merged, then rendered. Word splits a run at every
    # spell-check mark and revision, so a single bold phrase often arrives as
    # one run per word; emphasising each separately gives `**HARSH****BADHAN**`
    # instead of one bold name.
    parts = []

    for item in items:
        address = getattr(item, "address", None)

        if address is not None:
            label = item.text

            if label.strip():
                parts.append({"key": ("link", address), "text": label})

            continue

        text = getattr(item, "text", "")

        if not text:
            continue

        font = item.font
        name = (font.name or "").lower()
        mono = any(key in name for key in ("mono", "courier", "consol"))
        key = ("run", bool(font.bold), bool(font.italic), mono)

        if parts and parts[-1]["key"] == key:
            parts[-1]["text"] += text
        else:
            parts.append({"key": key, "text": text})

    pieces = []

    for part in parts:
        kind = part["key"][0]
        text = part["text"]

        if kind == "link":
            pieces.append(f"[{escape_md(text)}]({part['key'][1]})")
            continue

        _, bold, italic, mono = part["key"]

        if mono and text.strip():
            # Inline code is literal, so the escaping comes back off.
            stripped = text.strip()
            lead = text[: len(text) - len(text.lstrip())]
            trail = text[len(text.rstrip()) :]
            pieces.append(f"{lead}`{stripped}`{trail}")
            continue

        rendered = escape_md(text)

        if italic:
            rendered = wrap(rendered, "*")
        if bold:
            rendered = wrap(rendered, "**")

        pieces.append(rendered)

    return "".join(pieces).strip()


def docx_cell_text(cell):
    lines = [docx_inline(paragraph) for paragraph in cell.paragraphs]
    joined = "<br>".join(line for line in lines if line.strip())
    return joined.replace("|", "\\|")


def docx_table(table):
    """Renders a Word table as a Markdown table."""
    rows = []

    for row in table.rows:
        try:
            cells = [docx_cell_text(cell) for cell in row.cells]
        except Exception:  # noqa: BLE001 — malformed merges raise rather than degrade
            continue

        if any(cell.strip() for cell in cells):
            rows.append(cells)

    if not rows:
        return ""

    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]

    # Markdown has no concept of a table without a header row, so the first row
    # becomes one. A blank header still renders correctly.
    header = rows[0]
    body = rows[1:]

    out = ["| " + " | ".join(header) + " |", "| " + " | ".join(["---"] * width) + " |"]
    out.extend("| " + " | ".join(row) + " |" for row in body)

    return "\n".join(out)


def docx_to_markdown(path):
    import docx
    from docx.table import Table
    from docx.text.paragraph import Paragraph

    try:
        document = docx.Document(path)
    except Exception as error:  # noqa: BLE001
        return None, fail(f"This file could not be opened as a Word document: {error}")

    formats = docx_numbering_formats(document)
    blocks = []
    counters = {}
    # Heading text is held back until the whole document has been walked: the
    # right level for a Heading 1 depends on whether a Title appears anywhere.
    headings = []

    for child in document.element.body.iterchildren():
        if child.tag == f"{W_NS}tbl":
            counters.clear()
            rendered = docx_table(Table(child, document))

            if rendered:
                blocks.append(("table", rendered))

            continue

        if child.tag != f"{W_NS}p":
            continue

        paragraph = Paragraph(child, document)
        text = docx_inline(paragraph)

        if not text.strip():
            continue

        level, is_title = docx_heading_level(paragraph)

        if level:
            counters.clear()
            blocks.append(("heading", ""))
            headings.append((len(blocks) - 1, level, collapse(text), is_title))
            continue

        listing = docx_list_info(paragraph, formats)

        # A document that was typed rather than formatted — or one produced by
        # another converter — carries its bullets as literal characters with no
        # list properties at all. Those are still a list to every reader.
        literal = LITERAL_BULLET.match(text)

        if listing is None and literal:
            blocks.append(("list", f"- {collapse(literal.group(1))}"))
            continue

        if listing is not None:
            level, ordered = listing
            level = min(level, 5)

            if ordered:
                # Word restarts numbering per list; mirroring that keeps the
                # output faithful when a document has several separate lists.
                counters[level] = counters.get(level, 0) + 1
                for deeper in [key for key in counters if key > level]:
                    del counters[deeper]
                marker = f"{counters[level]}."
            else:
                marker = "-"

            blocks.append(("list", f"{'  ' * level}{marker} {collapse(text)}"))
            continue

        counters.clear()
        style_name = (paragraph.style.name or "").lower() if paragraph.style else ""

        if "quote" in style_name:
            blocks.append(("quote", "\n".join(f"> {line}" for line in collapse(text).split("\n"))))
            continue

        blocks.append(("paragraph", escape_line_start(text)))

    # A document that uses Title reserves `#` for it, so everything below has
    # to shift down one to keep the hierarchy that Word actually described.
    # Emitting both Title and Heading 1 as `#` would flatten two distinct
    # levels into one and lose the document's outline.
    demote = any(is_title for *_, is_title in headings)

    for index, level, heading_text, is_title in headings:
        final = 1 if is_title else min(6, level + 1) if demote else level
        blocks[index] = ("heading", f"{'#' * final} {heading_text}")

    markdown = assemble(blocks)

    if not markdown.strip():
        return None, fail("This Word document has no text in it.")

    return summarise(blocks, markdown, 0, "docx"), 0


# ─────────────────────────────── PDF ────────────────────────────────

BULLET_RE = re.compile(r"^\s*([•·▪◦‣⁃∙●○–—\-\*])\s+(.+)$")
ORDERED_RE = re.compile(r"^\s*\(?(\d{1,3})[.)]\s+(.+)$")
ALPHA_RE = re.compile(r"^\s*\(?([a-zA-Z])[.)]\s+(.+)$")

# One indent step in a PDF is typically half an inch or a tab; 18pt is a
# forgiving quarter-inch that catches both without inventing nesting.
INDENT_UNIT = 18.0


def span_is_bold(span):
    return bool(span["flags"] & 16) or "bold" in span["font"].lower() or "black" in span["font"].lower()


def span_is_italic(span):
    font = span["font"].lower()
    return bool(span["flags"] & 2) or "italic" in font or "oblique" in font


def span_is_mono(span):
    font = span["font"].lower()
    return bool(span["flags"] & 8) or any(key in font for key in ("mono", "courier", "consol"))


def line_from_spans(spans):
    """Flattens one PyMuPDF line into text plus the attributes we classify on."""
    text = "".join(span["text"] for span in spans)
    weighted = [(span, len(span["text"].strip())) for span in spans]
    total = sum(count for _, count in weighted) or 1

    return {
        "text": text,
        "size": max((round(span["size"], 1) for span in spans), default=0.0),
        "bold": sum(count for span, count in weighted if span_is_bold(span)) / total > 0.6,
        "mono": sum(count for span, count in weighted if span_is_mono(span)) / total > 0.6,
        "spans": spans,
    }


def furniture(document, pages):
    """
    Finds running headers and footers so they can be dropped.

    A page number or a chapter title repeated on every page is furniture, not
    content — kept, it interrupts the text at every page boundary with a line
    that was never part of the prose.
    """
    if len(pages) < 3:
        return set()

    seen = Counter()

    for index in pages:
        page = document[index]
        height = page.rect.height or 1
        edge = height * 0.08

        for block in page.get_text("dict").get("blocks", []):
            if block["type"] != 0:
                continue

            top, bottom = block["bbox"][1], block["bbox"][3]

            if top > edge and bottom < height - edge:
                continue

            for line in block.get("lines", []):
                text = collapse("".join(span["text"] for span in line.get("spans", [])))

                if text:
                    # Page numbers differ per page; the shape is what repeats.
                    seen[re.sub(r"\d+", "#", text)] += 1

    threshold = max(2, int(len(pages) * 0.6))
    return {shape for shape, count in seen.items() if count >= threshold}


def page_tables(page):
    """Extracts tables, tolerating older PyMuPDF builds and awkward pages."""
    try:
        found = page.find_tables()
    except Exception:  # noqa: BLE001
        return []

    out = []

    for table in getattr(found, "tables", []):
        try:
            markdown = table.to_markdown().strip()
        except Exception:  # noqa: BLE001
            continue

        # A "table" of one cell is nearly always a misread text box.
        if markdown and markdown.count("\n") >= 2:
            out.append({"bbox": table.bbox, "markdown": markdown})

    return out


def inside(bbox, boxes):
    """True when a block sits within a table's area and should not be re-emitted."""
    x0, y0, x1, y1 = bbox
    centre_x, centre_y = (x0 + x1) / 2, (y0 + y1) / 2

    return any(bx0 <= centre_x <= bx1 and by0 <= centre_y <= by1 for bx0, by0, bx1, by1 in boxes)


def merge_spans(spans):
    """
    Coalesces neighbouring spans that share formatting.

    A PDF starts a new span at every kerning or font adjustment, so a bold
    phrase routinely arrives as one span per word. Emphasising each separately
    yields `**one** **word** **at** **a** **time**`, which is unpleasant to
    read and factually wrong about the document: that was one bold phrase, not
    six adjacent ones.
    """
    merged = []

    for span in spans:
        key = (span_is_bold(span), span_is_italic(span), span_is_mono(span))

        if merged and merged[-1]["key"] == key:
            merged[-1]["text"] += span["text"]
        else:
            merged.append({"key": key, "text": span["text"]})

    return merged


def inline_from_spans(spans, emphasise):
    """
    Renders spans with inline emphasis.

    `emphasise` is off when most of the block is bold: a paragraph set entirely
    in bold is a design choice, and marking every word of it up reads far worse
    than the plain text it came from.
    """
    pieces = []

    for span in merge_spans(spans):
        text = span["text"]
        bold, italic, mono = span["key"]

        if not text:
            continue

        if mono and text.strip():
            stripped = text.strip()
            lead = text[: len(text) - len(text.lstrip())]
            trail = text[len(text.rstrip()) :]
            pieces.append(f"{lead}`{stripped}`{trail}" if len(stripped) < 80 else escape_md(text))
            continue

        rendered = escape_md(text)

        if emphasise:
            if italic:
                rendered = wrap(rendered, "*")
            if bold:
                rendered = wrap(rendered, "**")

        pieces.append(rendered)

    return "".join(pieces)


def looks_like_caps_heading(text):
    """
    True for a short all-capitals line.

    Setting a section title in capitals at body size is the house style of
    almost every résumé and report template, and it is the only signal those
    documents give — there is no size change to measure.
    """
    letters = [character for character in text if character.isalpha()]
    density = len(letters) / max(1, len(text.replace(" ", "")))

    return (
        len(text) <= 60
        and len(letters) >= 3
        and all(character.isupper() for character in letters)
        # "CGPA: 7.39" is all-capitals too, but it is a labelled value rather
        # than a section title. Requiring the line to be mostly letters keeps
        # those out without needing to guess at the meaning.
        and density >= 0.6
        and not text.endswith((".", ",", ";", ":"))
    )


def join_wrapped(lines):
    """
    Rejoins the hard-wrapped lines of a PDF paragraph into one line.

    PDFs store a paragraph as separate positioned lines; leaving them as-is
    produces Markdown that re-wraps at the original page width and reads badly
    at any other width. Words split across a line break are rejoined.
    """
    out = ""

    for line in lines:
        text = line.strip()

        if not text:
            continue

        if not out:
            out = text
            continue

        if out.endswith("-") and not out.endswith("--") and text[:1].islower():
            # Closed up, but the hyphen stays. A hyphen before a line break is
            # ambiguous — a soft break inside one word ("algo-rithms") or a
            # genuine compound ("user-generated") — and only a dictionary can
            # tell them apart. Keeping it is the safer default: Word, which
            # produced most of what this converter sees, does not hyphenate
            # automatically, so a hyphen at a break is usually part of the
            # word. Dropping it would silently weld "user-generated" into
            # "usergenerated", which the reader cannot undo by eye.
            out = out + text
        else:
            out = f"{out} {text}"

    return out


def emit_paragraph(lines, blocks):
    text = join_wrapped(lines)

    if text.strip():
        blocks.append(("paragraph", escape_line_start(text)))


def classify_block(block, scale, left_margin, blocks, use_bold_headings):
    """Turns one PyMuPDF text block into Markdown blocks."""
    lines = [line_from_spans(line["spans"]) for line in block.get("lines", []) if line.get("spans")]
    lines = [line for line in lines if line["text"].strip()]

    if not lines:
        return

    # A block set predominantly in a monospaced face is code, and code is the
    # one thing whose line breaks and indentation must survive verbatim.
    if sum(1 for line in lines if line["mono"]) / len(lines) > 0.7:
        left = min(line["spans"][0]["bbox"][0] for line in lines)
        rendered = []

        for line in lines:
            offset = line["spans"][0]["bbox"][0] - left
            width = line["size"] * 0.6 or 6
            indent = " " * min(24, int(round(offset / width))) if width else ""
            rendered.append(indent + line["text"].rstrip())

        blocks.append(("code", "```\n" + "\n".join(rendered) + "\n```"))
        return

    bold_share = sum(1 for line in lines if line["bold"]) / len(lines)
    emphasise = bold_share < 0.6
    pending = []

    # Where the most recent list item was emitted, and how far in its marker
    # sat, so that wrapped continuation lines can be reunited with it.
    list_anchor = None

    for line in lines:
        text = line["text"].strip()
        x0 = line["spans"][0]["bbox"][0]
        level = scale.get(line["size"], 0)

        # Headings: short, larger than the body, and not a sentence.
        is_heading = bool(level) and len(text) <= 200

        if not is_heading and looks_like_caps_heading(text):
            is_heading, level = True, 2

        if not is_heading and use_bold_headings and line["bold"] and len(text) <= 90:
            if not text.endswith((".", ",", ";")):
                is_heading, level = True, 3

        if is_heading:
            emit_paragraph(pending, blocks)
            pending, list_anchor = [], None
            blocks.append(("heading", f"{'#' * level} {collapse(escape_md(text))}"))
            continue

        bullet = BULLET_RE.match(text)
        ordered = ORDERED_RE.match(text) if not bullet else None
        alpha = ALPHA_RE.match(text) if not bullet and not ordered else None

        if bullet or ordered or alpha:
            emit_paragraph(pending, blocks)
            pending = []

            body = (bullet or ordered or alpha).group(2)
            indent = max(0.0, x0 - left_margin)
            depth = min(4, int(indent // INDENT_UNIT))
            marker = f"{ordered.group(1)}." if ordered else "-"

            blocks.append(("list", f"{'  ' * depth}{marker} {escape_md(collapse(body))}"))
            list_anchor = (len(blocks) - 1, x0)
            continue

        # A line that is not a new item but hangs to the right of the last
        # marker is the rest of that item, wrapped by the page width. Left as
        # its own block it becomes a stray paragraph in the middle of a list —
        # which is how the sentence reads, split in half, in every naive
        # PDF-to-Markdown conversion.
        if list_anchor and not pending and x0 > list_anchor[1] + 2:
            index, marker_x = list_anchor
            kind, existing = blocks[index]
            blocks[index] = (kind, join_wrapped([existing, escape_md(collapse(text))]))
            continue

        pending.append(inline_from_spans(line["spans"], emphasise))
        list_anchor = None

    emit_paragraph(pending, blocks)


def pdf_to_markdown(path, max_pages):
    import pymupdf

    try:
        document = pymupdf.open(path)
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
                "Split it and convert the parts separately."
            )

        pages = list(range(document.page_count))
        skip = furniture(document, pages)

        # The document's own body size is the only reliable yardstick — 14pt is
        # a heading in one PDF and ordinary body text in another. Weighting by
        # character count rather than span count stops a handful of long
        # headings outvoting the actual prose.
        sizes = Counter()

        for index in pages:
            for block in document[index].get_text("dict").get("blocks", []):
                if block["type"] != 0:
                    continue
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        sizes[round(span["size"], 1)] += len(span["text"].strip())

        if not sizes:
            return None, fail(
                "No text could be read from this PDF. If it is a scan, use Image → Text instead — "
                "that reads the pages as pictures."
            )

        body_size = sizes.most_common(1)[0][0]

        # Sizes are ranked, not thresholded: a document defines its own scale,
        # and the largest distinct size is its top-level heading whatever the
        # absolute number happens to be.
        larger = sorted({size for size in sizes if size >= body_size * 1.12}, reverse=True)
        scale = {size: min(6, rank + 1) for rank, size in enumerate(larger[:5])}

        # Only fall back to "bold means heading" when the document has no size
        # hierarchy at all. Where a real scale exists, bold is just emphasis.
        use_bold_headings = not scale

        items = []

        for index in pages:
            page = document[index]
            tables = page_tables(page)
            boxes = [table["bbox"] for table in tables]

            for table in tables:
                items.append((index, table["bbox"][1], table["bbox"][0], ("table", table["markdown"])))

            raw = page.get_text("dict").get("blocks", [])
            left_margin = min(
                (block["bbox"][0] for block in raw if block["type"] == 0),
                default=0.0,
            )

            for block in raw:
                if block["type"] != 0 or inside(block["bbox"], boxes):
                    continue

                lines = block.get("lines", [])
                shape = collapse("".join(span["text"] for line in lines for span in line.get("spans", [])))

                if re.sub(r"\d+", "#", shape) in skip:
                    continue

                collected = []
                classify_block(block, scale, left_margin, collected, use_bold_headings)

                for entry in collected:
                    items.append((index, block["bbox"][1], block["bbox"][0], entry))

        items.sort(key=lambda entry: (entry[0], round(entry[1], 1), entry[2]))
        blocks = [entry[3] for entry in items]
        markdown = assemble(blocks)

        if not markdown.strip():
            return None, fail("No text could be read from this PDF.")

        return summarise(blocks, markdown, document.page_count, "pdf"), 0


# ────────────────────────────── entry ───────────────────────────────


def selfcheck():
    """Reports whether this host can run either converter, for the capability probe."""
    try:
        import pymupdf  # noqa: F401
    except Exception as error:  # noqa: BLE001
        print(f"PyMuPDF unavailable: {error}", file=sys.stderr)
        return 1

    try:
        import docx  # noqa: F401
    except Exception as error:  # noqa: BLE001
        print(f"python-docx unavailable: {error}", file=sys.stderr)
        return 1

    print(f"pymupdf {pymupdf.__doc__.strip().splitlines()[0] if pymupdf.__doc__ else ''}".strip())
    return 0


def main():
    parser = argparse.ArgumentParser(description="Convert a PDF or Word document to Markdown.")
    parser.add_argument("input", nargs="?")
    parser.add_argument("--max-pages", type=int, default=0)
    parser.add_argument("--selfcheck", action="store_true")

    args = parser.parse_args()

    if args.selfcheck:
        return selfcheck()

    if not args.input:
        parser.error("an input path is required")

    extension = os.path.splitext(args.input)[1].lower()

    # stdout is the JSON channel and nothing else may write to it. PyMuPDF
    # prints advisory notices there ("Consider using the pymupdf_layout
    # package…") which land in the middle of the payload and make it
    # unparseable. Anything the libraries print is redirected to stderr, where
    # it is logged rather than parsed, and the result is written to the real
    # stdout only once the conversion is over.
    with contextlib.redirect_stdout(sys.stderr):
        if extension == ".docx":
            result, code = docx_to_markdown(args.input)
        elif extension == ".pdf":
            result, code = pdf_to_markdown(args.input, args.max_pages)
        else:
            return fail(f"Unsupported file type: {extension or 'no extension'}")

    if result is None:
        return code

    json.dump(result, sys.__stdout__)
    return 0


if __name__ == "__main__":
    sys.exit(main())

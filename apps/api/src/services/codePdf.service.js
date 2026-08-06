'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const PDFDocument = require('pdfkit');
const hljs = require('highlight.js');
const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const { AppError } = require('../utils/AppError');
const { sanitizeBaseName } = require('../utils/sanitizeFilename');
const { safeUnlink } = require('../utils/fileCleanup');
const { parseHighlightedTokens, tokenColor, isCommentToken, isBoldToken } = require('../utils/codeTokens');

const PAGE_SIZE = 'LETTER';
const MARGIN = 56;
const PANEL_PADDING_X = 14;
const PANEL_PADDING_Y = 12;
const PANEL_RADIUS = 6;
const PANEL_BG = '#fbfbfd';
const PANEL_BORDER = '#e2e8f0';
const GUTTER_BG = '#f1f5f9';
const GUTTER_TEXT = '#94a3b8';
const GUTTER_WIDTH = 34;
const TITLE_SIZE = 19;
const SECTION_SIZE = 11;
const FONT_SIZE = 9.5;
const LINE_HEIGHT = 13.2;
const FOOTER_SIZE = 8;
const FOOTER_BAND = 18;
const WRAP_INDENT = 10;

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return '';
}

/**
 * JetBrains Mono is committed under assets/fonts so server output matches local
 * output exactly. The other lookups are a convenience for contributors who have
 * the font installed system-wide; Courier is the last-resort fallback.
 */
function resolveFontSet() {
  const homeFonts = path.join(os.homedir(), 'Library', 'Fonts');

  const pick = (override, fileName) =>
    firstExistingPath([
      override,
      path.join(env.fontDir, fileName),
      path.join(homeFonts, fileName),
      path.join('/Library/Fonts', fileName),
      path.join('/usr/share/fonts/truetype/jetbrains-mono', fileName)
    ]);

  return {
    regular: pick(env.codePdfFont.regular, 'JetBrainsMono-Regular.ttf'),
    italic: pick(env.codePdfFont.italic, 'JetBrainsMono-Italic.ttf'),
    bold: pick(env.codePdfFont.bold, 'JetBrainsMono-Bold.ttf'),
    boldItalic: pick(env.codePdfFont.boldItalic, 'JetBrainsMono-BoldItalic.ttf')
  };
}

function registerFonts(doc) {
  const files = resolveFontSet();

  if (!files.regular) {
    return { base: 'Courier', italic: 'Courier-Oblique', bold: 'Courier-Bold', boldItalic: 'Courier-BoldOblique' };
  }

  doc.registerFont('code', files.regular);
  const names = { base: 'code', italic: 'code', bold: 'code', boldItalic: 'code' };

  if (files.italic) {
    doc.registerFont('code-italic', files.italic);
    names.italic = 'code-italic';
  }

  if (files.bold) {
    doc.registerFont('code-bold', files.bold);
    names.bold = 'code-bold';
  }

  if (files.boldItalic) {
    doc.registerFont('code-bold-italic', files.boldItalic);
    names.boldItalic = 'code-bold-italic';
  }

  return names;
}

function detectLanguage(code, requested) {
  if (requested && hljs.getLanguage(requested)) {
    return requested;
  }

  try {
    const auto = hljs.highlightAuto(code.slice(0, 20000));
    // Below this relevance hljs is mostly guessing, and plaintext looks better
    // than confidently-wrong colouring.
    if (auto && auto.language && auto.relevance >= 5) return auto.language;
  } catch {
    /* fall through to plaintext */
  }

  return 'plaintext';
}

function highlight(code, language) {
  try {
    return { html: hljs.highlight(code, { language, ignoreIllegals: true }).value, language };
  } catch {
    return { html: hljs.highlight(code, { language: 'plaintext', ignoreIllegals: true }).value, language: 'plaintext' };
  }
}

/** Splits tokens on newlines so each source line can be numbered independently. */
function tokensToLines(tokens) {
  const lines = [[]];

  tokens.forEach((token) => {
    const segments = token.text.split('\n');

    segments.forEach((segment, index) => {
      if (index > 0) lines.push([]);
      if (segment) lines[lines.length - 1].push({ text: segment, cssClass: token.cssClass });
    });
  });

  // Almost every source file ends with a newline, which would otherwise render
  // as a numbered blank line at the end of the listing.
  if (lines.length > 1 && lines[lines.length - 1].length === 0) {
    lines.pop();
  }

  return lines;
}

function fontFor(fonts, cssClass) {
  if (isCommentToken(cssClass)) return fonts.italic;
  if (isBoldToken(cssClass)) return fonts.bold;
  return fonts.base;
}

/**
 * Longest prefix of `text` that fits `available` points, by binary search.
 * Far fewer width measurements than shrinking one character at a time, which
 * matters on a 300k-character listing.
 */
function fittingPrefixLength(doc, text, available) {
  if (doc.widthOfString(text) <= available) return text.length;

  let low = 1;
  let high = text.length;
  let best = 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    if (doc.widthOfString(text.slice(0, mid)) <= available) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return best;
}

/**
 * Turns source lines into display rows, wrapping anything wider than the code
 * panel. Wrapping only depends on the panel width, which is identical on every
 * page — so this runs once, before pagination, and pagination becomes a matter
 * of slicing the resulting array.
 */
function layoutRows(doc, lines, fonts, contentWidth) {
  const rows = [];

  lines.forEach((spans, index) => {
    const lineNumber = index + 1;
    let current = { lineNumber, indent: 0, segments: [] };
    let used = 0;

    const pushRow = () => {
      rows.push(current);
      current = { lineNumber: null, indent: WRAP_INDENT, segments: [] };
      used = 0;
    };

    spans.forEach((span) => {
      const font = fontFor(fonts, span.cssClass);
      const color = tokenColor(span.cssClass);
      doc.font(font).fontSize(FONT_SIZE);

      let pending = span.text;

      while (pending.length > 0) {
        const available = contentWidth - current.indent - used;

        if (available <= 4) {
          pushRow();
          continue;
        }

        const take = fittingPrefixLength(doc, pending, available);
        const chunk = pending.slice(0, take);

        current.segments.push({ text: chunk, color, font });
        used += doc.widthOfString(chunk);
        pending = pending.slice(take);

        if (pending.length > 0) pushRow();
      }
    });

    rows.push(current);
  });

  return rows;
}

/** Height consumed by the title/section block above the code panel. */
function headerHeight(doc, options) {
  const width = doc.page.width - MARGIN * 2;
  let height = 0;

  if (options.title) {
    doc.font('Helvetica-Bold').fontSize(TITLE_SIZE);
    height += doc.heightOfString(options.title, { width }) + 4;
  }

  if (options.section) {
    doc.font('Helvetica').fontSize(SECTION_SIZE);
    height += doc.heightOfString(options.section, { width }) + 4;
  }

  return height > 0 ? height + 10 : 0;
}

function panelGeometry(doc, top) {
  return {
    x: MARGIN,
    y: top,
    width: doc.page.width - MARGIN * 2,
    maxHeight: doc.page.height - MARGIN - top - FOOTER_BAND
  };
}

function rowCapacity(maxHeight) {
  return Math.max(1, Math.floor((maxHeight - PANEL_PADDING_Y * 2) / LINE_HEIGHT));
}

function drawHeader(doc, options) {
  const width = doc.page.width - MARGIN * 2;
  let y = MARGIN;

  if (options.title) {
    doc.font('Helvetica-Bold').fontSize(TITLE_SIZE).fillColor('#0f172a');
    doc.text(options.title, MARGIN, y, { width });
    y = doc.y + 4;
  }

  if (options.section) {
    doc.font('Helvetica').fontSize(SECTION_SIZE).fillColor('#64748b');
    doc.text(options.section, MARGIN, y, { width });
  }
}

function drawPanel(doc, geometry, height) {
  doc.save();
  doc.roundedRect(geometry.x, geometry.y, geometry.width, height, PANEL_RADIUS).fill(PANEL_BG);
  doc
    .roundedRect(geometry.x + 0.5, geometry.y + 0.5, geometry.width - 1, height - 1, PANEL_RADIUS)
    .lineWidth(0.75)
    .stroke(PANEL_BORDER);

  // Gutter, clipped to the panel so its square corners don't poke out of the
  // rounded outline.
  doc.save();
  doc.roundedRect(geometry.x, geometry.y, geometry.width, height, PANEL_RADIUS).clip();
  doc.rect(geometry.x, geometry.y, GUTTER_WIDTH, height).fill(GUTTER_BG);
  doc.restore();

  doc.restore();
}

function drawRows(doc, rows, geometry, fonts) {
  const contentX = geometry.x + GUTTER_WIDTH + PANEL_PADDING_X;
  let y = geometry.y + PANEL_PADDING_Y;

  rows.forEach((row) => {
    if (row.lineNumber !== null) {
      doc.save();
      doc.font(fonts.base).fontSize(FONT_SIZE - 0.5).fillColor(GUTTER_TEXT);
      doc.text(String(row.lineNumber), geometry.x + 1, y + 1, {
        width: GUTTER_WIDTH - 6,
        align: 'right',
        lineBreak: false
      });
      doc.restore();
    }

    let x = contentX + row.indent;

    row.segments.forEach((segment) => {
      doc.font(segment.font).fontSize(FONT_SIZE).fillColor(segment.color);
      doc.text(segment.text, x, y, { lineBreak: false });
      x += doc.widthOfString(segment.text);
    });

    y += LINE_HEIGHT;
  });
}

/**
 * Stamps "<name> · <language>" and "Page n of m" onto every page.
 *
 * Footers are written after all content, against buffered pages, because the
 * footer band sits below the bottom margin — and any `text()` call past the
 * margin makes PDFKit helpfully insert a brand new page. Zeroing the margin for
 * the duration of the write is the documented way to opt out of that.
 */
function stampFooters(doc, label) {
  const range = doc.bufferedPageRange();
  if (range.count === 0) return;

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);

    const originalBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = doc.page.height - MARGIN + 8;
    const width = doc.page.width - MARGIN * 2;

    doc.font('Helvetica').fontSize(FOOTER_SIZE).fillColor('#94a3b8');
    doc.text(label, MARGIN, y, { width, align: 'left', lineBreak: false });
    doc.text(`Page ${index + 1} of ${range.count}`, MARGIN, y, { width, align: 'right', lineBreak: false });

    doc.page.margins.bottom = originalBottom;
  }
}

/**
 * Renders the document: wrap once, slice into pages, then paint. Measuring
 * before drawing is what lets the panel on the final page shrink to fit its
 * content instead of always running to the bottom of the sheet.
 */
function renderDocument(doc, lines, options) {
  const fonts = registerFonts(doc);

  const firstTop = MARGIN + headerHeight(doc, options);
  const firstGeometry = panelGeometry(doc, firstTop);
  const restGeometry = panelGeometry(doc, MARGIN);

  const contentWidth = firstGeometry.width - GUTTER_WIDTH - PANEL_PADDING_X * 2;
  const rows = layoutRows(doc, lines, fonts, contentWidth);

  const firstCapacity = rowCapacity(firstGeometry.maxHeight);
  const restCapacity = rowCapacity(restGeometry.maxHeight);

  let cursor = 0;
  let isFirstPage = true;

  while (cursor < rows.length || isFirstPage) {
    const geometry = isFirstPage ? firstGeometry : restGeometry;
    const capacity = isFirstPage ? firstCapacity : restCapacity;

    if (!isFirstPage) doc.addPage({ size: PAGE_SIZE, margin: MARGIN });
    if (isFirstPage) drawHeader(doc, options);

    const pageRows = rows.slice(cursor, cursor + capacity);
    const height = Math.min(geometry.maxHeight, PANEL_PADDING_Y * 2 + pageRows.length * LINE_HEIGHT);

    drawPanel(doc, geometry, height);
    drawRows(doc, pageRows, geometry, fonts);

    cursor += capacity;
    isFirstPage = false;
  }

  return rows.length;
}

async function generateCodePdf({ code, filename, language, title, section }) {
  if (typeof code !== 'string' || !code.trim()) {
    throw AppError.badRequest('Code content is required.');
  }

  if (code.length > env.maxCodeChars) {
    throw AppError.payloadTooLarge(
      `Code is ${code.length.toLocaleString()} characters; the limit is ${env.maxCodeChars.toLocaleString()}.`
    );
  }

  const safeName = sanitizeBaseName(filename, 'code_file');
  // A tab is one glyph in a monospace PDF; expand it so indentation survives.
  const normalized = code.replace(/\r\n?/g, '\n').replace(/\t/g, '    ');

  const detectedLanguage = detectLanguage(normalized, language);
  const highlighted = highlight(normalized, detectedLanguage);
  const lines = tokensToLines(parseHighlightedTokens(highlighted.html));

  const outputFileName = `${randomUUID()}.pdf`;
  const outputPath = path.join(env.outputDir, outputFileName);

  try {
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: PAGE_SIZE,
        margin: MARGIN,
        bufferPages: true,
        autoFirstPage: true,
        info: { Title: `${safeName}.pdf`, Author: 'coDF', Creator: 'coDF' }
      });

      const stream = fs.createWriteStream(outputPath);
      let failed = false;

      const fail = (error) => {
        if (failed) return;
        failed = true;
        reject(error);
      };

      stream.on('finish', () => {
        if (!failed) resolve();
      });
      stream.on('error', fail);
      doc.on('error', fail);
      doc.pipe(stream);

      try {
        renderDocument(doc, lines, {
          title: String(title || '').trim(),
          section: String(section || '').trim()
        });

        stampFooters(doc, `${safeName} · ${highlighted.language}`);
        doc.end();
      } catch (error) {
        fail(error);
      }
    });
  } catch (error) {
    await safeUnlink(outputPath);
    throw AppError.internal(`Failed to render the PDF: ${error.message}`);
  }

  return {
    outputPath,
    outputFileName,
    originalName: `${safeName}.pdf`,
    detectedLanguage: highlighted.language,
    lineCount: lines.length
  };
}

module.exports = { generateCodePdf, detectLanguage };

'use strict';

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { marked } = require('marked');
const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const { AppError } = require('../utils/AppError');
const { sanitizeBaseName } = require('../utils/sanitizeFilename');
const { safeUnlink } = require('../utils/fileCleanup');
const { ensureWorkspace } = require('../utils/workspace');
const { resolveTheme, resolvePageSize } = require('../utils/markdownTheme');
const { BlockBuilder } = require('./markdownPdf/blocks');
const { paginate } = require('./markdownPdf/paginate');
const { sanitize } = require('./markdownPdf/inline');

const MARGIN = 54;
const FOOTER_BAND = 26;

const METRICS = {
  body: 10.5,
  bodyLeading: 15.4,
  code: 8.9,
  codeLeading: 12.6,
  tableText: 9.2,
  tableLeading: 13,
  paragraphGap: 9,
  listGap: 3
};

function registerFonts(doc) {
  const monoDir = env.fontDir;

  const pick = (file) => {
    const full = path.join(monoDir, file);
    return fs.existsSync(full) ? full : null;
  };

  const regular = pick('JetBrainsMono-Regular.ttf');
  const bold = pick('JetBrainsMono-Bold.ttf');
  const italic = pick('JetBrainsMono-Italic.ttf');

  // The body face is a PDF standard font: universally available, correct
  // metrics everywhere, and zero bytes added to the image. Code uses the
  // bundled JetBrains Mono so listings match the code→PDF converter exactly.
  const fonts = {
    regular: 'Helvetica',
    bold: 'Helvetica-Bold',
    italic: 'Helvetica-Oblique',
    boldItalic: 'Helvetica-BoldOblique',
    mono: 'Courier',
    monoBold: 'Courier-Bold',
    monoItalic: 'Courier-Oblique'
  };

  if (regular) {
    doc.registerFont('md-mono', regular);
    fonts.mono = 'md-mono';
    fonts.monoBold = 'md-mono';
    fonts.monoItalic = 'md-mono';
  }
  if (bold) {
    doc.registerFont('md-mono-bold', bold);
    fonts.monoBold = 'md-mono-bold';
  }
  if (italic) {
    doc.registerFont('md-mono-italic', italic);
    fonts.monoItalic = 'md-mono-italic';
  }

  return fonts;
}

/** Paints the page background — the whole point of the dark theme. */
function paintPage(doc, theme) {
  if (theme.name === 'light') return;

  doc.save();
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(theme.page);
  doc.restore();
}

function drawTitleBlock(doc, { title, subtitle, theme, fonts, width }) {
  let y = MARGIN;

  if (title) {
    doc.font(fonts.bold).fontSize(25).fillColor(theme.heading);
    doc.text(title, MARGIN, y, { width });
    y = doc.y + 4;
  }

  if (subtitle) {
    doc.font(fonts.regular).fontSize(11).fillColor(theme.muted);
    doc.text(subtitle, MARGIN, y, { width });
    y = doc.y + 4;
  }

  if (title || subtitle) {
    y += 8;
    doc.save();
    doc.moveTo(MARGIN, y).lineTo(MARGIN + width, y).lineWidth(1).stroke(theme.ruleStrong);
    doc.restore();
    y += 16;
  }

  return y;
}

/**
 * Footers are stamped after all content, against buffered pages: writing below
 * the bottom margin during layout makes PDFKit insert a page of its own.
 */
function stampFooters(doc, { theme, fonts, label, width }) {
  const range = doc.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);

    const originalBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = doc.page.height - MARGIN + 10;

    doc.save();
    doc
      .moveTo(MARGIN, y - 8)
      .lineTo(MARGIN + width, y - 8)
      .lineWidth(0.5)
      .stroke(theme.rule);
    doc.restore();

    doc.font(fonts.regular).fontSize(8).fillColor(theme.muted);
    if (label) doc.text(label, MARGIN, y, { width, align: 'left', lineBreak: false });
    doc.text(`${index + 1} / ${range.count}`, MARGIN, y, { width, align: 'right', lineBreak: false });

    doc.page.margins.bottom = originalBottom;
  }
}

async function renderMarkdownPdf({ markdown, filename, title, subtitle, theme: themeName, pageSize }) {
  if (typeof markdown !== 'string' || !markdown.trim()) {
    throw AppError.badRequest('Add some Markdown before converting.');
  }

  if (markdown.length > env.maxCodeChars) {
    throw AppError.payloadTooLarge(
      `The document is ${markdown.length.toLocaleString()} characters; the limit is ${env.maxCodeChars.toLocaleString()}.`
    );
  }

  ensureWorkspace();

  const theme = resolveTheme(themeName);
  const page = resolvePageSize(pageSize);
  const safeName = sanitizeBaseName(filename, 'document');
  const stats = { droppedGlyphs: 0 };

  let tokens;
  try {
    tokens = marked.lexer(markdown.replace(/\r\n?/g, '\n'), { gfm: true, breaks: false });
  } catch (error) {
    throw AppError.badRequest(`This Markdown could not be parsed: ${error.message}`);
  }

  const outputFileName = `${randomUUID()}.pdf`;
  const outputPath = path.join(env.outputDir, outputFileName);
  const contentWidth = page.width - MARGIN * 2;

  let pageCount = 0;

  try {
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: page.size,
        margin: MARGIN,
        bufferPages: true,
        autoFirstPage: true,
        info: { Title: title || `${safeName}.pdf`, Author: 'coDF', Creator: 'coDF' }
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
        const fonts = registerFonts(doc);

        paintPage(doc, theme);
        const contentTop = drawTitleBlock(doc, {
          title: sanitize(title, stats),
          subtitle: sanitize(subtitle, stats),
          theme,
          fonts,
          width: contentWidth
        });

        const builder = new BlockBuilder(doc, {
          theme,
          fonts,
          metrics: METRICS,
          stats,
          contentWidth
        });

        const blocks = builder.build(tokens, 0);

        // Measure and paginate everything before drawing, so page breaks are a
        // decision rather than an accident of where the cursor happened to be.
        const pages = paginate(blocks, {
          top: contentTop,
          bottom: page.height - MARGIN - FOOTER_BAND,
          left: MARGIN
        });

        pages.forEach((placements, index) => {
          if (index > 0) {
            doc.addPage({ size: page.size, margin: MARGIN });
            paintPage(doc, theme);
          }

          // Backgrounds first, so panels and rules sit behind their text.
          placements.forEach((placement) => {
            if (!placement.block.decorate) return;
            placement.block.decorate(doc, {
              x: placement.x,
              y: placement.y,
              height: placement.height,
              isFirst: placement.isFirst,
              isLast: placement.isLast
            });
          });

          placements.forEach((placement) => {
            let y = placement.contentY;

            for (let row = placement.rowStart; row < placement.rowEnd; row += 1) {
              placement.block.rows[row].draw(doc, placement.x, y);
              y += placement.block.rows[row].height;
            }
          });
        });

        pageCount = pages.length;

        stampFooters(doc, {
          theme,
          fonts,
          label: title ? sanitize(title, stats) : `${safeName}.md`,
          width: contentWidth
        });

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
    pageCount,
    themeUsed: theme.name,
    droppedGlyphs: stats.droppedGlyphs
  };
}

module.exports = { renderMarkdownPdf };

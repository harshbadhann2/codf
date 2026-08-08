'use strict';

const hljs = require('highlight.js');
const { flattenInline } = require('./inline');
const { wrapInline, drawLine } = require('./typeset');
const { parseHighlightedTokens, tokenColor } = require('../../utils/codeTokens');

/**
 * Markdown tokens → measured blocks.
 *
 * A block is `{ rows, keepTogether, keepWithNext, minOrphan, minWidow,
 * spaceBefore, spaceAfter, decorate }`. Rows are the atoms the paginator moves
 * between pages; the flags are what stop it making the ugly choices:
 *
 *   keepTogether  move the whole block to the next page rather than split it
 *   keepWithNext  a heading may not be the last thing on a page
 *   minOrphan     leave at least this many rows behind at a break
 *   minWidow      carry at least this many rows forward
 *   decorate      draw the panel/bar/border behind whichever rows landed here
 *
 * Splitting a code listing across a page boundary is the specific thing that
 * makes a generated PDF look amateur, so code blocks are keepTogether whenever
 * they can possibly fit on one page.
 */

const HEADING_SIZES = { 1: 21, 2: 16, 3: 13.5, 4: 11.75, 5: 10.75, 6: 10.25 };
const HEADING_SPACE_BEFORE = { 1: 20, 2: 17, 3: 14, 4: 12, 5: 11, 6: 10 };
const HEADING_SPACE_AFTER = { 1: 9, 2: 7, 3: 6, 4: 5, 5: 4, 6: 4 };

const CODE_PADDING = 10;
const CODE_GUTTER = 26;
const QUOTE_PADDING = 12;
const QUOTE_BAR = 3;
const LIST_INDENT = 20;
const TABLE_PADDING = 7;

function detectLanguage(code, requested) {
  if (requested && hljs.getLanguage(requested)) return requested;

  try {
    const auto = hljs.highlightAuto(code.slice(0, 8000));
    if (auto?.language && auto.relevance >= 6) return auto.language;
  } catch {
    /* plaintext */
  }

  return 'plaintext';
}

function highlightToLines(code, language) {
  let html;

  try {
    html = hljs.highlight(code, { language, ignoreIllegals: true }).value;
  } catch {
    html = hljs.highlight(code, { language: 'plaintext', ignoreIllegals: true }).value;
  }

  const tokens = parseHighlightedTokens(html);
  const lines = [[]];

  tokens.forEach((token) => {
    const parts = token.text.split('\n');
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ text: part, cssClass: token.cssClass });
    });
  });

  while (lines.length > 1 && lines[lines.length - 1].length === 0) lines.pop();
  return lines;
}

class BlockBuilder {
  constructor(doc, { theme, fonts, metrics, stats, contentWidth }) {
    this.doc = doc;
    this.theme = theme;
    this.fonts = fonts;
    this.metrics = metrics;
    this.stats = stats;
    this.contentWidth = contentWidth;
  }

  build(tokens, indent = 0) {
    const blocks = [];

    for (const token of tokens) {
      const made = this.buildToken(token, indent);
      if (Array.isArray(made)) blocks.push(...made);
      else if (made) blocks.push(made);
    }

    return blocks;
  }

  buildToken(token, indent) {
    switch (token.type) {
      case 'heading':
        return this.heading(token, indent);
      case 'paragraph':
        return this.paragraph(token, indent);
      case 'text':
        return token.tokens ? this.paragraph(token, indent) : null;
      case 'code':
        return this.code(token, indent);
      case 'blockquote':
        return this.blockquote(token, indent);
      case 'list':
        return this.list(token, indent);
      case 'table':
        return this.table(token, indent);
      case 'hr':
        return this.rule(indent);
      case 'space':
      case 'html':
        return null;
      default:
        return token.tokens ? this.paragraph(token, indent) : null;
    }
  }

  /* ── Heading ───────────────────────────────────────────────── */
  heading(token, indent) {
    const { theme, doc } = this;
    const size = HEADING_SIZES[token.depth] || 10.5;
    const width = this.contentWidth - indent;
    const segments = flattenInline(token.tokens, { bold: true }, this.stats);

    const { lines } = wrapInline(doc, segments, {
      width,
      fonts: this.fonts,
      baseSize: size,
      lineHeight: size * 1.3
    });

    const underlined = token.depth <= 2;

    const rows = lines.map((line) => ({
      height: line.height,
      draw: (target, x, y) => {
        line.runs.forEach((run) => {
          run.style = { ...run.style, colour: theme.heading };
        });
        drawLine(target, line, x, y, theme);
      }
    }));

    if (underlined) {
      rows.push({
        height: 8,
        draw: (target, x, y) => {
          target.save();
          target
            .moveTo(x, y + 4)
            .lineTo(x + width, y + 4)
            .lineWidth(token.depth === 1 ? 1 : 0.6)
            .stroke(token.depth === 1 ? theme.ruleStrong : theme.rule);
          target.restore();
        }
      });
    }

    return {
      kind: 'heading',
      rows,
      indent,
      // A heading stranded at the foot of a page is the other classic tell of
      // machine-made typesetting.
      keepTogether: true,
      keepWithNext: 2,
      spaceBefore: HEADING_SPACE_BEFORE[token.depth] || 10,
      spaceAfter: HEADING_SPACE_AFTER[token.depth] || 5
    };
  }

  /* ── Paragraph ─────────────────────────────────────────────── */
  paragraph(token, indent) {
    const { theme, doc, metrics } = this;
    const width = this.contentWidth - indent;
    const segments = flattenInline(token.tokens, {}, this.stats);

    const { lines } = wrapInline(doc, segments, {
      width,
      fonts: this.fonts,
      baseSize: metrics.body,
      lineHeight: metrics.bodyLeading
    });

    return {
      kind: 'paragraph',
      rows: lines.map((line) => ({
        height: line.height,
        draw: (target, x, y) => drawLine(target, line, x, y, theme)
      })),
      indent,
      minOrphan: 2,
      minWidow: 2,
      spaceBefore: 0,
      spaceAfter: metrics.paragraphGap
    };
  }

  /* ── Fenced code ───────────────────────────────────────────── */
  code(token, indent) {
    const { theme, doc, metrics } = this;
    const language = detectLanguage(token.text || '', token.lang);
    const codeLines = highlightToLines((token.text || '').replace(/\t/g, '    '), language);

    const width = this.contentWidth - indent;
    const innerX = CODE_GUTTER + CODE_PADDING;
    const innerWidth = width - innerX - CODE_PADDING;
    const palette = theme.syntax;

    doc.font(this.fonts.mono).fontSize(metrics.code);
    const charWidth = doc.widthOfString('0');
    const maxChars = Math.max(8, Math.floor(innerWidth / charWidth));

    // Wrap long code lines rather than clipping them, and mark continuations
    // in the gutter so the numbering still means something.
    const rows = [];
    codeLines.forEach((spans, index) => {
      const chunks = this.wrapCodeSpans(spans, maxChars);

      chunks.forEach((chunk, chunkIndex) => {
        rows.push({
          height: metrics.codeLeading,
          draw: (target, x, y) => {
            target.save();
            target.font(this.fonts.mono).fontSize(metrics.code * 0.86).fillColor(theme.codeGutter);
            target.text(chunkIndex === 0 ? String(index + 1) : '·', x + 6, y + 1.5, {
              width: CODE_GUTTER - 12,
              align: 'right',
              lineBreak: false
            });
            target.restore();

            let cursor = x + innerX + (chunkIndex > 0 ? charWidth : 0);
            chunk.forEach((piece) => {
              target
                .font(this.fonts.mono)
                .fontSize(metrics.code)
                .fillColor(tokenColor(piece.cssClass, palette));
              target.text(piece.text, cursor, y, { lineBreak: false });
              cursor += target.widthOfString(piece.text);
            });
          }
        });
      });
    });

    const label = language !== 'plaintext' ? language : '';

    return {
      kind: 'code',
      rows,
      indent,
      // The requirement that started this feature: a listing must not be sliced
      // in half by a page boundary. It only splits when it cannot fit on any
      // page at all, and then never leaves fewer than three lines behind.
      keepTogether: true,
      minOrphan: 3,
      minWidow: 3,
      padding: { top: CODE_PADDING, bottom: CODE_PADDING },
      spaceBefore: 6,
      spaceAfter: metrics.paragraphGap + 2,
      decorate: (target, { x, y, height, isFirst, isLast }) => {
        const radius = 6;
        target.save();
        target.roundedRect(x, y, width, height, radius).fill(theme.codeBg);
        target
          .roundedRect(x + 0.4, y + 0.4, width - 0.8, height - 0.8, radius)
          .lineWidth(0.8)
          .stroke(theme.codeBorder);
        // Gutter well, clipped to the panel so its corners stay rounded.
        target.save();
        target.roundedRect(x, y, width, height, radius).clip();
        target.rect(x, y, CODE_GUTTER, height).fill(theme.inlineCodeBg);
        target.restore();

        if (label && isFirst) {
          target.font(this.fonts.mono).fontSize(6.8).fillColor(theme.chipText);
          target.text(label.toUpperCase(), x + width - 60, y + 5, {
            width: 54,
            align: 'right',
            lineBreak: false
          });
        }

        if (!isLast) {
          target.font(this.fonts.regular).fontSize(6.8).fillColor(theme.chipText);
          target.text('continues…', x + width - 70, y + height - 10, {
            width: 64,
            align: 'right',
            lineBreak: false
          });
        }

        target.restore();
      }
    };
  }

  wrapCodeSpans(spans, maxChars) {
    const chunks = [];
    let current = [];
    let used = 0;

    spans.forEach((span) => {
      let rest = span.text;

      while (rest.length) {
        const room = maxChars - used;

        if (room <= 0) {
          chunks.push(current);
          current = [];
          used = 0;
          continue;
        }

        const take = rest.slice(0, room);
        current.push({ text: take, cssClass: span.cssClass });
        used += take.length;
        rest = rest.slice(room);
      }
    });

    if (current.length || !chunks.length) chunks.push(current);
    return chunks;
  }

  /* ── Blockquote ────────────────────────────────────────────── */
  blockquote(token, indent) {
    const { theme, metrics } = this;
    const width = this.contentWidth - indent;
    const inset = QUOTE_BAR + QUOTE_PADDING;
    const inner = this.build(token.tokens, indent + inset + QUOTE_PADDING);

    const rows = [];
    inner.forEach((block, index) => {
      if (index > 0 && block.spaceBefore) rows.push({ height: block.spaceBefore, draw: () => {} });
      block.rows.forEach((row) =>
        rows.push({ height: row.height, draw: (target, x, y) => row.draw(target, x + inset, y) })
      );
      if (index < inner.length - 1) rows.push({ height: block.spaceAfter || 0, draw: () => {} });
    });

    return {
      kind: 'blockquote',
      rows,
      indent,
      keepTogether: true,
      minOrphan: 2,
      minWidow: 2,
      padding: { top: 8, bottom: 8 },
      spaceBefore: 4,
      spaceAfter: metrics.paragraphGap,
      decorate: (target, { x, y, height }) => {
        target.save();
        target.roundedRect(x, y, width, height, 4).fill(theme.quoteBg);
        target.rect(x, y, QUOTE_BAR, height).fill(theme.quoteBar);
        target.restore();
      }
    };
  }

  /* ── Lists ─────────────────────────────────────────────────── */
  list(token, indent) {
    const { theme, metrics } = this;
    const blocks = [];
    const start = Number(token.start) || 1;

    token.items.forEach((item, index) => {
      // Offsets are relative to wherever the paginator places this block, so a
      // nested list adds another LIST_INDENT rather than re-applying the outer
      // one and marching off the right margin.
      const bodyIndent = indent + LIST_INDENT;
      const children = this.build(item.tokens, bodyIndent);

      if (!children.length) return;

      const marker = token.ordered ? `${start + index}.` : '•';
      const rows = [];

      children.forEach((block, childIndex) => {
        block.rows.forEach((row, rowIndex) => {
          const isFirstRow = childIndex === 0 && rowIndex === 0;

          rows.push({
            height: row.height,
            draw: (target, x, y) => {
              if (isFirstRow) {
                if (item.task) {
                  this.drawCheckbox(target, x, y, item.checked);
                } else {
                  target
                    .font(token.ordered ? this.fonts.regular : this.fonts.regular)
                    .fontSize(metrics.body)
                    .fillColor(theme.muted);
                  target.text(marker, x, y, {
                    width: LIST_INDENT - 7,
                    align: token.ordered ? 'right' : 'left',
                    lineBreak: false
                  });
                }
              }

              row.draw(target, x + LIST_INDENT, y);
            }
          });
        });

        if (childIndex < children.length - 1) {
          rows.push({ height: block.spaceAfter || 0, draw: () => {} });
        }
      });

      blocks.push({
        kind: 'list-item',
        rows,
        indent,
        // Keep a bullet with at least its first two lines, so an item never
        // begins as a lone marker at the bottom of a page.
        minOrphan: 2,
        minWidow: 2,
        keepWithNext: 0,
        spaceBefore: 0,
        spaceAfter: token.loose ? metrics.paragraphGap : metrics.listGap
      });
    });

    if (blocks.length) {
      blocks[blocks.length - 1].spaceAfter = metrics.paragraphGap;
    }

    return blocks;
  }

  drawCheckbox(target, x, y, checked) {
    const { theme, metrics } = this;
    const size = metrics.body * 0.85;
    const top = y + 1.5;

    target.save();
    target.roundedRect(x + 2, top, size, size, 2.5).lineWidth(0.9);

    if (checked) {
      target.fillAndStroke(theme.quoteBar, theme.quoteBar);
      target
        .moveTo(x + 2 + size * 0.24, top + size * 0.52)
        .lineTo(x + 2 + size * 0.44, top + size * 0.72)
        .lineTo(x + 2 + size * 0.78, top + size * 0.28)
        .lineWidth(1.2)
        .stroke(theme.page);
    } else {
      target.stroke(theme.ruleStrong);
    }

    target.restore();
  }

  /* ── Table ─────────────────────────────────────────────────── */
  table(token, indent) {
    const { theme, doc, metrics } = this;
    const width = this.contentWidth - indent;
    const columns = token.header.length;
    const aligns = token.align || [];

    // Natural width per column, then scaled to the content width. Columns get
    // at least a readable minimum so a narrow one does not collapse.
    const natural = new Array(columns).fill(0);
    const measure = (cell, bold) => {
      const segments = flattenInline(cell.tokens, bold ? { bold: true } : {}, { droppedGlyphs: 0 });
      const { maxWidth } = wrapInline(doc, segments, {
        width: 10000,
        fonts: this.fonts,
        baseSize: metrics.tableText,
        lineHeight: metrics.tableLeading
      });
      return maxWidth;
    };

    token.header.forEach((cell, index) => {
      natural[index] = Math.max(natural[index], measure(cell, true));
    });
    token.rows.forEach((row) => {
      row.forEach((cell, index) => {
        if (index < columns) natural[index] = Math.max(natural[index], measure(cell, false));
      });
    });

    const totalNatural = natural.reduce((sum, value) => sum + value, 0) || 1;
    const available = width - TABLE_PADDING * 2 * columns;
    const widths = natural.map((value) => Math.max(38, (value / totalNatural) * available));

    const overflow = widths.reduce((sum, value) => sum + value, 0) - available;
    if (overflow > 0) {
      // Shave proportionally from the widest columns so the table still fits.
      const scale = available / (available + overflow);
      for (let index = 0; index < widths.length; index += 1) {
        widths[index] = Math.max(38, widths[index] * scale);
      }
    }

    const buildRow = (cells, isHeader, rowIndex) => {
      const laid = cells.slice(0, columns).map((cell, index) => {
        const segments = flattenInline(cell.tokens, isHeader ? { bold: true } : {}, this.stats);
        return wrapInline(doc, segments, {
          width: widths[index],
          fonts: this.fonts,
          baseSize: metrics.tableText,
          lineHeight: metrics.tableLeading
        }).lines;
      });

      const height = Math.max(...laid.map((lines) => lines.length)) * metrics.tableLeading + TABLE_PADDING * 2;

      return {
        height,
        isHeader,
        draw: (target, x, y) => {
          target.save();

          if (isHeader) {
            target.rect(x, y, width, height).fill(theme.tableHeaderBg);
          } else if (rowIndex % 2 === 1) {
            target.rect(x, y, width, height).fill(theme.tableStripe);
          }

          target
            .moveTo(x, y + height)
            .lineTo(x + width, y + height)
            .lineWidth(0.6)
            .stroke(theme.tableBorder);

          let cellX = x + TABLE_PADDING;

          laid.forEach((lines, index) => {
            const columnWidth = widths[index];
            const align = aligns[index];

            lines.forEach((line, lineIndex) => {
              let offset = 0;
              const lineWidth = line.runs.reduce((sum, run) => sum + run.width + (run.spaceWidth || 0), 0);

              if (align === 'right') offset = columnWidth - lineWidth;
              else if (align === 'center') offset = (columnWidth - lineWidth) / 2;

              line.runs.forEach((run) => {
                run.style = {
                  ...run.style,
                  colour: isHeader ? theme.tableHeaderText : theme.text
                };
              });

              drawLine(
                target,
                line,
                cellX + Math.max(0, offset),
                y + TABLE_PADDING + lineIndex * metrics.tableLeading,
                theme
              );
            });

            cellX += columnWidth + TABLE_PADDING * 2;
          });

          target.restore();
        }
      };
    };

    const headerRow = buildRow(token.header, true, -1);
    const bodyRows = token.rows.map((row, index) => buildRow(row, false, index));

    return {
      kind: 'table',
      rows: [headerRow, ...bodyRows],
      indent,
      keepTogether: true,
      minOrphan: 2,
      minWidow: 1,
      // A table continuing onto the next page repeats its header, or the
      // columns become unreadable.
      repeatFirstRow: true,
      spaceBefore: 6,
      spaceAfter: metrics.paragraphGap + 2,
      decorate: (target, { x, y, height }) => {
        target.save();
        target.rect(x, y, width, height).lineWidth(0.6).stroke(theme.tableBorder);
        target.restore();
      }
    };
  }

  /* ── Horizontal rule ───────────────────────────────────────── */
  rule(indent) {
    const { theme, metrics } = this;
    const width = this.contentWidth - indent;

    return {
      kind: 'hr',
      rows: [
        {
          height: 1,
          draw: (target, x, y) => {
            target.save();
            target
              .moveTo(x, y)
              .lineTo(x + width, y)
              .lineWidth(0.8)
              .stroke(theme.rule);
            target.restore();
          }
        }
      ],
      indent,
      keepTogether: true,
      spaceBefore: metrics.paragraphGap + 4,
      spaceAfter: metrics.paragraphGap + 6
    };
  }
}

module.exports = { BlockBuilder };

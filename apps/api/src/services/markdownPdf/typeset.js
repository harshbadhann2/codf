'use strict';

const { toWords } = require('./inline');

/**
 * Turns styled words into laid-out lines, each with an exact height.
 *
 * Everything downstream — pagination, keep-together, orphan control — depends
 * on knowing heights before a single glyph is drawn, so this is the layer that
 * makes good page breaks possible at all.
 */

function fontFor(fonts, style) {
  if (style.code) return style.bold ? fonts.monoBold : fonts.mono;
  if (style.bold && style.italic) return fonts.boldItalic;
  if (style.bold) return fonts.bold;
  if (style.italic) return fonts.italic;
  return fonts.regular;
}

function sizeFor(baseSize, style) {
  // Monospace at the same nominal size reads noticeably larger than the body
  // face, so inline code is nudged down to sit on the same visual line.
  return style.code ? baseSize * 0.92 : baseSize;
}

function measureWord(doc, word, fonts, baseSize) {
  const font = fontFor(fonts, word.style);
  const size = sizeFor(baseSize, word.style);

  doc.font(font).fontSize(size);

  const width = doc.widthOfString(word.text);
  const spaceWidth = word.trailingSpace ? doc.widthOfString(' ') : 0;

  return { font, size, width, spaceWidth };
}

/**
 * Greedy line breaking.
 *
 * Returns `{ lines, maxWidth }` where each line is
 * `{ runs: [{ text, font, size, style, x, width }], height }`.
 */
function wrapInline(doc, segments, { width, fonts, baseSize, lineHeight }) {
  const words = toWords(segments);
  const lines = [];
  let current = { runs: [], width: 0 };
  let widest = 0;

  const flush = () => {
    // Trailing space at a break would push the last word off the measured
    // width; drop it so justification and centring stay honest.
    const last = current.runs[current.runs.length - 1];
    if (last) last.spaceWidth = 0;

    widest = Math.max(widest, current.width);
    lines.push({ runs: current.runs, height: lineHeight });
    current = { runs: [], width: 0 };
  };

  for (const word of words) {
    if (word.break) {
      flush();
      continue;
    }

    const metrics = measureWord(doc, word, fonts, baseSize);
    const advance = metrics.width + metrics.spaceWidth;

    if (current.runs.length && current.width + metrics.width > width) {
      flush();
    }

    // A single word wider than the column: hard-split it rather than let it
    // run into the margin. URLs and long identifiers hit this constantly.
    if (metrics.width > width && !current.runs.length) {
      let rest = word.text;

      while (rest.length > 1) {
        doc.font(metrics.font).fontSize(metrics.size);

        let take = rest.length;
        while (take > 1 && doc.widthOfString(rest.slice(0, take)) > width) take -= 1;

        const chunk = rest.slice(0, take);
        current.runs.push({
          text: chunk,
          font: metrics.font,
          size: metrics.size,
          style: word.style,
          x: 0,
          width: doc.widthOfString(chunk),
          spaceWidth: 0
        });
        current.width = doc.widthOfString(chunk);
        rest = rest.slice(take);

        if (rest.length) flush();
      }

      if (rest.length) {
        doc.font(metrics.font).fontSize(metrics.size);
        current.runs.push({
          text: rest,
          font: metrics.font,
          size: metrics.size,
          style: word.style,
          x: current.width,
          width: doc.widthOfString(rest),
          spaceWidth: metrics.spaceWidth
        });
        current.width += doc.widthOfString(rest) + metrics.spaceWidth;
      }

      continue;
    }

    current.runs.push({
      text: word.text,
      font: metrics.font,
      size: metrics.size,
      style: word.style,
      x: current.width,
      width: metrics.width,
      spaceWidth: metrics.spaceWidth
    });
    current.width += advance;
  }

  if (current.runs.length) flush();
  if (!lines.length) lines.push({ runs: [], height: lineHeight });

  return { lines, maxWidth: widest };
}

/** Draws one laid-out line at (x, y). */
function drawLine(doc, line, x, y, theme) {
  for (const run of line.runs) {
    if (!run.text) continue;

    const left = x + run.x;
    const style = run.style;

    if (style.code) {
      // Chip behind inline code, sized to the glyphs rather than the line box.
      doc.save();
      doc
        .roundedRect(left - 2, y - 1.5, run.width + 4, run.size + 4, 3)
        .fill(theme.inlineCodeBg);
      doc.restore();
    }

    const colour = style.code
      ? theme.inlineCodeText
      : style.link
        ? theme.link
        : style.colour || theme.text;

    doc.font(run.font).fontSize(run.size).fillColor(colour);
    doc.text(run.text, left, y, { lineBreak: false });

    if (style.link) {
      doc.save();
      doc
        .moveTo(left, y + run.size + 1.5)
        .lineTo(left + run.width, y + run.size + 1.5)
        .lineWidth(0.6)
        .stroke(theme.linkUnderline);
      doc.restore();
      doc.link(left, y - 1, run.width, run.size + 4, style.link);
    }

    if (style.strike) {
      doc.save();
      doc
        .moveTo(left, y + run.size * 0.42)
        .lineTo(left + run.width, y + run.size * 0.42)
        .lineWidth(0.7)
        .stroke(colour);
      doc.restore();
    }
  }
}

module.exports = { wrapInline, drawLine, fontFor, sizeFor };

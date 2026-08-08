'use strict';

/**
 * Inline text layout.
 *
 * PDFKit's own `text()` can wrap, but it will not tell you how many lines it
 * produced until after it has drawn them — which is useless when the whole
 * point is to decide *where a page should break before drawing anything*. So
 * inline content is measured and wrapped here, and every line comes back with
 * its exact height and the runs that sit on it.
 */

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g;

// Emoji and other pictographs have no glyph in the fonts this renderer uses.
// Left in place they come out as .notdef boxes, which looks broken; dropping
// them is the lesser evil, and the caller reports the count so it is never
// silent.
const PICTOGRAPHS = new RegExp(
  [
    '\\u{1F000}-\\u{1FAFF}',
    '\\u{1F1E6}-\\u{1F1FF}',
    '\\u{2600}-\\u{27BF}',
    '\\u{2B00}-\\u{2BFF}',
    '\\u{FE00}-\\u{FE0F}',
    '\\u{1F3FB}-\\u{1F3FF}'
  ]
    .map((range) => `[${range}]`)
    .join('|') + '|\\u{200D}',
  'gu'
);

/**
 * Arrows and maths symbols are extremely common in technical Markdown but sit
 * outside WinAnsi, which is all the standard PDF fonts can encode — left alone
 * they come out as an unrelated glyph ("→" printed as "!"). These have exact
 * ASCII equivalents, so transliterating is lossless in meaning.
 */
const TRANSLITERATE = new Map(Object.entries({
  '\u2192': '->', '\u27F6': '->', '\u21D2': '=>', '\u2190': '<-', '\u27F5': '<-',
  '\u21D0': '<=', '\u2194': '<->', '\u21D4': '<=>', '\u2191': '^', '\u2193': 'v',
  '\u2264': '<=', '\u2265': '>=', '\u2260': '!=', '\u2261': '==', '\u2248': '~=',
  '\u221E': 'infinity', '\u00B7': '\u00B7',
  '\u2713': 'v', '\u2714': 'v', '\u2717': 'x', '\u2718': 'x',
  '\u2605': '*', '\u2606': '*', '\u26A0': '!'
}));

// Code points above Latin-1 that WinAnsi does encode, so they must survive.
const WINANSI_EXTRAS = new Set([
  0x152, 0x153, 0x160, 0x161, 0x178, 0x17d, 0x17e, 0x192, 0x2c6, 0x2dc,
  0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e,
  0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122
]);

function encodable(codePoint) {
  return codePoint < 0x100 || WINANSI_EXTRAS.has(codePoint);
}

function sanitize(text, stats) {
  if (!text) return '';

  // Transliteration runs before the pictograph strip: a check mark and several
  // arrows fall inside the pictograph ranges, and dropping them would throw
  // away characters we have a perfectly good ASCII equivalent for.
  const output = String(text).replace(ZERO_WIDTH, '');
  let result = '';

  for (const character of output) {
    const replacement = TRANSLITERATE.get(character);

    if (replacement !== undefined) {
      result += replacement;
      continue;
    }

    if (PICTOGRAPHS.test(character)) {
      PICTOGRAPHS.lastIndex = 0;
      stats.droppedGlyphs += 1;
      continue;
    }
    PICTOGRAPHS.lastIndex = 0;

    if (encodable(character.codePointAt(0))) {
      result += character;
    } else {
      // Anything left would render as an unrelated glyph rather than nothing,
      // which is worse than dropping it — but never silently, so it is counted.
      stats.droppedGlyphs += 1;
    }
  }

  return result;
}

/**
 * Flattens marked's inline token tree into styled segments.
 *
 * `style` carries bold/italic/code/strike/link down through nesting, so
 * `**bold [link](x)**` keeps both attributes.
 */
function flattenInline(tokens, style, stats, out = []) {
  if (!Array.isArray(tokens)) return out;

  for (const token of tokens) {
    switch (token.type) {
      case 'text':
      case 'escape':
        out.push({ text: sanitize(token.text ?? token.raw, stats), style });
        break;

      case 'strong':
        flattenInline(token.tokens, { ...style, bold: true }, stats, out);
        break;

      case 'em':
        flattenInline(token.tokens, { ...style, italic: true }, stats, out);
        break;

      case 'del':
        flattenInline(token.tokens, { ...style, strike: true }, stats, out);
        break;

      case 'codespan':
        out.push({ text: sanitize(token.text, stats), style: { ...style, code: true } });
        break;

      case 'link':
        flattenInline(
          token.tokens?.length ? token.tokens : [{ type: 'text', text: token.text }],
          { ...style, link: token.href },
          stats,
          out
        );
        break;

      case 'br':
        out.push({ text: '\n', style });
        break;

      case 'image':
        // Inline images are not fetched (see the block renderer for why); the
        // alt text is the honest stand-in.
        out.push({ text: sanitize(token.text || 'image', stats), style: { ...style, italic: true } });
        break;

      case 'html':
        // Raw HTML in Markdown is not rendered — strip tags, keep any text.
        out.push({ text: sanitize(String(token.raw || '').replace(/<[^>]*>/g, ''), stats), style });
        break;

      default:
        if (token.tokens) flattenInline(token.tokens, style, stats, out);
        else if (token.text) out.push({ text: sanitize(token.text, stats), style });
    }
  }

  return out;
}

/** Splits segments into measurable atoms, keeping spaces attached to words. */
function toWords(segments) {
  const words = [];

  for (const segment of segments) {
    if (!segment.text) continue;

    // Split so trailing whitespace rides with the preceding word: that way a
    // line break can discard it without leaving a gap at the margin.
    const parts = segment.text.split(/(\n)|(\s+)/).filter((part) => part !== undefined && part !== '');

    for (const part of parts) {
      if (part === '\n') {
        words.push({ text: '', style: segment.style, break: true });
      } else if (/^\s+$/.test(part)) {
        if (words.length && !words[words.length - 1].break) {
          words[words.length - 1].trailingSpace = true;
        }
      } else {
        words.push({ text: part, style: segment.style });
      }
    }
  }

  return words;
}

module.exports = { flattenInline, toWords, sanitize };

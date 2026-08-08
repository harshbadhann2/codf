'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { paginate } = require('../src/services/markdownPdf/paginate');
const { sanitize } = require('../src/services/markdownPdf/inline');
const { resolveTheme, resolvePageSize } = require('../src/utils/markdownTheme');
const { request, jsonPost, filePost, stopServer } = require('./helpers');

test.after(async () => {
  await stopServer();
});

/* ── Pagination: the rules that make the output look typeset ───────── */

const rows = (count, height = 14) => Array.from({ length: count }, () => ({ height, draw: () => {} }));
const bounds = { top: 0, bottom: 700, left: 0 };

test('a code block that fits on a page is never split across one', () => {
  const filler = { rows: rows(40), spaceAfter: 0 };
  // 30 rows = 420pt: too tall for what remains, but fine on an empty page.
  const code = { rows: rows(30), keepTogether: true, spaceAfter: 0 };

  const pages = paginate([filler, code], bounds);
  const slices = pages.flat().filter((placement) => placement.block === code);

  assert.equal(slices.length, 1, 'code block was split');
  assert.equal(slices[0].rowStart, 0);
  assert.equal(slices[0].rowEnd, 30);
});

test('a code block too tall for any page splits, but not into slivers', () => {
  // 80 rows = 1120pt, taller than the 700pt page: it has to break somewhere.
  const code = { rows: rows(80), keepTogether: true, minOrphan: 3, minWidow: 3, spaceAfter: 0 };
  const pages = paginate([code], bounds);
  const slices = pages.flat().filter((placement) => placement.block === code);

  assert.ok(slices.length > 1, 'expected a split');

  slices.forEach((slice) => {
    assert.ok(slice.rowEnd - slice.rowStart >= 3, 'a slice left fewer than three lines behind');
  });
});

test('a heading is never stranded at the foot of a page', () => {
  const filler = { rows: rows(45), spaceAfter: 0 };
  const heading = { rows: rows(2), keepTogether: true, keepWithNext: 2, spaceAfter: 0 };
  // The heading's successor is a keep-together block that will move as a unit.
  const code = { rows: rows(30), keepTogether: true, spaceAfter: 0 };

  const pages = paginate([filler, heading, code], bounds);

  const headingPage = pages.findIndex((page) => page.some((placement) => placement.block === heading));
  const codePage = pages.findIndex((page) => page.some((placement) => placement.block === code));

  assert.equal(headingPage, codePage, 'heading and its block landed on different pages');
});

test('paragraphs do not leave a single line behind or carry one forward', () => {
  const filler = { rows: rows(46), spaceAfter: 0 };
  const paragraph = { rows: rows(6), minOrphan: 2, minWidow: 2, spaceAfter: 0 };

  const pages = paginate([filler, paragraph], bounds);
  const slices = pages.flat().filter((placement) => placement.block === paragraph);

  slices.forEach((slice) => {
    assert.ok(slice.rowEnd - slice.rowStart >= 2, `orphan/widow of ${slice.rowEnd - slice.rowStart} line(s)`);
  });
});

test('a continued table repeats its header row', () => {
  const table = {
    rows: rows(70),
    keepTogether: true,
    repeatFirstRow: true,
    minOrphan: 2,
    minWidow: 1,
    spaceAfter: 0
  };

  const pages = paginate([table], bounds);
  assert.ok(pages.length > 1, 'expected the table to continue');

  const continuation = pages[1].filter((placement) => placement.block === table);
  assert.ok(
    continuation.some((placement) => placement.repeated && placement.rowStart === 0),
    'header was not repeated on the continuation page'
  );
});

/* ── Themes ────────────────────────────────────────────────────────── */

test('themes are distinct palettes, not one inverted', () => {
  const light = resolveTheme('light');
  const dark = resolveTheme('dark');

  assert.notEqual(light.page, dark.page);
  assert.notEqual(light.syntax.keyword, dark.syntax.keyword);
  assert.equal(resolveTheme('nonsense').name, 'light', 'unknown theme should fall back to light');
  assert.equal(resolvePageSize('letter').size, 'LETTER');
  assert.equal(resolvePageSize('nonsense').size, 'A4');
});

/* ── Character handling ────────────────────────────────────────────── */

test('arrows transliterate instead of printing the wrong glyph', () => {
  const stats = { droppedGlyphs: 0 };
  // The standard PDF fonts encode WinAnsi only; "→" left alone prints as "!".
  assert.equal(sanitize('A → B', stats), 'A -> B');
  assert.equal(sanitize('x ≤ y', stats), 'x <= y');
  assert.equal(stats.droppedGlyphs, 0);
});

test('typographic punctuation survives', () => {
  const stats = { droppedGlyphs: 0 };
  assert.equal(sanitize('“quoted” — dash…', stats), '“quoted” — dash…');
  assert.equal(stats.droppedGlyphs, 0);
});

test('unrenderable characters are dropped and counted, never silently', () => {
  const stats = { droppedGlyphs: 0 };
  const output = sanitize('hi \u{1F389} there 日本', stats);

  assert.equal(output.includes('\u{1F389}'), false);
  assert.equal(stats.droppedGlyphs, 3, 'one emoji plus two CJK characters');
});

/* ── End to end ────────────────────────────────────────────────────── */

const DOC = `# Title

Body with **bold**, \`code\` and a [link](https://example.com).

- one
- two

\`\`\`js
const answer = 42;
console.log(answer);
\`\`\`

| A | B |
|---|--:|
| 1 | 2 |
`;

test('markdown-to-pdf renders a real PDF in both themes', async () => {
  for (const theme of ['light', 'dark']) {
    const { status, body } = await jsonPost('/api/convert/markdown-to-pdf', {
      markdown: DOC,
      filename: `doc_${theme}`,
      title: 'Report',
      theme
    });

    assert.equal(status, 201, JSON.stringify(body));
    assert.equal(body.data.themeUsed, theme);
    assert.ok(body.data.pageCount >= 1);
    assert.equal(body.data.originalName, `doc_${theme}.pdf`);

    const download = await request(`/api/files/${body.data.outputFileName}`);
    assert.equal(download.status, 200);
    assert.equal(Buffer.from(download.body).subarray(0, 4).toString(), '%PDF');
  }
});

test('an uploaded .md file converts', async () => {
  const { status, body } = await filePost('/api/convert/markdown-file-to-pdf', {
    fileName: 'notes.md',
    contents: DOC,
    type: 'text/markdown',
    fields: { theme: 'dark' }
  });

  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.data.originalName, 'notes.pdf');
  assert.equal(body.data.themeUsed, 'dark');
});

test('empty markdown is rejected', async () => {
  const { status, body } = await jsonPost('/api/convert/markdown-to-pdf', { markdown: '   ' });

  assert.equal(status, 400);
  assert.match(body.error.message, /Markdown/i);
});

test('a long document paginates rather than overflowing one page', async () => {
  const long = Array.from({ length: 60 }, (_, index) => `## Section ${index}\n\nParagraph ${index}. ${'word '.repeat(60)}`).join('\n\n');

  const { status, body } = await jsonPost('/api/convert/markdown-to-pdf', {
    markdown: long,
    filename: 'long'
  });

  assert.equal(status, 201);
  assert.ok(body.data.pageCount > 3, `expected several pages, got ${body.data.pageCount}`);
});

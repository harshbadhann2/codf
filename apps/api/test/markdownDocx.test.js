'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { marked } = require('marked');
const { blocksFromTokens, flattenInline } = require('../src/services/markdownDocx.service');
const { request, jsonPost, stopServer } = require('./helpers');

test.after(async () => {
  await stopServer();
});

const lex = (markdown) => blocksFromTokens(marked.lexer(markdown, { gfm: true }));

test('health reports the Word output', async () => {
  const { body } = await request('/api/health');

  assert.ok('markdownToDocx' in body.data.capabilities, 'markdownToDocx missing from health');
});

test('headings, lists and tables become their own blocks', () => {
  const blocks = lex('# Title\n\n- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n');
  const kinds = blocks.map((block) => block.type);

  assert.ok(kinds.includes('heading'));
  assert.equal(kinds.filter((kind) => kind === 'list').length, 2);
  assert.ok(kinds.includes('table'));
});

test('nested list items carry their depth', () => {
  const blocks = lex('- outer\n  - inner\n');
  const levels = blocks.filter((block) => block.type === 'list').map((block) => block.level);

  // Depth is what lets the renderer pick "List Bullet 2" over a hand-set
  // indent, so a flattened level here is a silently wrong Word document.
  assert.deepEqual(levels, [0, 1]);
});

test('emphasis nests rather than replacing the run', () => {
  const runs = flattenInline(marked.lexer('**bold and *both* here**')[0].tokens);
  const both = runs.find((run) => run.text.includes('both'));

  assert.equal(both.bold, true);
  assert.equal(both.italic, true);
});

test('only safe link schemes survive as hyperlinks', () => {
  const safe = flattenInline(marked.lexer('[ok](https://example.com)')[0].tokens);
  assert.equal(safe[0].link, 'https://example.com');

  // A javascript: URL left live in a .docx is a link somebody may click in
  // Word, so the text is kept and the address is dropped.
  const unsafe = flattenInline(marked.lexer('[bad](javascript:alert(1))')[0].tokens);
  assert.equal(unsafe[0].link, undefined);
  assert.equal(unsafe[0].text, 'bad');
});

test('images are never fetched, only described', () => {
  const runs = flattenInline(marked.lexer('![a cat](https://example.com/cat.png)')[0].tokens);

  assert.equal(runs.length, 1);
  assert.match(runs[0].text, /\[image: a cat\]/);
  assert.equal(runs[0].link, undefined);
});

test('empty Markdown is refused before any work happens', async () => {
  const { status, body } = await jsonPost('/api/convert/markdown-to-docx', { markdown: '   ' });

  assert.ok(status === 400 || status === 503, `unexpected status ${status}`);
  if (status === 400) assert.match(body.error.message, /Add some Markdown/i);
});

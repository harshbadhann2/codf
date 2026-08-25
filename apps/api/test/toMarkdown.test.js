'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { request, filePost, stopServer } = require('./helpers');

test.after(async () => {
  await stopServer();
});

test('health reports the Markdown conversion', async () => {
  const { body } = await request('/api/health');

  assert.ok('toMarkdown' in body.data.capabilities, 'toMarkdown missing from health');
  assert.ok('available' in body.data.capabilities.toMarkdown);
});

test('a file whose contents are not a document is refused', async () => {
  const { status, body } = await filePost('/api/convert/to-markdown', {
    fileName: 'fake.pdf',
    contents: 'this is plain text wearing a .pdf extension',
    type: 'application/pdf'
  });

  // 400 regardless of whether Python is installed: the upload is checked
  // before the capability guard, so a malformed file is answered the same way
  // on a host that could have converted a real one.
  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.match(body.error.message, /not a valid/i);
});

test('an unsupported extension is refused by name before anything is read', async () => {
  // Rejected by the upload allowlist rather than this route's own profile —
  // .rtf never reaches disk at all. Either layer answering 400 is correct;
  // what matters is that it is refused without being parsed.
  const { status, body } = await filePost('/api/convert/to-markdown', {
    fileName: 'notes.rtf',
    contents: '{\\rtf1}',
    type: 'application/rtf'
  });

  assert.equal(status, 400);
  assert.match(body.error.message, /unsupported file type|\.pdf|\.docx/i);
});

test('the .doc extension is rejected — only .docx is supported', async () => {
  // Worth pinning: a 2003-era .doc is a completely different container, and
  // python-docx opens it far enough to fail confusingly rather than cleanly.
  const { status } = await filePost('/api/convert/to-markdown', {
    fileName: 'old.doc',
    contents: 'anything',
    type: 'application/msword'
  });

  assert.equal(status, 400);
});

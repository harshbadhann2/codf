'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PDF_TO_DOCX_ENGINES } = require('../src/services/document.service');
const { getCapabilities } = require('../src/services/capabilities.service');
const { filePost, stopServer } = require('./helpers');

test.after(async () => {
  await stopServer();
});

test('both PDF to Word engines are registered, with text as the default', () => {
  assert.equal(PDF_TO_DOCX_ENGINES.text, 'pdf_to_docx_text.py');
  assert.equal(PDF_TO_DOCX_ENGINES.layout, 'pdf_to_docx.py');

  // The default matters: `layout` (pdf2docx) drops every space in LaTeX
  // output, which is what most student resumes are built from.
  const [first] = Object.keys(PDF_TO_DOCX_ENGINES);
  assert.equal(first, 'text');
});

test('an unknown mode falls back rather than erroring', async () => {
  const capabilities = await getCapabilities();

  if (!capabilities.pdfToDocx.available) {
    // The suite is expected to run without Python installed; the point of the
    // capability system is that this degrades instead of failing.
    const { status, body } = await filePost('/api/convert/pdf-to-docx', {
      fileName: 'x.pdf',
      contents: '%PDF-1.4\n%%EOF\n',
      type: 'application/pdf',
      fields: { mode: 'nonsense' }
    });

    assert.equal(status, 503);
    assert.equal(body.error.code, 'capability_unavailable');
    return;
  }

  const { status } = await filePost('/api/convert/pdf-to-docx', {
    fileName: 'tiny.pdf',
    contents: '%PDF-1.4\n%%EOF\n',
    type: 'application/pdf',
    fields: { mode: 'nonsense' }
  });

  // A bad mode must not 500 — it should be treated as the default and then
  // fail (or succeed) on the merits of the file itself.
  assert.notEqual(status, 500);
});

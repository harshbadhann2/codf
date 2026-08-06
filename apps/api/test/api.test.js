'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { request, jsonPost, filePost, stopServer } = require('./helpers');

test.after(async () => {
  await stopServer();
});

test('health reports status, limits and capabilities', async () => {
  const { status, body } = await request('/api/health');

  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.status, 'ok');
  assert.ok(body.data.limits.maxFileSizeMb > 0);

  // codeToPdf and imageConvert are pure Node — always available.
  assert.equal(body.data.capabilities.codeToPdf.available, true);
  assert.equal(body.data.capabilities.imageConvert.available, true);

  // The external-tool capabilities must always be reported, present or not.
  assert.ok('available' in body.data.capabilities.docxToPdf);
  assert.ok('available' in body.data.capabilities.pdfToDocx);
});

test('ping is a cheap liveness probe', async () => {
  const { status, body } = await request('/api/health/ping');
  assert.equal(status, 200);
  assert.equal(Buffer.from(body).toString(), 'pong');
});

test('every response carries a request id', async () => {
  const { headers } = await request('/api/health');
  assert.match(headers.get('x-request-id'), /^[\w-]+$/);
});

test('unknown routes return a structured 404', async () => {
  const { status, body } = await request('/api/does-not-exist');

  assert.equal(status, 404);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'route_not_found');
});

test('code-to-pdf renders a PDF and reports the language', async () => {
  const { status, body } = await jsonPost('/api/convert/code-to-pdf', {
    filename: 'demo_solution',
    title: 'Assignment 1',
    section: 'Section A',
    language: 'python',
    code: 'def greet(name):\n    """Say hello."""\n    return f"hello {name}"\n'
  });

  assert.equal(status, 201);
  assert.equal(body.success, true);
  assert.equal(body.data.detectedLanguage, 'python');
  assert.equal(body.data.originalName, 'demo_solution.pdf');
  assert.match(body.data.outputFileName, /\.pdf$/);

  // The download URL must be absolute: the frontend is served from a different
  // origin, so a relative path would resolve against Vercel and 404.
  assert.match(body.data.downloadUrl, /^https?:\/\/127\.0\.0\.1:\d+\/api\/files\//);
});

test('code-to-pdf output is a real, downloadable PDF', async () => {
  const { body: created } = await jsonPost('/api/convert/code-to-pdf', {
    filename: 'roundtrip',
    code: 'const answer = 42;\nconsole.log(answer);\n'
  });

  const download = await request(`/api/files/${created.data.outputFileName}?name=roundtrip.pdf`);

  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'application/pdf');
  assert.match(download.headers.get('content-disposition'), /filename="roundtrip\.pdf"/);
  assert.equal(Buffer.from(download.body).subarray(0, 4).toString(), '%PDF');
});

test('code-to-pdf rejects an empty body', async () => {
  const { status, body } = await jsonPost('/api/convert/code-to-pdf', { code: '   ' });

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'bad_request');
});

test('download rejects path traversal and unknown ids', async () => {
  const traversal = await request('/api/files/..%2F..%2Fetc%2Fpasswd');
  assert.ok(traversal.status === 400 || traversal.status === 404);

  const missing = await request('/api/files/00000000-0000-4000-8000-000000000000.pdf');
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, 'not_found');
});

test('uploads are validated by magic number, not by extension', async () => {
  // A PDF-shaped name whose bytes are plain text must be refused.
  const { status, body } = await filePost('/api/convert/pdf-to-docx', {
    fileName: 'not-really.pdf',
    contents: 'this is plain text pretending to be a pdf',
    type: 'application/pdf'
  });

  assert.equal(status, 400);
  assert.match(body.error.message, /not a valid PDF/i);
});

test('unsupported file types are refused at upload time', async () => {
  const { status, body } = await filePost('/api/convert/image', {
    fileName: 'payload.exe',
    contents: 'MZ binary',
    type: 'application/octet-stream'
  });

  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test('code files are converted and .ipynb notebooks are flattened', async () => {
  const notebook = JSON.stringify({
    cells: [
      { cell_type: 'markdown', source: ['# Title\n'] },
      { cell_type: 'code', source: ['import math\n', 'print(math.pi)\n'] }
    ]
  });

  const { status, body } = await filePost('/api/convert/code-file-to-pdf', {
    fileName: 'analysis.ipynb',
    contents: notebook,
    type: 'application/json',
    fields: { title: 'Notebook export' }
  });

  assert.equal(status, 201);
  assert.equal(body.data.originalName, 'analysis.pdf');
  assert.ok(body.data.lineCount > 0);
});

test('image conversion produces a PNG with correct dimensions', async () => {
  const sharp = require('sharp');
  const jpeg = await sharp({
    create: { width: 24, height: 16, channels: 3, background: '#ff8800' }
  })
    .jpeg()
    .toBuffer();

  const { status, body } = await filePost('/api/convert/image', {
    fileName: 'swatch.jpg',
    contents: jpeg,
    type: 'image/jpeg',
    fields: { targetFormat: 'png' }
  });

  assert.equal(status, 201);
  assert.equal(body.data.originalName, 'swatch.png');
  assert.equal(body.data.width, 24);
  assert.equal(body.data.height, 16);

  const download = await request(`/api/files/${body.data.outputFileName}`);
  assert.equal(download.headers.get('content-type'), 'image/png');
});

test('image conversion rejects an unknown target format', async () => {
  const sharp = require('sharp');
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } })
    .png()
    .toBuffer();

  const { status } = await filePost('/api/convert/image', {
    fileName: 'tiny.png',
    contents: png,
    type: 'image/png',
    fields: { targetFormat: 'tiff' }
  });

  assert.equal(status, 400);
});

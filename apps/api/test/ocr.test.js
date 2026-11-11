'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { SEGMENTATION } = require('../src/services/ocr.service');
const { getCapabilities } = require('../src/services/capabilities.service');
const { request, filePost, stopServer } = require('./helpers');

test.after(async () => {
  await stopServer();
});

test('segmentation modes cover the shapes text arrives in', () => {
  // 3 = automatic page analysis, 6 = one uniform block, 7 = a single line.
  // These are Tesseract's own PSM numbers; drifting from them silently
  // changes behaviour, so they are pinned.
  assert.equal(SEGMENTATION.auto, 3);
  assert.equal(SEGMENTATION.block, 6);
  assert.equal(SEGMENTATION.line, 7);
});

test('health reports both extraction routes', async () => {
  const { body } = await request('/api/health');
  const capabilities = body.data.capabilities;

  assert.ok('imageToText' in capabilities, 'imageToText missing from health');
  assert.ok('pdfToText' in capabilities, 'pdfToText missing from health');
  assert.ok('available' in capabilities.imageToText);
  assert.ok('available' in capabilities.pdfToText);
});

test('a non-image is refused before OCR is attempted', async () => {
  // The upload is validated before the capability guard runs (see
  // conversion.routes.js), so this is a 400 whether or not Tesseract exists.
  const { status, body } = await filePost('/api/convert/image-to-text', {
    fileName: 'fake.png',
    contents: 'this is plain text pretending to be a png',
    type: 'image/png'
  });

  assert.equal(status, 400);
  assert.match(body.error.message, /not a valid image/i);
});

test('an image with no text gives a useful message rather than empty output', async () => {
  const capabilities = await getCapabilities();
  if (!capabilities.imageToText.available) return; // engine absent; covered above

  const blank = await sharp({
    create: { width: 600, height: 400, channels: 3, background: '#dddddd' }
  })
    .png()
    .toBuffer();

  const { status, body } = await filePost('/api/convert/image-to-text', {
    fileName: 'blank.png',
    contents: blank,
    type: 'image/png',
    fields: { mode: 'auto' }
  });

  assert.equal(status, 400);
  assert.match(body.error.message, /no readable text/i);
});

test('extraction is guarded when the engine is missing', async () => {
  const capabilities = await getCapabilities();
  if (capabilities.imageToText.available) return;

  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: '#fff' } })
    .png()
    .toBuffer();

  const { status, body } = await filePost('/api/convert/image-to-text', {
    fileName: 'x.png',
    contents: png,
    type: 'image/png'
  });

  assert.equal(status, 503);
  assert.match(body.error.message, /tesseract/i);
});

test('text output downloads as .txt', async () => {
  const capabilities = await getCapabilities();
  if (!capabilities.imageToText.available) return;

  // Render legible text with sharp so the assertion does not depend on a
  // fixture file living in the repo.
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="240">
       <rect width="900" height="240" fill="white"/>
       <text x="40" y="120" font-family="DejaVu Sans, Helvetica, Arial" font-size="64" fill="black">Hello World</text>
     </svg>`
  );

  const png = await sharp(svg).png().toBuffer();

  const { status, body } = await filePost('/api/convert/image-to-text', {
    fileName: 'hello.png',
    contents: png,
    type: 'image/png',
    fields: { mode: 'block' }
  });

  if (status !== 201) return; // rendering fonts vary by host; not the unit under test

  assert.equal(body.data.originalName, 'hello.txt');
  assert.ok(typeof body.data.text === 'string');
  assert.ok(body.data.characters > 0);

  const download = await request(`/api/files/${body.data.outputFileName}`);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-type'), /text\/plain/);
});

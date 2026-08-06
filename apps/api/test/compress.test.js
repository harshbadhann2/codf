'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { request, filePost, stopServer } = require('./helpers');

test.after(async () => {
  await stopServer();
});

/**
 * Builds a noisy photo-like JPEG. Random pixels resist compression, so a
 * target is only met by genuinely doing the work — a flat colour would encode
 * to a few hundred bytes regardless and prove nothing.
 */
async function noisyPhoto(width, height) {
  const pixels = Buffer.alloc(width * height * 3);
  let seed = 42;

  for (let i = 0; i < pixels.length; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    pixels[i] = seed % 256;
  }

  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 100 })
    .toBuffer();
}

function compress(contents, fields) {
  return filePost('/api/convert/image-compress', {
    fileName: 'photo.jpg',
    contents,
    type: 'image/jpeg',
    fields
  });
}

test('compresses a large photo under a 100 KB target', async () => {
  const photo = await noisyPhoto(1400, 1100);
  assert.ok(photo.length > 200 * 1024, 'fixture must start well above the target');

  const { status, body } = await compress(photo, { targetKb: '100' });

  assert.equal(status, 201);
  assert.equal(body.success, true);
  assert.equal(body.data.withinTarget, true);
  assert.ok(body.data.bytes <= 100 * 1024, `got ${body.data.bytes} bytes`);
  assert.ok(body.data.bytes > 0);
  assert.equal(body.data.originalBytes, photo.length);
});

test('hits a tight 20 KB signature target by downscaling when needed', async () => {
  const photo = await noisyPhoto(1200, 900);
  const { status, body } = await compress(photo, { targetKb: '20' });

  assert.equal(status, 201);
  assert.ok(body.data.bytes <= 20 * 1024, `got ${body.data.bytes} bytes`);
  assert.equal(body.data.withinTarget, true);
  // Quality alone cannot reach 20 KB from this source, so pixels must go —
  // and the response has to admit it.
  assert.equal(body.data.downscaled, true);
  assert.ok(body.data.width < body.data.originalWidth);
});

test('honours exact dimensions with cover, and still meets the target', async () => {
  const photo = await noisyPhoto(1000, 1000);
  const { status, body } = await compress(photo, {
    targetKb: '50',
    width: '200',
    height: '230',
    fit: 'cover'
  });

  assert.equal(status, 201);
  assert.equal(body.data.width, 200);
  assert.equal(body.data.height, 230);
  assert.ok(body.data.bytes <= 50 * 1024);
});

test('inside fit preserves aspect ratio within the box', async () => {
  const photo = await noisyPhoto(1000, 500);
  const { body } = await compress(photo, { targetKb: '100', width: '400', height: '400', fit: 'inside' });

  assert.equal(body.data.width, 400);
  assert.equal(body.data.height, 200);
});

test('an already-small image passes through without being made worse', async () => {
  const photo = await noisyPhoto(120, 120);
  const { status, body } = await compress(photo, { targetKb: '500' });

  assert.equal(status, 201);
  assert.equal(body.data.withinTarget, true);
  assert.equal(body.data.downscaled, false);
  assert.equal(body.data.width, 120);
});

test('produces a real, downloadable file of the requested format', async () => {
  const photo = await noisyPhoto(600, 600);
  const { body } = await compress(photo, { targetKb: '40', format: 'webp' });

  assert.equal(body.data.originalName, 'photo.webp');

  const download = await request(`/api/files/${body.data.outputFileName}`);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('content-type'), 'image/webp');
  assert.ok(download.body.byteLength <= 40 * 1024);
});

test('png targets are met through palette quantisation', async () => {
  const photo = await noisyPhoto(700, 700);
  const { status, body } = await compress(photo, { targetKb: '60', format: 'png' });

  assert.equal(status, 201);
  assert.ok(body.data.bytes <= 60 * 1024, `got ${body.data.bytes} bytes`);
  assert.equal(body.data.originalName, 'photo.png');
});

test('resizing to requested dimensions does not count as being downscaled', async () => {
  const photo = await noisyPhoto(900, 900);

  // The output is far smaller than the input, but only because those are the
  // dimensions that were asked for. Reporting that as "we had to shrink it"
  // sends the user off to fix a problem they do not have.
  const { body } = await compress(photo, {
    targetKb: '20',
    width: '140',
    height: '60',
    fit: 'cover'
  });

  assert.equal(body.data.width, 140);
  assert.equal(body.data.height, 60);
  assert.equal(body.data.downscaled, false);
});

test('meets a minimum size as well as a maximum', async () => {
  const photo = await noisyPhoto(1000, 1000);
  const { status, body } = await compress(photo, {
    targetKb: '50',
    minKb: '20',
    width: '200',
    height: '230',
    fit: 'cover'
  });

  assert.equal(status, 201);
  assert.ok(body.data.bytes >= 20 * 1024, `below floor: ${body.data.bytes}`);
  assert.ok(body.data.bytes <= 50 * 1024, `above ceiling: ${body.data.bytes}`);
  assert.equal(body.data.withinTarget, true);
});

test('a padded image is still a valid, correctly sized picture', async () => {
  const photo = await noisyPhoto(800, 800);
  // 140x60 cannot naturally reach 15 KB, so this forces the padding path.
  const { body } = await compress(photo, {
    targetKb: '20',
    minKb: '15',
    width: '140',
    height: '60',
    fit: 'cover'
  });

  assert.equal(body.data.padded, true);
  assert.ok(body.data.bytes >= 15 * 1024);

  const download = await request(`/api/files/${body.data.outputFileName}`);
  const buffer = Buffer.from(download.body);

  // Padding lives in a JPEG COM segment, so the stream must still open with
  // SOI and close with EOI — trailing junk would fail a strict validator.
  assert.equal(buffer.subarray(0, 2).toString('hex'), 'ffd8');
  assert.equal(buffer.subarray(-2).toString('hex'), 'ffd9');

  const meta = await sharp(buffer).metadata();
  assert.equal(meta.width, 140);
  assert.equal(meta.height, 60);
  assert.equal(meta.format, 'jpeg');
});

test('a padded PNG stays decodable', async () => {
  const photo = await noisyPhoto(600, 600);
  const { body } = await compress(photo, {
    targetKb: '40',
    minKb: '35',
    format: 'png',
    width: '200',
    height: '230',
    fit: 'cover'
  });

  assert.ok(body.data.bytes >= 35 * 1024);

  const download = await request(`/api/files/${body.data.outputFileName}`);
  const meta = await sharp(Buffer.from(download.body)).metadata();

  assert.equal(meta.format, 'png');
  assert.equal(meta.width, 200);
  assert.equal(meta.height, 230);
});

test('rejects a minimum larger than the maximum', async () => {
  const photo = await noisyPhoto(200, 200);
  const { status, body } = await compress(photo, { targetKb: '20', minKb: '50' });

  assert.equal(status, 400);
  assert.match(body.error.message, /minimum size cannot be larger/i);
});

test('rejects a missing or nonsensical target size', async () => {
  const photo = await noisyPhoto(100, 100);

  const missing = await compress(photo, {});
  assert.equal(missing.status, 400);
  assert.match(missing.body.error.message, /maximum size/i);

  const zero = await compress(photo, { targetKb: '0' });
  assert.equal(zero.status, 400);

  const junk = await compress(photo, { targetKb: 'abc' });
  assert.equal(junk.status, 400);
});

test('rejects out-of-range dimensions', async () => {
  const photo = await noisyPhoto(100, 100);
  const { status, body } = await compress(photo, { targetKb: '50', width: '99999' });

  assert.equal(status, 400);
  assert.match(body.error.message, /width/i);
});

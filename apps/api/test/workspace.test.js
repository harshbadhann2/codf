'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { cleanupOldFiles } = require('../src/utils/fileCleanup');
const { startServer, request, filePost, jsonPost, stopServer } = require('./helpers');

test.after(async () => {
  await stopServer();
});

const workDir = () => process.env.WORK_DIR;
const uploadDir = () => path.join(workDir(), 'uploads');
const outputDir = () => path.join(workDir(), 'outputs');

/**
 * Regression: the scratch directories used to be created once at boot, and the
 * periodic sweep of the work directory happily deleted them once their mtime
 * went stale during a quiet spell. Every upload afterwards failed with an
 * opaque 500 (ENOENT from Multer) until the process restarted — so the API
 * worked right after a deploy and broke an hour later.
 */
test('uploads still work after the scratch directories are deleted', async () => {
  await startServer();

  fs.rmSync(uploadDir(), { recursive: true, force: true });
  fs.rmSync(outputDir(), { recursive: true, force: true });
  assert.equal(fs.existsSync(uploadDir()), false, 'precondition: uploads dir removed');

  const png = await sharp({ create: { width: 32, height: 32, channels: 3, background: '#0aa' } })
    .png()
    .toBuffer();

  const { status, body } = await filePost('/api/convert/image', {
    fileName: 'after-cleanup.png',
    contents: png,
    type: 'image/png',
    fields: { targetFormat: 'jpg' }
  });

  assert.equal(status, 201, JSON.stringify(body));
  assert.equal(body.data.originalName, 'after-cleanup.jpg');

  const download = await request(`/api/files/${body.data.outputFileName}`);
  assert.equal(download.status, 200);
});

test('code-to-pdf recreates the output directory if it has gone', async () => {
  await startServer();
  fs.rmSync(outputDir(), { recursive: true, force: true });

  const { status, body } = await jsonPost('/api/convert/code-to-pdf', {
    filename: 'recreated',
    code: 'print("still here")\n'
  });

  assert.equal(status, 201, JSON.stringify(body));

  const download = await request(`/api/files/${body.data.outputFileName}`);
  assert.equal(download.status, 200);
});

test('the work-dir sweep never removes the directories the app depends on', async () => {
  await startServer();
  fs.mkdirSync(uploadDir(), { recursive: true });
  fs.mkdirSync(outputDir(), { recursive: true });

  // A stray per-conversion temp dir, backdated so the sweep considers it old.
  const stray = path.join(workDir(), 'lo-00000000-0000-4000-8000-000000000000');
  fs.mkdirSync(stray, { recursive: true });
  const oldTime = new Date(Date.now() - 60 * 60 * 1000);
  fs.utimesSync(stray, oldTime, oldTime);
  fs.utimesSync(uploadDir(), oldTime, oldTime);
  fs.utimesSync(outputDir(), oldTime, oldTime);

  await cleanupOldFiles(workDir(), 1000, { protect: ['uploads', 'outputs'] });

  assert.equal(fs.existsSync(stray), false, 'stray temp dir should be collected');
  assert.equal(fs.existsSync(uploadDir()), true, 'uploads must survive');
  assert.equal(fs.existsSync(outputDir()), true, 'outputs must survive');
});

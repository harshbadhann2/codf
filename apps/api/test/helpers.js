'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.TRUST_PROXY = '0';

// Each test process gets its own scratch directory so runs never see each
// other's files. The path is only computed here — `src/app` creates it, and
// `stopServer` removes it. Nothing happens merely by importing this module,
// because Node's test runner treats every file under test/ as a test file and
// will execute this one on its own.
process.env.WORK_DIR = path.join(os.tmpdir(), `codf-test-${process.pid}-${Date.now()}`);

let app;
let server;
let baseUrl;

async function startServer() {
  if (server) return baseUrl;

  // Required lazily: loading the app reads env vars set above and creates the
  // work directory, neither of which should happen at import time.
  ({ app } = require('../src/app'));

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

async function stopServer() {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
    server = undefined;
  }

  fs.rmSync(process.env.WORK_DIR, { recursive: true, force: true });
}

async function request(pathname, options = {}) {
  const url = `${await startServer()}${pathname}`;
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.arrayBuffer();

  return { status: response.status, headers: response.headers, body };
}

function jsonPost(pathname, payload) {
  return request(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

function filePost(pathname, { fileName, contents, type = 'application/octet-stream', fields = {} }) {
  const form = new FormData();
  form.append('file', new Blob([contents], { type }), fileName);
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));

  return request(pathname, { method: 'POST', body: form });
}

module.exports = { startServer, stopServer, request, jsonPost, filePost };

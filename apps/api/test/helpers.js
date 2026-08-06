'use strict';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.TRUST_PROXY = '0';

const os = require('os');
const path = require('path');
const fs = require('fs');

// Every run gets its own scratch dir so tests never see each other's files.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codf-test-'));
process.env.WORK_DIR = workDir;

const { app } = require('../src/app');

let server;
let baseUrl;

async function startServer() {
  if (server) return baseUrl;

  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });

  baseUrl = `http://127.0.0.1:${server.address().port}`;
  return baseUrl;
}

async function stopServer() {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
  server = undefined;
  fs.rmSync(workDir, { recursive: true, force: true });
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

module.exports = { startServer, stopServer, request, jsonPost, filePost, workDir };

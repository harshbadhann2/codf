'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeBaseName, sanitizeDownloadName } = require('../src/utils/sanitizeFilename');
const { isAllowedOrigin } = require('../src/config/cors');
const { JobQueue } = require('../src/utils/jobQueue');
const { parseHighlightedTokens, tokenColor } = require('../src/utils/codeTokens');

test('sanitizeBaseName strips anything filesystem-unsafe', () => {
  assert.equal(sanitizeBaseName('my report (final).pdf'), 'my_report_final_pdf');
  assert.equal(sanitizeBaseName('../../etc/passwd'), 'etc_passwd');
  assert.equal(sanitizeBaseName(''), 'converted_file');
  assert.equal(sanitizeBaseName('   '), 'converted_file');
  assert.ok(sanitizeBaseName('x'.repeat(200)).length <= 60);
});

test('sanitizeDownloadName keeps the real extension', () => {
  assert.equal(sanitizeDownloadName('Lab Report.docx', 'pdf'), 'Lab_Report.pdf');
  assert.equal(sanitizeDownloadName('../../evil', 'png'), 'evil.png');
});

test('localhost is always an allowed origin', () => {
  assert.equal(isAllowedOrigin('http://localhost:5173'), true);
  assert.equal(isAllowedOrigin('http://127.0.0.1:3000'), true);
  // No Origin header at all (curl, health checks) must pass through.
  assert.equal(isAllowedOrigin(undefined), true);
});

test('unknown production origins are refused', () => {
  assert.equal(isAllowedOrigin('https://malicious.example.com'), false);
});

test('the job queue serialises work and rejects an overfull queue', async () => {
  const queue = new JobQueue({ concurrency: 1, maxQueued: 1, queueTimeoutMs: 1000 });
  const order = [];

  const slow = (label, ms) => () =>
    new Promise((resolve) => {
      setTimeout(() => {
        order.push(label);
        resolve(label);
      }, ms);
    });

  const first = queue.run('a', slow('a', 40));
  const second = queue.run('b', slow('b', 5));

  // One active + one queued is the ceiling; the third must be turned away.
  await assert.rejects(() => queue.run('c', slow('c', 5)), /busy/i);

  await Promise.all([first, second]);
  assert.deepEqual(order, ['a', 'b']);
});

test('highlight markup flattens into coloured tokens', () => {
  const tokens = parseHighlightedTokens('<span class="hljs-keyword">const</span> x = 1;');

  assert.equal(tokens[0].text, 'const');
  assert.match(tokens[0].cssClass, /keyword/);
  assert.notEqual(tokenColor('hljs-keyword'), tokenColor('hljs-string'));
  assert.equal(tokens.map((token) => token.text).join(''), 'const x = 1;');
});

test('nested highlight spans keep their outer class in scope', () => {
  const tokens = parseHighlightedTokens(
    '<span class="hljs-function"><span class="hljs-title">main</span>()</span>'
  );

  assert.equal(tokens[0].text, 'main');
  assert.match(tokens[0].cssClass, /function/);
  assert.match(tokens[0].cssClass, /title/);
});

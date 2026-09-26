'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
// helpers must load first: it sets NODE_ENV and WORK_DIR before env.js reads them.
const { jsonPost, filePost, stopServer } = require('./helpers');
const PDFDocument = require('pdfkit');
const { Anthropic } = require('@anthropic-ai/sdk');
const { env } = require('../src/config/env');
const { redactSecrets } = require('../src/utils/redactSecrets');
const { explainCode, parseExplanation, ExplanationError } = require('../src/services/llmService');

const HEADING = 'AI-generated explanation – verify before submission';

const GOOD_JSON = JSON.stringify({
  summary: 'Adds up the numbers in a list.',
  approach: 'Loops over the list once, keeping a running total.',
  complexity: { time: 'O(n) - one pass over the list', space: 'O(1) - a single accumulator' }
});

/** A stand-in for the Anthropic client. Records every request it receives. */
function fakeClient(respond) {
  const calls = [];

  return {
    calls,
    messages: {
      create: async (params) => {
        calls.push(params);
        return respond(params);
      }
    }
  };
}

const replyWith = (text, stopReason = 'end_turn') => () => ({
  stop_reason: stopReason,
  content: [{ type: 'text', text }]
});

// Every test decides for itself whether the feature is configured. A developer's
// real key in apps/api/.env must never leak into a test and reach the network.
const original = { key: env.llmApiKey, model: env.llmModel };

function configure(key, model = 'test-model') {
  env.llmApiKey = key;
  env.llmModel = key ? model : '';
}

test.afterEach(() => {
  mock.restoreAll();
  configure('');
});

test.after(async () => {
  env.llmApiKey = original.key;
  env.llmModel = original.model;
  await stopServer();
});

// ─── Secret redaction ──────────────────────────────────────────────────────

test('redactSecrets masks provider keys, tokens, private keys and emails', () => {
  const code = [
    'ANTHROPIC = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123"',
    "aws_id = 'AKIAIOSFODNN7EXAMPLE'",
    'gh = "ghp_abcdefghijklmnopqrstuvwxyz0123456789"',
    'jwt = eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    'headers = {"Authorization": "Bearer abcdefghijklmnop1234567890"}',
    '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----',
    'owner = "alice@example.com"'
  ].join('\n');

  const { text, count } = redactSecrets(code);

  assert.equal(count, 7);
  for (const secret of ['sk-ant-api03', 'AKIAIOSFODNN7', 'ghp_', 'eyJhbGci', 'abcdefghijklmnop1234', 'MIIEow', 'alice@']) {
    assert.ok(!text.includes(secret), `${secret} should have been redacted`);
  }

  assert.match(text, /\[REDACTED_API_KEY\]/);
  assert.match(text, /\[REDACTED_JWT\]/);
  assert.match(text, /Bearer \[REDACTED_TOKEN\]/);
  assert.match(text, /\[REDACTED_PRIVATE_KEY\]/);
  assert.match(text, /\[REDACTED_EMAIL\]/);
});

test('redactSecrets masks string literals assigned to secret-looking names, keeping the structure', () => {
  const { text } = redactSecrets('password = "hunter2"\nconst dbSecret = \'abc\';\n"client_secret": "xyz"');

  assert.equal(text, 'password = "[REDACTED_SECRET]"\nconst dbSecret = \'[REDACTED_SECRET]\';\n"client_secret": "[REDACTED_SECRET]"');
});

test('redactSecrets leaves ordinary code untouched', () => {
  const code = [
    'def binary_search(items, target):',
    '    low, high = 0, len(items) - 1',
    '    password = input("Enter password: ")',
    '    if token == expected: return True',
    '@app.route("/login")',
    'int main() { printf("%d\\n", 42); return 0; }'
  ].join('\n');

  assert.deepEqual(redactSecrets(code), { text: code, count: 0 });
});

// ─── Parsing and validating the model's JSON ───────────────────────────────

test('parseExplanation accepts the exact JSON shape', () => {
  assert.deepEqual(parseExplanation(GOOD_JSON), JSON.parse(GOOD_JSON));
});

test('parseExplanation tolerates a ```json fence around the object', () => {
  assert.deepEqual(parseExplanation(`\`\`\`json\n${GOOD_JSON}\n\`\`\``), JSON.parse(GOOD_JSON));
});

test('parseExplanation rejects malformed or incomplete responses', () => {
  const cases = [
    'Sure! Here is the explanation: it adds numbers.',
    '{"summary": "cut off mid',
    JSON.stringify({ summary: 'x', approach: 'y' }),
    JSON.stringify({ summary: 'x', approach: 'y', complexity: { time: 'O(n)' } }),
    JSON.stringify({ summary: 42, approach: 'y', complexity: { time: 'O(n)', space: 'O(1)' } }),
    JSON.stringify({ summary: '   ', approach: 'y', complexity: { time: 'O(n)', space: 'O(1)' } }),
    'null',
    ''
  ];

  cases.forEach((raw) => assert.throws(() => parseExplanation(raw), ExplanationError, raw));
});

test('parseExplanation caps runaway field lengths', () => {
  const long = JSON.stringify({
    summary: 'word '.repeat(1000),
    approach: 'y',
    complexity: { time: 'O(n)', space: 'O(1)' }
  });

  const { summary } = parseExplanation(long);
  assert.equal(summary.length, 600);
  assert.ok(summary.endsWith('…'));
});

// ─── explainCode: safeguards and fallbacks (fake client, no network) ───────

test('explainCode returns the explanation and sends redacted code to the model', async () => {
  configure('test-key', 'claude-test');
  const client = fakeClient(replyWith(GOOD_JSON));

  const outcome = await explainCode(
    { code: 'API_KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz"\nprint(sum([1, 2]))', language: 'python' },
    { client }
  );

  assert.equal(outcome.status, 'included');
  assert.deepEqual(outcome.explanation, JSON.parse(GOOD_JSON));

  const [request] = client.calls;
  assert.equal(request.model, 'claude-test');
  assert.match(request.system, /JSON/);
  assert.match(request.messages[0].content, /Language: python/);
  assert.match(request.messages[0].content, /\[REDACTED_API_KEY\]/);
  assert.ok(!request.messages[0].content.includes('sk-ant-api03'));
});

test('explainCode is off when the key or model is missing, without calling the model', async () => {
  for (const [key, model] of [['', 'claude-test'], ['test-key', '']]) {
    env.llmApiKey = key;
    env.llmModel = model;
    const client = fakeClient(replyWith(GOOD_JSON));

    const outcome = await explainCode({ code: 'print(1)', language: 'python' }, { client });

    assert.equal(outcome.status, 'skipped');
    assert.match(outcome.reason, /not configured/);
    assert.equal(client.calls.length, 0);
  }
});

test('explainCode skips oversized code with a clear reason, without calling the model', async () => {
  configure('test-key');
  const client = fakeClient(replyWith(GOOD_JSON));

  const outcome = await explainCode({ code: 'x'.repeat(env.llmMaxCodeChars + 1), language: '' }, { client });

  assert.equal(outcome.status, 'skipped');
  assert.match(outcome.reason, /limited to/);
  assert.equal(client.calls.length, 0);
});

test('explainCode falls back with a specific reason for every failure mode', async () => {
  configure('test-key');

  const failures = [
    [() => { throw new Anthropic.APIConnectionTimeoutError(); }, /too long/],
    [() => { throw new Error('socket hang up'); }, /unavailable/],
    [replyWith('I would rather not answer in JSON.'), /could not be understood/],
    [replyWith('{"summary": "trunc', 'max_tokens'), /could not be understood/]
  ];

  for (const [respond, reason] of failures) {
    const outcome = await explainCode({ code: 'print(1)', language: 'python' }, { client: fakeClient(respond) });

    assert.equal(outcome.status, 'skipped');
    assert.match(outcome.reason, reason);
    assert.equal(outcome.explanation, undefined);
  }
});

// ─── End to end through the real Express app ───────────────────────────────

/** Records every string PDFKit prints, so tests can check what ended up in the PDF. */
function spyOnPdfText() {
  const spy = mock.method(PDFDocument.prototype, 'text');
  return () => spy.mock.calls.map((call) => call.arguments[0]);
}

const PROGRAM = {
  filename: 'sum_list',
  language: 'python',
  code: 'def total(xs):\n    return sum(xs)\n'
};

test('code-to-pdf with the toggle off is unchanged: no AI call, no AI field', async () => {
  configure('test-key');
  const create = mock.method(Anthropic.Messages.prototype, 'create', async () => {
    throw new Error('must not be called');
  });
  const printed = spyOnPdfText();

  const { status, body } = await jsonPost('/api/convert/code-to-pdf', PROGRAM);

  assert.equal(status, 201);
  assert.equal(create.mock.callCount(), 0);
  assert.equal('aiExplanation' in body.data, false);
  assert.equal(printed().includes(HEADING), false);
});

test('code-to-pdf with explain on and no API key still returns the PDF, plus a notice', async () => {
  configure('');

  const { status, body } = await jsonPost('/api/convert/code-to-pdf', { ...PROGRAM, explain: true });

  assert.equal(status, 201);
  assert.match(body.data.outputFileName, /\.pdf$/);
  assert.equal(body.data.aiExplanation.status, 'skipped');
  assert.match(body.data.aiExplanation.reason, /not configured/);
});

test('code-to-pdf with explain on prints the labelled explanation (mocked SDK)', async () => {
  configure('test-key');
  const create = mock.method(Anthropic.Messages.prototype, 'create', async () => replyWith(GOOD_JSON)());
  const printed = spyOnPdfText();

  const { status, body } = await jsonPost('/api/convert/code-to-pdf', { ...PROGRAM, explain: true });

  assert.equal(status, 201);
  assert.equal(create.mock.callCount(), 1);
  assert.deepEqual(body.data.aiExplanation, { status: 'included' });
  assert.ok(printed().includes(HEADING));
  assert.ok(printed().includes('Adds up the numbers in a list.'));
});

test('code-file-to-pdf accepts explain as a form field and falls back on an SDK error', async () => {
  configure('test-key');
  mock.method(Anthropic.Messages.prototype, 'create', async () => {
    throw new Anthropic.APIConnectionTimeoutError();
  });

  const { status, body } = await filePost('/api/convert/code-file-to-pdf', {
    fileName: 'sum_list.py',
    contents: PROGRAM.code,
    type: 'text/x-python',
    fields: { explain: 'true' }
  });

  assert.equal(status, 201);
  assert.equal(body.data.detectedLanguage, 'python');
  assert.equal(body.data.aiExplanation.status, 'skipped');
  assert.match(body.data.aiExplanation.reason, /too long/);
});

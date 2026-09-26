'use strict';

/**
 * Masks likely secrets in source code before it is sent to a third-party AI
 * provider. Students paste real projects, and real projects contain API keys.
 *
 * Deliberately a little over-eager: a false positive only makes the
 * explanation slightly less specific, while a false negative leaks a
 * credential. Order matters — the specific token formats run first, so the
 * generic `password = "…"` rule does not re-redact an already masked value.
 */
const RULES = [
  // A whole PEM private key block.
  {
    label: 'PRIVATE_KEY',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g
  },
  // Provider keys with a recognisable prefix: Anthropic/OpenAI, AWS, GitHub,
  // Slack, Google, Stripe.
  {
    label: 'API_KEY',
    pattern:
      /\b(?:sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|[sr]k_live_[0-9A-Za-z]{16,})/g
  },
  // JSON Web Token: three base64url segments, the header always starting "eyJ".
  {
    label: 'JWT',
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g
  },
  // "Bearer <token>" in an Authorization header. The word "Bearer" is kept.
  {
    label: 'TOKEN',
    pattern: /(\bBearer\s+)(?!\[REDACTED)[A-Za-z0-9._~+/-]{16,}=*/g,
    replace: (label) => (match, prefix) => `${prefix}[REDACTED_${label}]`
  },
  // A string literal assigned to a secret-looking name:
  //   password = "hunter2"   apiKey: 'abc'   "client_secret": "xyz"
  // Only the literal is masked, so the code's structure stays explainable.
  // Comparisons (`password == "x"`) and calls (`password = input()`) are left alone.
  {
    label: 'SECRET',
    pattern:
      /(\b[\w-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credentials?)[\w-]*["']?\s*[:=]\s*)(["'`])(?!\[REDACTED)(?:(?!\2)[^\n])+\2/gi,
    replace: (label) => (match, prefix, quote) => `${prefix}${quote}[REDACTED_${label}]${quote}`
  },
  {
    label: 'EMAIL',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
  }
];

/**
 * Returns the code with secrets replaced by `[REDACTED_<KIND>]` markers, and
 * how many were replaced (logged, never the values themselves).
 */
function redactSecrets(code) {
  let count = 0;
  let text = String(code || '');

  RULES.forEach(({ label, pattern, replace }) => {
    const replacer = replace ? replace(label) : () => `[REDACTED_${label}]`;

    text = text.replace(pattern, (...args) => {
      count += 1;
      return replacer(...args);
    });
  });

  return { text, count };
}

module.exports = { redactSecrets };

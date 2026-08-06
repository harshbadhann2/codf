'use strict';

/** Reduces arbitrary user input to a filename-safe base name. Never empty. */
function sanitizeBaseName(input = '', fallback = 'converted_file') {
  const normalized = String(input)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9\-_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .slice(0, 60);

  return normalized || fallback;
}

/** Sanitizes a full `name.ext` pair, keeping the extension intact. */
function sanitizeDownloadName(input, expectedExt) {
  const raw = String(input || '').trim();
  const withoutExt = raw.replace(/\.[^./\\]+$/, '');
  const base = sanitizeBaseName(withoutExt);
  const ext = String(expectedExt || '').replace(/^\.+/, '').toLowerCase();

  return ext ? `${base}.${ext}` : base;
}

module.exports = { sanitizeBaseName, sanitizeDownloadName };

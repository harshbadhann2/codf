'use strict';

const path = require('path');
const { env } = require('../config/env');
const { AppError } = require('./AppError');

// Output names are server-generated UUIDs. Anything else is rejected before it
// can reach the filesystem, so `..` traversal never gets a chance.
const SAFE_OUTPUT_NAME = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.(pdf|docx|png|jpg|webp)$/i;

function resolveOutputFilePath(fileName) {
  if (!SAFE_OUTPUT_NAME.test(fileName || '')) {
    throw AppError.badRequest('Invalid file identifier.');
  }

  const resolved = path.resolve(env.outputDir, fileName);

  // Defence in depth: even with the regex above, confirm we stayed inside.
  if (path.dirname(resolved) !== path.resolve(env.outputDir)) {
    throw AppError.badRequest('Invalid file path.');
  }

  return resolved;
}

module.exports = { resolveOutputFilePath, SAFE_OUTPUT_NAME };

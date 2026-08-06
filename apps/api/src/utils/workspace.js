'use strict';

const fs = require('fs');
const { env } = require('../config/env');

/**
 * Guarantees the scratch directories exist.
 *
 * Creating them once at boot is not enough: the work directory lives in the OS
 * temp dir, which the system (or our own sweep) may empty underneath a running
 * process. If `uploads/` has gone, Multer fails to open its write stream and
 * every upload 500s until the next restart — a failure that only shows up
 * after the server has been running a while, which is the worst kind.
 *
 * mkdir with recursive:true on an existing path is a cheap no-op syscall, so
 * this is safe to call on the hot path.
 */
function ensureWorkspace() {
  fs.mkdirSync(env.uploadDir, { recursive: true });
  fs.mkdirSync(env.outputDir, { recursive: true });
}

module.exports = { ensureWorkspace };

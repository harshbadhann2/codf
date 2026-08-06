'use strict';

const fs = require('fs/promises');
const path = require('path');
const { logger } = require('./logger');

async function safeUnlink(filePath) {
  if (!filePath) return;

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.warn('Failed to remove temp file', { filePath, error: error.message });
    }
  }
}

async function safeRemoveDir(dirPath) {
  if (!dirPath) return;

  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (error) {
    logger.warn('Failed to remove temp dir', { dirPath, error: error.message });
  }
}

/** Best-effort delete once the download window closes. */
function scheduleFileCleanup(filePath, ttlMs) {
  const timer = setTimeout(() => {
    safeUnlink(filePath);
  }, ttlMs);

  timer.unref();
  return timer;
}

/**
 * Sweeps a directory for entries older than `maxAgeMs`. The scheduled per-file
 * timers above are lost on restart, so this is what actually bounds disk use.
 */
async function cleanupOldFiles(directoryPath, maxAgeMs, { protect = [] } = {}) {
  const now = Date.now();
  const protected_ = new Set(protect);
  let entries;

  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }

  let removed = 0;

  await Promise.all(
    entries.map(async (entry) => {
      // Never remove a directory the app itself depends on. Their mtime only
      // changes when something is written, so a quiet hour is enough to make
      // them look stale — and deleting them breaks every upload that follows.
      if (protected_.has(entry.name)) return;

      const entryPath = path.join(directoryPath, entry.name);

      try {
        const stats = await fs.stat(entryPath);
        if (now - stats.mtimeMs <= maxAgeMs) return;

        if (entry.isDirectory()) {
          await safeRemoveDir(entryPath);
        } else {
          await safeUnlink(entryPath);
        }

        removed += 1;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          logger.warn('Cleanup inspection failed', { entryPath, error: error.message });
        }
      }
    })
  );

  return removed;
}

module.exports = { safeUnlink, safeRemoveDir, scheduleFileCleanup, cleanupOldFiles };

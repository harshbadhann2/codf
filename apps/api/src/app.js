'use strict';

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const sharp = require('sharp');
const { apiRouter } = require('./routes');
const { env } = require('./config/env');
const { corsOptions } = require('./config/cors');
const { globalLimiter } = require('./middleware/rateLimit.middleware');
const { requestContext } = require('./middleware/requestContext.middleware');
const { errorHandler, notFound } = require('./middleware/error.middleware');
const { cleanupOldFiles } = require('./utils/fileCleanup');
const { ensureWorkspace } = require('./utils/workspace');
const { logger } = require('./utils/logger');

ensureWorkspace();

// Sharp's default cache and thread pool are tuned for beefy servers. On a
// 512 MB instance they are pure overhead.
sharp.cache(false);
sharp.concurrency(1);

const app = express();

// Render terminates TLS at its edge. Without this, req.protocol reports "http"
// (breaking the absolute download URLs) and every client shares one rate-limit
// bucket because req.ip is the proxy's address.
app.set('trust proxy', env.trustProxy);
app.disable('x-powered-by');

app.use(requestContext);
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false // API-only; the frontend sets its own CSP
  })
);
app.use(cors(corsOptions));
app.use(globalLimiter);
app.use(express.urlencoded({ extended: false, limit: '256kb' }));

app.use('/api', apiRouter);

app.get('/', (_req, res) => {
  res.json({
    success: true,
    data: { service: 'coDF API', version: env.version, health: '/api/health' }
  });
});

app.use(notFound);
app.use(errorHandler);

/**
 * Sweeps expired uploads and outputs. The per-file timers set at conversion
 * time do not survive a restart, so this interval is what actually bounds disk
 * usage over a long-running instance.
 */
function startCleanupLoop() {
  const sweep = () => {
    // The work-dir pass exists to collect abandoned per-conversion temp dirs
    // (LibreOffice profiles). uploads/ and outputs/ are protected: their mtime
    // goes stale during any quiet spell, and removing them breaks every
    // subsequent upload until the process restarts.
    ensureWorkspace();

    Promise.all([
      cleanupOldFiles(env.uploadDir, env.fileTtlMs),
      cleanupOldFiles(env.outputDir, env.fileTtlMs),
      cleanupOldFiles(env.workDir, env.fileTtlMs * 2, {
        protect: [path.basename(env.uploadDir), path.basename(env.outputDir)]
      })
    ])
      .then(([uploads, outputs, scratch]) => {
        const total = uploads + outputs + scratch;
        if (total > 0) logger.debug('Cleanup sweep', { uploads, outputs, scratch });
      })
      .catch((error) => logger.warn('Cleanup sweep failed', { error: error.message }));
  };

  const timer = setInterval(sweep, env.cleanupIntervalMs);
  timer.unref();
  return timer;
}

module.exports = { app, startCleanupLoop };

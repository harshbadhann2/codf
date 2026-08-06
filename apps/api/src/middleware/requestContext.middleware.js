'use strict';

const { randomUUID } = require('crypto');
const { logger } = require('../utils/logger');

/**
 * Tags every request with an id, echoes it back in `X-Request-Id`, and logs one
 * line per completed request. When a user reports "it failed", that id is what
 * makes the matching Render log line findable.
 */
function requestContext(req, res, next) {
  const incoming = req.get('x-request-id');
  req.id = incoming && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    // Health checks fire constantly; logging them buries everything else.
    if (req.path === '/api/health' && res.statusCode < 400) return;

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

    logger[level]('request', {
      requestId: req.id,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      durationMs: Math.round(durationMs),
      origin: req.get('origin') || undefined
    });
  });

  next();
}

module.exports = { requestContext };

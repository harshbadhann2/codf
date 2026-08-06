'use strict';

const os = require('os');
const { env } = require('../config/env');
const { asyncHandler } = require('../utils/asyncHandler');
const { getCapabilities } = require('../services/capabilities.service');
const { conversionQueue } = require('../utils/jobQueue');
const { isAllowedOrigin } = require('../config/cors');

/**
 * The frontend calls this on load to detect a cold start and to learn which
 * conversions this deployment can actually perform. It doubles as Render's
 * health check, so it must stay cheap and must never fail on a missing tool.
 */
const healthController = asyncHandler(async (req, res) => {
  const capabilities = await getCapabilities();
  const memory = process.memoryUsage();
  const origin = req.get('origin') || '';

  res.json({
    success: true,
    data: {
      service: 'coDF API',
      status: 'ok',
      version: env.version,
      commit: env.gitCommit || undefined,
      environment: env.nodeEnv,
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      limits: {
        maxFileSizeMb: env.maxFileSizeMb,
        maxCodeChars: env.maxCodeChars,
        fileTtlMs: env.fileTtlMs,
        pdfToDocxMaxPages: env.pdfToDocxMaxPages
      },
      capabilities,
      queue: conversionQueue.stats,
      memory: {
        rssMb: Math.round(memory.rss / 1024 / 1024),
        heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
        systemFreeMb: Math.round(os.freemem() / 1024 / 1024)
      },
      // Surfaced deliberately: a misconfigured CLIENT_ORIGIN is the single most
      // common split-deployment failure, and this makes it self-diagnosing.
      cors: {
        requestOrigin: origin || null,
        allowed: isAllowedOrigin(origin)
      }
    }
  });
});

/** Liveness only — no capability probes, for uptime pings. */
function pingController(_req, res) {
  res.type('text/plain').send('pong');
}

module.exports = { healthController, pingController };

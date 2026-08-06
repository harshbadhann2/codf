'use strict';

const { app, startCleanupLoop } = require('./src/app');
const { env } = require('./src/config/env');
const { logger } = require('./src/utils/logger');
const { warmUpCapabilities } = require('./src/services/capabilities.service');

const server = app.listen(env.port, env.host, () => {
  logger.info('coDF API listening', {
    port: env.port,
    host: env.host,
    environment: env.nodeEnv,
    allowedOrigins: env.allowedOrigins.length ? env.allowedOrigins : ['(localhost only)'],
    workDir: env.workDir
  });

  if (env.isProduction && env.allowedOrigins.length === 0) {
    logger.warn('CLIENT_ORIGIN is not set — browser requests from your frontend will be blocked by CORS.', {
      fix: 'Set CLIENT_ORIGIN to your frontend URL (e.g. https://your-app.vercel.app) and redeploy.'
    });
  }
});

// Render's free tier sleeps between requests, so the first call after a wake-up
// pays for these probes unless they run at boot.
warmUpCapabilities();
startCleanupLoop();

// Render's proxy holds connections open; without this Node closes idle sockets
// first and the proxy returns sporadic 502s.
server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
server.requestTimeout = 300000;

let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('Shutting down', { signal });

  const force = setTimeout(() => {
    logger.warn('Forcing exit after shutdown timeout');
    process.exit(1);
  }, 15000);
  force.unref();

  server.close(() => {
    clearTimeout(force);
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: reason?.message || String(reason) });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  shutdown('uncaughtException');
});

module.exports = { server };

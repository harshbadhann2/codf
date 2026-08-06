'use strict';

const { env } = require('./env');
const { logger } = require('../utils/logger');

const VERCEL_PREVIEW = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

const customPatterns = env.allowedOriginPatterns
  .map((pattern) => {
    try {
      return new RegExp(pattern);
    } catch (error) {
      logger.warn('Ignoring invalid CLIENT_ORIGIN_REGEX entry', { pattern, error: error.message });
      return null;
    }
  })
  .filter(Boolean);

// Localhost is always allowed so `npm run dev` needs zero configuration. It is
// not a security hole: an attacker who controls localhost already owns the box.
const DEV_ORIGINS = [
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
  /^http:\/\/\[::1\]:\d+$/
];

function isAllowedOrigin(origin) {
  if (!origin) return true; // curl, health checks, server-to-server
  if (env.allowedOrigins.includes('*')) return true;

  const normalized = origin.replace(/\/+$/, '');

  if (env.allowedOrigins.includes(normalized)) return true;
  if (DEV_ORIGINS.some((pattern) => pattern.test(normalized))) return true;
  if (env.allowVercelPreviews && VERCEL_PREVIEW.test(normalized)) return true;
  if (customPatterns.some((pattern) => pattern.test(normalized))) return true;

  return false;
}

const warnedOrigins = new Set();

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    // Reject by omitting the CORS headers rather than throwing. Throwing turns
    // a blocked preflight into a 500 with no headers, which shows up in the
    // browser as an unexplained network error instead of a CORS message.
    if (!warnedOrigins.has(origin)) {
      warnedOrigins.add(origin);
      logger.warn('Blocked cross-origin request', {
        origin,
        hint: 'Add this origin to CLIENT_ORIGIN on the API service and redeploy.',
        allowedOrigins: env.allowedOrigins
      });
    }

    callback(null, false);
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition', 'X-Request-Id', 'RateLimit-Remaining', 'Retry-After'],
  credentials: false,
  maxAge: 86400,
  optionsSuccessStatus: 204
};

module.exports = { corsOptions, isAllowedOrigin };

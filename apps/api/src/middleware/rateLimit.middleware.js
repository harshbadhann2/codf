'use strict';

const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

function buildLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Failed uploads shouldn't burn the user's budget for the window.
    skipFailedRequests: false,
    skip: () => env.isTest,
    handler(_req, res) {
      res.status(429).json({
        success: false,
        error: { code: 'rate_limited', message }
      });
    }
  });
}

// Generous ceiling across the whole API so a runaway client can't monopolise it.
const globalLimiter = buildLimiter({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  message: 'Too many requests. Please slow down and try again shortly.'
});

// Tighter budget for the endpoints that actually cost CPU and memory.
const conversionLimiter = buildLimiter({
  windowMs: env.convertRateLimitWindowMs,
  max: env.convertRateLimitMax,
  message: 'You have run a lot of conversions recently. Please wait a few minutes and try again.'
});

module.exports = { globalLimiter, conversionLimiter };

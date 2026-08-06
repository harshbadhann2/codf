'use strict';

const { env } = require('../config/env');

const LEVELS = { silent: 100, error: 50, warn: 40, info: 30, debug: 20 };
const threshold = LEVELS[env.logLevel] ?? LEVELS.info;

// Structured JSON in production so Render's log search is actually usable;
// short human lines in development so the terminal stays readable.
function emit(level, message, context) {
  if (LEVELS[level] < threshold) return;

  if (env.isProduction) {
    const line = JSON.stringify({
      level,
      time: new Date().toISOString(),
      msg: message,
      ...context
    });
    process.stdout.write(`${line}\n`);
    return;
  }

  const suffix = context && Object.keys(context).length ? ` ${JSON.stringify(context)}` : '';
  process.stdout.write(`[${level}] ${message}${suffix}\n`);
}

const logger = {
  error: (message, context) => emit('error', message, context),
  warn: (message, context) => emit('warn', message, context),
  info: (message, context) => emit('info', message, context),
  debug: (message, context) => emit('debug', message, context)
};

module.exports = { logger };

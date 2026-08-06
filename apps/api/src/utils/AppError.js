'use strict';

/**
 * Errors that are safe to show the user verbatim. Anything else that reaches
 * the error handler is logged in full and reported as a generic 500.
 */
class AppError extends Error {
  constructor(statusCode, message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = options.code || 'app_error';
    this.expose = true;
    this.details = options.details;
    Error.captureStackTrace(this, AppError);
  }

  static badRequest(message, options) {
    return new AppError(400, message, { code: 'bad_request', ...options });
  }

  static payloadTooLarge(message, options) {
    return new AppError(413, message, { code: 'payload_too_large', ...options });
  }

  static notFound(message, options) {
    return new AppError(404, message, { code: 'not_found', ...options });
  }

  static unavailable(message, options) {
    return new AppError(503, message, { code: 'service_unavailable', ...options });
  }

  static internal(message, options) {
    return new AppError(500, message, { code: 'internal_error', ...options });
  }
}

module.exports = { AppError };

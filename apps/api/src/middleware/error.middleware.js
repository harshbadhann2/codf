'use strict';

const multer = require('multer');
const { AppError } = require('../utils/AppError');
const { env } = require('../config/env');
const { logger } = require('../utils/logger');
const { safeUnlink } = require('../utils/fileCleanup');

function notFound(req, res) {
  res.status(404).json({
    success: false,
    error: {
      code: 'route_not_found',
      message: `No route matches ${req.method} ${req.originalUrl}`
    }
  });
}

function describeMulterError(error) {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return {
        status: 413,
        code: 'file_too_large',
        message: `That file is larger than the ${env.maxFileSizeMb} MB limit.`
      };
    case 'LIMIT_FILE_COUNT':
    case 'LIMIT_UNEXPECTED_FILE':
      return { status: 400, code: 'unexpected_file', message: 'Please upload exactly one file, in the "file" field.' };
    case 'LIMIT_FIELD_VALUE':
    case 'LIMIT_FIELD_COUNT':
      return { status: 400, code: 'invalid_form', message: 'The submitted form data was too large.' };
    default:
      return { status: 400, code: 'upload_failed', message: error.message || 'Upload failed.' };
  }
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
function errorHandler(error, req, res, next) {
  // A request that dies mid-flight can leave its upload behind.
  if (req.file?.path) safeUnlink(req.file.path);

  let status = 500;
  let code = 'internal_error';
  let message = 'Something went wrong on our side. Please try again.';
  let details;

  if (error instanceof multer.MulterError) {
    ({ status, code, message } = describeMulterError(error));
  } else if (error instanceof AppError) {
    status = error.statusCode;
    code = error.code;
    message = error.message;
    details = error.details;
  } else if (error?.statusCode >= 400 && error.statusCode < 500) {
    status = error.statusCode;
    code = error.code || 'bad_request';
    message = error.message;
  } else if (error?.type === 'entity.too.large') {
    status = 413;
    code = 'payload_too_large';
    message = 'The request body is too large.';
  } else if (error instanceof SyntaxError && 'body' in error) {
    status = 400;
    code = 'invalid_json';
    message = 'The request body is not valid JSON.';
  }

  // Unexpected errors keep their real message in the logs and a generic one in
  // the response, so stack details never leak to the client.
  if (status >= 500) {
    logger.error('Unhandled request error', {
      requestId: req.id,
      path: req.originalUrl,
      error: error?.message,
      stack: env.isProduction ? undefined : error?.stack
    });
  }

  res.status(status).json({
    success: false,
    error: { code, message, ...(details ? { details } : {}), requestId: req.id }
  });
}

module.exports = { errorHandler, notFound };

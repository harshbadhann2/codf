'use strict';

const path = require('path');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { env } = require('./env');
const { SUPPORTED_CODE_EXTENSIONS } = require('../services/codeFile.service');

const ALLOWED_EXTENSIONS = new Set([
  '.docx',
  '.pdf',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  ...SUPPORTED_CODE_EXTENSIONS
]);

// Disk storage, never memory: a 10 MB in-memory buffer per concurrent upload is
// a real cost on a 512 MB instance, and streaming to disk costs nothing.
const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    cb(null, env.uploadDir);
  },
  filename(_req, file, cb) {
    const extension = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: env.maxFileSizeBytes,
    files: 1,
    fields: 12,
    fieldSize: 1024 * 100,
    parts: 20
  },
  fileFilter(_req, file, cb) {
    const extension = path.extname(file.originalname || '').toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(extension)) {
      const error = new Error(`Unsupported file type: ${extension || 'unknown'}.`);
      error.statusCode = 400;
      error.code = 'UNSUPPORTED_FILE_TYPE';
      cb(error);
      return;
    }

    cb(null, true);
  }
});

const uploadSingle = upload.single('file');

module.exports = { upload, uploadSingle, ALLOWED_EXTENSIONS };

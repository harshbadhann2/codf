'use strict';

const express = require('express');
const { healthRouter } = require('./health.routes');
const { conversionRouter } = require('./conversion.routes');
const { filesRouter } = require('./files.routes');
const { env } = require('../config/env');

const router = express.Router();

router.use('/health', healthRouter);
router.use('/convert', conversionRouter);
router.use('/files', filesRouter);

// Self-describing index, so hitting the API root in a browser explains itself.
router.get('/', (_req, res) => {
  res.json({
    success: true,
    data: {
      service: 'coDF API',
      version: env.version,
      docs: 'https://github.com/HARSH-BADHAN/codf#api',
      endpoints: {
        health: 'GET /api/health',
        ping: 'GET /api/health/ping',
        codeToPdf: 'POST /api/convert/code-to-pdf',
        codeFileToPdf: 'POST /api/convert/code-file-to-pdf',
        docxToPdf: 'POST /api/convert/docx-to-pdf',
        pdfToDocx: 'POST /api/convert/pdf-to-docx',
        image: 'POST /api/convert/image',
        imageCompress: 'POST /api/convert/image-compress',
        download: 'GET /api/files/:fileName'
      }
    }
  });
});

module.exports = { apiRouter: router };

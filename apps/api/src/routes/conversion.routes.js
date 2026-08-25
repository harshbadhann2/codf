'use strict';

const express = require('express');
const { uploadSingle } = require('../config/multer');
const { validateUploadedFile } = require('../middleware/validateFile.middleware');
const { requireCapability } = require('../middleware/capability.middleware');
const { conversionLimiter } = require('../middleware/rateLimit.middleware');
const {
  codeToPdfController,
  codeFileToPdfController,
  docxToPdfController,
  pdfToDocxController,
  imageConvertController,
  imageCompressController,
  markdownToPdfController,
  markdownFileToPdfController,
  imageToTextController,
  pdfToTextController,
  toMarkdownController
} = require('../controllers/conversion.controller');

const router = express.Router();

router.use(conversionLimiter);

router.post('/code-to-pdf', express.json({ limit: '2mb' }), codeToPdfController);

router.post('/markdown-to-pdf', express.json({ limit: '2mb' }), markdownToPdfController);

router.post('/markdown-file-to-pdf', uploadSingle, validateUploadedFile('markdown'), markdownFileToPdfController);

router.post('/code-file-to-pdf', uploadSingle, validateUploadedFile('code'), codeFileToPdfController);

router.post(
  '/docx-to-pdf',
  uploadSingle,
  validateUploadedFile('docx'),
  requireCapability('docxToPdf'),
  docxToPdfController
);

router.post(
  '/pdf-to-docx',
  uploadSingle,
  validateUploadedFile('pdf'),
  requireCapability('pdfToDocx'),
  pdfToDocxController
);

router.post('/image', uploadSingle, validateUploadedFile('image'), imageConvertController);

router.post(
  '/image-to-text',
  uploadSingle,
  validateUploadedFile('image'),
  requireCapability('imageToText'),
  imageToTextController
);

router.post(
  '/pdf-to-text',
  uploadSingle,
  validateUploadedFile('pdf'),
  requireCapability('pdfToText'),
  pdfToTextController
);

router.post(
  '/to-markdown',
  uploadSingle,
  validateUploadedFile('document'),
  requireCapability('toMarkdown'),
  toMarkdownController
);

router.post('/image-compress', uploadSingle, validateUploadedFile('image'), imageCompressController);

module.exports = { conversionRouter: router };

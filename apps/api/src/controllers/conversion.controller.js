'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const mime = require('mime-types');
const { env } = require('../config/env');
const { AppError } = require('../utils/AppError');
const { asyncHandler } = require('../utils/asyncHandler');
const { sanitizeBaseName, sanitizeDownloadName } = require('../utils/sanitizeFilename');
const { resolveOutputFilePath } = require('../utils/outputFile');
const { safeUnlink, scheduleFileCleanup } = require('../utils/fileCleanup');
const { conversionQueue } = require('../utils/jobQueue');
const { generateCodePdf } = require('../services/codePdf.service');
const { parseCodeFile } = require('../services/codeFile.service');
const { convertDocxToPdf, convertPdfToDocx } = require('../services/document.service');
const { convertImage } = require('../services/image.service');

/**
 * Builds the response payload for a finished conversion.
 *
 * `downloadUrl` is absolute and derived from the request. The frontend lives on
 * a different origin (Vercel) than the API (Render), so a relative path would
 * resolve against the frontend and 404 — that is the bug this exists to avoid.
 */
function buildResult(req, result, extra = {}) {
  const downloadPath = `/api/files/${result.outputFileName}`;
  const base = `${req.protocol}://${req.get('host')}`;
  const query = `?name=${encodeURIComponent(result.originalName)}`;

  return {
    outputFileName: result.outputFileName,
    originalName: result.originalName,
    downloadPath,
    downloadUrl: `${base}${downloadPath}${query}`,
    expiresInMs: env.fileTtlMs,
    expiresAt: new Date(Date.now() + env.fileTtlMs).toISOString(),
    ...extra
  };
}

function finish(req, res, result, extra) {
  scheduleFileCleanup(result.outputPath, env.fileTtlMs);
  res.status(201).json({ success: true, data: buildResult(req, result, extra) });
}

/** Runs a file conversion through the concurrency gate, always cleaning up the upload. */
async function withUpload(req, label, task) {
  const uploadedPath = req.file.path;

  try {
    return await conversionQueue.run(label, () => task(uploadedPath));
  } finally {
    await safeUnlink(uploadedPath);
    req.file = undefined;
  }
}

function originalBaseName(req) {
  return sanitizeBaseName(path.parse(req.file.originalname || '').name);
}

const codeToPdfController = asyncHandler(async (req, res) => {
  const { code, filename, language, title, section } = req.body || {};

  if (typeof code !== 'string' || !code.trim()) {
    throw AppError.badRequest('Paste some code before generating a PDF.');
  }

  if (code.length > env.maxCodeChars) {
    throw AppError.payloadTooLarge(
      `Code is ${code.length.toLocaleString()} characters; the limit is ${env.maxCodeChars.toLocaleString()}.`
    );
  }

  const result = await conversionQueue.run('code-to-pdf', () =>
    generateCodePdf({ code, filename, language, title, section })
  );

  finish(req, res, result, { detectedLanguage: result.detectedLanguage, lineCount: result.lineCount });
});

const codeFileToPdfController = asyncHandler(async (req, res) => {
  const baseName = originalBaseName(req);
  const originalName = req.file.originalname;

  const result = await withUpload(req, 'code-file-to-pdf', async (uploadedPath) => {
    const parsed = await parseCodeFile({
      filePath: uploadedPath,
      originalName,
      languageOverride: req.body.language || ''
    });

    return generateCodePdf({
      code: parsed.code,
      filename: req.body.filename || baseName,
      language: parsed.language,
      title: req.body.title,
      section: req.body.section
    });
  });

  finish(req, res, result, { detectedLanguage: result.detectedLanguage, lineCount: result.lineCount });
});

const docxToPdfController = asyncHandler(async (req, res) => {
  const baseName = originalBaseName(req);

  const result = await withUpload(req, 'docx-to-pdf', (uploadedPath) =>
    convertDocxToPdf({ inputPath: uploadedPath, originalBaseName: baseName })
  );

  finish(req, res, result);
});

const pdfToDocxController = asyncHandler(async (req, res) => {
  const baseName = originalBaseName(req);

  const result = await withUpload(req, 'pdf-to-docx', (uploadedPath) =>
    convertPdfToDocx({ inputPath: uploadedPath, originalBaseName: baseName })
  );

  finish(req, res, result);
});

const imageConvertController = asyncHandler(async (req, res) => {
  const baseName = originalBaseName(req);
  const { targetFormat, quality } = req.body;

  const result = await withUpload(req, 'image-convert', (uploadedPath) =>
    convertImage({
      inputPath: uploadedPath,
      targetFormat,
      originalBaseName: baseName,
      quality: Number.parseInt(quality, 10) || undefined
    })
  );

  finish(req, res, result, {
    width: result.width,
    height: result.height,
    sourceFormat: result.sourceFormat
  });
});

const downloadFileController = asyncHandler(async (req, res) => {
  const outputPath = resolveOutputFilePath(req.params.fileName);
  const stats = await fsp.stat(outputPath).catch(() => null);

  if (!stats || !stats.isFile()) {
    throw AppError.notFound('This download has expired. Converted files are removed automatically — please convert again.');
  }

  const extension = path.extname(outputPath).toLowerCase();
  const contentType = mime.lookup(extension) || 'application/octet-stream';
  // The stored name is a UUID; `?name=` restores something meaningful for the
  // user's Downloads folder. It is re-sanitised here — never trusted as given.
  const downloadName = sanitizeDownloadName(req.query.name, extension.slice(1));
  const inline = ['.png', '.jpg', '.jpeg', '.webp', '.pdf'].includes(extension) && req.query.inline === '1';

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${downloadName}"`);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const stream = fs.createReadStream(outputPath);

  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: { code: 'stream_failed', message: 'Failed to read the converted file.' }
      });
      return;
    }
    res.destroy();
  });

  // Stop reading if the client disappears mid-download.
  res.on('close', () => stream.destroy());

  stream.pipe(res);
});

module.exports = {
  codeToPdfController,
  codeFileToPdfController,
  docxToPdfController,
  pdfToDocxController,
  imageConvertController,
  downloadFileController
};

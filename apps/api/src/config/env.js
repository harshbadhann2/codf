'use strict';

const path = require('path');
const os = require('os');
const dotenv = require('dotenv');

// Local development reads apps/api/.env. On Render every value comes from the
// dashboard / render.yaml, and this call is a harmless no-op.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function toInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function toList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const appRoot = path.resolve(__dirname, '../..');

// Render's filesystem is ephemeral but writable. Keeping scratch files under an
// explicit work dir (default: the OS temp dir) means we never depend on the
// image layer being writable and never leak files into the source tree.
const workDir = process.env.WORK_DIR
  ? path.resolve(process.env.WORK_DIR)
  : path.join(os.tmpdir(), 'codf');

const nodeEnv = process.env.NODE_ENV || 'development';

const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',

  // Render injects PORT. Never hard-code it in production.
  port: toInt(process.env.PORT, 3030),
  host: process.env.HOST || '0.0.0.0',

  // Number of proxies in front of the app. Render terminates TLS at one hop,
  // so `1` is correct there and keeps rate limiting keyed on the real client IP.
  trustProxy: toInt(process.env.TRUST_PROXY, 1),

  // Exact origins allowed to call the API, comma separated.
  allowedOrigins: toList(process.env.CLIENT_ORIGIN).map((origin) => origin.replace(/\/+$/, '')),
  // Extra origins matched by regex, comma separated. Useful for Vercel previews.
  allowedOriginPatterns: toList(process.env.CLIENT_ORIGIN_REGEX),
  // Convenience switch for `https://<anything>.vercel.app`.
  allowVercelPreviews: toBool(process.env.ALLOW_VERCEL_PREVIEWS, false),

  maxFileSizeBytes: toInt(process.env.MAX_FILE_SIZE_MB, 10) * 1024 * 1024,
  maxFileSizeMb: toInt(process.env.MAX_FILE_SIZE_MB, 10),
  maxCodeChars: toInt(process.env.MAX_CODE_CHARS, 300000),

  fileTtlMs: toInt(process.env.FILE_TTL_MS, 15 * 60 * 1000),
  cleanupIntervalMs: toInt(process.env.CLEANUP_INTERVAL_MS, 5 * 60 * 1000),

  rateLimitWindowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  rateLimitMax: toInt(process.env.RATE_LIMIT_MAX, 300),
  convertRateLimitWindowMs: toInt(process.env.CONVERT_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
  convertRateLimitMax: toInt(process.env.CONVERT_RATE_LIMIT_MAX, 60),

  // Heavy conversions run one at a time. On a 512 MB instance, two concurrent
  // LibreOffice or PyMuPDF processes is the difference between "slow" and OOM.
  maxConcurrentJobs: toInt(process.env.MAX_CONCURRENT_JOBS, 1),
  maxQueuedJobs: toInt(process.env.MAX_QUEUED_JOBS, 8),
  jobQueueTimeoutMs: toInt(process.env.JOB_QUEUE_TIMEOUT_MS, 60 * 1000),

  libreOfficePath: process.env.LIBREOFFICE_PATH || '',
  libreOfficeTimeoutMs: toInt(process.env.LIBREOFFICE_TIMEOUT_MS, 120000),

  pythonPath: process.env.PYTHON_PATH || '',
  tesseractPath: process.env.TESSERACT_PATH || '',
  ocrLanguage: process.env.OCR_LANGUAGE || 'eng',
  ocrTimeoutMs: toInt(process.env.OCR_TIMEOUT_MS, 150000),
  pdfToDocxTimeoutMs: toInt(process.env.PDF_TO_DOCX_TIMEOUT_MS, 150000),
  pdfToDocxMaxPages: toInt(process.env.PDF_TO_DOCX_MAX_PAGES, 60),

  codePdfFont: {
    regular: process.env.CODE_PDF_FONT_REGULAR || '',
    italic: process.env.CODE_PDF_FONT_ITALIC || '',
    bold: process.env.CODE_PDF_FONT_BOLD || '',
    boldItalic: process.env.CODE_PDF_FONT_BOLD_ITALIC || ''
  },

  logLevel: process.env.LOG_LEVEL || (nodeEnv === 'test' ? 'silent' : 'info'),

  appRoot,
  fontDir: path.join(appRoot, 'assets', 'fonts'),
  scriptDir: path.join(appRoot, 'scripts'),
  workDir,
  uploadDir: path.join(workDir, 'uploads'),
  outputDir: path.join(workDir, 'outputs'),

  version: process.env.npm_package_version || '2.0.0',
  gitCommit: (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || '').slice(0, 7)
};

module.exports = { env, toInt, toBool, toList };

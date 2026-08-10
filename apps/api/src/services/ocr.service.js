'use strict';

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const { AppError } = require('../utils/AppError');
const { logger } = require('../utils/logger');
const { runCommand } = require('../utils/runCommand');
const { sanitizeBaseName } = require('../utils/sanitizeFilename');
const { safeUnlink } = require('../utils/fileCleanup');
const { ensureWorkspace } = require('../utils/workspace');
const { getCapability } = require('./capabilities.service');

const MAX_PIXELS = 50_000_000;

/**
 * Tesseract reads small text badly and huge images slowly. Roughly 2200px on
 * the long edge puts ordinary document text near the ~300 dpi the engine was
 * trained on, which is where accuracy peaks.
 */
const TARGET_LONG_EDGE = 2200;
const MIN_LONG_EDGE = 1000;

/**
 * Page segmentation modes worth exposing.
 *
 * `auto` is right for a photographed page. `block` is markedly better for a
 * screenshot or a cropped paragraph, where the automatic analyser sometimes
 * decides a tight crop is a single vertical column and scrambles the order.
 */
const SEGMENTATION = {
  auto: 3,
  block: 6,
  line: 7
};

async function requireOcr() {
  const capability = await getCapability('ocr');

  if (!capability.available) {
    throw AppError.unavailable(capability.reason, { code: 'ocr_unavailable' });
  }

  return capability.binary;
}

/**
 * Prepares an image for recognition.
 *
 * Deliberately minimal. The usual advice — stretch the contrast, binarise,
 * normalise — was written for Tesseract's legacy template matcher. The LSTM
 * engine used here does its own normalisation, and measured against a known
 * page those steps range from pointless to destructive: aggressive contrast
 * clipped faint strokes and cost accuracy, and sharp's `normalise()` shifted
 * the gamma so far that recall collapsed from 100% to 6%.
 *
 * What is left is what actually helps: drop colour the recogniser ignores,
 * bring the image near the ~300 dpi the engine was trained at, and sharpen
 * only to recover edges lost in that resampling.
 */
async function preprocess(inputPath, workPath) {
  const image = sharp(inputPath, { failOn: 'error', limitInputPixels: MAX_PIXELS });

  let metadata;

  try {
    metadata = await image.metadata();
  } catch (error) {
    // A file sharp cannot decode is bad input, not a server fault.
    throw AppError.badRequest(`This image could not be read: ${error.message}`);
  }

  if (!metadata.width || !metadata.height) {
    throw AppError.badRequest('Unable to read this image. It may be corrupted.');
  }

  const longEdge = Math.max(metadata.width, metadata.height);
  const pipeline = image.rotate().grayscale();

  // Scale toward the sweet spot in either direction — up for phone crops of
  // small text, down for 12 MP photos that would only cost time.
  if (longEdge > TARGET_LONG_EDGE * 1.15) {
    pipeline.resize({
      width: metadata.width >= metadata.height ? TARGET_LONG_EDGE : null,
      height: metadata.height > metadata.width ? TARGET_LONG_EDGE : null,
      fit: 'inside'
    });
  } else if (longEdge < MIN_LONG_EDGE) {
    const scale = Math.min(3, MIN_LONG_EDGE / longEdge);
    pipeline.resize({
      width: Math.round(metadata.width * scale),
      kernel: 'lanczos3'
    });
  }

  await pipeline.sharpen({ sigma: 0.7 }).png({ compressionLevel: 3 }).toFile(workPath);

  return { width: metadata.width, height: metadata.height };
}

/** Collapses the ragged whitespace OCR produces, keeping paragraph breaks. */
function tidy(text) {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''));

  const out = [];
  let blanks = 0;

  for (const line of lines) {
    if (line.trim()) {
      out.push(line);
      blanks = 0;
    } else {
      blanks += 1;
      if (blanks === 1 && out.length) out.push('');
    }
  }

  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out.join('\n');
}

function countWords(text) {
  const matches = text.match(/\S+/g);
  return matches ? matches.length : 0;
}

/** Writes the extracted text as a downloadable .txt alongside the inline copy. */
async function writeTextFile(text, originalBaseName) {
  ensureWorkspace();

  const outputFileName = `${randomUUID()}.txt`;
  const outputPath = path.join(env.outputDir, outputFileName);

  await fs.writeFile(outputPath, text, 'utf8');

  return {
    outputPath,
    outputFileName,
    originalName: `${sanitizeBaseName(originalBaseName, 'extracted')}.txt`
  };
}

/** Image → text. */
async function extractTextFromImage({ inputPath, originalBaseName, language, mode }) {
  const binary = await requireOcr();
  ensureWorkspace();

  const workPath = path.join(env.workDir, `ocr-${randomUUID()}.png`);
  const psm = SEGMENTATION[mode] ?? SEGMENTATION.auto;

  try {
    const source = await preprocess(inputPath, workPath);

    const { stdout } = await runCommand(
      binary,
      [workPath, 'stdout', '-l', language || env.ocrLanguage, '--psm', String(psm), '--oem', '1'],
      {
        timeoutMs: env.ocrTimeoutMs,
        // Tesseract's thread pool buys nothing here and costs memory we do not
        // have; the job queue already serialises work.
        env: { OMP_THREAD_LIMIT: '1' }
      }
    );

    const text = tidy(stdout);

    if (!text) {
      throw AppError.badRequest(
        'No readable text was found in this image. Sharper, straighter and better-lit images work best.'
      );
    }

    const written = await writeTextFile(text, originalBaseName);

    return {
      ...written,
      text,
      characters: text.length,
      words: countWords(text),
      sourceWidth: source.width,
      sourceHeight: source.height,
      ocrUsed: true,
      pages: 1
    };
  } catch (error) {
    if (error instanceof AppError) throw error;

    if (error.code === 'ETIMEDOUT') {
      throw AppError.unavailable('Reading this image took too long. Try a smaller or simpler image.');
    }

    logger.error('image OCR failed', { error: error.message });
    throw AppError.internal('Could not read text from this image.');
  } finally {
    await safeUnlink(workPath);
  }
}

/**
 * PDF → text.
 *
 * The script reads any real text layer first and only rasterises the pages
 * that lack one, so a normal PDF is extracted exactly and instantly while a
 * scan still works.
 */
async function extractTextFromPdf({ inputPath, originalBaseName, language, mode, forceOcr }) {
  const capability = await getCapability('python');

  if (!capability.available) {
    throw AppError.unavailable(capability.reason, { code: 'pdf_text_unavailable' });
  }

  ensureWorkspace();

  const script = path.join(env.scriptDir, 'extract_text.py');
  const psm = SEGMENTATION[mode] ?? SEGMENTATION.auto;

  const args = [
    script,
    inputPath,
    '--max-pages',
    String(env.pdfToDocxMaxPages),
    '--lang',
    language || env.ocrLanguage,
    '--psm',
    String(psm)
  ];

  if (forceOcr) args.push('--force-ocr');

  try {
    const { stdout } = await runCommand(capability.binary, args, {
      timeoutMs: env.ocrTimeoutMs,
      env: {
        HOME: env.workDir,
        OMP_THREAD_LIMIT: '1',
        OMP_NUM_THREADS: '1',
        PYTHONUNBUFFERED: '1',
        TESSERACT_PATH: env.tesseractPath || ''
      }
    });

    const parsed = JSON.parse(stdout);
    const text = tidy(parsed.text);
    const written = await writeTextFile(text, originalBaseName);

    return {
      ...written,
      text,
      characters: text.length,
      words: countWords(text),
      pages: parsed.pages,
      textPages: parsed.textPages,
      ocrPages: parsed.ocrPages,
      // Worth surfacing: it tells the user whether they got an exact copy of a
      // text layer or a best-effort reading of a picture.
      ocrUsed: parsed.ocrPages > 0
    };
  } catch (error) {
    if (error instanceof AppError) throw error;

    if (error.code === 'ETIMEDOUT') {
      throw AppError.unavailable(
        'Reading this PDF took too long. Scanned pages are slow — try fewer pages at a time.'
      );
    }

    if (error.exitCode === 2) {
      throw AppError.badRequest(extractScriptError(error.stderr) || 'No text could be read from this PDF.');
    }

    if (error.signal === 'SIGKILL') {
      throw AppError.unavailable('The server ran out of memory reading this PDF. Try fewer pages.');
    }

    logger.error('pdf text extraction failed', { error: error.message });
    throw AppError.internal('Could not read text from this PDF.');
  }
}

function extractScriptError(stderr) {
  const line = String(stderr || '')
    .trim()
    .split('\n')
    .reverse()
    .find((entry) => entry.trim().startsWith('{'));

  if (!line) return '';

  try {
    return JSON.parse(line).error || '';
  } catch {
    return '';
  }
}

module.exports = { extractTextFromImage, extractTextFromPdf, SEGMENTATION };

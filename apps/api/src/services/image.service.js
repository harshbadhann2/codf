'use strict';

const path = require('path');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const { AppError } = require('../utils/AppError');
const { sanitizeBaseName } = require('../utils/sanitizeFilename');
const { safeUnlink } = require('../utils/fileCleanup');
const { ensureWorkspace } = require('../utils/workspace');

// A decompression bomb is small on disk and enormous in memory. 50 MP is a
// generous ceiling for real photos and well inside the instance's budget.
const MAX_PIXELS = 50_000_000;

const TARGETS = {
  png: { ext: 'png', mime: 'image/png' },
  jpg: { ext: 'jpg', mime: 'image/jpeg' },
  jpeg: { ext: 'jpg', mime: 'image/jpeg' },
  webp: { ext: 'webp', mime: 'image/webp' }
};

async function convertImage({ inputPath, targetFormat, originalBaseName, quality }) {
  const target = TARGETS[String(targetFormat || '').toLowerCase()];

  if (!target) {
    throw AppError.badRequest('targetFormat must be one of: png, jpg, webp.');
  }

  ensureWorkspace();
  const outputFileName = `${randomUUID()}.${target.ext}`;
  const outputPath = path.join(env.outputDir, outputFileName);

  try {
    const image = sharp(inputPath, { failOn: 'error', limitInputPixels: MAX_PIXELS });
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      throw AppError.badRequest('Unable to read the image dimensions. The file may be corrupted.');
    }

    // .rotate() with no argument applies the EXIF orientation, so photos from
    // phones don't come out sideways.
    const pipeline = image.rotate();

    if (target.ext === 'png') {
      await pipeline.png({ compressionLevel: 9, effort: 7 }).toFile(outputPath);
    } else if (target.ext === 'webp') {
      await pipeline.webp({ quality: quality || 88 }).toFile(outputPath);
    } else {
      // JPEG has no alpha channel; flatten transparency onto white rather than
      // letting it render as black.
      await pipeline
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: quality || 90, mozjpeg: true, chromaSubsampling: '4:4:4' })
        .toFile(outputPath);
    }

    const output = await sharp(outputPath).metadata();

    return {
      outputPath,
      outputFileName,
      originalName: `${sanitizeBaseName(originalBaseName, 'image')}.${target.ext}`,
      width: output.width,
      height: output.height,
      sourceFormat: metadata.format
    };
  } catch (error) {
    await safeUnlink(outputPath);

    if (error instanceof AppError) throw error;

    if (String(error.message).includes('pixel')) {
      throw AppError.payloadTooLarge('That image has too many pixels to process safely.');
    }

    throw AppError.badRequest(`Image conversion failed: ${error.message}`);
  }
}

module.exports = { convertImage };

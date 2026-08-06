'use strict';

const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const { AppError } = require('../utils/AppError');
const { sanitizeBaseName } = require('../utils/sanitizeFilename');
const { safeUnlink } = require('../utils/fileCleanup');
const { ensureWorkspace } = require('../utils/workspace');
const { padToMinimum } = require('../utils/imagePadding');
const { logger } = require('../utils/logger');

const MAX_PIXELS = 50_000_000;

// Quality floor is 20 rather than 1: below roughly this point JPEG artefacts
// make a passport photo unusable, and shrinking the image is a better trade
// than destroying it. The search falls back to downscaling instead.
const MIN_QUALITY = 20;
const MAX_QUALITY = 95;

// Each round is a full quality search, so this bounds worst-case work. The
// scale estimate below converges in one or two rounds in practice.
const MAX_DOWNSCALE_ROUNDS = 6;
const MIN_DIMENSION = 40;

const FORMATS = {
  jpg: { ext: 'jpg', lossy: true },
  jpeg: { ext: 'jpg', lossy: true },
  webp: { ext: 'webp', lossy: true },
  png: { ext: 'png', lossy: false }
};

function encode(pipeline, ext, quality, { fullChroma = false } = {}) {
  if (ext === 'webp') {
    return pipeline.webp({ quality, effort: 4 }).toBuffer();
  }

  if (ext === 'png') {
    // PNG is lossless, so "quality" here drives palette quantisation — the only
    // real lever for hitting a size target without resizing.
    return pipeline.png({ palette: true, quality, effort: 6, compressionLevel: 9 }).toBuffer();
  }

  return pipeline
    .flatten({ background: '#ffffff' })
    .jpeg({
      quality,
      mozjpeg: true,
      progressive: false,
      // 4:4:4 keeps full colour resolution. It costs bytes, which is the point
      // when we are trying to climb over a minimum size.
      ...(fullChroma ? { chromaSubsampling: '4:4:4' } : {})
    })
    .toBuffer();
}

/**
 * Highest quality whose encoded size fits `targetBytes`, by binary search.
 *
 * Returns the winning buffer, or the smallest buffer achievable when even
 * MIN_QUALITY overshoots — the caller uses that size to decide how far to
 * downscale before trying again.
 */
async function searchQuality(makePipeline, ext, targetBytes) {
  let low = MIN_QUALITY;
  let high = MAX_QUALITY;
  let best = null;
  let bestQuality = 0;
  let smallest = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const buffer = await encode(makePipeline(), ext, mid);

    if (!smallest || buffer.length < smallest.length) smallest = buffer;

    if (buffer.length <= targetBytes) {
      best = buffer;
      bestQuality = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return { best, bestQuality, smallest };
}

function buildResize(maxWidth, maxHeight, fit) {
  if (!maxWidth && !maxHeight) return null;

  return {
    width: maxWidth || null,
    height: maxHeight || null,
    // 'cover' crops to exactly the requested box (what forms asking for
    // "200x230" usually mean); 'inside' preserves the whole frame.
    fit: fit === 'cover' ? 'cover' : 'inside',
    withoutEnlargement: fit !== 'cover',
    position: 'centre'
  };
}

/**
 * Climbs toward `minBytes` without losing quality.
 *
 * Tries full-chroma encoding at increasing quality, keeping the largest result
 * that still fits under the ceiling. Returns null when nothing improves on what
 * we already have.
 */
async function searchUpward(makePipeline, ext, minBytes, maxBytes, currentBytes) {
  if (ext === 'png' || ext === 'webp') return null;

  let bestBuffer = null;

  for (const quality of [96, 98, 100]) {
    const buffer = await encode(makePipeline(), ext, quality, { fullChroma: true });

    if (buffer.length > maxBytes) break; // any higher quality only grows
    if (buffer.length > currentBytes) bestBuffer = buffer;
    if (buffer.length >= minBytes) return buffer;
  }

  return bestBuffer;
}

/**
 * Compresses an image to land inside a target file size.
 *
 * Exists because form portals (exam boards, university admissions) reject
 * uploads outside a fixed KB range, often at fixed pixel dimensions too.
 * Quality is traded first; the image is only downscaled when quality alone
 * cannot get there, and the response says so.
 */
async function compressToTarget({
  inputPath,
  targetBytes,
  minBytes,
  format,
  maxWidth,
  maxHeight,
  fit,
  originalBaseName
}) {
  const spec = FORMATS[String(format || 'jpg').toLowerCase()];

  if (!spec) {
    throw AppError.badRequest('format must be one of: jpg, png, webp.');
  }

  if (!Number.isFinite(targetBytes) || targetBytes < 1024) {
    throw AppError.badRequest('Target size must be at least 1 KB.');
  }

  const source = sharp(inputPath, { failOn: 'error', limitInputPixels: MAX_PIXELS });
  const metadata = await source.metadata();

  if (!metadata.width || !metadata.height) {
    throw AppError.badRequest('Unable to read the image dimensions. The file may be corrupted.');
  }

  const originalBytes = (await fs.stat(inputPath)).size;
  const resize = buildResize(maxWidth, maxHeight, fit);

  // Fresh pipeline per attempt: sharp instances are single-use, and reading
  // from the path lets libvips shrink-on-load instead of decoding full size.
  const makePipeline = (scale) => {
    const pipeline = sharp(inputPath, { failOn: 'error', limitInputPixels: MAX_PIXELS }).rotate();

    if (resize) pipeline.resize(resize);
    if (scale && scale < 1) {
      pipeline.resize({
        width: Math.max(MIN_DIMENSION, Math.round((resize?.width || metadata.width) * scale)),
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    return pipeline;
  };

  if (minBytes && minBytes > targetBytes) {
    throw AppError.badRequest('The minimum size cannot be larger than the maximum size.');
  }

  let scale = 1;
  let result = null;
  let quality = 0;
  let rounds = 0;

  while (rounds < MAX_DOWNSCALE_ROUNDS) {
    const { best, bestQuality, smallest } = await searchQuality(
      () => makePipeline(scale),
      spec.ext,
      targetBytes
    );

    if (best) {
      result = best;
      quality = bestQuality;
      break;
    }

    // Encoded size scales roughly with pixel count, so the linear dimension
    // needs sqrt(target / achieved). The 0.92 is headroom against that
    // approximation, which keeps this to one or two rounds instead of ten.
    const ratio = Math.sqrt(targetBytes / smallest.length) * 0.92;
    const nextScale = scale * Math.min(0.95, Math.max(0.25, ratio));
    const nextWidth = Math.round((resize?.width || metadata.width) * nextScale);

    if (nextWidth < MIN_DIMENSION) {
      result = smallest;
      quality = MIN_QUALITY;
      scale = nextScale;
      break;
    }

    scale = nextScale;
    rounds += 1;
  }

  if (!result) {
    throw AppError.badRequest(
      `Could not compress this image below ${Math.round(targetBytes / 1024)} KB without destroying it. Try a larger target size.`
    );
  }

  // Forms usually state a range. A file under the floor is rejected just as
  // surely as one over the ceiling, so climb back up if we undershot.
  let padded = false;

  if (minBytes && result.length < minBytes) {
    const better = await searchUpward(() => makePipeline(scale), spec.ext, minBytes, targetBytes, result.length);
    if (better) result = better;

    if (result.length < minBytes) {
      const grown = padToMinimum(result, minBytes, spec.ext);
      padded = grown.length > result.length;
      result = grown;
    }
  }

  ensureWorkspace();
  const outputFileName = `${randomUUID()}.${spec.ext}`;
  const outputPath = path.join(env.outputDir, outputFileName);

  try {
    await fs.writeFile(outputPath, result);
    const final = await sharp(outputPath).metadata();

    logger.debug('Compressed image', {
      originalBytes,
      finalBytes: result.length,
      targetBytes,
      quality,
      rounds
    });

    return {
      outputPath,
      outputFileName,
      originalName: `${sanitizeBaseName(originalBaseName, 'image')}.${spec.ext}`,
      bytes: result.length,
      originalBytes,
      width: final.width,
      height: final.height,
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      quality,
      // True when quality alone was not enough and pixels had to go. The UI
      // surfaces this so nobody is surprised by a smaller photo.
      // Not "smaller than the input" — resizing to requested dimensions is the
      // whole point and is no surprise. This means the size target forced us
      // below what the caller actually asked for, which is worth flagging.
      downscaled: scale < 1,
      withinTarget: result.length <= targetBytes && (!minBytes || result.length >= minBytes),
      // True when metadata was added to clear a minimum. Pixels are untouched;
      // worth reporting so the size is never a mystery.
      padded
    };
  } catch (error) {
    await safeUnlink(outputPath);
    throw AppError.internal(`Failed to write the compressed image: ${error.message}`);
  }
}

module.exports = { compressToTarget, MIN_QUALITY, MAX_QUALITY };

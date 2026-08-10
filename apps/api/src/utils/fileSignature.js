'use strict';

const fs = require('fs/promises');

async function readHeader(filePath, bytes = 12) {
  const fileHandle = await fs.open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await fileHandle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

/**
 * Magic-number check. Extensions and MIME types are client-supplied and
 * trivially spoofed; the first bytes of the file are not.
 */
async function detectFileSignature(filePath) {
  const header = await readHeader(filePath, 12);

  if (header.length >= 4 && header.subarray(0, 4).toString('latin1') === '%PDF') {
    return 'pdf';
  }

  if (header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'png';
  }

  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'jpg';
  }

  // WebP is a RIFF container: "RIFF" then a size, then "WEBP". Detecting it
  // properly is what lets the image profile stop accepting unknown bytes —
  // which previously meant any file renamed .png passed validation.
  if (
    header.length >= 12 &&
    header.subarray(0, 4).toString('latin1') === 'RIFF' &&
    header.subarray(8, 12).toString('latin1') === 'WEBP'
  ) {
    return 'webp';
  }

  // .docx is a zip container. PK\x03\x04 is a normal archive; PK\x05\x06 and
  // PK\x07\x08 are the empty and spanned variants.
  if (header.length >= 4 && header[0] === 0x50 && header[1] === 0x4b) {
    const third = header[2];
    const fourth = header[3];
    const isZip =
      (third === 0x03 && fourth === 0x04) ||
      (third === 0x05 && fourth === 0x06) ||
      (third === 0x07 && fourth === 0x08);

    if (isZip) return 'zip';
  }

  return 'unknown';
}

module.exports = { detectFileSignature };

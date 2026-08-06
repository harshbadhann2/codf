'use strict';

/**
 * Grows an encoded image to a minimum byte size without touching its pixels.
 *
 * Form portals routinely demand a *range* ("photo between 20 KB and 50 KB").
 * A small, clean photo can legitimately encode below the floor even at maximum
 * quality, and the only honest fix is to make the file bigger without making
 * the picture worse. Both formats below have a standard metadata container for
 * exactly this, so the result stays a fully valid file that every decoder
 * renders identically — no trailing junk after the end-of-image marker, which
 * strict validators are entitled to reject.
 */

// A JPEG COM segment carries a 2-byte big-endian length, so one segment can
// hold 65533 bytes of payload. Larger padding is split across several.
const MAX_COM_PAYLOAD = 65533 - 2;

function padJpeg(buffer, targetBytes) {
  const needed = targetBytes - buffer.length;
  if (needed <= 0) return buffer;

  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return buffer; // not a JPEG

  const segments = [];
  let remaining = needed;

  while (remaining > 0) {
    // Each segment costs 4 bytes of overhead (marker + length) on top of payload.
    const payloadSize = Math.min(remaining - 4, MAX_COM_PAYLOAD);
    if (payloadSize <= 0) break;

    const segment = Buffer.alloc(payloadSize + 4);
    segment[0] = 0xff;
    segment[1] = 0xfe; // COM
    segment.writeUInt16BE(payloadSize + 2, 2);
    segment.fill(0x20, 4); // spaces: a COM segment is nominally text
    segments.push(segment);

    remaining -= segment.length;
  }

  if (segments.length === 0) return buffer;

  // COM segments live between SOI and the rest of the stream.
  return Buffer.concat([buffer.subarray(0, 2), ...segments, buffer.subarray(2)]);
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);

  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }

  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buffer[i]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const PNG_IEND = Buffer.from([0x49, 0x45, 0x4e, 0x44]);

function padPng(buffer, targetBytes) {
  const needed = targetBytes - buffer.length;
  if (needed <= 0) return buffer;

  // A tEXt chunk costs 12 bytes of framing plus the keyword and separator.
  const keyword = Buffer.from('Comment\0', 'latin1');
  const payloadSize = needed - 12 - keyword.length;
  if (payloadSize <= 0) return buffer;

  const iendIndex = buffer.lastIndexOf(PNG_IEND);
  if (iendIndex < 4) return buffer; // not a PNG we recognise

  const data = Buffer.concat([keyword, Buffer.alloc(payloadSize, 0x20)]);
  const chunk = Buffer.alloc(data.length + 12);

  chunk.writeUInt32BE(data.length, 0);
  chunk.write('tEXt', 4, 'latin1');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);

  // Chunks must precede IEND; the index points at the type field, which sits
  // 4 bytes after that chunk's length field.
  const iendStart = iendIndex - 4;
  return Buffer.concat([buffer.subarray(0, iendStart), chunk, buffer.subarray(iendStart)]);
}

/** Returns a buffer of at least `targetBytes`, or the original if unsupported. */
function padToMinimum(buffer, targetBytes, ext) {
  if (buffer.length >= targetBytes) return buffer;
  if (ext === 'jpg' || ext === 'jpeg') return padJpeg(buffer, targetBytes);
  if (ext === 'png') return padPng(buffer, targetBytes);
  return buffer; // WebP's RIFF container makes this less safe; not worth it
}

module.exports = { padToMinimum, padJpeg, padPng, crc32 };

'use strict';

const path = require('path');
const { AppError } = require('../utils/AppError');
const { detectFileSignature } = require('../utils/fileSignature');
const { safeUnlink } = require('../utils/fileCleanup');
const { SUPPORTED_CODE_EXTENSIONS } = require('../services/codeFile.service');

const profiles = {
  docx: {
    label: 'Word document',
    extensions: new Set(['.docx']),
    signatures: new Set(['zip'])
  },
  pdf: {
    label: 'PDF',
    extensions: new Set(['.pdf']),
    signatures: new Set(['pdf'])
  },
  image: {
    label: 'image',
    extensions: new Set(['.jpg', '.jpeg', '.png', '.webp']),
    signatures: new Set(['jpg', 'png', 'unknown']) // webp has no entry in our sniffer
  },
  code: {
    label: 'source file',
    extensions: new Set(SUPPORTED_CODE_EXTENSIONS),
    signatures: new Set(['unknown']) // plain text has no magic number
  }
};

/**
 * Verifies the upload really is what its extension claims. Extension and MIME
 * type both come from the client; the magic number comes from the bytes.
 */
function validateUploadedFile(profileName) {
  const profile = profiles[profileName];

  if (!profile) {
    throw new Error(`Unknown validation profile: ${profileName}`);
  }

  return (req, _res, next) => {
    (async () => {
      const { file } = req;

      if (!file) {
        throw AppError.badRequest('Please choose a file to upload.');
      }

      const extension = path.extname(file.originalname || '').toLowerCase();

      if (!profile.extensions.has(extension)) {
        await safeUnlink(file.path);
        throw AppError.badRequest(
          `Expected a ${profile.label} (${[...profile.extensions].join(', ')}) but received "${extension || 'no extension'}".`
        );
      }

      if (file.size === 0) {
        await safeUnlink(file.path);
        throw AppError.badRequest('The uploaded file is empty.');
      }

      const signature = await detectFileSignature(file.path);

      if (!profile.signatures.has(signature)) {
        await safeUnlink(file.path);
        throw AppError.badRequest(
          `This file is not a valid ${profile.label} — its contents do not match its "${extension}" extension.`
        );
      }
    })()
      .then(() => next())
      .catch(next);
  };
}

module.exports = { validateUploadedFile };

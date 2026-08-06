'use strict';

const { AppError } = require('../utils/AppError');
const { getCapabilities } = require('../services/capabilities.service');
const { safeUnlink } = require('../utils/fileCleanup');

/**
 * Blocks a route when the tool it depends on is missing from the runtime, and
 * says which tool. Without this the user sees a bare 500; with it they see
 * "PDF to Word is unavailable: Python with pdf2docx was not found."
 */
function requireCapability(name) {
  return (req, _res, next) => {
    getCapabilities()
      .then(async (capabilities) => {
        const capability = capabilities[name];

        if (capability && !capability.available) {
          // Don't leave the upload behind when we reject the request.
          if (req.file) await safeUnlink(req.file.path);
          throw AppError.unavailable(capability.reason || `${name} is unavailable on this server.`, {
            code: 'capability_unavailable',
            details: { capability: name }
          });
        }
      })
      .then(() => next())
      .catch(next);
  };
}

module.exports = { requireCapability };

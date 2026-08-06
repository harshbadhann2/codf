'use strict';

/** Forwards rejected promises from async route handlers into Express' error pipeline. */
function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };

'use strict';

/**
 * Custom application error with HTTP status code.
 * Throw from controllers/routes to send a structured JSON error response.
 */
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Wraps an async Express route handler so that rejected promises are
 * forwarded to the Express error-handling middleware instead of being
 * silently swallowed.
 *
 * Usage:
 *   router.get('/foo', asyncHandler(async (req, res) => { ... }));
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { AppError, asyncHandler };

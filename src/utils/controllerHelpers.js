"use strict";

/**
 * controllerHelpers.js
 *
 * Shared utility functions for Express controllers.
 * Eliminates common duplicated patterns across the codebase:
 *   - ObjectId validation with automatic 400 response
 *   - Company ID extraction from request
 *   - Pagination calculation
 *   - Standardised error responses
 *   - Mongoose ValidationError handling
 *   - Async controller wrapper (try/catch boilerplate removal)
 */

const mongoose = require("mongoose");

// ─── ObjectId Validation ─────────────────────────────────────────────────────

/**
 * Validate a MongoDB ObjectId string.
 * Returns true if valid, false otherwise.
 */
function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Validate an ObjectId and send 400 if invalid.
 * Returns true if valid (caller should continue), false if response was sent.
 *
 * Usage:
 *   if (!validateObjectId(res, courseId, "course ID")) return;
 */
function validateObjectId(res, id, label = "ID") {
  if (!isValidObjectId(id)) {
    res.status(400).json({ error: `Invalid ${label}` });
    return false;
  }
  return true;
}

/**
 * Validate multiple ObjectIds at once.
 * Returns true if all valid, false if any invalid (response already sent).
 *
 * Usage:
 *   if (!validateObjectIds(res, { "quiz ID": quizId, "question ID": questionId })) return;
 */
function validateObjectIds(res, idMap) {
  for (const [label, id] of Object.entries(idMap)) {
    if (!isValidObjectId(id)) {
      res.status(400).json({ error: `Invalid ${label}` });
      return false;
    }
  }
  return true;
}

// ─── Company ID Extraction ───────────────────────────────────────────────────

/**
 * Extract company ID from the authenticated user on the request.
 * Handles both `req.user.company` and `req.user.companyId` patterns.
 */
function getCompanyId(req) {
  return req.user.company || req.user.companyId;
}

// ─── Pagination ──────────────────────────────────────────────────────────────

/**
 * Parse pagination params from query string and return skip/limit values.
 *
 * @param {object} query - req.query
 * @param {object} [defaults] - { page: 1, limit: 20 }
 * @returns {{ page: number, limit: number, skip: number }}
 */
function parsePagination(query, defaults = {}) {
  const page  = Math.max(1, Number(query.page)  || defaults.page  || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || defaults.limit || 20));
  const skip  = (page - 1) * limit;
  return { page, limit, skip };
}

// ─── Date Range Filter ───────────────────────────────────────────────────────

/**
 * Build a Mongoose date-range filter object from startDate/endDate query params.
 * Returns null if neither date is provided.
 *
 * @param {string|undefined} startDate
 * @param {string|undefined} endDate
 * @param {object} [options] - { endOfDay: true } pads endDate to 23:59:59.999
 * @returns {object|null} e.g. { $gte: Date, $lte: Date }
 */
function buildDateFilter(startDate, endDate, options = {}) {
  if (!startDate && !endDate) return null;
  const filter = {};
  if (startDate) filter.$gte = new Date(startDate);
  if (endDate) {
    const ed = new Date(endDate);
    if (options.endOfDay !== false) {
      ed.setHours(23, 59, 59, 999);
    }
    filter.$lte = ed;
  }
  return filter;
}

// ─── Error Responses ─────────────────────────────────────────────────────────

/**
 * Send a standardised error response. Handles Mongoose ValidationError,
 * duplicate key errors (code 11000), and generic server errors.
 *
 * @param {object} res - Express response
 * @param {Error}  err - The caught error
 * @param {string} [context] - Log prefix, e.g. "[createQuiz]"
 * @param {object} [options] - { defaultMessage: "Failed to ..." }
 */
function handleControllerError(res, err, context, options = {}) {
  if (context) {
    console.error(context, err);
  }

  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
      error: messages.length ? messages.join(", ") : err.message,
    });
  }

  if (err.code === 11000) {
    return res.status(409).json({
      error: options.duplicateMessage || "Duplicate entry — a record with this data already exists.",
    });
  }

  const status = err.status || err.statusCode || 500;
  return res.status(status).json({
    error: err.message || options.defaultMessage || "Internal server error",
  });
}

/**
 * Wrap an async controller handler to eliminate try/catch boilerplate.
 * Catches errors and delegates to handleControllerError.
 *
 * Usage:
 *   exports.getQuiz = asyncHandler("[getQuiz]", async (req, res) => { ... });
 */
function asyncHandler(context, fn) {
  if (typeof context === "function") {
    fn = context;
    context = null;
  }
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      handleControllerError(res, err, context);
    });
  };
}

// ─── Success Responses ───────────────────────────────────────────────────────

/**
 * Send a standardised success JSON response.
 */
function sendSuccess(res, data, statusCode = 200) {
  return res.status(statusCode).json({ success: true, ...data });
}

module.exports = {
  isValidObjectId,
  validateObjectId,
  validateObjectIds,
  getCompanyId,
  parsePagination,
  buildDateFilter,
  handleControllerError,
  asyncHandler,
  sendSuccess,
};

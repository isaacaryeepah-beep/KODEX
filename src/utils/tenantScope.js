"use strict";

/**
 * tenantScope.js
 *
 * Centralised helpers that enforce companyId (stored as `company` in all
 * documents) isolation in every Mongoose query.
 *
 * Convention: the tenant field in every document is `company` (ObjectId ref
 * to Company), matching the existing codebase standard.
 *
 * Usage examples
 * ──────────────
 *   // Build a base filter for any query:
 *   const filter = tenantFilter(req.user.company, { status: "active" });
 *   const courses = await Course.find(filter);
 *
 *   // Safe findById that throws if the document belongs to a different tenant:
 *   const quiz = await scopedFindById(NormalQuiz, quizId, req.user.company);
 *
 *   // Ensure a document you already have belongs to the right tenant:
 *   assertTenantMatch(quiz, req.user.company);   // throws TenantMismatchError
 *
 *   // Create a document with the tenant field pre-set:
 *   const leave = await scopedCreate(LeaveRequest, payload, req.user.company);
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

class TenantMismatchError extends Error {
  constructor(message = "Cross-tenant access denied") {
    super(message);
    this.name = "TenantMismatchError";
    this.statusCode = 403;
  }
}

class ResourceNotFoundError extends Error {
  constructor(message = "Resource not found") {
    super(message);
    this.name = "ResourceNotFoundError";
    this.statusCode = 404;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise a value to a plain string for ObjectId comparison.
 * Handles ObjectId instances, strings, and User/Company documents.
 */
function toIdString(value) {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof mongoose.Types.ObjectId) return value.toString();
  if (value._id) return value._id.toString();
  return String(value);
}

/**
 * Build a Mongoose filter that always includes the tenant constraint.
 *
 * @param {ObjectId|string} companyId
 * @param {Object} [extra={}] - Additional filter conditions to merge.
 * @returns {Object} Mongoose filter object.
 */
function tenantFilter(companyId, extra = {}) {
  if (!companyId) throw new Error("tenantFilter: companyId is required");
  return { company: companyId, ...extra };
}

/**
 * Assert that a fetched document belongs to the expected tenant.
 * Throws TenantMismatchError (403) if there is a mismatch.
 * Throws ResourceNotFoundError (404) if doc is null.
 *
 * @param {Object|null} doc        - Mongoose document.
 * @param {ObjectId|string} companyId
 * @param {string} [label="Resource"] - Human label for error messages.
 */
function assertTenantMatch(doc, companyId, label = "Resource") {
  if (!doc) {
    throw new ResourceNotFoundError(`${label} not found`);
  }
  const docCompany = toIdString(doc.company);
  const expected   = toIdString(companyId);
  if (docCompany !== expected) {
    throw new TenantMismatchError(
      `${label} does not belong to this organisation`
    );
  }
}

/**
 * Scoped findById — fetches by _id AND verifies the company field.
 * Returns null if either the document is missing or the tenant doesn't match.
 *
 * Prefer this over raw Model.findById when you need a clean 404/403 split.
 *
 * @param {mongoose.Model} Model
 * @param {ObjectId|string} id
 * @param {ObjectId|string} companyId
 * @param {Object} [options]
 * @param {string|Object} [options.select] - Field projection.
 * @param {string|Object} [options.populate] - Population config.
 * @returns {Promise<mongoose.Document>} - Throws if not found or tenant mismatch.
 */
async function scopedFindById(Model, id, companyId, { select, populate } = {}) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ResourceNotFoundError(`${Model.modelName} not found`);
  }

  let query = Model.findOne({ _id: id, company: companyId });
  if (select)   query = query.select(select);
  if (populate) query = query.populate(populate);

  const doc = await query.exec();
  if (!doc) {
    // To prevent leaking existence of records, always return 404.
    throw new ResourceNotFoundError(`${Model.modelName} not found`);
  }
  return doc;
}

/**
 * Scoped find — wraps Model.find with the tenant filter pre-applied.
 *
 * @param {mongoose.Model} Model
 * @param {Object} filter     - Additional conditions (company is injected).
 * @param {ObjectId|string} companyId
 * @param {Object} [options]
 * @param {string|Object} [options.select]
 * @param {string|Object} [options.sort]
 * @param {number}  [options.limit]
 * @param {number}  [options.skip]
 * @param {string|Object} [options.populate]
 * @returns {Promise<mongoose.Document[]>}
 */
async function scopedFind(Model, filter = {}, companyId, options = {}) {
  const { select, sort, limit, skip, populate } = options;
  let query = Model.find(tenantFilter(companyId, filter));
  if (select)   query = query.select(select);
  if (sort)     query = query.sort(sort);
  if (limit)    query = query.limit(limit);
  if (skip)     query = query.skip(skip);
  if (populate) query = query.populate(populate);
  return query.exec();
}

/**
 * Scoped create — merges the company field into data before Model.create.
 *
 * @param {mongoose.Model} Model
 * @param {Object|Object[]} data - Document data (company will be overwritten).
 * @param {ObjectId|string} companyId
 * @returns {Promise<mongoose.Document|mongoose.Document[]>}
 */
async function scopedCreate(Model, data, companyId) {
  if (Array.isArray(data)) {
    return Model.create(data.map((d) => ({ ...d, company: companyId })));
  }
  return Model.create({ ...data, company: companyId });
}

/**
 * Scoped findOneAndUpdate — ensures the query is always tenant-scoped.
 *
 * @param {mongoose.Model} Model
 * @param {Object} filter
 * @param {ObjectId|string} companyId
 * @param {Object} update
 * @param {Object} [options={}]  - Mongoose findOneAndUpdate options.
 * @returns {Promise<mongoose.Document|null>}
 */
async function scopedFindOneAndUpdate(Model, filter, companyId, update, options = {}) {
  return Model.findOneAndUpdate(
    tenantFilter(companyId, filter),
    update,
    { new: true, runValidators: true, ...options }
  ).exec();
}

/**
 * Scoped count — returns document count restricted to the tenant.
 *
 * @param {mongoose.Model} Model
 * @param {Object} filter
 * @param {ObjectId|string} companyId
 * @returns {Promise<number>}
 */
async function scopedCount(Model, filter = {}, companyId) {
  return Model.countDocuments(tenantFilter(companyId, filter)).exec();
}

/**
 * Verify that a list of IDs all belong to the given tenant.
 * Useful before bulk operations.
 *
 * @param {mongoose.Model} Model
 * @param {ObjectId[]|string[]} ids
 * @param {ObjectId|string} companyId
 * @returns {Promise<boolean>} - true if all ids are valid within the tenant.
 */
async function allBelongToTenant(Model, ids, companyId) {
  if (!ids || ids.length === 0) return true;
  const count = await Model.countDocuments({
    _id: { $in: ids },
    company: companyId,
  });
  return count === ids.length;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Error classes (re-export so controllers can do instanceof checks)
  TenantMismatchError,
  ResourceNotFoundError,

  // Core helpers
  tenantFilter,
  assertTenantMatch,
  toIdString,

  // Query helpers
  scopedFindById,
  scopedFind,
  scopedCreate,
  scopedFindOneAndUpdate,
  scopedCount,
  allBelongToTenant,
};

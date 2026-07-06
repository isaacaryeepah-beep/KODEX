"use strict";

/**
 * ApiKey
 *
 * Company-scoped credential for the public REST API (/api/v1/*).
 * One document per issued key.
 *
 * Security model:
 *  - The full key ("dk_live_<40 hex>") is generated once, returned to the
 *    admin ONCE at creation, and never stored — only its SHA-256 hash
 *    (`keyHash`, unique-indexed for O(1) lookup). Same discipline as
 *    refresh tokens (src/models/RefreshToken.js). A database leak yields
 *    no usable keys.
 *  - `prefix` (the first characters) is kept ONLY so admins can recognise
 *    which key is which in the UI ("dk_live_3fa9…"). It is not sufficient
 *    to authenticate.
 *  - `company` binds the key to exactly one tenant at creation. The public
 *    API derives the tenant from the key server-side and never from any
 *    request parameter — cross-tenant access is structurally impossible.
 *  - `scopes` whitelist what the key may read. A payroll key with
 *    read:attendance cannot list employees, and vice versa.
 *  - Revocation is soft (`revokedAt`) so the key's audit history survives;
 *    the auth middleware rejects revoked keys on the very next request.
 */

const mongoose = require("mongoose");

// Read-only in Phase 1 by design — write scopes arrive with Phase 2
// (webhooks + writes) once the read surface has proven itself in the wild.
const API_SCOPES = Object.freeze([
  "read:attendance",
  "read:employees",
  "read:leaves",
  "read:shifts",
]);

const apiKeySchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Key name is required"],
      trim: true,
      maxlength: 80,
    },
    keyHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    prefix: {
      type: String,
      required: true,
    },
    scopes: {
      type: [{ type: String, enum: API_SCOPES }],
      default: [],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null },
    requestCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const ApiKey = mongoose.model("ApiKey", apiKeySchema);

module.exports = ApiKey;
module.exports.API_SCOPES = API_SCOPES;

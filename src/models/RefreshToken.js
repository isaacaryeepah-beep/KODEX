"use strict";

const mongoose = require("mongoose");

// Stores issued refresh tokens so they can be revoked on logout.
// TTL index auto-purges expired documents — DB stays lean.
const refreshTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    // Revoked tokens are kept briefly so reuse can be detected (token rotation
    // attack detection). MongoDB's TTL will clean them up after expiry.
    revoked: { type: Boolean, default: false, index: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, default: null },
    ipAddress: { type: String, default: null },
  },
  { timestamps: true }
);

// Auto-delete after expiry + 1-day buffer (so reuse detection window is kept)
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);

"use strict";

/**
 * Badge.js
 *
 * A badge definition created by an admin for a company.
 * Badges are awarded to users either manually by staff or automatically
 * by the achievements check endpoint.
 *
 * achievementKey links a badge to a standard automatic criterion:
 *   COURSE_COMPLETE      — completed at least 1 course (academic)
 *   FIVE_COURSES         — completed 5+ courses (academic)
 *   TEN_COURSES          — completed 10+ courses (academic)
 *   PERFECT_ATTENDANCE   — 100% attendance in at least one course (3+ sessions)
 *   TRAINING_COMPLETE    — completed at least 1 training module (corporate)
 *   FIVE_TRAININGS       — completed 5+ training modules (corporate)
 *   QUIZ_ACE             — scored ≥ 90% on at least one graded quiz (academic)
 *
 * Badges with achievementKey = null (or unknown) are manual-only.
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const BADGE_CATEGORIES = Object.freeze([
  "academic",
  "attendance",
  "performance",
  "training",
  "participation",
  "general",
]);

const ACHIEVEMENT_KEYS = Object.freeze([
  "COURSE_COMPLETE",
  "FIVE_COURSES",
  "TEN_COURSES",
  "PERFECT_ATTENDANCE",
  "TRAINING_COMPLETE",
  "FIVE_TRAININGS",
  "QUIZ_ACE",
]);

const badgeSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },

    // ── Identity ──────────────────────────────────────────────────────────
    name: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 100,
    },
    description: { type: String, default: "", trim: true, maxlength: 500 },
    icon:        { type: String, default: "🏅", trim: true },  // emoji or URL
    color:       { type: String, default: "#6366f1", trim: true },

    // ── Classification ────────────────────────────────────────────────────
    category: {
      type:    String,
      enum:    BADGE_CATEGORIES,
      default: "general",
    },

    // ── Auto-award link ───────────────────────────────────────────────────
    // If set, POST /api/badges/check/:userId will auto-award this badge
    // when the named criterion is met.
    achievementKey: {
      type:    String,
      enum:    [...ACHIEVEMENT_KEYS, null],
      default: null,
    },

    // ── State ─────────────────────────────────────────────────────────────
    isActive:  { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// One achievementKey per company (prevents duplicate auto-award badges)
badgeSchema.index(
  { company: 1, achievementKey: 1 },
  { unique: true, partialFilterExpression: { achievementKey: { $ne: null } } }
);
badgeSchema.index({ company: 1, isActive: 1 });

const Badge = mongoose.model("Badge", badgeSchema);
module.exports = Badge;
module.exports.BADGE_CATEGORIES  = BADGE_CATEGORIES;
module.exports.ACHIEVEMENT_KEYS  = ACHIEVEMENT_KEYS;

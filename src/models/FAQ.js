"use strict";

/**
 * FAQ.js
 *
 * Knowledge base entry for the AI FAQ Assistant.
 * Staff (admin/superadmin) curate these; the chatbot searches them first
 * before falling back to the AI model.
 *
 * targetRoles: [] means the FAQ is visible to all roles.
 * Non-empty array restricts the FAQ to those roles only.
 *
 * viewCount / helpfulCount / notHelpfulCount give admins insight into
 * which FAQs are being used and how well they are rated.
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const FAQ_CATEGORIES = Object.freeze([
  "attendance",
  "snapquiz",
  "assignments",
  "billing",
  "hr",
  "meetings",
  "gps_attendance",
  "password_reset",
  "general",
]);

const faqSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },

    // ── Content ───────────────────────────────────────────────────────────
    question: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 500,
    },
    answer: {
      type:     String,
      required: true,
      trim:     true,
    },
    category: {
      type:    String,
      enum:    FAQ_CATEGORIES,
      default: "general",
    },

    // Search boost keywords (synonyms, acronyms, alternate phrasings)
    keywords: { type: [String], default: [] },

    // ── Audience ──────────────────────────────────────────────────────────
    // Empty = visible to all roles; non-empty = restricted to listed roles
    targetRoles: { type: [String], default: [] },

    // ── State ─────────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true },

    // ── Analytics ─────────────────────────────────────────────────────────
    viewCount:       { type: Number, default: 0, min: 0 },
    helpfulCount:    { type: Number, default: 0, min: 0 },
    notHelpfulCount: { type: Number, default: 0, min: 0 },

    // ── Audit ─────────────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────
// Full-text search across question, answer, and boost keywords
faqSchema.index({ question: "text", answer: "text", keywords: "text" }, {
  weights: { question: 10, keywords: 5, answer: 1 },
  name: "faq_text_search",
});
// Category-filtered listing
faqSchema.index({ company: 1, category: 1, isActive: 1 });
// General active lookup
faqSchema.index({ company: 1, isActive: 1 });

const FAQ = mongoose.model("FAQ", faqSchema);
module.exports = FAQ;
module.exports.FAQ_CATEGORIES = FAQ_CATEGORIES;

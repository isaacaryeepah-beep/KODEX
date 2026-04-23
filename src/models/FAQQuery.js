"use strict";

/**
 * FAQQuery.js
 *
 * An immutable log of every question submitted through the AI FAQ chatbot.
 * Used by admins to:
 *  - see which questions are not answered by the FAQ database
 *  - train the knowledge base by converting unanswered queries into FAQs
 *  - track escalations to support tickets
 *
 * source:
 *   "faq" — answered directly from the FAQ knowledge base
 *   "ai"  — no FAQ match found; answered (or attempted) by the AI model
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const faqQuerySchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },

    // ── Who asked ────────────────────────────────────────────────────────
    user:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    userRole: { type: String, default: "" },

    // ── The question ──────────────────────────────────────────────────────
    question: { type: String, required: true, trim: true },

    // ── Resolution ───────────────────────────────────────────────────────
    source: { type: String, enum: ["faq", "ai"], default: "ai" },

    // Set when matched to an FAQ entry
    matchedFAQ: { type: mongoose.Schema.Types.ObjectId, ref: "FAQ", default: null },

    // Set when the AI model was called
    aiResponse:     { type: String, default: null },
    confidenceHigh: { type: Boolean, default: null }, // null = no AI call made

    // ── Feedback ──────────────────────────────────────────────────────────
    // null = not yet rated; true = helpful; false = not helpful
    wasHelpful: { type: Boolean, default: null },

    // ── Escalation ────────────────────────────────────────────────────────
    escalatedToTicket: { type: Boolean, default: false },
    ticketId: { type: mongoose.Schema.Types.ObjectId, ref: "SupportTicket", default: null },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────
// Admin: unanswered / unescalated query review
faqQuerySchema.index({ company: 1, createdAt: -1 });
faqQuerySchema.index({ company: 1, source: 1, createdAt: -1 });
faqQuerySchema.index({ company: 1, escalatedToTicket: 1, createdAt: -1 });
// User's own query history
faqQuerySchema.index({ company: 1, user: 1, createdAt: -1 });

const FAQQuery = mongoose.model("FAQQuery", faqQuerySchema);
module.exports = FAQQuery;

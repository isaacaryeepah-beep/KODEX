"use strict";

/**
 * SupportTicket.js
 *
 * Internal help-desk ticket raised by any authenticated user within a company.
 * Works in both academic and corporate modes.
 *
 * Lifecycle:
 *   open → in_progress → waiting_response ↔ in_progress → resolved → closed
 *   (Staff may re-open a resolved ticket by setting status back to in_progress.)
 *
 * Replies are embedded as a sub-array.  Tickets rarely have more than a few
 * dozen exchanges, so embedding is appropriate and avoids an extra collection.
 * isInternal replies are visible only to staff (hidden from the ticket creator).
 *
 * ticketNumber is a human-readable sequential reference (e.g. TK-00042).
 * It is computed at creation time from a count query — not enforced as unique
 * so that rare race conditions never fail a ticket creation.  The ObjectId is
 * the authoritative identifier for all API lookups.
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const TICKET_STATUSES  = Object.freeze(["open", "in_progress", "waiting_response", "resolved", "closed"]);
const TICKET_CATEGORIES = Object.freeze(["technical", "academic", "financial", "hr", "general"]);
const TICKET_PRIORITIES = Object.freeze(["low", "medium", "high", "urgent"]);

const replySchema = new mongoose.Schema(
  {
    author:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body:       { type: String, required: true, trim: true },
    // Internal notes are visible to staff only, not to the ticket creator
    isInternal: { type: Boolean, default: false },
    editedAt:   { type: Date, default: null },
  },
  { timestamps: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },

    // ── Human-readable reference (not unique — use _id for lookups) ───────
    ticketNumber: { type: String, default: "" },

    // ── Creator ───────────────────────────────────────────────────────────
    createdBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // ── Content ───────────────────────────────────────────────────────────
    subject: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 300,
    },
    description: {
      type:     String,
      required: true,
      trim:     true,
    },
    category: {
      type:    String,
      enum:    TICKET_CATEGORIES,
      default: "general",
    },
    priority: {
      type:    String,
      enum:    TICKET_PRIORITIES,
      default: "medium",
    },

    // ── Workflow ──────────────────────────────────────────────────────────
    status: {
      type:    String,
      enum:    TICKET_STATUSES,
      default: "open",
      index:   true,
    },
    assignedTo: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
    closedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    closedAt:   { type: Date, default: null },

    // ── Thread ────────────────────────────────────────────────────────────
    replies: { type: [replySchema], default: [] },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────
// Creator's own tickets
supportTicketSchema.index({ company: 1, createdBy: 1, status: 1 });
// Staff queue: all open/in-progress tickets in a company
supportTicketSchema.index({ company: 1, status: 1, createdAt: -1 });
// Assigned queue
supportTicketSchema.index({ company: 1, assignedTo: 1, status: 1 });

const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);
module.exports = SupportTicket;
module.exports.TICKET_STATUSES   = TICKET_STATUSES;
module.exports.TICKET_CATEGORIES = TICKET_CATEGORIES;
module.exports.TICKET_PRIORITIES = TICKET_PRIORITIES;

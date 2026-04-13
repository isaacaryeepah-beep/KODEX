"use strict";

/**
 * Message.js
 *
 * A single message within a Conversation.
 * Soft-deleted messages have their body replaced with "[deleted]" in
 * responses — the document is kept so thread continuity is preserved.
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },

    conversation: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Conversation",
      required: true,
      index:    true,
    },

    sender: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // ── Content ───────────────────────────────────────────────────────────
    body: {
      type:     String,
      required: true,
      trim:     true,
    },

    // ── Edit tracking ──────────────────────────────────────────────────────
    editedAt: { type: Date, default: null },

    // ── Soft-delete ───────────────────────────────────────────────────────
    isDeleted:  { type: Boolean, default: false, index: true },
    deletedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deletedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────

// List messages in a conversation in chronological order
messageSchema.index({ company: 1, conversation: 1, createdAt: 1 });
// Messages by sender (e.g. "delete my messages")
messageSchema.index({ company: 1, sender: 1 });

const Message = mongoose.model("Message", messageSchema);
module.exports = Message;

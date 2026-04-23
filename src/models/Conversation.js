"use strict";

/**
 * Conversation.js
 *
 * Represents a direct (1:1) or group messaging thread between users
 * within the same company (tenant-isolated).
 *
 * Unread tracking strategy:
 *   Each participant entry stores `unreadCount` (cached) and `lastReadAt`.
 *   When a new message is sent, all other participants have their
 *   `unreadCount` incremented.  Opening a conversation resets the current
 *   user's `unreadCount` to 0 and updates `lastReadAt`.
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const participantSchema = new mongoose.Schema(
  {
    user:        { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    unreadCount: { type: Number, default: 0, min: 0 },
    lastReadAt:  { type: Date, default: null },
    // Soft-leave: participant removed themselves but messages are kept
    leftAt:      { type: Date, default: null },
  },
  { _id: false }
);

const lastMessageSchema = new mongoose.Schema(
  {
    body:   { type: String, default: "" },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    sentAt: { type: Date, default: null },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },

    // ── Participants (2–20) ───────────────────────────────────────────────
    participants: {
      type:     [participantSchema],
      validate: {
        validator: function (v) { return v.length >= 2 && v.length <= 20; },
        message:   "A conversation must have between 2 and 20 participants",
      },
    },

    // ── Group conversation settings ───────────────────────────────────────
    isGroup: { type: Boolean, default: false },
    title:   { type: String, trim: true, maxlength: 100, default: "" }, // group name

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // ── Conversation type ─────────────────────────────────────────────────
    type: {
      type:    String,
      enum:    ["direct_message", "hod_request", "announcement"],
      default: "direct_message",
    },

    // ── HOD request metadata (type === "hod_request" only) ────────────────
    hodRequestMeta: {
      type: new mongoose.Schema({
        category: {
          type: String,
          enum: ["complaint", "academic_issue", "emergency"],
          default: null,
        },
        subject: { type: String, trim: true, default: null },
      }, { _id: false }),
      default: null,
    },

    // ── Snapshot of the most recent message (for fast list rendering) ─────
    lastMessage: { type: lastMessageSchema, default: () => ({}) },

    // Total message count (cached)
    messageCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────

// Primary: list all conversations for a user in a company
conversationSchema.index({ company: 1, "participants.user": 1 });
// Sort by most recent activity
conversationSchema.index({ company: 1, "lastMessage.sentAt": -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);
module.exports = Conversation;

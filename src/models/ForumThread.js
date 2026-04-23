"use strict";

/**
 * ForumThread.js
 *
 * A discussion thread attached to a course.
 * The opening message lives on the thread itself (body field).
 * Replies are ForumPost documents that reference this thread.
 *
 * Types:
 *   discussion   — general topic, open conversation
 *   question     — expects an accepted answer (isSolved when answered)
 *   announcement — staff-only creation; students read-only
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const THREAD_TYPES = Object.freeze(["discussion", "question", "announcement"]);

const forumThreadSchema = new mongoose.Schema(
  {
    // ── Tenant & context ──────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },
    course: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Course",
      required: true,
      index:    true,
    },
    author: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // ── Content ───────────────────────────────────────────────────────────
    title: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 300,
    },
    body: {
      type:    String,
      default: "",
    },
    type: {
      type:    String,
      enum:    THREAD_TYPES,
      default: "discussion",
    },
    tags: { type: [String], default: [] },

    // ── State flags ───────────────────────────────────────────────────────
    isPinned:  { type: Boolean, default: false },   // staff only
    isLocked:  { type: Boolean, default: false },   // no new replies when locked
    isSolved:  { type: Boolean, default: false },   // question thread: answer marked
    isDeleted: { type: Boolean, default: false, index: true },

    // ── Cached counters (updated by post create/delete) ───────────────────
    replyCount: { type: Number, default: 0, min: 0 },
    viewCount:  { type: Number, default: 0, min: 0 },
    lastReplyAt: { type: Date, default: null },

    // ── Edit tracking ──────────────────────────────────────────────────────
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────

// Primary listing: pinned first, then most recently active
forumThreadSchema.index({ company: 1, course: 1, isDeleted: 1, isPinned: -1, lastReplyAt: -1 });
// Thread by author
forumThreadSchema.index({ company: 1, author: 1, isDeleted: 1 });
// Type filter
forumThreadSchema.index({ company: 1, course: 1, type: 1, isDeleted: 1 });

const ForumThread = mongoose.model("ForumThread", forumThreadSchema);
module.exports = ForumThread;
module.exports.THREAD_TYPES = THREAD_TYPES;

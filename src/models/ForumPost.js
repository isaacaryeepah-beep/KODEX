"use strict";

/**
 * ForumPost.js
 *
 * A reply within a ForumThread.
 * Supports:
 *   - upvotes (array of user ObjectIds, deduplicated by the route handler)
 *   - isAnswer flag for accepted answers on question-type threads
 *   - soft-delete so the thread structure stays coherent
 *   - optional parentPost for one level of nested replies (quote/reply-to)
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const forumPostSchema = new mongoose.Schema(
  {
    // ── Tenant & context ──────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },
    // Denormalized from the thread for faster per-course queries / cascade deletes
    course: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Course",
      required: true,
      index:    true,
    },
    thread: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "ForumThread",
      required: true,
      index:    true,
    },
    author: {
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

    // Optional: which post this is a direct reply to (null = replies to thread)
    parentPost: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "ForumPost",
      default: null,
    },

    // ── Social signals ────────────────────────────────────────────────────
    upvotes:     { type: [mongoose.Schema.Types.ObjectId], default: [] },
    upvoteCount: { type: Number, default: 0, min: 0 },

    // ── Answer tracking (for question threads) ────────────────────────────
    isAnswer: { type: Boolean, default: false },

    // ── Soft-delete ───────────────────────────────────────────────────────
    isDeleted:  { type: Boolean, default: false, index: true },
    deletedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deletedAt:  { type: Date, default: null },

    // ── Edit tracking ──────────────────────────────────────────────────────
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────

// List posts in a thread, chronological
forumPostSchema.index({ company: 1, thread: 1, isDeleted: 1, createdAt: 1 });
// Fast answer lookup
forumPostSchema.index({ company: 1, thread: 1, isAnswer: 1 });
// Author's posts across courses
forumPostSchema.index({ company: 1, author: 1, isDeleted: 1 });

const ForumPost = mongoose.model("ForumPost", forumPostSchema);
module.exports = ForumPost;

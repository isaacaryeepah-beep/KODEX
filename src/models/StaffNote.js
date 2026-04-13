"use strict";

/**
 * StaffNote.js
 *
 * A private staff-authored note about a student or employee.
 * Notes are never visible to the subject — they exist solely for internal
 * staff coordination (pastoral care, at-risk tracking, HR case notes, etc.)
 *
 * Confidential notes (isConfidential = true) are visible only to the author
 * and to admin / superadmin roles.
 *
 * followUpDate supports scheduling future check-ins; followUpCompleted tracks
 * whether that follow-up has been actioned.
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const NOTE_CATEGORIES = Object.freeze([
  "academic",      // academic performance concern or update
  "behavioral",    // conduct / disciplinary
  "achievement",   // positive milestone, commendation
  "health",        // welfare / medical concern
  "meeting",       // note from a 1:1 meeting
  "pastoral",      // general pastoral care
  "hr",            // HR / employment matter
  "general",
]);

const staffNoteSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },

    // ── Who the note is about ─────────────────────────────────────────────
    subject: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
      index:    true,
    },

    // ── Who wrote it ──────────────────────────────────────────────────────
    author: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // ── Content ───────────────────────────────────────────────────────────
    category: {
      type:    String,
      enum:    NOTE_CATEGORIES,
      default: "general",
    },
    body: {
      type:     String,
      required: true,
      trim:     true,
    },
    tags: { type: [String], default: [] },

    // ── Visibility ────────────────────────────────────────────────────────
    // true → visible only to author + admin/superadmin
    isConfidential: { type: Boolean, default: false },

    // ── Follow-up ─────────────────────────────────────────────────────────
    followUpDate:      { type: Date,    default: null },
    followUpCompleted: { type: Boolean, default: false },

    // ── Soft-delete ───────────────────────────────────────────────────────
    isDeleted: { type: Boolean, default: false },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deletedAt: { type: Date, default: null },

    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────
// Notes about a specific subject (the primary query)
staffNoteSchema.index({ company: 1, subject: 1, isDeleted: 1, createdAt: -1 });
// Author's own notes across all subjects
staffNoteSchema.index({ company: 1, author: 1, isDeleted: 1 });
// Upcoming follow-ups for a staff member
staffNoteSchema.index({ company: 1, author: 1, followUpDate: 1, followUpCompleted: 1 });

const StaffNote = mongoose.model("StaffNote", staffNoteSchema);
module.exports = StaffNote;
module.exports.NOTE_CATEGORIES = NOTE_CATEGORIES;

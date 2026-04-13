"use strict";

/**
 * SnapQuizResult
 *
 * One result document per student per SnapQuiz (not per attempt).
 * Aggregates across all attempts per SnapQuiz.scorePolicy.
 *
 * Mirrors NormalQuizResult with the addition of:
 *  - `integrityFlag`    — true if any attempt was terminated or has high-risk
 *    proctoring events. Surfaces a warning in the grading panel.
 *  - `violationSummary` — denormalized count of violations across all attempts
 *    for quick dashboard display without joining ViolationLog.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Sub-schema: per-attempt summary row
// ---------------------------------------------------------------------------

const attemptSummarySchema = new mongoose.Schema(
  {
    attemptId:          { type: mongoose.Schema.Types.ObjectId, ref: "SnapQuizAttempt" },
    attemptNumber:      { type: Number },
    status:             { type: String },
    rawScore:           { type: Number,  default: null },
    maxScore:           { type: Number,  default: null },
    percentageScore:    { type: Number,  default: null },
    isPassed:           { type: Boolean, default: null },
    gradingStatus:      { type: String },
    submittedAt:        { type: Date,    default: null },
    timeSpentSeconds:   { type: Number,  default: null },
    isTerminated:       { type: Boolean, default: false },
    violationCount:     { type: Number,  default: 0    },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const snapQuizResultSchema = new mongoose.Schema(
  {
    // ── References ────────────────────────────────────────────────────────
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SnapQuiz",
      required: [true, "SnapQuiz reference is required"],
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Student is required"],
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },

    // ── Counted attempt ───────────────────────────────────────────────────
    countedAttemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SnapQuizAttempt",
      default: null,
    },
    averagedOverAttempts: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },

    // ── Official score ────────────────────────────────────────────────────
    rawScore:        { type: Number,  default: null },
    maxScore:        { type: Number,  default: null },
    percentageScore: { type: Number,  default: null },
    isPassed:        { type: Boolean, default: null },

    // ── Attempt stats ─────────────────────────────────────────────────────
    totalAttempts:     { type: Number, default: 0 },
    completedAttempts: { type: Number, default: 0 },
    remainingAttempts: { type: Number, default: null },
    breakdown: {
      type: [attemptSummarySchema],
      default: [],
    },

    // ── Integrity ─────────────────────────────────────────────────────────
    // Set to true if any attempt was terminated by anti-cheat or had
    // high-risk proctoring events. Does NOT automatically invalidate the result.
    integrityFlag: {
      type: Boolean,
      default: false,
      index: true,
    },
    integrityFlagReason: {
      type: String,
      trim: true,
      default: null,
    },
    // Denormalized total violations across all attempts.
    totalViolations: {
      type: Number,
      default: 0,
    },

    // ── Release control ───────────────────────────────────────────────────
    isReleased: {
      type: Boolean,
      default: false,
      index: true,
    },
    releasedAt: { type: Date,                                       default: null },
    releasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // ── Grading state ─────────────────────────────────────────────────────
    gradingStatus: {
      type: String,
      default: "pending",
      index: true,
    },
    computedAt: {
      type: Date,
      default: null,
    },

    // ── Feedback ──────────────────────────────────────────────────────────
    overallFeedback:  { type: String, trim: true, default: null },
    feedbackGivenBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    feedbackGivenAt:  { type: Date,                                         default: null },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

snapQuizResultSchema.index(
  { quiz: 1, student: 1 },
  { unique: true, name: "unique_snap_result_per_student" }
);

snapQuizResultSchema.index({ company: 1, quiz: 1, gradingStatus: 1 });
snapQuizResultSchema.index({ quiz: 1, isReleased: 1 });
snapQuizResultSchema.index({ quiz: 1, integrityFlag: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const SnapQuizResult = mongoose.model("SnapQuizResult", snapQuizResultSchema);

module.exports = SnapQuizResult;

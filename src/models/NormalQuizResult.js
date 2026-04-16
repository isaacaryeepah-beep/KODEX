"use strict";

/**
 * NormalQuizResult
 *
 * One result document per student per quiz (not per attempt).
 * Aggregates across all attempts according to NormalQuiz.scorePolicy.
 *
 * Design decisions:
 *  - Computed after grading is complete; re-computed whenever a new attempt
 *    is graded or a manual grade changes.
 *  - `countedAttemptId` points to the specific attempt whose score is
 *    recorded here (best / last / first, per policy).
 *  - `isReleased` is the single gate the front-end checks before showing
 *    scores. Controlled by the lecturer (or auto-released when
 *    NormalQuiz.autoReleaseResults = true).
 *  - `breakdown` stores per-attempt summary rows for the student's history
 *    panel and lecturer analytics.
 *  - Upsert pattern: controllers use findOneAndUpdate with upsert=true so
 *    there is always exactly one result per (quiz, student) pair.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Sub-schema: per-attempt summary row
// ---------------------------------------------------------------------------

const attemptSummarySchema = new mongoose.Schema(
  {
    attemptId:       { type: mongoose.Schema.Types.ObjectId, ref: "NormalQuizAttempt" },
    attemptNumber:   { type: Number },
    status:          { type: String },          // attempt status at time of grading
    rawScore:        { type: Number, default: null },
    maxScore:        { type: Number, default: null },
    percentageScore: { type: Number, default: null },
    isPassed:        { type: Boolean, default: null },
    gradingStatus:   { type: String },
    submittedAt:     { type: Date, default: null },
    timeSpentSeconds:{ type: Number, default: null },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const normalQuizResultSchema = new mongoose.Schema(
  {
    // ── References ────────────────────────────────────────────────────────
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NormalQuiz",
      required: [true, "NormalQuiz reference is required"],
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
    // The attempt whose score is used as the official result.
    // Determined by NormalQuiz.scorePolicy (best/last/average/first).
    countedAttemptId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NormalQuizAttempt",
      default: null,
    },
    // For scorePolicy = "average", countedAttemptId is null and
    // averagedOverAttempts lists all included attempt IDs.
    averagedOverAttempts: {
      type: [mongoose.Schema.Types.ObjectId],
      default: [],
    },

    // ── Official score (from counted attempt or average) ──────────────────
    rawScore:        { type: Number, default: null },
    maxScore:        { type: Number, default: null },
    percentageScore: { type: Number, default: null },
    isPassed:        { type: Boolean, default: null },

    // ── Attempt stats ─────────────────────────────────────────────────────
    totalAttempts:       { type: Number, default: 0 },
    completedAttempts:   { type: Number, default: 0 },
    remainingAttempts:   { type: Number, default: null }, // null = unlimited
    // Per-attempt rows for history view.
    breakdown: {
      type: [attemptSummarySchema],
      default: [],
    },

    // ── Release control ───────────────────────────────────────────────────
    // Whether the student can view their score/answers.
    isReleased: {
      type: Boolean,
      default: false,
      index: true,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    releasedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Grading state ─────────────────────────────────────────────────────
    // Mirrors the counted attempt's gradingStatus for quick filtering.
    gradingStatus: {
      type: String,
      default: "pending",
      index: true,
    },
    // When the result was last computed/updated.
    computedAt: {
      type: Date,
      default: null,
    },

    // ── Lecturer feedback on the overall result ───────────────────────────
    overallFeedback: {
      type: String,
      trim: true,
      default: null,
    },
    feedbackGivenBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    feedbackGivenAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// One result per student per quiz.
normalQuizResultSchema.index(
  { quiz: 1, student: 1 },
  { unique: true, name: "unique_result_per_student" }
);

// Grading queue: find all pending/partial results for a quiz.
normalQuizResultSchema.index({ company: 1, quiz: 1, gradingStatus: 1 });

// Release queue: find unreleased results for a quiz.
normalQuizResultSchema.index({ quiz: 1, isReleased: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const NormalQuizResult = mongoose.model("NormalQuizResult", normalQuizResultSchema);

module.exports = NormalQuizResult;

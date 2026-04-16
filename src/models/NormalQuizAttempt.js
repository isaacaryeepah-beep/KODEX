"use strict";

/**
 * NormalQuizAttempt
 *
 * One attempt record per student per quiz session. Multiple attempts are
 * allowed up to NormalQuiz.allowedAttempts (0 = unlimited).
 *
 * Design decisions:
 *  - `questionOrder` stores the shuffled question IDs assigned to this
 *    attempt. This means the same random order is shown on resume, and the
 *    lecturer/grader sees what order the student worked in.
 *  - `optionOrders` stores per-question option shuffles when
 *    NormalQuiz.randomizeOptions is true.
 *  - Light anti-cheat fields are passive logs, not enforcement mechanisms.
 *    They are surfaced in the lecturer's grading view as context only.
 *  - `gradingStatus` tracks the grading pipeline: auto-graded questions
 *    resolve immediately; manual-grading questions enter a queue.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const ATTEMPT_STATUSES = Object.freeze({
  IN_PROGRESS:    "in_progress",
  SUBMITTED:      "submitted",
  AUTO_SUBMITTED: "auto_submitted", // timer/window expired
  ABANDONED:      "abandoned",      // student left, never submitted
});

const GRADING_STATUSES = Object.freeze({
  PENDING:           "pending",           // not yet processed
  AUTO_GRADED:       "auto_graded",       // all questions auto-graded
  PARTIALLY_GRADED:  "partially_graded",  // some manual questions still pending
  FULLY_GRADED:      "fully_graded",      // all questions have a mark
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const normalQuizAttemptSchema = new mongoose.Schema(
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

    // ── Attempt metadata ──────────────────────────────────────────────────
    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
      enum: Object.values(ATTEMPT_STATUSES),
      default: ATTEMPT_STATUSES.IN_PROGRESS,
      index: true,
    },

    // Ordered list of question IDs presented to this student.
    // Set at attempt-start; never mutated after that.
    questionOrder: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "NormalQuizQuestion" }],
      default: [],
    },

    // Per-question option shuffle map: { [questionId]: [shuffledIndex, ...] }
    // Only populated when NormalQuiz.randomizeOptions = true.
    optionOrders: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ── Timing ────────────────────────────────────────────────────────────
    startedAt: {
      type: Date,
      default: Date.now,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    // Actual time the student spent (seconds). Set on submission.
    timeSpentSeconds: {
      type: Number,
      default: null,
    },
    // Server-side deadline for this attempt (startedAt + timeLimitMinutes).
    // null if the quiz has no time limit.
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    // ── Scores (populated after grading) ─────────────────────────────────
    rawScore:        { type: Number, default: null },
    maxScore:        { type: Number, default: null },
    percentageScore: { type: Number, default: null },
    isPassed:        { type: Boolean, default: null },

    // Breakdown: auto-graded portion vs manual portion
    autoScore:           { type: Number, default: null },
    manualScore:         { type: Number, default: null },
    pendingManualMarks:  { type: Number, default: 0 }, // marks not yet graded

    // ── Grading pipeline ──────────────────────────────────────────────────
    gradingStatus: {
      type: String,
      enum: Object.values(GRADING_STATUSES),
      default: GRADING_STATUSES.PENDING,
      index: true,
    },
    gradedAt:  { type: Date, default: null },
    gradedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Whether this attempt is the one that "counts" per NormalQuiz.scorePolicy.
    isBestAttempt:   { type: Boolean, default: false },
    isCountedAttempt: { type: Boolean, default: false },

    // ── Light anti-cheat (passive logging) ───────────────────────────────
    device: {
      ipAddress:  { type: String, default: null },
      userAgent:  { type: String, default: null },
      deviceId:   { type: String, default: null },
      platform:   { type: String, enum: ["mobile", "tablet", "desktop", "unknown"], default: "unknown" },
    },
    tabSwitchCount:  { type: Number, default: 0 },
    focusLostCount:  { type: Number, default: 0 },
    // Array of { event: String, occurredAt: Date } for detailed review
    suspiciousEvents: {
      type: [{
        event:       { type: String },
        occurredAt:  { type: Date, default: Date.now },
        detail:      { type: String, default: null },
      }],
      default: [],
    },

    // ── Result release ────────────────────────────────────────────────────
    // Whether the student can see their score/answers for this attempt.
    isResultReleased: { type: Boolean, default: false },
    resultReleasedAt: { type: Date, default: null },
    resultReleasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Lecturer feedback on the whole attempt (optional).
    overallFeedback: { type: String, trim: true, default: null },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// One in-progress attempt per student per quiz (prevent duplicate sessions).
normalQuizAttemptSchema.index(
  { quiz: 1, student: 1, status: 1 },
  { name: "attempt_quiz_student_status" }
);

// Unique attempt number per student per quiz.
normalQuizAttemptSchema.index(
  { quiz: 1, student: 1, attemptNumber: 1 },
  { unique: true, name: "unique_attempt_number" }
);

// Grading queue: find all partially-graded attempts for a quiz.
normalQuizAttemptSchema.index({ company: 1, quiz: 1, gradingStatus: 1 });

// Expiry sweep for abandoned in-progress attempts.
normalQuizAttemptSchema.index({ expiresAt: 1, status: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const NormalQuizAttempt = mongoose.model("NormalQuizAttempt", normalQuizAttemptSchema);

module.exports = NormalQuizAttempt;
module.exports.ATTEMPT_STATUSES = ATTEMPT_STATUSES;
module.exports.GRADING_STATUSES = GRADING_STATUSES;

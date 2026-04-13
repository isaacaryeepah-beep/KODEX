"use strict";

/**
 * SnapQuizAttempt
 *
 * One attempt record per student per SnapQuiz session.
 *
 * Key differences from NormalQuizAttempt:
 *  - `sessionToken`     — UUID issued at attempt-start. Every subsequent
 *    request from the student must present this token. A mismatch means the
 *    student opened a second tab/device (session-lock violation).
 *  - `expiresAt`        — Always set (timeLimitMinutes is required on SnapQuiz).
 *    The server checks this on every response-save and submit request; it
 *    auto-submits via a background watchdog when the deadline passes.
 *  - `lastHeartbeatAt`  — Updated by the client's heartbeat ping. If the
 *    watchdog sees > heartbeatTimeoutSeconds since the last beat, it
 *    auto-submits with status AUTO_SUBMITTED.
 *  - `violationCount`   — Incremented by every enforced anti-cheat event.
 *    When it reaches SnapQuiz.maxViolationsBeforeTermination the session is
 *    terminated (status = TERMINATED) and the attempt is force-submitted.
 *  - `isTerminated`     — True when the session was ended by the anti-cheat
 *    engine rather than by the student.
 */

const mongoose = require("mongoose");
const crypto   = require("crypto");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const ATTEMPT_STATUSES = Object.freeze({
  ACTIVE:         "active",          // session running, student working
  SUBMITTED:      "submitted",       // student clicked Submit
  AUTO_SUBMITTED: "auto_submitted",  // timer/heartbeat timeout expired
  TERMINATED:     "terminated",      // anti-cheat engine ended session
  ABANDONED:      "abandoned",       // student never returned
});

const GRADING_STATUSES = Object.freeze({
  PENDING:          "pending",
  AUTO_GRADED:      "auto_graded",
  PARTIALLY_GRADED: "partially_graded",
  FULLY_GRADED:     "fully_graded",
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const snapQuizAttemptSchema = new mongoose.Schema(
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

    // ── Attempt metadata ──────────────────────────────────────────────────
    attemptNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    status: {
      type: String,
      enum: Object.values(ATTEMPT_STATUSES),
      default: ATTEMPT_STATUSES.ACTIVE,
      index: true,
    },

    // Ordered list of question IDs for this attempt (shuffle persisted).
    questionOrder: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "SnapQuizQuestion" }],
      default: [],
    },
    optionOrders: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ── Session lock ──────────────────────────────────────────────────────
    // Unique per active session — reissued on each new attempt.
    sessionToken: {
      type: String,
      default: () => crypto.randomBytes(32).toString("hex"),
      index: true,
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
    timeSpentSeconds: {
      type: Number,
      default: null,
    },
    // Server-set hard deadline (startedAt + timeLimitMinutes).
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    // Updated by client heartbeat pings.
    lastHeartbeatAt: {
      type: Date,
      default: null,
    },

    // ── Scores ────────────────────────────────────────────────────────────
    rawScore:        { type: Number,  default: null },
    maxScore:        { type: Number,  default: null },
    percentageScore: { type: Number,  default: null },
    isPassed:        { type: Boolean, default: null },
    autoScore:       { type: Number,  default: null },
    manualScore:     { type: Number,  default: null },
    pendingManualMarks: { type: Number, default: 0 },

    // ── Grading pipeline ──────────────────────────────────────────────────
    gradingStatus: {
      type: String,
      enum: Object.values(GRADING_STATUSES),
      default: GRADING_STATUSES.PENDING,
      index: true,
    },
    gradedAt:  { type: Date,                                     default: null },
    gradedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    isBestAttempt:    { type: Boolean, default: false },
    isCountedAttempt: { type: Boolean, default: false },

    // ── Anti-cheat enforcement ────────────────────────────────────────────
    violationCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isTerminated: {
      type: Boolean,
      default: false,
    },
    terminationReason: {
      type: String,
      trim: true,
      default: null,
    },
    terminatedAt: {
      type: Date,
      default: null,
    },
    // Whether the student acknowledged the terms/rules before starting.
    termsAcknowledged: {
      type: Boolean,
      default: false,
    },
    termsAcknowledgedAt: {
      type: Date,
      default: null,
    },

    // ── Device & passive logging ──────────────────────────────────────────
    device: {
      ipAddress: { type: String, default: null },
      userAgent: { type: String, default: null },
      deviceId:  { type: String, default: null },
      platform:  { type: String, enum: ["mobile", "tablet", "desktop", "unknown"], default: "unknown" },
    },
    // Passive counts (in addition to the enforced violations above).
    tabSwitchCount: { type: Number, default: 0 },
    focusLostCount: { type: Number, default: 0 },
    fullscreenExitCount: { type: Number, default: 0 },

    // ── Result release ────────────────────────────────────────────────────
    isResultReleased:  { type: Boolean,                                    default: false },
    resultReleasedAt:  { type: Date,                                       default: null  },
    resultReleasedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    overallFeedback:   { type: String, trim: true,                         default: null  },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Only one ACTIVE attempt per student per quiz.
snapQuizAttemptSchema.index(
  { quiz: 1, student: 1, status: 1 },
  { name: "snap_attempt_quiz_student_status" }
);

// Unique attempt number per student per quiz.
snapQuizAttemptSchema.index(
  { quiz: 1, student: 1, attemptNumber: 1 },
  { unique: true, name: "snap_unique_attempt_number" }
);

// Session token lookup (for session-lock validation on every request).
snapQuizAttemptSchema.index(
  { sessionToken: 1 },
  { unique: true, sparse: true, name: "snap_session_token" }
);

// Watchdog queries: expired or heartbeat-timed-out active attempts.
snapQuizAttemptSchema.index({ expiresAt: 1, status: 1 });
snapQuizAttemptSchema.index({ lastHeartbeatAt: 1, status: 1 });

// Grading queue.
snapQuizAttemptSchema.index({ company: 1, quiz: 1, gradingStatus: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const SnapQuizAttempt = mongoose.model("SnapQuizAttempt", snapQuizAttemptSchema);

module.exports = SnapQuizAttempt;
module.exports.ATTEMPT_STATUSES  = ATTEMPT_STATUSES;
module.exports.GRADING_STATUSES  = GRADING_STATUSES;

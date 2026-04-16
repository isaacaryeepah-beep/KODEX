"use strict";

/**
 * SnapQuizProctoringEvent
 *
 * Records proctoring captures and AI analysis results for a SnapQuiz attempt.
 * Only populated when SnapQuiz.proctoringEnabled = true.
 *
 * Design decisions:
 *  - Snapshots are taken at regular intervals (snapshotIntervalSeconds) plus
 *    on-demand when a violation is detected.
 *  - `imageUrl` is an opaque cloud storage URL; the proctoring subsystem or
 *    a storage service handles the actual file.
 *  - `aiFlags` captures any issues auto-detected by an AI proctoring service
 *    (multiple faces, face not visible, suspicious gaze, etc.).
 *  - `reviewStatus` drives the manual review queue: a lecturer or proctor
 *    reviews flagged events and marks them cleared or confirmed.
 *  - This model is append-only (no updates after creation except reviewStatus).
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const EVENT_TYPES = Object.freeze({
  SCHEDULED_SNAPSHOT: "scheduled_snapshot",  // periodic capture
  VIOLATION_SNAPSHOT: "violation_snapshot",  // triggered by a violation
  SESSION_START:      "session_start",        // first capture at attempt start
  SESSION_END:        "session_end",          // final capture on submit/terminate
  MANUAL_CAPTURE:     "manual_capture",       // lecturer/proctor triggered
});

const REVIEW_STATUSES = Object.freeze({
  PENDING:   "pending",    // not yet reviewed
  CLEARED:   "cleared",    // reviewed; no concern
  FLAGGED:   "flagged",    // reviewer marked as suspicious
  ESCALATED: "escalated",  // referred for further action
});

// Flags that an AI proctoring service might raise.
const AI_FLAG_TYPES = Object.freeze({
  FACE_NOT_VISIBLE: "face_not_visible",
  MULTIPLE_FACES:   "multiple_faces",
  GAZE_AWAY:        "gaze_away",
  PHONE_DETECTED:   "phone_detected",
  BOOK_DETECTED:    "book_detected",
  LOW_CONFIDENCE:   "low_confidence",
});

// ---------------------------------------------------------------------------
// Sub-schema: individual AI flag
// ---------------------------------------------------------------------------

const aiFlagSchema = new mongoose.Schema(
  {
    flagType:   { type: String, enum: Object.values(AI_FLAG_TYPES) },
    confidence: { type: Number, default: null }, // 0–1 probability
    detail:     { type: String, default: null },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const snapQuizProctoringEventSchema = new mongoose.Schema(
  {
    // ── References ────────────────────────────────────────────────────────
    attempt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SnapQuizAttempt",
      required: [true, "Attempt reference is required"],
      index: true,
    },
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
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },

    // ── Event detail ──────────────────────────────────────────────────────
    eventType: {
      type: String,
      enum: Object.values(EVENT_TYPES),
      required: [true, "Event type is required"],
    },
    capturedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // ── Media ─────────────────────────────────────────────────────────────
    // URL of the captured image/screenshot in cloud storage.
    imageUrl: {
      type: String,
      default: null,
    },
    // Thumbnail URL (lower resolution for list views).
    thumbnailUrl: {
      type: String,
      default: null,
    },

    // ── AI analysis ───────────────────────────────────────────────────────
    aiAnalysisCompleted: {
      type: Boolean,
      default: false,
    },
    aiAnalysisCompletedAt: {
      type: Date,
      default: null,
    },
    aiFlags: {
      type: [aiFlagSchema],
      default: [],
    },
    // Overall AI risk score for this event (0 = clean, 1 = high risk).
    aiRiskScore: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
    },

    // ── Manual review ─────────────────────────────────────────────────────
    reviewStatus: {
      type: String,
      enum: Object.values(REVIEW_STATUSES),
      default: REVIEW_STATUSES.PENDING,
      index: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
    reviewNote: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Association with a violation ──────────────────────────────────────
    // Set when this snapshot was triggered by a specific violation event.
    relatedViolationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SnapQuizViolationLog",
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// All events for an attempt (proctoring review panel).
snapQuizProctoringEventSchema.index({ attempt: 1, capturedAt: 1 });

// Review queue: pending events for a quiz.
snapQuizProctoringEventSchema.index({ quiz: 1, reviewStatus: 1 });

// AI flagged events for priority review.
snapQuizProctoringEventSchema.index({ quiz: 1, aiRiskScore: -1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const SnapQuizProctoringEvent = mongoose.model("SnapQuizProctoringEvent", snapQuizProctoringEventSchema);

module.exports = SnapQuizProctoringEvent;
module.exports.EVENT_TYPES     = EVENT_TYPES;
module.exports.REVIEW_STATUSES = REVIEW_STATUSES;
module.exports.AI_FLAG_TYPES   = AI_FLAG_TYPES;

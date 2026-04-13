"use strict";

/**
 * SnapQuizViolationLog
 *
 * Enforcement-grade violation log for SnapQuiz anti-cheat.
 *
 * Unlike NormalQuizAttempt.suspiciousEvents (a passive embedded array),
 * this is a first-class collection so:
 *   - Violations can be queried and audited independently of the attempt.
 *   - The lecturer's review panel can filter/sort by type, severity, time.
 *   - The anti-cheat engine can count violations in real time with an
 *     indexed query instead of loading the full attempt document.
 *
 * Violation lifecycle:
 *   1. Client reports an event (tab_switch, fullscreen_exit, etc.).
 *   2. Server logs a ViolationLog document and increments
 *      SnapQuizAttempt.violationCount.
 *   3. Server checks the count against SnapQuiz.maxViolationsBeforeTermination.
 *   4. If threshold reached → session is terminated and auto-submitted.
 *
 * actionTaken reflects what the server did in response to this specific event.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const VIOLATION_TYPES = Object.freeze({
  TAB_SWITCH:        "tab_switch",
  FOCUS_LOST:        "focus_lost",
  FULLSCREEN_EXIT:   "fullscreen_exit",
  COPY_PASTE:        "copy_paste",
  RIGHT_CLICK:       "right_click",
  PRINT_SCREEN:      "print_screen",
  MULTIPLE_WINDOWS:  "multiple_windows",
  DEVTOOLS_OPEN:     "devtools_open",
  SESSION_CONFLICT:  "session_conflict",  // second tab/device detected
  HEARTBEAT_MISSED:  "heartbeat_missed",
  FACE_NOT_VISIBLE:  "face_not_visible",  // proctoring
  MULTIPLE_FACES:    "multiple_faces",    // proctoring
  AUDIO_DETECTED:    "audio_detected",    // proctoring
  MOTION_DETECTED:   "motion_detected",   // proctoring
  OTHER:             "other",
});

const VIOLATION_SEVERITIES = Object.freeze({
  INFO:     "info",     // logged but no action taken
  WARNING:  "warning",  // student warned
  CRITICAL: "critical", // counts toward termination threshold
});

const ACTIONS_TAKEN = Object.freeze({
  LOGGED:     "logged",     // passively recorded only
  WARNED:     "warned",     // warning shown to student
  COUNTED:    "counted",    // incremented violation counter
  TERMINATED: "terminated", // this event caused session termination
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const snapQuizViolationLogSchema = new mongoose.Schema(
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
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },

    // ── Violation detail ──────────────────────────────────────────────────
    violationType: {
      type: String,
      enum: Object.values(VIOLATION_TYPES),
      required: [true, "Violation type is required"],
    },
    severity: {
      type: String,
      enum: Object.values(VIOLATION_SEVERITIES),
      default: VIOLATION_SEVERITIES.WARNING,
    },
    // Sequence number within this attempt (1-based, derived from violationCount
    // at the time of the event).
    violationNumber: {
      type: Number,
      default: null,
    },
    // Freeform detail from the client (e.g. "document.hidden = true").
    detail: {
      type: String,
      trim: true,
      default: null,
    },
    occurredAt: {
      type: Date,
      default: Date.now,
      index: true,
    },

    // ── Server response ───────────────────────────────────────────────────
    actionTaken: {
      type: String,
      enum: Object.values(ACTIONS_TAKEN),
      default: ACTIONS_TAKEN.COUNTED,
    },
    // Violation count on the attempt at the moment this log was created.
    violationCountAtEvent: {
      type: Number,
      default: null,
    },
    // Whether this specific event triggered session termination.
    causedTermination: {
      type: Boolean,
      default: false,
    },

    // ── Proctoring snapshot (optional) ────────────────────────────────────
    // URL of the image captured at the moment of the violation (proctoring).
    snapshotUrl: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false, // append-only log
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// All violations for an attempt (reviewer panel).
snapQuizViolationLogSchema.index({ attempt: 1, occurredAt: 1 });

// Aggregate violation counts per type per quiz (analytics).
snapQuizViolationLogSchema.index({ quiz: 1, violationType: 1 });

// Company-scoped audit.
snapQuizViolationLogSchema.index({ company: 1, quiz: 1, createdAt: 1 });

// Find termination-causing events quickly.
snapQuizViolationLogSchema.index({ attempt: 1, causedTermination: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const SnapQuizViolationLog = mongoose.model("SnapQuizViolationLog", snapQuizViolationLogSchema);

module.exports = SnapQuizViolationLog;
module.exports.VIOLATION_TYPES      = VIOLATION_TYPES;
module.exports.VIOLATION_SEVERITIES = VIOLATION_SEVERITIES;
module.exports.ACTIONS_TAKEN        = ACTIONS_TAKEN;

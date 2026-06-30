"use strict";

/**
 * SnapQuiz
 *
 * The "strict" quiz type in DIKLY Academic — used for formal examinations,
 * class tests, and high-stakes assessments where academic integrity matters.
 *
 * Key differences from NormalQuiz:
 *  - Server-authoritative timer: expiresAt is set at attempt-start and
 *    strictly enforced; the server auto-submits when it expires.
 *  - Session locking: a session token is issued per active attempt.
 *    Opening a second tab/device is detected and can terminate the session.
 *  - Anti-cheat enforcement: violations (tab switch, focus loss, fullscreen
 *    exit) are enforced — they increment a counter and can terminate the
 *    session once maxViolationsBeforeTermination is reached.
 *  - Single attempt by default: allowedAttempts defaults to 1; multi-attempt
 *    SnapQuizzes are possible but unusual.
 *  - Optional proctoring: enables SnapQuizProctoringEvent captures (snapshots,
 *    motion detection). Proctoring is infrastructure-level; this model only
 *    records the flag and settings.
 *
 * Scope rules (enforced at middleware layer):
 *  - Lecturer (or admin) creates/edits. Must be assigned to the course.
 *  - Students enrolled in `course` may access when published + window open.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const SNAP_QUIZ_TYPES = Object.freeze({
  EXAM:       "exam",        // formal examination
  MID_TERM:   "mid_term",    // mid-semester assessment
  QUIZ:       "quiz",        // regular quiz
  CLASS_TEST: "class_test",  // short in-class test
  FINAL:      "final",       // final examination
  MOCK:       "mock",        // practice under exam conditions
});

// Security level presets — applied by the controller when securityLevel is set
const SECURITY_PRESETS = Object.freeze({
  low: {
    maxViolationsBeforeTermination: 0,
    terminateOnTabSwitch:      false,
    terminateOnFocusLost:      false,
    terminateOnFullscreenExit: false,
    requireFullscreen:         false,
    preventCopyPaste:          false,
    preventRightClick:         false,
    preventPrintScreen:        false,
    proctoringEnabled:         false,
    aiProctoringEnabled:       false,
    snapshotIntervalSeconds:   0,
    monitoringMode:            "none",
    enforceSessionLock:        true,
    heartbeatIntervalSeconds:  30,
    heartbeatTimeoutSeconds:   120,
  },
  medium: {
    maxViolationsBeforeTermination: 5,
    terminateOnTabSwitch:      true,
    terminateOnFocusLost:      true,
    terminateOnFullscreenExit: true,
    requireFullscreen:         true,
    preventCopyPaste:          true,
    preventRightClick:         true,
    preventPrintScreen:        true,
    proctoringEnabled:         false,
    aiProctoringEnabled:       false,
    snapshotIntervalSeconds:   0,
    monitoringMode:            "none",
    enforceSessionLock:        true,
    heartbeatIntervalSeconds:  30,
    heartbeatTimeoutSeconds:   90,
  },
  high: {
    maxViolationsBeforeTermination: 3,
    terminateOnTabSwitch:      true,
    terminateOnFocusLost:      true,
    terminateOnFullscreenExit: true,
    requireFullscreen:         true,
    preventCopyPaste:          true,
    preventRightClick:         true,
    preventPrintScreen:        true,
    proctoringEnabled:         true,
    aiProctoringEnabled:       true,
    snapshotIntervalSeconds:   12,
    monitoringMode:            "ai",
    enforceSessionLock:        true,
    heartbeatIntervalSeconds:  20,
    heartbeatTimeoutSeconds:   60,
  },
});

const SNAP_QUIZ_STATUSES = Object.freeze({
  DRAFT:     "draft",
  PUBLISHED: "published",
  OPEN:      "open",       // actively accepting attempts right now
  CLOSED:    "closed",     // window ended
  ARCHIVED:  "archived",
});

const SCORE_POLICIES = Object.freeze({
  BEST:    "best",
  LAST:    "last",
  AVERAGE: "average",
  FIRST:   "first",
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const snapQuizSchema = new mongoose.Schema(
  {
    // ── Tenant & ownership ────────────────────────────────────────────────
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course is required"],
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by (lecturer) is required"],
      index: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Identity ──────────────────────────────────────────────────────────
    title: {
      type: String,
      required: [true, "Quiz title is required"],
      trim: true,
      maxlength: [200, "Title may not exceed 200 characters"],
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    instructions: {
      type: String,
      trim: true,
      default: "",
    },
    quizType: {
      type: String,
      enum: Object.values(SNAP_QUIZ_TYPES),
      default: SNAP_QUIZ_TYPES.EXAM,
    },
    // snap     → lightweight: fullscreen + tab/focus/blur detection, basic camera check
    // proctored → advanced AI: snapshots every 10-15s, face/object/audio detection, AI report
    quizLevel: {
      type: String,
      enum: ["snap", "proctored"],
      default: "snap",
      index: true,
    },
    // Convenience preset applied at creation time. "custom" means the lecturer
    // configured individual toggles instead of picking a preset.
    securityLevel: {
      type: String,
      enum: ["low", "medium", "high", "custom"],
      default: "medium",
    },
    // Fine-grained per-feature overrides (used when securityLevel = "custom")
    mobileMonitoring:    { type: Boolean, default: true  }, // Capacitor pause/resume detection
    screenshotDetection: { type: Boolean, default: false }, // best-effort on mobile
    liveAlerts:          { type: Boolean, default: true  }, // real-time alerts to lecturer

    // ── Scoring ───────────────────────────────────────────────────────────
    totalMarks: {
      type: Number,
      default: 0,
      min: 0,
    },
    passMark: {
      type: Number,
      default: null,
    },
    scorePolicy: {
      type: String,
      enum: Object.values(SCORE_POLICIES),
      default: SCORE_POLICIES.FIRST,  // SnapQuiz default: first attempt counts
    },

    // ── Timing (required for SnapQuiz — always timed) ─────────────────────
    timeLimitMinutes: {
      type: Number,
      required: [true, "SnapQuiz requires a time limit"],
      min: [1, "Time limit must be at least 1 minute"],
    },
    // Availability window: students can only start within this window.
    startTime: {
      type: Date,
      required: [true, "SnapQuiz requires a start time"],
    },
    endTime: {
      type: Date,
      required: [true, "SnapQuiz requires an end time"],
    },
    // Extra buffer after endTime before hard auto-submit (default 60 s).
    gracePeriodSeconds: {
      type: Number,
      default: 60,
    },
    // If true, student cannot start a new attempt after endTime even if they
    // have not used all allowedAttempts.
    lockAfterEndTime: {
      type: Boolean,
      default: true,
    },

    // ── Attempt settings ──────────────────────────────────────────────────
    allowedAttempts: {
      type: Number,
      default: 1,
      min: 1,         // SnapQuiz: at least 1; 0 (unlimited) not permitted
    },

    // ── Session locking ───────────────────────────────────────────────────
    // Reject requests from a different sessionToken (multi-tab detection).
    enforceSessionLock: {
      type: Boolean,
      default: true,
    },
    // Client must send a heartbeat every N seconds to keep the session alive.
    // 0 = heartbeat monitoring disabled.
    heartbeatIntervalSeconds: {
      type: Number,
      default: 30,
      min: 0,
    },
    // How long (seconds) without a heartbeat before the server auto-submits.
    heartbeatTimeoutSeconds: {
      type: Number,
      default: 90,
      min: 0,
    },

    // ── Anti-cheat enforcement ────────────────────────────────────────────
    // Number of violations before the session is forcibly terminated.
    // 0 = never terminate automatically.
    maxViolationsBeforeTermination: {
      type: Number,
      default: 3,
      min: 0,
    },
    terminateOnTabSwitch:      { type: Boolean, default: true  },
    terminateOnFocusLost:      { type: Boolean, default: true  },
    terminateOnFullscreenExit: { type: Boolean, default: true  },
    requireFullscreen:         { type: Boolean, default: true  },
    preventCopyPaste:          { type: Boolean, default: true  },
    preventRightClick:         { type: Boolean, default: true  },
    preventPrintScreen:        { type: Boolean, default: false },
    // Warn the student before the violation count triggers termination.
    showViolationWarnings:     { type: Boolean, default: true  },

    // ── Proctoring ────────────────────────────────────────────────────────
    proctoringEnabled:  { type: Boolean, default: false },
    // How often to capture a snapshot (seconds). 0 = disabled.
    snapshotIntervalSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Whether AI face-detection is applied to snapshots.
    aiProctoringEnabled: { type: Boolean, default: false },

    // ── Result visibility ─────────────────────────────────────────────────
    // SnapQuiz defaults: don't reveal score or answers immediately.
    showResultAfterSubmission:  { type: Boolean, default: false },
    showAnswersAfterSubmission: { type: Boolean, default: false },
    showAnswersAfterClose:      { type: Boolean, default: false },
    autoReleaseResults:         { type: Boolean, default: false },

    // ── Presentation ──────────────────────────────────────────────────────
    randomizeQuestions: { type: Boolean, default: true  }, // shuffle for SnapQuiz
    randomizeOptions:   { type: Boolean, default: true  },

    // ── Lifecycle / status ────────────────────────────────────────────────
    status: {
      type: String,
      enum: Object.values(SNAP_QUIZ_STATUSES),
      default: SNAP_QUIZ_STATUSES.DRAFT,
      index: true,
    },
    isPublished:  { type: Boolean, default: false },
    isActive:     { type: Boolean, default: true  },
    publishedAt:  { type: Date, default: null },
    openedAt:     { type: Date, default: null },
    closedAt:     { type: Date, default: null },
    archivedAt:   { type: Date, default: null },
    archivedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // ── Monitoring mode ───────────────────────────────────────────────────
    // none → standard anti-cheat flags only (snap quizzes)
    // ai   → AI snapshot analysis + face/object/gaze detection (proctored quizzes)
    monitoringMode: {
      type: String,
      enum: ["none", "ai"],
      default: "none",
    },
    humanMonitors: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    maxConcurrentMonitors: { type: Number, default: 5, min: 1 },
    // Noise threshold (0–255 Web Audio API scale). Violations above this are logged.
    noiseDetectionThreshold: { type: Number, default: 40, min: 0, max: 255 },

    // ── Meeting tie-in (Phase 3: DIKLY spec) ─────────────────────────────
    // When set, students can only start/continue this quiz while the linked
    // meeting is in 'live' status. Acts as an in-class proctoring gate.
    linkedMeeting: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Meeting",
      default: null,
      index: true,
    },
    requireLiveMeeting: {
      type: Boolean,
      default: false,
    },

    // ── Join code ─────────────────────────────────────────────────────────
    // 6-digit numeric string generated at creation time. Lets students enter
    // the code to jump straight to this quiz without browsing their course list.
    joinCode: {
      type: String,
      sparse: true,
      index: true,
    },

    // ── Attachments ───────────────────────────────────────────────────────
    attachments: {
      type: [{
        fileName:     { type: String },
        originalName: { type: String },
        fileUrl:      { type: String },
        mimeType:     { type: String },
        fileSize:     { type: Number },
        uploadedAt:   { type: Date, default: Date.now },
      }],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

snapQuizSchema.index({ company: 1, joinCode: 1 }, { sparse: true });
snapQuizSchema.index({ company: 1, course: 1, createdBy: 1, status: 1 });
snapQuizSchema.index({ company: 1, course: 1, isPublished: 1, isActive: 1 });
snapQuizSchema.index({ company: 1, startTime: 1, endTime: 1, status: 1 });
snapQuizSchema.index({ company: 1, createdBy: 1, createdAt: -1 });

// ---------------------------------------------------------------------------
// Virtuals
// ---------------------------------------------------------------------------

snapQuizSchema.virtual("isOpen").get(function () {
  if (!this.isPublished || !this.isActive) return false;
  const now = new Date();
  if (now < this.startTime) return false;
  if (!this.endTime) return true;
  const closeTime = new Date(this.endTime.getTime() + (this.gracePeriodSeconds || 0) * 1000);
  return now <= closeTime;
});

snapQuizSchema.set("toJSON",   { virtuals: true });
snapQuizSchema.set("toObject", { virtuals: true });

// ---------------------------------------------------------------------------
// Join-code generation — must be defined BEFORE mongoose.model() so the
// static is present on the constructor and the pre-save hook can call it.
// ---------------------------------------------------------------------------

snapQuizSchema.statics.generateJoinCode = async function () {
  let code, exists;
  do {
    code = String(Math.floor(100000 + Math.random() * 900000));
    exists = await this.exists({ joinCode: code });
  } while (exists);
  return code;
};

snapQuizSchema.pre("save", async function () {
  if (!this.joinCode) {
    this.joinCode = await this.constructor.generateJoinCode();
  }
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const SnapQuiz = mongoose.model("SnapQuiz", snapQuizSchema);

module.exports = SnapQuiz;
module.exports.SNAP_QUIZ_TYPES    = SNAP_QUIZ_TYPES;
module.exports.SNAP_QUIZ_STATUSES = SNAP_QUIZ_STATUSES;
module.exports.SCORE_POLICIES     = SCORE_POLICIES;
module.exports.SECURITY_PRESETS   = SECURITY_PRESETS;

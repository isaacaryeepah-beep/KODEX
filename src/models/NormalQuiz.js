"use strict";

/**
 * NormalQuiz
 *
 * The "lighter" quiz type in KODEX Academic — used for practice tests,
 * weekly assessments, revision, and take-home quizzes.
 *
 * Intentionally more flexible than SnapQuiz:
 *  - Optional timer (null = untimed)
 *  - Multiple attempts allowed
 *  - Results can be shown immediately after submission
 *  - No strict server-authoritative timer or session locking
 *  - Light anti-cheat logging only (tab-switch count, IP, device)
 *
 * Scope rules enforced at middleware layer:
 *  - Only the assigned lecturer (or admin) can create/edit this quiz.
 *  - Only students enrolled in `course` can access it when published.
 *  - `isPublished` must be true for students to see the quiz.
 *
 * Tenant field: `company` (standard convention).
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const QUIZ_TYPES = Object.freeze({
  PRACTICE:    "practice",    // ungraded, student self-study
  GRADED:      "graded",      // contributes to course grade
  REVISION:    "revision",    // pre-exam revision tool
  WEEKLY:      "weekly",      // regular weekly assessment
  TAKE_HOME:   "take_home",   // extended window, no time pressure
  CLASS:       "class",       // in-class quiz with optional timer
});

const SCORE_POLICIES = Object.freeze({
  BEST:    "best",    // highest score across attempts
  LAST:    "last",    // most recent attempt
  AVERAGE: "average", // mean of all attempts
  FIRST:   "first",   // only the first attempt counts
});

const QUIZ_STATUSES = Object.freeze({
  DRAFT:     "draft",     // not yet published
  PUBLISHED: "published", // visible to enrolled students
  CLOSED:    "closed",    // window ended, no new attempts
  ARCHIVED:  "archived",  // removed from active view
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const normalQuizSchema = new mongoose.Schema(
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
      enum: Object.values(QUIZ_TYPES),
      default: QUIZ_TYPES.GRADED,
    },

    // ── Scoring ───────────────────────────────────────────────────────────
    totalMarks: {
      type: Number,
      default: 0,
      min: 0,
    },
    passMark: {
      type: Number,
      default: null, // null = no pass/fail threshold
    },
    scorePolicy: {
      type: String,
      enum: Object.values(SCORE_POLICIES),
      default: SCORE_POLICIES.BEST,
    },

    // ── Timing ────────────────────────────────────────────────────────────
    // null = no time limit
    timeLimitMinutes: {
      type: Number,
      default: null,
      min: 1,
    },
    // Optional availability window
    startTime: {
      type: Date,
      default: null,
    },
    endTime: {
      type: Date,
      default: null,
    },
    // Extra seconds allowed after endTime before auto-submit kicks in
    gracePeriodSeconds: {
      type: Number,
      default: 30,
    },

    // ── Attempt settings ──────────────────────────────────────────────────
    // 0 = unlimited
    allowedAttempts: {
      type: Number,
      default: 1,
      min: 0,
    },

    // ── Result visibility ─────────────────────────────────────────────────
    showResultAfterSubmission: {
      type: Boolean,
      default: true,
    },
    showAnswersAfterSubmission: {
      type: Boolean,
      default: false, // lecturer may want to hold answers until after window
    },
    showAnswersAfterClose: {
      type: Boolean,
      default: true, // reveal answers once endTime passes
    },
    // When false, lecturer must manually release results.
    autoReleaseResults: {
      type: Boolean,
      default: true,
    },

    // ── Presentation ──────────────────────────────────────────────────────
    randomizeQuestions: {
      type: Boolean,
      default: false,
    },
    randomizeOptions: {
      type: Boolean,
      default: false,
    },

    // ── Light anti-cheat (passive only — no lock-down) ────────────────────
    logTabSwitches:   { type: Boolean, default: true },
    logFocusLost:     { type: Boolean, default: true },
    logIpAddress:     { type: Boolean, default: true },
    preventCopyPaste: { type: Boolean, default: false }, // hint only, not enforced server-side

    // ── Lifecycle / status ────────────────────────────────────────────────
    status: {
      type: String,
      enum: Object.values(QUIZ_STATUSES),
      default: QUIZ_STATUSES.DRAFT,
      index: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    publishedAt: { type: Date, default: null },
    closedAt:    { type: Date, default: null },
    archivedAt:  { type: Date, default: null },
    archivedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // ── Attachments (lecturer reference materials) ────────────────────────
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

// Lecturer's quiz list for a course.
normalQuizSchema.index({ company: 1, course: 1, createdBy: 1, status: 1 });
// Student quiz discovery: published + active quizzes for a course.
normalQuizSchema.index({ company: 1, course: 1, isPublished: 1, isActive: 1 });
// Quiz window queries: find quizzes open right now.
normalQuizSchema.index({ company: 1, startTime: 1, endTime: 1 });

// ---------------------------------------------------------------------------
// Virtuals
// ---------------------------------------------------------------------------

normalQuizSchema.virtual("isOpen").get(function () {
  if (!this.isPublished || !this.isActive) return false;
  const now = new Date();
  if (this.startTime && now < this.startTime) return false;
  if (this.endTime) {
    const closeTime = new Date(this.endTime.getTime() + (this.gracePeriodSeconds || 0) * 1000);
    if (now > closeTime) return false;
  }
  return true;
});

normalQuizSchema.set("toJSON", { virtuals: true });
normalQuizSchema.set("toObject", { virtuals: true });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const NormalQuiz = mongoose.model("NormalQuiz", normalQuizSchema);

module.exports = NormalQuiz;
module.exports.QUIZ_TYPES     = QUIZ_TYPES;
module.exports.SCORE_POLICIES = SCORE_POLICIES;
module.exports.QUIZ_STATUSES  = QUIZ_STATUSES;

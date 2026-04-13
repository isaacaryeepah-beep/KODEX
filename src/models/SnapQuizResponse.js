"use strict";

/**
 * SnapQuizResponse
 *
 * One document per question per SnapQuizAttempt.
 * Structurally mirrors NormalQuizResponse — same answer field set, same
 * grading pipeline fields. Kept as a separate model for clean isolation.
 *
 * Saves are idempotent upserts: { attempt, question } is unique so the
 * client can auto-save on every keystroke without creating duplicates.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const RESPONSE_GRADING_STATUSES = Object.freeze({
  UNGRADED:        "ungraded",
  AUTO_GRADED:     "auto_graded",
  PENDING_MANUAL:  "pending_manual",
  MANUALLY_GRADED: "manually_graded",
  SKIPPED:         "skipped",
});

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const fileAttachmentSchema = new mongoose.Schema(
  {
    fileName:      { type: String, trim: true },
    originalName:  { type: String, trim: true },
    fileUrl:       { type: String, trim: true },
    mimeType:      { type: String, trim: true },
    fileSizeBytes: { type: Number, default: null },
    uploadedAt:    { type: Date,   default: Date.now },
  },
  { _id: false }
);

const graderAnnotationSchema = new mongoose.Schema(
  {
    gradedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    gradedAt:    { type: Date,   default: Date.now },
    comment:     { type: String, trim: true, default: null },
    earnedMarks: { type: Number, default: null },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const snapQuizResponseSchema = new mongoose.Schema(
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
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SnapQuizQuestion",
      required: [true, "Question reference is required"],
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

    // ── Snapshot fields ───────────────────────────────────────────────────
    questionType: { type: String, required: true },
    maxMarks:     { type: Number, default: 1, min: 0 },

    // ── Student answers ───────────────────────────────────────────────────
    selectedOptionIndex:   { type: Number,   default: null },
    selectedOptionIndices: { type: [Number], default: []   },
    selectedBoolean:       { type: Boolean,  default: null },
    textAnswer:            { type: String,   trim: true, default: null },
    numericAnswer:         { type: Number,   default: null },
    equationAnswer:        { type: String,   trim: true, default: null },

    // ── Maths workings ────────────────────────────────────────────────────
    mathsWorkingsText:  { type: String,              trim: true, default: null },
    mathsWorkingsFiles: { type: [fileAttachmentSchema], default: []   },
    drawingData:        { type: String,              default: null },

    // ── File uploads ──────────────────────────────────────────────────────
    uploadedFiles: { type: [fileAttachmentSchema], default: [] },

    // ── Timing ────────────────────────────────────────────────────────────
    firstAnsweredAt:  { type: Date,   default: null },
    lastUpdatedAt:    { type: Date,   default: null },
    timeSpentSeconds: { type: Number, default: null },

    // ── Grading ───────────────────────────────────────────────────────────
    isCorrect:        { type: Boolean, default: null },
    earnedMarks:      { type: Number,  default: null },
    isAutoGraded:     { type: Boolean, default: false },
    isManuallyGraded: { type: Boolean, default: false },
    gradingStatus: {
      type: String,
      enum: Object.values(RESPONSE_GRADING_STATUSES),
      default: RESPONSE_GRADING_STATUSES.UNGRADED,
      index: true,
    },
    graderAnnotation: { type: graderAnnotationSchema, default: null },
    feedback:         { type: String, trim: true, default: null },

    // ── Flags ─────────────────────────────────────────────────────────────
    isSkipped:  { type: Boolean, default: false },
    isFlagged:  { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

snapQuizResponseSchema.index({ attempt: 1, question: 1 }, { unique: true });
snapQuizResponseSchema.index({ quiz: 1, gradingStatus: 1 });
snapQuizResponseSchema.index({ quiz: 1, student: 1 });
snapQuizResponseSchema.index({ company: 1, quiz: 1, gradingStatus: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const SnapQuizResponse = mongoose.model("SnapQuizResponse", snapQuizResponseSchema);

module.exports = SnapQuizResponse;
module.exports.RESPONSE_GRADING_STATUSES = RESPONSE_GRADING_STATUSES;

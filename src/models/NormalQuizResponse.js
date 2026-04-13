"use strict";

/**
 * NormalQuizResponse
 *
 * One document per question per attempt. Captures the student's answer in a
 * type-safe way for all supported question types, plus maths workings and
 * file-upload metadata when applicable.
 *
 * Design decisions:
 *  - One response per (attempt, question) — partial saves during the quiz
 *    use findOneAndUpdate with upsert so saves are idempotent.
 *  - `isAutoGraded` / `isManuallyGraded` flags allow the grading pipeline to
 *    query exactly what still needs attention.
 *  - File uploads: only metadata is stored here; actual file lives in S3/GCS.
 *    The URL is treated as an opaque string — the controller handles upload.
 *  - `mathsWorkings` captures the student's method (text or image URL) when
 *    the question has requireWorkings = true.
 *  - `drawingData` captures a base-64 or URL for drawing-type answers.
 *  - `earnedMarks` is null until the question has been graded.
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
  SKIPPED:         "skipped",  // question was not answered — 0 marks awarded
});

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

// Uploaded file metadata (essay, file_upload, maths workings attachments)
const fileAttachmentSchema = new mongoose.Schema(
  {
    fileName:     { type: String, trim: true },
    originalName: { type: String, trim: true },
    fileUrl:      { type: String, trim: true },
    mimeType:     { type: String, trim: true },
    fileSizeBytes:{ type: Number, default: null },
    uploadedAt:   { type: Date, default: Date.now },
  },
  { _id: false }
);

// Grader annotation left on this specific response during manual grading.
const graderAnnotationSchema = new mongoose.Schema(
  {
    gradedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    gradedAt:   { type: Date, default: Date.now },
    comment:    { type: String, trim: true, default: null },
    earnedMarks:{ type: Number, default: null },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const normalQuizResponseSchema = new mongoose.Schema(
  {
    // ── References ────────────────────────────────────────────────────────
    attempt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NormalQuizAttempt",
      required: [true, "Attempt reference is required"],
      index: true,
    },
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NormalQuiz",
      required: [true, "NormalQuiz reference is required"],
      index: true,
    },
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NormalQuizQuestion",
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

    // ── Question snapshot (denormalized for grading history) ──────────────
    // Stores questionType so graders and analytics don't need to join.
    questionType: {
      type: String,
      required: true,
    },
    // Maximum marks available for this question (snapshot from question doc).
    maxMarks: {
      type: Number,
      default: 1,
      min: 0,
    },

    // ── Student answers (only the field matching questionType is used) ────

    // MCQ: index of the selected option (after any shuffle is reversed).
    selectedOptionIndex: {
      type: Number,
      default: null,
    },
    // MCQ_MULTI: indices of selected options.
    selectedOptionIndices: {
      type: [Number],
      default: [],
    },
    // TRUE_FALSE: student's boolean selection.
    selectedBoolean: {
      type: Boolean,
      default: null,
    },
    // SHORT_ANSWER / FILL_BLANK / ESSAY: free-text answer.
    textAnswer: {
      type: String,
      trim: true,
      default: null,
    },
    // NUMERIC: student's numeric value.
    numericAnswer: {
      type: Number,
      default: null,
    },
    // EQUATION / DRAWING: structured or freeform answer text/LaTeX.
    equationAnswer: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Maths workings ────────────────────────────────────────────────────
    // Text description of method / working (when requireWorkings = true).
    mathsWorkingsText: {
      type: String,
      trim: true,
      default: null,
    },
    // Image(s) of working (hand-written scans, whiteboard photos, etc.)
    mathsWorkingsFiles: {
      type: [fileAttachmentSchema],
      default: [],
    },
    // Base-64 or URL from the on-screen drawing canvas.
    drawingData: {
      type: String, // base-64 data-URI or cloud URL after upload
      default: null,
    },

    // ── File uploads (file_upload type, or essay attachments) ─────────────
    uploadedFiles: {
      type: [fileAttachmentSchema],
      default: [],
    },

    // ── Timing ────────────────────────────────────────────────────────────
    // First time the student opened/interacted with this question.
    firstAnsweredAt: {
      type: Date,
      default: null,
    },
    // Last time the student changed their answer.
    lastUpdatedAt: {
      type: Date,
      default: null,
    },
    // Time student spent on this question (seconds), estimated client-side.
    timeSpentSeconds: {
      type: Number,
      default: null,
    },

    // ── Grading ───────────────────────────────────────────────────────────
    isCorrect: {
      type: Boolean,
      default: null, // null until graded
    },
    earnedMarks: {
      type: Number,
      default: null, // null until graded
    },
    isAutoGraded: {
      type: Boolean,
      default: false,
    },
    isManuallyGraded: {
      type: Boolean,
      default: false,
    },
    gradingStatus: {
      type: String,
      enum: Object.values(RESPONSE_GRADING_STATUSES),
      default: RESPONSE_GRADING_STATUSES.UNGRADED,
      index: true,
    },
    // Populated by auto-grader or manual grader.
    graderAnnotation: {
      type: graderAnnotationSchema,
      default: null,
    },
    // Public feedback shown to student after result release.
    feedback: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Flags ─────────────────────────────────────────────────────────────
    // True if the student explicitly skipped / left blank.
    isSkipped: {
      type: Boolean,
      default: false,
    },
    // True if the student flagged for review during the attempt.
    isFlagged: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Primary lookup: all responses for an attempt (grading view).
normalQuizResponseSchema.index({ attempt: 1, question: 1 }, { unique: true });

// Grading queue: pending-manual responses for a quiz.
normalQuizResponseSchema.index({ quiz: 1, gradingStatus: 1 });

// Student's response history for a quiz (result view).
normalQuizResponseSchema.index({ quiz: 1, student: 1 });

// Company-scoped for admin analytics.
normalQuizResponseSchema.index({ company: 1, quiz: 1, gradingStatus: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const NormalQuizResponse = mongoose.model("NormalQuizResponse", normalQuizResponseSchema);

module.exports = NormalQuizResponse;
module.exports.RESPONSE_GRADING_STATUSES = RESPONSE_GRADING_STATUSES;

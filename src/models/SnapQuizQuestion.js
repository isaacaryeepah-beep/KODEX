"use strict";

/**
 * SnapQuizQuestion
 *
 * A question belonging to a SnapQuiz. Structurally identical to
 * NormalQuizQuestion — all question types and maths/drawing fields are
 * supported. Kept as a separate model so SnapQuiz and NormalQuiz question
 * banks are completely isolated.
 *
 * Supports: mcq, mcq_multi, true_false, short_answer, fill_blank,
 *           essay, numeric, equation, drawing, file_upload
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums (mirrors NormalQuizQuestion — kept explicit for isolation)
// ---------------------------------------------------------------------------

const QUESTION_TYPES = Object.freeze({
  MCQ:          "mcq",
  MCQ_MULTI:    "mcq_multi",
  TRUE_FALSE:   "true_false",
  SHORT_ANSWER: "short_answer",
  FILL_BLANK:   "fill_blank",
  ESSAY:        "essay",
  NUMERIC:      "numeric",
  EQUATION:     "equation",
  DRAWING:      "drawing",
  FILE_UPLOAD:  "file_upload",
});

const MANUAL_GRADE_TYPES = new Set([
  QUESTION_TYPES.ESSAY,
  QUESTION_TYPES.EQUATION,
  QUESTION_TYPES.DRAWING,
  QUESTION_TYPES.FILE_UPLOAD,
]);

// ---------------------------------------------------------------------------
// Sub-schema: media attachment
// ---------------------------------------------------------------------------

const mediaSchema = new mongoose.Schema(
  {
    type:     { type: String, enum: ["image", "diagram", "formula", "audio"], default: "image" },
    url:      { type: String, trim: true },
    altText:  { type: String, trim: true, default: null },
    caption:  { type: String, trim: true, default: null },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const snapQuizQuestionSchema = new mongoose.Schema(
  {
    // ── Ownership & tenant ────────────────────────────────────────────────
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SnapQuiz",
      required: [true, "SnapQuiz reference is required"],
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Created by is required"],
    },

    // ── Display ───────────────────────────────────────────────────────────
    orderIndex:   { type: Number, default: 0 },
    questionType: {
      type: String,
      enum: Object.values(QUESTION_TYPES),
      required: [true, "Question type is required"],
    },
    questionText: {
      type: String,
      required: [true, "Question text is required"],
      trim: true,
    },
    media: { type: [mediaSchema], default: [] },

    // ── Options ───────────────────────────────────────────────────────────
    options:     { type: [String],      default: [] },
    optionMedia: { type: [mediaSchema], default: [] },

    // ── Correct answers ───────────────────────────────────────────────────
    correctOptionIndex:   { type: Number,   default: null },
    correctOptionIndices: { type: [Number], default: []   },
    correctBoolean:       { type: Boolean,  default: null },
    correctAnswerText: {
      type: String,
      trim: true,
      default: null,
    },
    acceptedAnswers: { type: [String], default: [] },
    numericAnswer: {
      value:     { type: Number, default: null },
      tolerance: { type: Number, default: 0 },
      unit:      { type: String, default: null },
    },
    modelAnswer: {
      type: String,
      trim: true,
      default: "",
    },

    // ── Marks & grading ───────────────────────────────────────────────────
    marks:                  { type: Number,  default: 1, min: 0 },
    allowPartialMarks:      { type: Boolean, default: false },
    requiresManualGrading:  { type: Boolean, default: false },

    // ── Maths / drawing support ───────────────────────────────────────────
    mathsDrawing: {
      requireWorkings:       { type: Boolean, default: false },
      requireDrawing:        { type: Boolean, default: false },
      allowFileUpload:       { type: Boolean, default: false },
      allowedFileTypes:      { type: String,  default: "image/png,image/jpeg,application/pdf" },
      maxFileSizeMb:         { type: Number,  default: 5 },
      markingGuide:          { type: String,  trim: true, default: "" },
      partialCreditGuidance: { type: String,  trim: true, default: "" },
    },

    explanation: { type: String, trim: true, default: "" },
    isActive:    { type: Boolean, default: true, index: true },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

snapQuizQuestionSchema.index({ quiz: 1, orderIndex: 1 });
snapQuizQuestionSchema.index({ quiz: 1, isActive: 1, orderIndex: 1 });
snapQuizQuestionSchema.index({ company: 1, quiz: 1 });

// ---------------------------------------------------------------------------
// Pre-save hook
// ---------------------------------------------------------------------------

snapQuizQuestionSchema.pre("save", function (next) {
  if (MANUAL_GRADE_TYPES.has(this.questionType)) {
    this.requiresManualGrading = true;
  }
  next();
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const SnapQuizQuestion = mongoose.model("SnapQuizQuestion", snapQuizQuestionSchema);

module.exports = SnapQuizQuestion;
module.exports.QUESTION_TYPES     = QUESTION_TYPES;
module.exports.MANUAL_GRADE_TYPES = MANUAL_GRADE_TYPES;

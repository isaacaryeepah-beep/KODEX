"use strict";

/**
 * NormalQuizQuestion
 *
 * A question belonging to a NormalQuiz. Stored as separate documents so
 * questions can be:
 *   - individually updated without touching the quiz document
 *   - reordered without rewriting the quiz
 *   - randomized per-attempt (order stored on NormalQuizAttempt)
 *   - potentially referenced by the QuestionBank in a later phase
 *
 * Supports all question types needed for academic use:
 *   mcq, mcq_multi, true_false, short_answer, fill_blank,
 *   essay, numeric, equation, drawing, file_upload
 *
 * Maths/drawing support fields are included so lecturers can specify:
 *   - whether workings are required alongside the final answer
 *   - whether a drawing canvas / upload is needed
 *   - marking guides and partial credit notes
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const QUESTION_TYPES = Object.freeze({
  MCQ:          "mcq",          // single correct answer from options
  MCQ_MULTI:    "mcq_multi",    // multiple correct answers from options
  TRUE_FALSE:   "true_false",   // boolean answer
  SHORT_ANSWER: "short_answer", // short text, auto-graded by match
  FILL_BLANK:   "fill_blank",   // one or more blank(s) in sentence
  ESSAY:        "essay",        // long-form, manual grading
  NUMERIC:      "numeric",      // number with optional tolerance
  EQUATION:     "equation",     // equation input, manual or pattern grading
  DRAWING:      "drawing",      // diagram/sketch, manual grading
  FILE_UPLOAD:  "file_upload",  // student uploads a file
});

// Which types require manual grading (cannot be auto-scored).
const MANUAL_GRADE_TYPES = new Set([
  QUESTION_TYPES.ESSAY,
  QUESTION_TYPES.EQUATION,
  QUESTION_TYPES.DRAWING,
  QUESTION_TYPES.FILE_UPLOAD,
]);

// ---------------------------------------------------------------------------
// Sub-schema: media attachment for question body or answer options
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

const normalQuizQuestionSchema = new mongoose.Schema(
  {
    // ── Ownership & tenant ────────────────────────────────────────────────
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "NormalQuiz",
      required: [true, "NormalQuiz reference is required"],
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
    // Position in the quiz (0-based). Used for default ordering.
    orderIndex: {
      type: Number,
      default: 0,
    },

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

    // Optional media (image, diagram) attached to the question stem.
    media: { type: [mediaSchema], default: [] },

    // ── Options (MCQ / MCQ_MULTI / TRUE_FALSE) ────────────────────────────
    // For true_false, options are automatically ["True", "False"].
    options: {
      type: [String],
      default: [],
    },
    // Optional media per option (diagrams as answer choices).
    optionMedia: {
      type: [mediaSchema],
      default: [],
    },

    // ── Correct answers ───────────────────────────────────────────────────
    // MCQ: single index into `options`.
    correctOptionIndex: {
      type: Number,
      default: null,
    },
    // MCQ_MULTI: array of correct indices.
    correctOptionIndices: {
      type: [Number],
      default: [],
    },
    // TRUE_FALSE: true or false.
    correctBoolean: {
      type: Boolean,
      default: null,
    },
    // SHORT_ANSWER / FILL_BLANK: primary accepted answer.
    correctAnswerText: {
      type: String,
      trim: true,
      default: null,
    },
    // Alternative accepted answers (case-insensitive matched on auto-grade).
    acceptedAnswers: {
      type: [String],
      default: [],
    },
    // NUMERIC: expected value and tolerance.
    numericAnswer: {
      value:     { type: Number, default: null },
      tolerance: { type: Number, default: 0 }, // ±tolerance
      unit:      { type: String, default: null },
    },
    // Model answer shown to lecturer when manually grading essay/drawing/equation.
    modelAnswer: {
      type: String,
      trim: true,
      default: "",
    },

    // ── Marks & grading ───────────────────────────────────────────────────
    marks: {
      type: Number,
      default: 1,
      min: 0,
    },
    allowPartialMarks: {
      type: Boolean,
      default: false,
    },
    // Whether this question requires a human to grade it.
    requiresManualGrading: {
      type: Boolean,
      default: false,
    },

    // ── Maths / drawing support ───────────────────────────────────────────
    mathsDrawing: {
      // Student must show their working/method, not just the final answer.
      requireWorkings:       { type: Boolean, default: false },
      // Student must submit a drawing or diagram.
      requireDrawing:        { type: Boolean, default: false },
      // Student may upload an image/PDF as part of their answer.
      allowFileUpload:       { type: Boolean, default: false },
      // Comma-separated MIME types allowed, e.g. "image/png,application/pdf"
      allowedFileTypes:      { type: String, default: "image/png,image/jpeg,application/pdf" },
      maxFileSizeMb:         { type: Number, default: 5 },
      // Lecturer's internal marking guide (not shown to students).
      markingGuide:          { type: String, trim: true, default: "" },
      // Guidance on awarding partial marks (shown to grader).
      partialCreditGuidance: { type: String, trim: true, default: "" },
    },

    // ── Explanation / hint ────────────────────────────────────────────────
    // Shown to student after submission if quiz is configured to show answers.
    explanation: {
      type: String,
      trim: true,
      default: "",
    },

    // Soft-delete: lecturer can hide a question without removing it.
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Ordered question list for a quiz.
normalQuizQuestionSchema.index({ quiz: 1, orderIndex: 1 });
normalQuizQuestionSchema.index({ quiz: 1, isActive: 1, orderIndex: 1 });
// Company-scoped for ownership checks.
normalQuizQuestionSchema.index({ company: 1, quiz: 1 });

// ---------------------------------------------------------------------------
// Pre-save: auto-set requiresManualGrading from question type.
// ---------------------------------------------------------------------------

normalQuizQuestionSchema.pre("save", function (next) {
  if (MANUAL_GRADE_TYPES.has(this.questionType)) {
    this.requiresManualGrading = true;
  }
  next();
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const NormalQuizQuestion = mongoose.model("NormalQuizQuestion", normalQuizQuestionSchema);

module.exports = NormalQuizQuestion;
module.exports.QUESTION_TYPES      = QUESTION_TYPES;
module.exports.MANUAL_GRADE_TYPES  = MANUAL_GRADE_TYPES;

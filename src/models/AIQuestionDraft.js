"use strict";

/**
 * AIQuestionDraft
 *
 * Stores a batch of AI-generated question drafts awaiting lecturer review.
 *
 * Workflow:
 *   1. Lecturer triggers generation (PDF / text / topic).
 *   2. Server calls Anthropic Claude, parses questions, saves this document.
 *   3. Lecturer reviews each question:
 *        - approve  → draftStatus = "approved"
 *        - reject   → draftStatus = "rejected"
 *        - edit     → overwrite fields, draftStatus = "edited"
 *   4. Lecturer calls /apply → approved/edited questions are written as real
 *      NormalQuizQuestion or SnapQuizQuestion documents.
 *   5. Draft status becomes "fully_processed".
 *
 * No `course` field — AI drafts are course-agnostic.
 * requireAssessmentOwnership uses skipCourseCheck: true for this model,
 * so only the createdBy check runs (no CourseLecturerAssignment lookup).
 *
 * TTL: drafts auto-expire after DRAFT_TTL_DAYS (default 30).
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const SOURCE_TYPES = Object.freeze({
  PDF:   "pdf",
  TEXT:  "text",
  TOPIC: "topic",   // free-form topic description only
});

const TARGET_QUIZ_TYPES = Object.freeze({
  NORMAL_QUIZ: "normal_quiz",
  SNAP_QUIZ:   "snap_quiz",
  STANDALONE:  "standalone", // not tied to any specific quiz yet
});

const DRAFT_STATUSES = Object.freeze({
  PENDING_REVIEW:      "pending_review",
  PARTIALLY_PROCESSED: "partially_processed",
  FULLY_PROCESSED:     "fully_processed",
  DISCARDED:           "discarded",
});

const QUESTION_DRAFT_STATUSES = Object.freeze({
  PENDING:  "pending",
  APPROVED: "approved",
  EDITED:   "edited",   // approved with manual edits
  REJECTED: "rejected",
});

// ---------------------------------------------------------------------------
// Sub-schema: individual draft question
// ---------------------------------------------------------------------------

const draftQuestionSchema = new mongoose.Schema(
  {
    // ── Question content ──────────────────────────────────────────────────
    questionType: {
      type: String,
      enum: [
        "mcq","mcq_multi","true_false","short_answer","fill_blank",
        "essay","numeric","equation","drawing","file_upload",
      ],
      required: true,
    },
    questionText: { type: String, trim: true, required: true },
    options:      { type: [String], default: [] },

    // Correct answers (depends on questionType)
    correctOptionIndex:   { type: Number,   default: null },
    correctOptionIndices: { type: [Number], default: []   },
    correctBoolean:       { type: Boolean,  default: null },
    correctAnswerText:    { type: String,   trim: true, default: null },
    acceptedAnswers:      { type: [String], default: []   },
    numericAnswer: {
      value:     { type: Number, default: null },
      tolerance: { type: Number, default: 0    },
      unit:      { type: String, default: null },
    },
    modelAnswer:  { type: String, trim: true, default: "" },
    explanation:  { type: String, trim: true, default: "" },
    marks:        { type: Number, default: 1, min: 0 },
    allowPartialMarks:     { type: Boolean, default: false },
    requiresManualGrading: { type: Boolean, default: false },

    // ── Draft review state ────────────────────────────────────────────────
    draftStatus: {
      type: String,
      enum: Object.values(QUESTION_DRAFT_STATUSES),
      default: QUESTION_DRAFT_STATUSES.PENDING,
    },
    approvedAt:  { type: Date, default: null },
    rejectedAt:  { type: Date, default: null },
    reviewNote:  { type: String, trim: true, default: null },

    // ── AI confidence / metadata ──────────────────────────────────────────
    // Optional quality score returned by the AI (0–1).
    aiConfidence: { type: Number, default: null, min: 0, max: 1 },
    // Subject tag inferred by AI (e.g. "Organic Chemistry", "Data Structures").
    aiSubjectTag: { type: String, trim: true, default: null },
  },
  { _id: true }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const aiQuestionDraftSchema = new mongoose.Schema(
  {
    // ── Tenant & ownership ────────────────────────────────────────────────
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
      index: true,
    },

    // ── Generation input ──────────────────────────────────────────────────
    sourceType: {
      type: String,
      enum: Object.values(SOURCE_TYPES),
      required: true,
    },
    // Short label for the UI (e.g. filename or first 80 chars of topic).
    sourceLabel: {
      type: String,
      trim: true,
      default: "",
    },
    // SHA-256 hash of the source text — used for deduplication warnings.
    sourceHash: {
      type: String,
      default: null,
    },

    // ── Generation parameters ─────────────────────────────────────────────
    generationParams: {
      count:      { type: Number, default: 5 },
      types:      { type: [String], default: ["mcq"] },
      difficulty: { type: String, default: "mixed" },
      subject:    { type: String, trim: true, default: null },
      language:   { type: String, default: "en" },
    },

    // ── Target quiz ───────────────────────────────────────────────────────
    targetQuizType: {
      type: String,
      enum: Object.values(TARGET_QUIZ_TYPES),
      default: TARGET_QUIZ_TYPES.STANDALONE,
    },
    targetQuizId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      // No ref — could be NormalQuiz or SnapQuiz depending on targetQuizType.
    },

    // ── Generated questions ───────────────────────────────────────────────
    questions: {
      type: [draftQuestionSchema],
      default: [],
    },

    // ── Batch status ──────────────────────────────────────────────────────
    status: {
      type: String,
      enum: Object.values(DRAFT_STATUSES),
      default: DRAFT_STATUSES.PENDING_REVIEW,
      index: true,
    },

    // ── Application record ────────────────────────────────────────────────
    // Set after /apply succeeds.
    appliedToQuizId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    appliedAt:    { type: Date, default: null },
    appliedCount: { type: Number, default: 0 }, // questions actually created

    // ── AI metadata ───────────────────────────────────────────────────────
    aiMetadata: {
      modelUsed:       { type: String, default: null },
      promptTokens:    { type: Number, default: null },
      completionTokens:{ type: Number, default: null },
      processingMs:    { type: Number, default: null },
      generatedAt:     { type: Date,   default: Date.now },
    },

    // ── TTL ───────────────────────────────────────────────────────────────
    // Auto-expire after N days (default 30). Set to a far-future date to keep.
    expiresAt: {
      type: Date,
      default: () => {
        const days = parseInt(process.env.AI_DRAFT_TTL_DAYS || "30", 10);
        return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      },
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// TTL index — MongoDB will auto-delete expired drafts
// ---------------------------------------------------------------------------

aiQuestionDraftSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "ai_draft_ttl" }
);

// ── Other indexes ─────────────────────────────────────────────────────────────

aiQuestionDraftSchema.index({ company: 1, createdBy: 1, status: 1, createdAt: -1 });
aiQuestionDraftSchema.index({ company: 1, targetQuizId: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const AIQuestionDraft = mongoose.model("AIQuestionDraft", aiQuestionDraftSchema);

module.exports = AIQuestionDraft;
module.exports.SOURCE_TYPES             = SOURCE_TYPES;
module.exports.TARGET_QUIZ_TYPES        = TARGET_QUIZ_TYPES;
module.exports.DRAFT_STATUSES           = DRAFT_STATUSES;
module.exports.QUESTION_DRAFT_STATUSES  = QUESTION_DRAFT_STATUSES;

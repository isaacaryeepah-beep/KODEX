"use strict";

/**
 * EvaluationResponse.js
 *
 * A student's submitted course evaluation.
 *
 * Design decisions:
 *  - One response per (company, course, student) — hard unique constraint.
 *  - `isAnonymous` defaults to true; when true the aggregated results endpoint
 *    never returns the student ObjectId.  The field is stored so admins can
 *    optionally configure non-anonymous evaluations in the future.
 *  - `responses` mirrors the EvaluationForm criteria keys so each answer can
 *    be looked up by key during aggregation.
 *  - `status: draft` allows students to save progress before submitting.
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const responseItemSchema = new mongoose.Schema(
  {
    key:    { type: String, required: true, trim: true },  // matches a criterion key
    rating: { type: Number, min: 1, max: 5, default: null },  // for type=rating
    text:   { type: String, trim: true,   default: null },    // for type=text
    yesno:  { type: Boolean,              default: null },    // for type=yesno
  },
  { _id: false }
);

const evaluationResponseSchema = new mongoose.Schema(
  {
    // ── Tenant & context ──────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },
    course: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Course",
      required: true,
      index:    true,
    },
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // ── Privacy ───────────────────────────────────────────────────────────
    isAnonymous: { type: Boolean, default: true },

    // ── Answers ───────────────────────────────────────────────────────────
    responses: { type: [responseItemSchema], default: () => [] },

    // ── Top-level required summary score ─────────────────────────────────
    overallRating: { type: Number, min: 1, max: 5, required: true },

    // ── Lifecycle ─────────────────────────────────────────────────────────
    status:      { type: String, enum: ["draft", "submitted"], default: "draft" },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Hard constraint: one response per student per course
evaluationResponseSchema.index(
  { company: 1, course: 1, student: 1 },
  { unique: true, name: "unique_evaluation_per_student" }
);
// Aggregation queries
evaluationResponseSchema.index({ company: 1, course: 1, status: 1 });

const EvaluationResponse = mongoose.model("EvaluationResponse", evaluationResponseSchema);
module.exports = EvaluationResponse;

"use strict";

/**
 * EvaluationForm.js
 *
 * Configurable evaluation questionnaire attached to a course.
 * One form per course.  If no form exists the route layer falls back to
 * DEFAULT_CRITERIA so every course is immediately evaluatable.
 *
 * Criterion types:
 *   rating  — integer 1–5 (Likert scale)
 *   text    — free-text comment
 *   yesno   — boolean yes / no
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const DEFAULT_CRITERIA = Object.freeze([
  { key: "teaching_quality",   label: "Teaching Quality",                          type: "rating", required: true  },
  { key: "course_content",     label: "Course Content",                            type: "rating", required: true  },
  { key: "learning_materials", label: "Learning Materials & Resources",            type: "rating", required: false },
  { key: "difficulty",         label: "Difficulty Level (1=Too Easy, 5=Too Hard)", type: "rating", required: false },
  { key: "engagement",         label: "Lecturer Engagement",                       type: "rating", required: false },
  { key: "overall",            label: "Overall Experience",                        type: "rating", required: true  },
  { key: "would_recommend",    label: "Would you recommend this course?",          type: "yesno",  required: false },
  { key: "comments",           label: "General Comments",                          type: "text",   required: false },
]);

const criterionSchema = new mongoose.Schema(
  {
    key:      { type: String, required: true, trim: true },   // unique within a form
    label:    { type: String, required: true, trim: true, maxlength: 200 },
    type:     { type: String, enum: ["rating", "text", "yesno"], default: "rating" },
    required: { type: Boolean, default: false },
    order:    { type: Number, default: 0 },
  },
  { _id: false }
);

const evaluationFormSchema = new mongoose.Schema(
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
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // ── Questions ─────────────────────────────────────────────────────────
    criteria: { type: [criterionSchema], default: () => [] },

    // ── Submission window ─────────────────────────────────────────────────
    isOpen:    { type: Boolean, default: false },
    openFrom:  { type: Date,    default: null  },
    openUntil: { type: Date,    default: null  },
  },
  { timestamps: true }
);

// One form per course per company
evaluationFormSchema.index({ company: 1, course: 1 }, { unique: true });

const EvaluationForm = mongoose.model("EvaluationForm", evaluationFormSchema);
module.exports = EvaluationForm;
module.exports.DEFAULT_CRITERIA = DEFAULT_CRITERIA;

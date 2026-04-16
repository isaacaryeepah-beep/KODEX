"use strict";

/**
 * Programme.js
 *
 * An academic degree programme offered by an institution
 * (e.g. "BSc Computer Science", "HND Business Administration").
 *
 * A programme has a list of course requirements: required courses,
 * elective slots, credit hours per course, and the semester in which
 * each course is typically taken.
 *
 * Students are linked to a programme via User.programme (string name today;
 * this model formalises that as a full document).  The progress endpoint
 * joins StudentCourseEnrollment against the requirement list to compute
 * how far along a student is.
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const QUALIFICATION_TYPES = Object.freeze([
  "BSc", "HND", "Diploma", "Certificate", "MSc", "MPhil", "PhD",
  "Top-Up", "Foundation", "Other",
]);

const requirementSchema = new mongoose.Schema(
  {
    course:      { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
    credits:     { type: Number, default: 3, min: 0 },
    isElective:  { type: Boolean, default: false },
    semester:    { type: Number, default: null, min: 1 },  // suggested semester (1-based)
    isRequired:  { type: Boolean, default: true },
  },
  { _id: true }
);

const programmeSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },

    // ── Identity ──────────────────────────────────────────────────────────
    name: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 200,
    },
    code: {
      type:  String,
      trim:  true,
      uppercase: true,
      maxlength: 20,
      default: "",
    },
    description:       { type: String, default: "", trim: true },
    qualificationType: { type: String, enum: [...QUALIFICATION_TYPES, null], default: null },
    department:        { type: String, default: null, trim: true },

    // ── Duration & credit requirements ────────────────────────────────────
    durationSemesters: { type: Number, default: null, min: 1 },
    totalCreditsRequired: { type: Number, default: null, min: 0 },
    minElectiveCredits:   { type: Number, default: 0,    min: 0 },

    // ── Course requirements ───────────────────────────────────────────────
    requirements: { type: [requirementSchema], default: [] },

    // ── State ─────────────────────────────────────────────────────────────
    isActive:  { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// Unique name within a company
programmeSchema.index({ company: 1, name: 1 }, { unique: true });
programmeSchema.index({ company: 1, isActive: 1 });

const Programme = mongoose.model("Programme", programmeSchema);
module.exports = Programme;
module.exports.QUALIFICATION_TYPES = QUALIFICATION_TYPES;

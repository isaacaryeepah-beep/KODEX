"use strict";

/**
 * IssuedCertificate.js
 *
 * Records an officially issued course-completion certificate for a student.
 *
 * Design decisions:
 *  - `verificationCode` is a cryptographically random hex string used for
 *    public verification without exposing any internal IDs.
 *  - Snapshot fields (studentName, courseName, etc.) are captured at issuance
 *    time so the certificate remains valid even if the user or course records
 *    are later edited or archived.
 *  - Certificates can be revoked by an admin; revoked certificates still appear
 *    in verification responses but are clearly marked as revoked.
 *  - Unique constraint: one certificate per (company, student, course) — staff
 *    must revoke before re-issuing.
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");
const crypto   = require("crypto");

const issuedCertificateSchema = new mongoose.Schema(
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
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },
    // Link back to the enrollment record that triggered issuance
    enrollment: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "StudentCourseEnrollment",
      default: null,
    },
    issuedBy: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // ── Verification ──────────────────────────────────────────────────────
    verificationCode: {
      type:     String,
      required: true,
      unique:   true,
      default:  () => crypto.randomBytes(20).toString("hex"),
    },

    // ── Snapshot (survives course/user edits) ─────────────────────────────
    studentName:        { type: String, default: "" },
    studentEmail:       { type: String, default: "" },
    studentIndexNumber: { type: String, default: "" },

    institutionName: { type: String, default: "" },
    courseName:      { type: String, default: "" },
    courseCode:      { type: String, default: "" },
    academicYear:    { type: String, default: "" },
    semester:        { type: String, default: "" },
    level:           { type: String, default: "" },
    programme:       { type: String, default: "" },

    finalGrade: {
      score:   { type: Number, default: null },
      grade:   { type: String, default: null },
      remarks: { type: String, default: null },
    },

    issuedAt: { type: Date, default: Date.now },

    // ── Revocation ────────────────────────────────────────────────────────
    isRevoked:    { type: Boolean, default: false },
    revokedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    revokedAt:    { type: Date, default: null },
    revokeReason: { type: String, default: null },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────

// One active certificate per student per course (enforced via application logic;
// not a DB unique constraint because revoked certs are kept for audit).
issuedCertificateSchema.index({ company: 1, student: 1, course: 1 });
// Fast verification lookup
issuedCertificateSchema.index({ verificationCode: 1 });
// All certs for a student
issuedCertificateSchema.index({ company: 1, student: 1 });

const IssuedCertificate = mongoose.model("IssuedCertificate", issuedCertificateSchema);
module.exports = IssuedCertificate;

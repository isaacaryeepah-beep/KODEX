"use strict";

/**
 * EmployeeProfile
 *
 * Extended HR record for a corporate-mode user.
 * One document per user (unique index on company + user).
 *
 * Intentionally separate from User to:
 *   - Keep the User document lean (auth + identity only)
 *   - Restrict sensitive HR data to admin/manager access
 *   - Enable the profile to be created after the user is already registered
 *
 * Corporate mode only.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const emergencyContactSchema = new mongoose.Schema(
  {
    name:         { type: String, trim: true, default: "" },
    relationship: { type: String, trim: true, default: "" },
    phone:        { type: String, trim: true, default: "" },
    email:        { type: String, trim: true, lowercase: true, default: "" },
  },
  { _id: false }
);

const documentRefSchema = new mongoose.Schema(
  {
    docType:    { type: String, trim: true, default: "other" }, // e.g. "contract", "id_card", "certificate"
    name:       { type: String, trim: true, default: "" },
    url:        { type: String, trim: true, default: "" },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: true }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const EMPLOYMENT_TYPES = Object.freeze([
  "full_time", "part_time", "contract", "intern", "temporary",
]);

const employeeProfileSchema = new mongoose.Schema(
  {
    // ── Tenant & owner ────────────────────────────────────────────────────
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },

    // ── Job info ─────────────────────────────────────────────────────────
    jobTitle:      { type: String, trim: true, default: "" },
    employmentType: {
      type: String,
      enum: EMPLOYMENT_TYPES,
      default: "full_time",
    },
    hireDate:          { type: Date, default: null },
    probationEndDate:  { type: Date, default: null },
    terminationDate:   { type: Date, default: null },
    terminationReason: { type: String, trim: true, default: "" },

    // ── Org placement ────────────────────────────────────────────────────
    // ObjectId refs allow rich lookups; string fallbacks preserve legacy data.
    departmentRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    teamRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      default: null,
    },
    branchRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Compensation ─────────────────────────────────────────────────────
    salaryBand:    { type: String, trim: true, default: "" }, // e.g. "L4", "Senior"
    monthlySalary: { type: Number, default: null, min: 0 },  // gross monthly (salaried)
    hourlyRate:    { type: Number, default: null, min: 0 },  // hourly pay (hourly workers)
    currency:      { type: String, trim: true, default: "GHS" },

    // ── Personal ─────────────────────────────────────────────────────────
    dateOfBirth: { type: Date, default: null },
    gender:      {
      type: String,
      enum: ["male", "female", "other", "prefer_not_to_say", ""],
      default: "",
    },
    nationality: { type: String, trim: true, default: "" },
    nationalId:  { type: String, trim: true, default: "" },
    address:     { type: String, trim: true, default: "" },
    city:        { type: String, trim: true, default: "" },
    country:     { type: String, trim: true, default: "" },

    // ── Contact ──────────────────────────────────────────────────────────
    workPhone:    { type: String, trim: true, default: "" },
    workEmail:    { type: String, trim: true, lowercase: true, default: "" },
    emergencyContact: {
      type: emergencyContactSchema,
      default: () => ({}),
    },

    // ── Documents ────────────────────────────────────────────────────────
    documents: { type: [documentRefSchema], default: [] },

    // ── Onboarding ───────────────────────────────────────────────────────
    onboardingComplete:   { type: Boolean, default: false },
    onboardingCompletedAt:{ type: Date,    default: null  },

    // ── Notes ────────────────────────────────────────────────────────────
    notes: { type: String, default: "" },

    // ── Audit ────────────────────────────────────────────────────────────
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Primary lookup: one profile per user per company
employeeProfileSchema.index(
  { company: 1, user: 1 },
  { unique: true, name: "emp_profile_company_user_unique" }
);

employeeProfileSchema.index({ company: 1, departmentRef: 1 });
employeeProfileSchema.index({ company: 1, manager: 1 });
employeeProfileSchema.index({ company: 1, hireDate: -1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const EmployeeProfile = mongoose.model("EmployeeProfile", employeeProfileSchema);

module.exports = EmployeeProfile;
module.exports.EMPLOYMENT_TYPES = EMPLOYMENT_TYPES;

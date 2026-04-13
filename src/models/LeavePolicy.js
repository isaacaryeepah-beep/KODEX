"use strict";

/**
 * LeavePolicy
 *
 * Defines a leave type (e.g. Annual Leave, Sick Leave) and its rules
 * for a given company.  LeaveBalance documents are seeded from these
 * policies at the start of each year (or when the policy is created).
 *
 * The existing LeaveRequest model stores the leave type as a free-form
 * enum string; LeavePolicy gives that string a canonical definition and
 * lets admins control entitlements, accrual, and carry-over.
 *
 * Corporate mode only.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const ACCRUAL_TYPES = Object.freeze(["annual", "monthly", "none"]);

// Leave policies can restrict which employment types are eligible
const EMPLOYMENT_TYPES = Object.freeze([
  "full_time", "part_time", "contract", "intern", "temporary",
]);

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const leavePolicySchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────────
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },

    // ── Identity ──────────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Policy name is required"],
      trim: true,
    },
    // Short uppercase code used as the `type` value on LeaveRequest
    // (e.g. "AL" for annual, "SL" for sick).
    code: {
      type: String,
      required: [true, "Policy code is required"],
      trim: true,
      uppercase: true,
    },
    description: { type: String, default: "" },

    // ── Entitlement ───────────────────────────────────────────────────────────
    daysPerYear: {
      type: Number,
      required: [true, "Days per year is required"],
      min: [0, "Days per year cannot be negative"],
    },
    // Maximum unused days that roll over into the next calendar year
    carryoverDays: { type: Number, default: 0, min: 0 },

    // How entitlement is credited to the employee balance
    accrualType: {
      type: String,
      enum: ACCRUAL_TYPES,
      default: "annual",
    },

    // ── Eligibility ───────────────────────────────────────────────────────────
    requiresApproval: { type: Boolean, default: true },
    requiresDocument: { type: Boolean, default: false }, // e.g. sick note
    // Minimum days of employment before this leave type becomes available
    minimumServiceDays: { type: Number, default: 0, min: 0 },

    // Which employment types can use this policy
    targetEmploymentTypes: {
      type: [String],
      enum: EMPLOYMENT_TYPES,
      default: ["full_time", "part_time"],
    },

    // ── Financial ─────────────────────────────────────────────────────────────
    isPaid: { type: Boolean, default: true },

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true, index: true },
    createdBy: {
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

// Unique code per company
leavePolicySchema.index(
  { company: 1, code: 1 },
  { unique: true, name: "leave_policy_company_code_unique" }
);

leavePolicySchema.index({ company: 1, isActive: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const LeavePolicy = mongoose.model("LeavePolicy", leavePolicySchema);

module.exports = LeavePolicy;
module.exports.ACCRUAL_TYPES     = ACCRUAL_TYPES;
module.exports.EMPLOYMENT_TYPES  = EMPLOYMENT_TYPES;

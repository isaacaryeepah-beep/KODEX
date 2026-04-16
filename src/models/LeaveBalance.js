"use strict";

/**
 * LeaveBalance
 *
 * Tracks an employee's leave entitlement, usage, and remaining days
 * for a specific LeavePolicy in a given calendar year.
 *
 * One document per (company, employee, policy, year).
 *
 * Lifecycle:
 *   1. Admin creates / seeds balances via POST /api/leave-policies/:id/allocate
 *   2. When a LeaveRequest is APPROVED, the route increments `used` and
 *      decrements `pending`.
 *   3. When a LeaveRequest is SUBMITTED (pending), `pending` is incremented.
 *   4. When a request is CANCELLED / REJECTED, `pending` is decremented.
 *   5. At year start, admins can seed the next year with carryover.
 *
 * `remaining` is a virtual: entitlement + carryover + adjustments - used - pending
 *
 * Corporate mode only.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const leaveBalanceSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────────
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },

    // ── Ownership ─────────────────────────────────────────────────────────────
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Employee is required"],
    },
    policy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeavePolicy",
      required: [true, "Policy is required"],
    },

    // ── Period ────────────────────────────────────────────────────────────────
    year: {
      type: Number,
      required: [true, "Year is required"],
      min: 2000,
    },

    // ── Balance components ────────────────────────────────────────────────────
    entitlement: { type: Number, default: 0, min: 0 }, // base days allocated
    carryover:   { type: Number, default: 0, min: 0 }, // rolled over from prior year
    adjustments: { type: Number, default: 0 },         // manual +/- by admin

    // Days consumed by APPROVED leave requests this year
    used:    { type: Number, default: 0, min: 0 },
    // Days tied up by PENDING leave requests (not yet approved)
    pending: { type: Number, default: 0, min: 0 },

    // ── Audit ─────────────────────────────────────────────────────────────────
    lastAdjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    lastAdjustedAt: { type: Date, default: null },
    adjustmentNote: { type: String, default: "" },
  },
  {
    timestamps: true,
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ---------------------------------------------------------------------------
// Virtual: remaining days
// ---------------------------------------------------------------------------

leaveBalanceSchema.virtual("remaining").get(function () {
  return (
    this.entitlement +
    this.carryover +
    this.adjustments -
    this.used -
    this.pending
  );
});

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Primary lookup — unique per employee per policy per year
leaveBalanceSchema.index(
  { company: 1, employee: 1, policy: 1, year: 1 },
  { unique: true, name: "leave_balance_unique" }
);

leaveBalanceSchema.index({ company: 1, employee: 1, year: 1 });
leaveBalanceSchema.index({ company: 1, year: 1 });

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = mongoose.model("LeaveBalance", leaveBalanceSchema);

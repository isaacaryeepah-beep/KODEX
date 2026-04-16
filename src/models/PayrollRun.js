"use strict";

/**
 * PayrollRun.js
 *
 * Represents one payroll batch for a company for a given year+month.
 * One run per company per period (unique index).
 *
 * Lifecycle: draft → approved → paid  (or cancelled from draft/approved)
 */

const mongoose = require("mongoose");

const PAYROLL_STATUSES = Object.freeze(["draft", "approved", "paid", "cancelled"]);

const payrollRunSchema = new mongoose.Schema(
  {
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },

    // Period
    year:  { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },

    // Status
    status: {
      type:    String,
      enum:    PAYROLL_STATUSES,
      default: "draft",
    },

    // Aggregate totals (computed on run, updated on re-run)
    totalGross:      { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    totalNet:        { type: Number, default: 0 },
    employeeCount:   { type: Number, default: 0 },

    // Metadata
    notes: { type: String, default: "" },

    // Actors
    runBy:      { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    approvedAt: { type: Date, default: null },
    paidAt:     { type: Date, default: null },
  },
  { timestamps: true }
);

// Only one payroll run per company per period
payrollRunSchema.index(
  { company: 1, year: 1, month: 1 },
  { unique: true, name: "payroll_run_company_period_unique" }
);

const PayrollRun = mongoose.model("PayrollRun", payrollRunSchema);
module.exports = PayrollRun;
module.exports.PAYROLL_STATUSES = PAYROLL_STATUSES;

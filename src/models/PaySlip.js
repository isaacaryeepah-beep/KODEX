"use strict";

/**
 * PaySlip.js
 *
 * One payslip per employee per PayrollRun.
 * Stores a full breakdown of earnings and deductions for the period.
 *
 * Pay lines:
 *   grossPay        = basePay + overtimePay + Σallowances
 *   totalDeductions = Σdeductions
 *   netPay          = grossPay − totalDeductions  (clamped to ≥ 0)
 */

const mongoose = require("mongoose");

// Generic labelled money line (allowance or deduction)
const lineItemSchema = new mongoose.Schema(
  {
    label:  { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const paySlipSchema = new mongoose.Schema(
  {
    // ── Tenant & references ───────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },
    employee: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },
    payrollRun: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "PayrollRun",
      required: true,
    },

    // ── Period (denormalised for fast employee queries) ───────────────────
    year:  { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },

    // ── Attendance summary ────────────────────────────────────────────────
    daysPresent:   { type: Number, default: 0 },
    daysAbsent:    { type: Number, default: 0 },
    daysOnLeave:   { type: Number, default: 0 },
    lateMinutes:   { type: Number, default: 0 },
    hoursWorked:   { type: Number, default: 0 },
    overtimeHours: { type: Number, default: 0 },

    // ── Pay lines ─────────────────────────────────────────────────────────
    basePay:     { type: Number, default: 0 }, // monthly salary OR hours × rate
    overtimePay: { type: Number, default: 0 },
    allowances:  { type: [lineItemSchema], default: [] },
    deductions:  { type: [lineItemSchema], default: [] }, // late penalty, unpaid, etc.

    // ── Totals ────────────────────────────────────────────────────────────
    grossPay:        { type: Number, default: 0 }, // basePay + overtimePay + Σallowances
    totalDeductions: { type: Number, default: 0 }, // Σdeductions
    netPay:          { type: Number, default: 0 }, // grossPay - totalDeductions

    // ── Meta ─────────────────────────────────────────────────────────────
    currency: { type: String, default: "GHS" },
    status:   { type: String, enum: ["draft", "approved", "paid"], default: "draft" },
    notes:    { type: String, default: "" },
  },
  { timestamps: true }
);

// One slip per employee per run
paySlipSchema.index(
  { company: 1, employee: 1, payrollRun: 1 },
  { unique: true, name: "payslip_emp_run_unique" }
);
// Admin: list all slips in a run
paySlipSchema.index({ company: 1, payrollRun: 1 });
// Employee: history by period
paySlipSchema.index({ company: 1, employee: 1, year: 1, month: 1 });

module.exports = mongoose.model("PaySlip", paySlipSchema);

"use strict";

/**
 * AttendanceSummary.js
 *
 * One attendance/hours summary per employee per AttendanceSummaryRun.
 * Deliberately contains no pay amounts, currency, or compensation data --
 * Dikly is the system of record for time and attendance, never money.
 * A company's own payroll system consumes this data (via CSV export) to
 * compute actual pay.
 */

const mongoose = require("mongoose");

const attendanceSummarySchema = new mongoose.Schema(
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
    summaryRun: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "AttendanceSummaryRun",
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

    // ── Meta ─────────────────────────────────────────────────────────────
    status: { type: String, enum: ["draft", "finalized"], default: "draft" },
    notes:  { type: String, default: "" },
  },
  { timestamps: true }
);

// One summary per employee per run
attendanceSummarySchema.index(
  { company: 1, employee: 1, summaryRun: 1 },
  { unique: true, name: "attendance_summary_emp_run_unique" }
);
// Admin: list all summaries in a run
attendanceSummarySchema.index({ company: 1, summaryRun: 1 });
// Employee: history by period
attendanceSummarySchema.index({ company: 1, employee: 1, year: 1, month: 1 });

module.exports = mongoose.model("AttendanceSummary", attendanceSummarySchema);

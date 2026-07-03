"use strict";

/**
 * AttendanceSummaryRun.js
 *
 * Represents one attendance/hours export batch for a company for a given
 * year+month. One run per company per period (unique index).
 *
 * This is deliberately NOT payroll -- Dikly never computes or stores pay
 * amounts, salary, or currency. A run packages up each employee's hours,
 * attendance, and leave data for the period so it can be exported (CSV)
 * and handed to the company's own payroll system or accountant.
 *
 * Lifecycle: draft → finalized  (or cancelled from draft/finalized)
 */

const mongoose = require("mongoose");

const SUMMARY_RUN_STATUSES = Object.freeze(["draft", "finalized", "cancelled"]);

const attendanceSummaryRunSchema = new mongoose.Schema(
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
      enum:    SUMMARY_RUN_STATUSES,
      default: "draft",
    },

    employeeCount: { type: Number, default: 0 },

    // Metadata
    notes: { type: String, default: "" },

    // Actors
    runBy:        { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    finalizedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    finalizedAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

// Only one summary run per company per period
attendanceSummaryRunSchema.index(
  { company: 1, year: 1, month: 1 },
  { unique: true, name: "attendance_summary_run_company_period_unique" }
);

const AttendanceSummaryRun = mongoose.model("AttendanceSummaryRun", attendanceSummaryRunSchema);
module.exports = AttendanceSummaryRun;
module.exports.SUMMARY_RUN_STATUSES = SUMMARY_RUN_STATUSES;

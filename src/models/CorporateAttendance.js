"use strict";

/**
 * CorporateAttendance
 *
 * Daily clock-in / clock-out record for corporate-mode employees.
 * One document per (company, employee, date) — unique index enforces this.
 *
 * This is distinct from AttendanceRecord (academic session-based attendance).
 * Corporate attendance tracks work-day presence against an employee's shift.
 *
 * Workflow:
 *   1. Employee POSTs /clock-in   → creates or updates this document
 *   2. Employee POSTs /clock-out  → fills clockOut, computes hoursWorked
 *   3. Admin can PATCH /override  → manual correction with audit trail
 *   4. Leave-approved employees can be auto-marked "on_leave" by a scheduled job
 *      or by the leave approval route.
 *
 * Corporate mode only.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const ATTENDANCE_STATUSES = Object.freeze([
  "present",
  "absent",
  "late",
  "half_day",
  "on_leave",
  "public_holiday",
  "remote",
  "excused",
]);

const CLOCK_METHODS = Object.freeze([
  "manual",     // admin/employee entered
  "qr_code",    // ESP32 / QR scan
  "biometric",  // fingerprint / face
  "gps",        // mobile GPS check-in
  "face_id",    // facial recognition
  "web",        // browser clock-in button
]);

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const locationSchema = new mongoose.Schema(
  {
    latitude:  { type: Number, default: null },
    longitude: { type: Number, default: null },
    accuracy:  { type: Number, default: null },
    address:   { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const clockEventSchema = new mongoose.Schema(
  {
    time:         { type: Date,    default: null },
    method:       { type: String,  enum: CLOCK_METHODS, default: "web" },
    location:     { type: locationSchema, default: () => ({}) },
    ipAddress:    { type: String,  trim: true, default: null },
    // Clock-in specific lateness fields
    isLate:       { type: Boolean, default: false },
    lateMinutes:  { type: Number,  default: 0, min: 0 },
    // Clock-out specific early-leave field
    earlyLeaveMinutes: { type: Number, default: 0, min: 0 },
    // Strict WiFi+GPS verification result
    verified:      { type: Boolean, default: null },  // null = not enforced, true = passed, false = blocked
    blockedReason: { type: String,  default: null },  // 'wifi_mismatch' | 'outside_geofence' | 'vpn_detected'
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const corporateAttendanceSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────────
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },

    // ── Who ───────────────────────────────────────────────────────────────────
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Employee is required"],
    },

    // Reference shift for this day (determines expected start/end times)
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
      default: null,
    },

    // ── When ──────────────────────────────────────────────────────────────────
    // Stored as midnight UTC of the attendance day (e.g. 2026-04-13T00:00:00Z)
    date: {
      type: Date,
      required: [true, "Date is required"],
    },

    // ── Clock events ──────────────────────────────────────────────────────────
    clockIn:  { type: clockEventSchema, default: () => ({}) },
    clockOut: { type: clockEventSchema, default: () => ({}) },

    // ── Computed duration ─────────────────────────────────────────────────────
    hoursWorked:   { type: Number, default: null, min: 0 },  // total hours
    overtimeHours: { type: Number, default: 0,    min: 0 },

    // Late-arrival / early-departure minutes (vs shift schedule)
    lateMinutes:        { type: Number, default: 0, min: 0 },
    earlyLeaveMinutes:  { type: Number, default: 0, min: 0 },

    // ── Status ────────────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      default: "absent",
      index: true,
    },

    // ── Leave link ────────────────────────────────────────────────────────────
    leaveRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeaveRequest",
      default: null,
    },

    // ── Failed clock-in attempts (strict mode) ────────────────────────────────
    failedAttempts: {
      type: [{
        attemptedAt: { type: Date,   default: Date.now },
        reason:      { type: String },
        ipAddress:   { type: String, default: null },
        latitude:    { type: Number, default: null },
        longitude:   { type: Number, default: null },
        _id:         false,
      }],
      default: [],
    },

    // ── Manual override ───────────────────────────────────────────────────────
    isManualOverride: { type: Boolean, default: false },
    overrideBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    overrideAt:     { type: Date,   default: null },
    overrideReason: { type: String, trim: true, default: "" },

    // ── Notes ────────────────────────────────────────────────────────────────
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// One record per employee per calendar day
corporateAttendanceSchema.index(
  { company: 1, employee: 1, date: 1 },
  { unique: true, name: "corp_attendance_emp_date_unique" }
);

corporateAttendanceSchema.index({ company: 1, date: 1 });
corporateAttendanceSchema.index({ company: 1, status: 1, date: 1 });
corporateAttendanceSchema.index({ company: 1, employee: 1, date: -1 });

// ---------------------------------------------------------------------------
// Helper: normalize a Date to midnight UTC for the given date string / Date
// ---------------------------------------------------------------------------

corporateAttendanceSchema.statics.normalizeDate = function (raw) {
  const d = new Date(raw);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const CorporateAttendance = mongoose.model(
  "CorporateAttendance",
  corporateAttendanceSchema
);

module.exports = CorporateAttendance;
module.exports.ATTENDANCE_STATUSES = ATTENDANCE_STATUSES;
module.exports.CLOCK_METHODS       = CLOCK_METHODS;

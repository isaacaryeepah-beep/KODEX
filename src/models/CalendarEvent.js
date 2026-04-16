"use strict";

/**
 * CalendarEvent.js
 *
 * An institution-wide or course/department-scoped calendar event.
 * Used by students (exam dates, deadlines), lecturers (class schedules,
 * result release), HR managers (company holidays, onboarding), and admins.
 *
 * Scope rules (evaluated in route layer):
 *   - targetRoles empty array → visible to everyone in the company
 *   - targetRoles non-empty  → only visible to users whose role is listed
 *   - course set             → only visible to enrolled students + staff
 *   - department set         → only visible to users in that department
 *
 * Recurrence:
 *   Simple repeating events (daily / weekly / monthly).
 *   No RRULE expansion is stored — the client renders repeating instances.
 *   recurrenceEndDate bounds the series.
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const EVENT_TYPES = Object.freeze([
  "exam",
  "assignment_deadline",
  "holiday",
  "class",
  "meeting",
  "registration",
  "result_release",
  "announcement",
  "other",
]);

const RECURRENCE_PATTERNS = Object.freeze(["daily", "weekly", "monthly"]);

const calendarEventSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },

    // ── Content ───────────────────────────────────────────────────────────
    title: {
      type:      String,
      required:  true,
      trim:      true,
      maxlength: 200,
    },
    description: { type: String, default: "", trim: true },
    type: {
      type:    String,
      enum:    EVENT_TYPES,
      default: "other",
      index:   true,
    },
    location: { type: String, default: "", trim: true, maxlength: 200 },
    color:    { type: String, default: "#6366f1", trim: true },

    // ── Time ──────────────────────────────────────────────────────────────
    startDate: { type: Date, required: true },
    endDate:   { type: Date, required: true },
    allDay:    { type: Boolean, default: false },

    // ── Scope ─────────────────────────────────────────────────────────────
    // Optional: link to a specific course (course-level event)
    course: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "Course",
      default: null,
      index:   true,
    },
    // Optional: restrict to a department
    department: { type: String, default: null, trim: true },
    // Optional: restrict to specific roles; empty = everyone
    targetRoles: { type: [String], default: [] },

    // ── Recurrence (simple) ───────────────────────────────────────────────
    isRecurring:        { type: Boolean, default: false },
    recurrencePattern:  { type: String, enum: [...RECURRENCE_PATTERNS, null], default: null },
    recurrenceEndDate:  { type: Date, default: null },

    // ── Authorship ────────────────────────────────────────────────────────
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// ── Indexes ────────────────────────────────────────────────────────────────

// Primary query: events in a date range for a company
calendarEventSchema.index({ company: 1, startDate: 1, endDate: 1 });
// Course-scoped event listing
calendarEventSchema.index({ company: 1, course: 1, startDate: 1 });
// Type filter + date ordering
calendarEventSchema.index({ company: 1, type: 1, startDate: 1 });

const CalendarEvent = mongoose.model("CalendarEvent", calendarEventSchema);
module.exports = CalendarEvent;
module.exports.EVENT_TYPES         = EVENT_TYPES;
module.exports.RECURRENCE_PATTERNS = RECURRENCE_PATTERNS;

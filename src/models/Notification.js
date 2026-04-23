"use strict";

/**
 * Notification
 *
 * In-app, per-user notification.  Distinct from Announcement (broadcast
 * to a whole company) — a Notification is targeted at a single recipient.
 *
 * Design:
 *  - Append-only: never updated except for `isRead` / `readAt`.
 *  - TTL index removes old notifications automatically (default 90 days).
 *  - `data` is a Mixed bag for deep links and extra payload that the
 *    front-end can use to navigate to the relevant resource.
 *  - `notificationService.js` is the only writer; routes are read-only
 *    from the recipient's perspective (mark-read, dismiss).
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Notification types
// ---------------------------------------------------------------------------

const NOTIFICATION_TYPES = Object.freeze({
  // Leave
  LEAVE_REQUESTED:     "leave_requested",      // → manager/admin
  LEAVE_APPROVED:      "leave_approved",        // → employee
  LEAVE_REJECTED:      "leave_rejected",        // → employee
  LEAVE_CANCELLED:     "leave_cancelled",       // → manager/admin

  // Attendance
  ATTENDANCE_OVERRIDDEN: "attendance_overridden",  // → employee
  LATE_CLOCK_IN:         "late_clock_in",          // → employee / manager

  // Academic: assignments
  ASSIGNMENT_PUBLISHED:  "assignment_published",   // → enrolled students
  ASSIGNMENT_SUBMITTED:  "assignment_submitted",   // → lecturer
  ASSIGNMENT_GRADED:     "assignment_graded",      // → student
  ASSIGNMENT_RETURNED:   "assignment_returned",    // → student (revision requested)
  ASSIGNMENT_DUE_SOON:   "assignment_due_soon",    // → student (reminder)

  // Academic: quizzes
  QUIZ_PUBLISHED:        "quiz_published",         // → enrolled students
  QUIZ_RESULT_RELEASED:  "quiz_result_released",   // → student
  QUIZ_VIOLATION:        "quiz_violation",         // → lecturer (proctoring event)

  // Academic: general
  GRADE_RELEASED:        "grade_released",         // → student (gradebook update)
  ENROLLMENT_ADDED:      "enrollment_added",       // → student (added to course)
  ENROLLMENT_REMOVED:    "enrollment_removed",     // → student (removed from course)

  // System / admin
  ANNOUNCEMENT:          "announcement",           // cross-mode broadcast
  SYSTEM:                "system",                 // platform-level message
  SUBSCRIPTION_EXPIRING: "subscription_expiring",  // → admin
  SUBSCRIPTION_EXPIRED:  "subscription_expired",   // → admin
  ROLE_CHANGED:          "role_changed",           // → affected user
  PASSWORD_RESET:        "password_reset",         // → user
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const notificationSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────────
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },

    // ── Target user ───────────────────────────────────────────────────────────
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient is required"],
      index: true,
    },

    // ── Content ───────────────────────────────────────────────────────────────
    type: {
      type: String,
      enum: Object.values(NOTIFICATION_TYPES),
      required: [true, "Notification type is required"],
      index: true,
    },
    title: {
      type: String,
      trim: true,
      required: [true, "Title is required"],
    },
    body: {
      type: String,
      trim: true,
      default: "",
    },

    // Optional deep-link path within the SPA (e.g. "/assignments/abc123")
    link: {
      type: String,
      trim: true,
      default: null,
    },

    // Extra payload for the front-end (resourceId, resourceType, etc.)
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ── Read state ────────────────────────────────────────────────────────────
    isRead:  { type: Boolean, default: false, index: true },
    readAt:  { type: Date,    default: null },

    // ── TTL ───────────────────────────────────────────────────────────────────
    expiresAt: {
      type: Date,
      default: () => {
        const days = parseInt(process.env.NOTIFICATION_TTL_DAYS || "90", 10);
        return new Date(Date.now() + days * 86_400_000);
      },
    },
  },
  {
    timestamps: true,
    versionKey: false, // notifications are append-only; no version needed
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Primary inbox query: all unread for a recipient, newest first
notificationSchema.index({ company: 1, recipient: 1, isRead: 1, createdAt: -1 });

// Pagination without isRead filter
notificationSchema.index({ company: 1, recipient: 1, createdAt: -1 });

// TTL — MongoDB auto-deletes expired notifications
notificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "notification_ttl" }
);

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const Notification = mongoose.model("Notification", notificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;

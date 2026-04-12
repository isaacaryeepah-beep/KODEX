"use strict";

/**
 * AuditLog
 *
 * Immutable record of every security-relevant and data-changing action
 * performed inside KODEX. Records are never updated or deleted — only
 * appended. Companywide isolation is enforced via the `company` field.
 *
 * Design decisions:
 *  - TTL index on `createdAt` keeps storage bounded (configurable per env).
 *  - `changes` stores before/after snapshots for UPDATE actions so diffs
 *    can be rendered in the admin audit viewer.
 *  - `severity` lets the UI surface critical events at a glance.
 *  - Denormalized `actorName` and `actorRole` ensure the log is readable
 *    even after the original User document is deleted/anonymised.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AUDIT_ACTIONS = Object.freeze({
  // Auth
  LOGIN:               "LOGIN",
  LOGOUT:              "LOGOUT",
  LOGIN_FAILED:        "LOGIN_FAILED",
  PASSWORD_RESET:      "PASSWORD_RESET",
  PASSWORD_CHANGED:    "PASSWORD_CHANGED",
  TWO_FA_ENABLED:      "TWO_FA_ENABLED",
  TWO_FA_DISABLED:     "TWO_FA_DISABLED",
  ACCOUNT_SUSPENDED:   "ACCOUNT_SUSPENDED",
  ACCOUNT_REACTIVATED: "ACCOUNT_REACTIVATED",

  // CRUD
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  BULK_DELETE: "BULK_DELETE",

  // Access
  VIEW_SENSITIVE:  "VIEW_SENSITIVE",
  EXPORT:          "EXPORT",
  DOWNLOAD:        "DOWNLOAD",
  ACCESS_DENIED:   "ACCESS_DENIED",

  // Workflow
  APPROVE:   "APPROVE",
  REJECT:    "REJECT",
  SUBMIT:    "SUBMIT",
  PUBLISH:   "PUBLISH",
  UNPUBLISH: "UNPUBLISH",
  ARCHIVE:   "ARCHIVE",

  // Academic
  QUIZ_STARTED:       "QUIZ_STARTED",
  QUIZ_SUBMITTED:     "QUIZ_SUBMITTED",
  QUIZ_VIOLATION:     "QUIZ_VIOLATION",
  GRADE_RELEASED:     "GRADE_RELEASED",
  ENROLLMENT_ADDED:   "ENROLLMENT_ADDED",
  ENROLLMENT_REMOVED: "ENROLLMENT_REMOVED",

  // Corporate
  CLOCK_IN:          "CLOCK_IN",
  CLOCK_OUT:         "CLOCK_OUT",
  LEAVE_REQUESTED:   "LEAVE_REQUESTED",
  LEAVE_APPROVED:    "LEAVE_APPROVED",
  LEAVE_REJECTED:    "LEAVE_REJECTED",
  ATTENDANCE_EDITED: "ATTENDANCE_EDITED",
  PAYROLL_EXPORTED:  "PAYROLL_EXPORTED",

  // Settings
  BRANDING_UPDATED:  "BRANDING_UPDATED",
  SETTINGS_CHANGED:  "SETTINGS_CHANGED",
  ROLE_CHANGED:      "ROLE_CHANGED",
  SUBSCRIPTION_CHANGED: "SUBSCRIPTION_CHANGED",
});

const SEVERITY = Object.freeze({
  LOW:      "low",
  MEDIUM:   "medium",
  HIGH:     "high",
  CRITICAL: "critical",
});

// Severity mapping by action category — used in the static helper below.
const ACTION_SEVERITY_MAP = {
  LOGIN:               SEVERITY.LOW,
  LOGOUT:              SEVERITY.LOW,
  LOGIN_FAILED:        SEVERITY.MEDIUM,
  PASSWORD_RESET:      SEVERITY.HIGH,
  PASSWORD_CHANGED:    SEVERITY.HIGH,
  TWO_FA_ENABLED:      SEVERITY.HIGH,
  TWO_FA_DISABLED:     SEVERITY.HIGH,
  ACCOUNT_SUSPENDED:   SEVERITY.CRITICAL,
  ACCOUNT_REACTIVATED: SEVERITY.HIGH,
  CREATE:              SEVERITY.LOW,
  UPDATE:              SEVERITY.LOW,
  DELETE:              SEVERITY.HIGH,
  BULK_DELETE:         SEVERITY.CRITICAL,
  VIEW_SENSITIVE:      SEVERITY.MEDIUM,
  EXPORT:              SEVERITY.MEDIUM,
  DOWNLOAD:            SEVERITY.LOW,
  ACCESS_DENIED:       SEVERITY.MEDIUM,
  APPROVE:             SEVERITY.LOW,
  REJECT:              SEVERITY.LOW,
  PUBLISH:             SEVERITY.LOW,
  UNPUBLISH:           SEVERITY.LOW,
  ARCHIVE:             SEVERITY.LOW,
  QUIZ_VIOLATION:      SEVERITY.HIGH,
  GRADE_RELEASED:      SEVERITY.LOW,
  ATTENDANCE_EDITED:   SEVERITY.HIGH,
  PAYROLL_EXPORTED:    SEVERITY.HIGH,
  BRANDING_UPDATED:    SEVERITY.MEDIUM,
  SETTINGS_CHANGED:    SEVERITY.MEDIUM,
  ROLE_CHANGED:        SEVERITY.CRITICAL,
  SUBSCRIPTION_CHANGED: SEVERITY.CRITICAL,
};

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const auditLogSchema = new mongoose.Schema(
  {
    // Tenant isolation — every log entry belongs to exactly one company.
    // Null only for platform-level superadmin actions.
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
      index: true,
    },

    // Who performed the action.
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    // Denormalized so the log is readable if actor is later deleted.
    actorName: { type: String, default: "System" },
    actorRole: { type: String, default: null },
    actorEmail: { type: String, default: null },

    // What happened.
    action: {
      type: String,
      enum: Object.values(AUDIT_ACTIONS),
      required: [true, "Audit action is required"],
      index: true,
    },

    // What resource was affected.
    resource: {
      type: String,
      trim: true,
      required: [true, "Audit resource type is required"],
      // e.g. "User", "Course", "LeaveRequest", "NormalQuiz"
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // Human-readable description of the resource (name/title at time of log).
    resourceLabel: {
      type: String,
      trim: true,
      default: null,
    },

    // For UPDATE actions: { before: {…}, after: {…} }.
    // Sensitive fields (password, tokens) must be stripped before storing.
    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Free-form context data (reason, notes, extra IDs, etc.).
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // Platform mode in which the action occurred.
    mode: {
      type: String,
      enum: ["academic", "corporate", "system", null],
      default: null,
    },

    // Event severity — derived automatically if not provided.
    severity: {
      type: String,
      enum: Object.values(SEVERITY),
      default: SEVERITY.LOW,
      index: true,
    },

    // Request metadata — helps with forensic analysis.
    ipAddress:     { type: String, default: null },
    userAgent:     { type: String, default: null },
    requestPath:   { type: String, default: null },
    requestMethod: { type: String, default: null },
    statusCode:    { type: Number, default: null },
  },
  {
    timestamps: true,
    // Disable _v — audit logs are append-only and never updated.
    versionKey: false,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Primary query pattern: all logs for a company in time range.
auditLogSchema.index({ company: 1, createdAt: -1 });

// Filter by actor within a company.
auditLogSchema.index({ company: 1, actor: 1, createdAt: -1 });

// Filter by resource type + id (e.g. full history of a leave request).
auditLogSchema.index({ company: 1, resource: 1, resourceId: 1 });

// Security dashboard: filter high/critical events.
auditLogSchema.index({ company: 1, severity: 1, createdAt: -1 });

// Action-type filter (e.g. "all exports in last 30 days").
auditLogSchema.index({ company: 1, action: 1, createdAt: -1 });

// TTL: automatically delete log entries older than the configured retention
// period. Default is 365 days. Override with AUDIT_LOG_TTL_DAYS env var.
const RETENTION_SECONDS = parseInt(process.env.AUDIT_LOG_TTL_DAYS || "365", 10) * 86400;
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: RETENTION_SECONDS });

// ---------------------------------------------------------------------------
// Pre-save: auto-derive severity if not set by caller.
// ---------------------------------------------------------------------------

auditLogSchema.pre("save", function (next) {
  if (!this.severity || this.severity === SEVERITY.LOW) {
    this.severity = ACTION_SEVERITY_MAP[this.action] || SEVERITY.LOW;
  }
  next();
});

// ---------------------------------------------------------------------------
// Statics
// ---------------------------------------------------------------------------

/**
 * Convenience factory — build and save a log entry in one call.
 *
 * Usage:
 *   await AuditLog.record({
 *     company: req.user.company,
 *     actor:   req.user,
 *     action:  AUDIT_ACTIONS.UPDATE,
 *     resource: "LeaveRequest",
 *     resourceId: leave._id,
 *     resourceLabel: `Leave #${leave._id}`,
 *     changes: { before: { status: "pending" }, after: { status: "approved" } },
 *     req,       // optional Express request object for IP/UA
 *   });
 */
auditLogSchema.statics.record = async function ({
  company = null,
  actor = null,
  action,
  resource,
  resourceId = null,
  resourceLabel = null,
  changes = null,
  metadata = null,
  mode = null,
  severity = null,
  req = null,
} = {}) {
  const entry = {
    company,
    actor:         actor?._id || actor,
    actorName:     actor?.name  || "System",
    actorRole:     actor?.role  || null,
    actorEmail:    actor?.email || null,
    action,
    resource,
    resourceId,
    resourceLabel,
    changes,
    metadata,
    mode,
    severity:      severity || ACTION_SEVERITY_MAP[action] || SEVERITY.LOW,
    ipAddress:     req?.ip             || req?.headers?.["x-forwarded-for"] || null,
    userAgent:     req?.headers?.["user-agent"] || null,
    requestPath:   req?.originalUrl    || null,
    requestMethod: req?.method         || null,
  };

  // Fire-and-forget: audit logging must never break the main request.
  return this.create(entry).catch((err) => {
    console.error("[AuditLog] Failed to write audit entry:", err.message);
  });
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

module.exports = AuditLog;
module.exports.AUDIT_ACTIONS = AUDIT_ACTIONS;
module.exports.SEVERITY       = SEVERITY;

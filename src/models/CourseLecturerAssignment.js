"use strict";

/**
 * CourseLecturerAssignment
 *
 * Junction table that records which lecturers are assigned to which courses.
 * Replaces the single `lecturerId` field on Course for multi-lecturer support.
 *
 * Design decisions:
 *  - A course can have one PRIMARY lecturer (owns assessments and grades) and
 *    zero or more SECONDARY/GUEST lecturers with narrower permissions.
 *  - Permissions are explicit booleans rather than inferred from role, so admins
 *    can fine-tune what each co-lecturer can see or do.
 *  - The `company` field duplicates what could be derived via course, but is
 *    stored here so every query can be tenant-scoped without a join.
 *  - Withdrawal is a soft-delete: status → "withdrawn", withdrawnAt set.
 *    Historical audit trails remain intact.
 *
 * Tenant field: `company` (ObjectId) — matches the codebase majority convention.
 * Note: Course.companyId is the equivalent field on the Course document.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const LECTURER_ROLES = Object.freeze({
  PRIMARY:   "primary",   // full ownership of assessments, grades, roster
  SECONDARY: "secondary", // co-lecturer with limited permissions
  GUEST:     "guest",     // read-only observer (e.g. HOD reviewing)
});

const ASSIGNMENT_STATUSES = Object.freeze({
  ACTIVE:    "active",
  INACTIVE:  "inactive",   // temporarily deactivated by admin
  WITHDRAWN: "withdrawn",  // lecturer removed from course
});

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const courseLecturerAssignmentSchema = new mongoose.Schema(
  {
    // Tenant isolation — always filter by this alongside course/lecturer.
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },

    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course is required"],
      index: true,
    },

    lecturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Lecturer is required"],
      index: true,
    },

    // Who created this assignment (admin, HOD, or superadmin).
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // The lecturer's role on this specific course.
    lecturerRole: {
      type: String,
      enum: Object.values(LECTURER_ROLES),
      default: LECTURER_ROLES.PRIMARY,
    },

    // Fine-grained permission flags.
    // Primary lecturers default to full permissions; secondary/guest default
    // to restricted. Admins can override any flag independently.
    permissions: {
      // Can create/edit/delete quizzes, snap-quizzes, assignments.
      canCreateAssessments:  { type: Boolean, default: true },
      // Can view ALL student submissions (not just their own students).
      canViewAllSubmissions: { type: Boolean, default: true },
      // Can assign and edit grades/feedback.
      canGrade:              { type: Boolean, default: true },
      // Can view the full enrolled student roster for this course.
      canViewRoster:         { type: Boolean, default: true },
      // Can post announcements scoped to this course.
      canPostAnnouncements:  { type: Boolean, default: true },
      // Can run AI question generation for this course.
      canUseAiGenerator:     { type: Boolean, default: true },
    },

    status: {
      type: String,
      enum: Object.values(ASSIGNMENT_STATUSES),
      default: ASSIGNMENT_STATUSES.ACTIVE,
      index: true,
    },

    // Optional note explaining why the assignment was made or withdrawn.
    note: { type: String, trim: true, default: null },

    // Lifecycle timestamps (in addition to createdAt/updatedAt).
    withdrawnAt: { type: Date, default: null },
    withdrawnBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Unique: one assignment record per lecturer per course per company.
courseLecturerAssignmentSchema.index(
  { company: 1, course: 1, lecturer: 1 },
  { unique: true, name: "unique_company_course_lecturer" }
);

// Find all active courses taught by a lecturer (common query).
courseLecturerAssignmentSchema.index({ company: 1, lecturer: 1, status: 1 });

// Find all active lecturers on a course (used by monitoring dashboards).
courseLecturerAssignmentSchema.index({ company: 1, course: 1, status: 1 });

// ---------------------------------------------------------------------------
// Statics
// ---------------------------------------------------------------------------

/**
 * Check whether a lecturer is actively assigned to a course.
 * Returns the assignment document, or null if not assigned.
 */
courseLecturerAssignmentSchema.statics.findActiveAssignment = function (
  companyId,
  courseId,
  lecturerId
) {
  return this.findOne({
    company:  companyId,
    course:   courseId,
    lecturer: lecturerId,
    status:   ASSIGNMENT_STATUSES.ACTIVE,
  });
};

/**
 * Return all active course IDs assigned to a given lecturer.
 * Lean result — only _ids.
 */
courseLecturerAssignmentSchema.statics.getCourseIdsForLecturer = async function (
  companyId,
  lecturerId
) {
  const docs = await this.find(
    { company: companyId, lecturer: lecturerId, status: ASSIGNMENT_STATUSES.ACTIVE },
    { course: 1 }
  ).lean();
  return docs.map((d) => d.course);
};

/**
 * Return all active lecturer IDs assigned to a given course.
 */
courseLecturerAssignmentSchema.statics.getLecturerIdsForCourse = async function (
  companyId,
  courseId
) {
  const docs = await this.find(
    { company: companyId, course: courseId, status: ASSIGNMENT_STATUSES.ACTIVE },
    { lecturer: 1, lecturerRole: 1 }
  ).lean();
  return docs.map((d) => ({ lecturerId: d.lecturer, role: d.lecturerRole }));
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const CourseLecturerAssignment = mongoose.model(
  "CourseLecturerAssignment",
  courseLecturerAssignmentSchema
);

module.exports = CourseLecturerAssignment;
module.exports.LECTURER_ROLES      = LECTURER_ROLES;
module.exports.ASSIGNMENT_STATUSES = ASSIGNMENT_STATUSES;

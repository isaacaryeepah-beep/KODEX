"use strict";

/**
 * StudentCourseEnrollment
 *
 * Junction table: tracks which students are enrolled in which courses.
 *
 * Design decisions:
 *  - Coexists with Course.enrolledStudents (legacy array) during transition.
 *    New code should use this model; existing code still works via the array.
 *  - `academicSnapshot` captures the student's programme/level/group at
 *    enrolment time. This is critical for audit: a student may later change
 *    group, but we need to know their classification when they took the course.
 *  - Status transitions: active → dropped | completed | suspended.
 *    Re-enrollment creates a new document rather than reactivating the old one,
 *    preserving the full history.
 *  - `finalGrade` is set by the lecturer after course completion.
 *
 * Tenant field: `company` (ObjectId) — matches codebase majority convention.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const ENROLLMENT_STATUSES = Object.freeze({
  ACTIVE:    "active",
  DROPPED:   "dropped",    // student withdrew mid-course
  COMPLETED: "completed",  // course finished, grade recorded
  SUSPENDED: "suspended",  // admin action
});

const ENROLLMENT_METHODS = Object.freeze({
  MANUAL:       "manual",       // admin/lecturer added individually
  SELF:         "self",         // student self-enrolled (if allowed)
  BULK_IMPORT:  "bulk_import",  // CSV or spreadsheet import
  ROSTER_SYNC:  "roster_sync",  // synced from StudentRoster model
  API:          "api",          // external integration
});

// ---------------------------------------------------------------------------
// Sub-schema: snapshot of student's academic classification at enrolment.
// ---------------------------------------------------------------------------

const academicSnapshotSchema = new mongoose.Schema(
  {
    programme:    { type: String, default: null }, // e.g. "HND", "BSc"
    level:        { type: String, default: null }, // e.g. "200"
    group:        { type: String, default: null }, // e.g. "A"
    sessionType:  { type: String, default: null }, // e.g. "Evening"
    semester:     { type: String, default: null }, // e.g. "1"
    department:   { type: String, default: null },
    academicYear: { type: String, default: null }, // e.g. "2024/2025"
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const studentCourseEnrollmentSchema = new mongoose.Schema(
  {
    // Tenant isolation.
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

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Student is required"],
      index: true,
    },

    // Who performed the enrollment action.
    enrolledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    enrollmentMethod: {
      type: String,
      enum: Object.values(ENROLLMENT_METHODS),
      default: ENROLLMENT_METHODS.MANUAL,
    },

    // Student classification at time of enrollment — never mutated after set.
    academicSnapshot: {
      type: academicSnapshotSchema,
      default: () => ({}),
    },

    status: {
      type: String,
      enum: Object.values(ENROLLMENT_STATUSES),
      default: ENROLLMENT_STATUSES.ACTIVE,
      index: true,
    },

    // Lifecycle timestamps.
    enrolledAt:   { type: Date, default: Date.now },
    droppedAt:    { type: Date, default: null },
    completedAt:  { type: Date, default: null },
    suspendedAt:  { type: Date, default: null },

    // Who changed the status (drop/complete/suspend).
    statusChangedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    statusChangeReason: { type: String, trim: true, default: null },

    // Final grade set by lecturer after course completion.
    // Stored here so it survives course archival.
    finalGrade: {
      score:       { type: Number, default: null },
      grade:       { type: String, default: null }, // e.g. "A", "B+", "Pass"
      gradedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
      gradedAt:    { type: Date, default: null },
      remarks:     { type: String, trim: true, default: null },
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------

// Unique: one enrollment per student per course per company.
// Re-enrollment after dropping creates a new document.
studentCourseEnrollmentSchema.index(
  { company: 1, course: 1, student: 1, status: 1 },
  { name: "enrollment_company_course_student_status" }
);

// Hard unique on active enrollments — a student cannot be actively enrolled twice.
studentCourseEnrollmentSchema.index(
  { company: 1, course: 1, student: 1 },
  {
    unique: true,
    partialFilterExpression: { status: ENROLLMENT_STATUSES.ACTIVE },
    name: "unique_active_enrollment",
  }
);

// All active enrollments for a student (used to build their course list).
studentCourseEnrollmentSchema.index({ company: 1, student: 1, status: 1 });

// All active enrollments for a course (used to build the class roster).
studentCourseEnrollmentSchema.index({ company: 1, course: 1, status: 1 });

// ---------------------------------------------------------------------------
// Statics
// ---------------------------------------------------------------------------

/**
 * Check whether a student is actively enrolled in a course.
 * Returns the enrollment document, or null.
 */
studentCourseEnrollmentSchema.statics.findActiveEnrollment = function (
  companyId,
  courseId,
  studentId
) {
  return this.findOne({
    company: companyId,
    course:  courseId,
    student: studentId,
    status:  ENROLLMENT_STATUSES.ACTIVE,
  });
};

/**
 * Return all active course IDs for a student.
 */
studentCourseEnrollmentSchema.statics.getCourseIdsForStudent = async function (
  companyId,
  studentId
) {
  const docs = await this.find(
    { company: companyId, student: studentId, status: ENROLLMENT_STATUSES.ACTIVE },
    { course: 1 }
  ).lean();
  return docs.map((d) => d.course);
};

/**
 * Return all active student IDs enrolled in a course.
 */
studentCourseEnrollmentSchema.statics.getStudentIdsForCourse = async function (
  companyId,
  courseId
) {
  const docs = await this.find(
    { company: companyId, course: courseId, status: ENROLLMENT_STATUSES.ACTIVE },
    { student: 1 }
  ).lean();
  return docs.map((d) => d.student);
};

/**
 * Capture the student's current academic classification as a snapshot.
 * Call this when creating the enrollment from the User document.
 */
studentCourseEnrollmentSchema.statics.buildSnapshot = function (user, course) {
  return {
    programme:    user.programme    || null,
    level:        user.studentLevel || null,
    group:        user.studentGroup || null,
    sessionType:  user.sessionType  || null,
    semester:     user.semester     || null,
    department:   user.department   || null,
    academicYear: course?.academicYear || null,
  };
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

const StudentCourseEnrollment = mongoose.model(
  "StudentCourseEnrollment",
  studentCourseEnrollmentSchema
);

module.exports = StudentCourseEnrollment;
module.exports.ENROLLMENT_STATUSES = ENROLLMENT_STATUSES;
module.exports.ENROLLMENT_METHODS  = ENROLLMENT_METHODS;

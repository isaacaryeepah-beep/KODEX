"use strict";

/**
 * academicScope.js
 *
 * Centralised helpers for academic scope enforcement.
 * Used by middleware and controllers to answer questions like:
 *   - "Is this lecturer assigned to this course?"
 *   - "Is this student enrolled in this course?"
 *   - "What courses can this lecturer see?"
 *   - "What courses can this student see?"
 *
 * Tenant note:
 *   Course uses `companyId`; CourseLecturerAssignment and
 *   StudentCourseEnrollment use `company`. Both represent the same Company
 *   ObjectId. All helpers accept the raw ObjectId and handle the field name
 *   difference internally.
 *
 * Caching:
 *   Per-request caching is NOT done here — callers should pass req.company
 *   and let requireCompanyScope handle the Company load. Query results for
 *   individual scope checks are cheap (indexed lookups); no in-process cache
 *   is needed.
 */

const mongoose = require("mongoose");

// Lazy-require to avoid circular deps at module load time.
const getCourse                 = () => require("../models/Course");
const getCourseLecturerAssign   = () => require("../models/CourseLecturerAssignment");
const getStudentCourseEnroll    = () => require("../models/StudentCourseEnrollment");

const { ResourceNotFoundError, TenantMismatchError } = require("./tenantScope");

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

class LecturerNotAssignedError extends Error {
  constructor(message = "You are not assigned to this course") {
    super(message);
    this.name = "LecturerNotAssignedError";
    this.statusCode = 403;
  }
}

class StudentNotEnrolledError extends Error {
  constructor(message = "You are not enrolled in this course") {
    super(message);
    this.name = "StudentNotEnrolledError";
    this.statusCode = 403;
  }
}

// ---------------------------------------------------------------------------
// Course helpers
// ---------------------------------------------------------------------------

/**
 * Load and validate a course belongs to the given company.
 * Uses Course.companyId (the field name used by the existing Course model).
 *
 * @param {ObjectId|string} courseId
 * @param {ObjectId|string} companyId
 * @returns {Promise<Document>} The Course document.
 * @throws ResourceNotFoundError if not found or wrong tenant.
 */
async function loadCourse(courseId, companyId) {
  if (!mongoose.Types.ObjectId.isValid(courseId)) {
    throw new ResourceNotFoundError("Course not found");
  }
  const Course = getCourse();
  const course = await Course.findOne({ _id: courseId, companyId });
  if (!course) throw new ResourceNotFoundError("Course not found");
  return course;
}

/**
 * Load a course and assert it is published and active.
 * Used for student-facing routes that must not expose draft courses.
 */
async function loadPublishedCourse(courseId, companyId) {
  const course = await loadCourse(courseId, companyId);
  if (!course.isPublished || !course.isActive) {
    throw new ResourceNotFoundError("Course not found");
  }
  return course;
}

// ---------------------------------------------------------------------------
// Lecturer scope helpers
// ---------------------------------------------------------------------------

/**
 * Assert a lecturer is actively assigned to a course.
 * Returns the CourseLecturerAssignment document.
 * Throws LecturerNotAssignedError (403) if not assigned.
 *
 * @param {ObjectId|string} lecturerId
 * @param {ObjectId|string} courseId
 * @param {ObjectId|string} companyId
 */
async function assertLecturerAssigned(lecturerId, courseId, companyId) {
  const CLA = getCourseLecturerAssign();
  const assignment = await CLA.findActiveAssignment(companyId, courseId, lecturerId);
  if (!assignment) {
    throw new LecturerNotAssignedError();
  }
  return assignment;
}

/**
 * Check (boolean) whether a lecturer is assigned to a course — no throw.
 */
async function isLecturerAssigned(lecturerId, courseId, companyId) {
  const CLA = getCourseLecturerAssign();
  const doc = await CLA.findActiveAssignment(companyId, courseId, lecturerId);
  return !!doc;
}

/**
 * Return all active course IDs for a lecturer.
 * Used to build scoped list queries ("show me all quizzes for my courses").
 */
async function getLecturerCourseIds(lecturerId, companyId) {
  const CLA = getCourseLecturerAssign();
  return CLA.getCourseIdsForLecturer(companyId, lecturerId);
}

/**
 * Build a Mongoose filter that limits results to courses the lecturer teaches.
 * The `courseField` parameter is the field name in the target model.
 *
 * @param {ObjectId|string} lecturerId
 * @param {ObjectId|string} companyId
 * @param {string} [courseField="course"] - Field name in the queried model.
 */
async function buildLecturerCourseFilter(lecturerId, companyId, courseField = "course") {
  const courseIds = await getLecturerCourseIds(lecturerId, companyId);
  return { [courseField]: { $in: courseIds } };
}

// ---------------------------------------------------------------------------
// Student enrollment helpers
// ---------------------------------------------------------------------------

/**
 * Assert a student is actively enrolled in a course.
 * Returns the StudentCourseEnrollment document.
 * Throws StudentNotEnrolledError (403) if not enrolled.
 */
async function assertStudentEnrolled(studentId, courseId, companyId) {
  const SCE = getStudentCourseEnroll();
  const enrollment = await SCE.findActiveEnrollment(companyId, courseId, studentId);
  if (!enrollment) {
    throw new StudentNotEnrolledError();
  }
  return enrollment;
}

/**
 * Check (boolean) whether a student is enrolled — no throw.
 */
async function isStudentEnrolled(studentId, courseId, companyId) {
  const SCE = getStudentCourseEnroll();
  const doc = await SCE.findActiveEnrollment(companyId, courseId, studentId);
  return !!doc;
}

/**
 * Return all active course IDs a student is enrolled in.
 */
async function getStudentCourseIds(studentId, companyId) {
  const SCE = getStudentCourseEnroll();
  return SCE.getCourseIdsForStudent(companyId, studentId);
}

/**
 * Build a Mongoose filter that limits results to courses the student is in.
 */
async function buildStudentCourseFilter(studentId, companyId, courseField = "course") {
  const courseIds = await getStudentCourseIds(studentId, companyId);
  return { [courseField]: { $in: courseIds } };
}

// ---------------------------------------------------------------------------
// Assessment visibility helpers
// ---------------------------------------------------------------------------

/**
 * Assert a student can see a specific assessment document.
 *
 * Checks (all must pass):
 *   1. Assessment belongs to the same company.
 *   2. Student is enrolled in the assessment's course.
 *   3. Assessment is published/active (if enforcePublished = true).
 *   4. Current time is within the assessment's window (if enforceWindow = true).
 *
 * @param {Document} assessment       - The assessment document (quiz/assignment/etc.)
 * @param {ObjectId|string} studentId
 * @param {ObjectId|string} companyId
 * @param {Object} [opts]
 * @param {boolean} [opts.enforcePublished=true]
 * @param {boolean} [opts.enforceWindow=false]  - Enforce startTime/endTime if present.
 * @param {string}  [opts.courseField="course"]  - Field name on the assessment doc.
 */
async function assertStudentCanAccessAssessment(
  assessment,
  studentId,
  companyId,
  { enforcePublished = true, enforceWindow = false, courseField = "course" } = {}
) {
  // Tenant check — assessment company field is `company` (standard convention).
  const assessmentCompany = assessment.company?.toString() || assessment.companyId?.toString();
  if (assessmentCompany !== companyId.toString()) {
    throw new TenantMismatchError("Assessment does not belong to this organisation");
  }

  // Enrollment check.
  const courseId = assessment[courseField];
  await assertStudentEnrolled(studentId, courseId, companyId);

  // Published check.
  if (enforcePublished && assessment.isPublished === false) {
    throw new ResourceNotFoundError("Assessment not found");
  }
  if (enforcePublished && assessment.isActive === false) {
    throw new ResourceNotFoundError("Assessment not found");
  }

  // Time window check (for SnapQuiz / timed assessments).
  if (enforceWindow) {
    const now = new Date();
    if (assessment.startTime && now < assessment.startTime) {
      throw new ResourceNotFoundError("Assessment has not started yet");
    }
    if (assessment.endTime && now > assessment.endTime) {
      throw new ResourceNotFoundError("Assessment has ended");
    }
  }
}

/**
 * Assert a lecturer owns an assessment AND is assigned to its course.
 *
 * @param {Document} assessment
 * @param {ObjectId|string} lecturerId
 * @param {ObjectId|string} companyId
 * @param {string} [courseField="course"]
 */
async function assertLecturerOwnsAssessment(
  assessment,
  lecturerId,
  companyId,
  courseField = "course"
) {
  // Ownership: createdBy must match.
  const creator = assessment.createdBy?.toString();
  if (creator !== lecturerId.toString()) {
    throw new LecturerNotAssignedError(
      "You do not have permission to access this assessment"
    );
  }

  // Course assignment: lecturer must still be assigned to the course.
  const courseId = assessment[courseField];
  await assertLecturerAssigned(lecturerId, courseId, companyId);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  // Error classes
  LecturerNotAssignedError,
  StudentNotEnrolledError,

  // Course loaders
  loadCourse,
  loadPublishedCourse,

  // Lecturer helpers
  assertLecturerAssigned,
  isLecturerAssigned,
  getLecturerCourseIds,
  buildLecturerCourseFilter,

  // Student helpers
  assertStudentEnrolled,
  isStudentEnrolled,
  getStudentCourseIds,
  buildStudentCourseFilter,

  // Assessment visibility
  assertStudentCanAccessAssessment,
  assertLecturerOwnsAssessment,
};

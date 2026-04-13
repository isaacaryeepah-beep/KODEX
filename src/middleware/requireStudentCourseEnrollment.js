"use strict";

/**
 * requireStudentCourseEnrollment
 *
 * Verifies that the authenticated student is actively enrolled in the course
 * referenced in the current request.
 *
 * Depends on:
 *   - authenticate        (req.user populated)
 *   - requireCompanyScope (req.companyId populated)
 *
 * Course ID resolution order (first match wins):
 *   1. req.params.courseId
 *   2. req.params.id
 *   3. req.body.courseId | req.body.course
 *   4. req.query.courseId
 *
 * On success, attaches to req:
 *   req.course      — the Course document
 *   req.enrollment  — the StudentCourseEnrollment document
 *
 * Admin / superadmin / lecturer bypass:
 *   admin and superadmin skip enrollment checks.
 *   lecturer also skips if `allowLecturer` option is true (e.g. preview routes).
 *
 * Usage
 * ─────
 *   // Standard: student must be enrolled.
 *   router.get(
 *     "/courses/:courseId/assessments",
 *     authenticate,
 *     requireCompanyScope,
 *     requireStudentCourseEnrollment,
 *     listAssessmentsHandler
 *   );
 *
 *   // Lecturer can also preview: pass allowLecturer option.
 *   router.get(
 *     "/courses/:courseId/preview",
 *     authenticate,
 *     requireCompanyScope,
 *     requireStudentCourseEnrollment({ allowLecturer: true }),
 *     previewHandler
 *   );
 */

const {
  assertStudentEnrolled,
  loadCourse,
  loadPublishedCourse,
  StudentNotEnrolledError,
} = require("../utils/academicScope");

const { ResourceNotFoundError } = require("../utils/tenantScope");

// ---------------------------------------------------------------------------
// Helper: extract course ID from request
// ---------------------------------------------------------------------------

function extractCourseId(req) {
  return (
    req.params?.courseId ||
    req.params?.id       ||
    req.body?.courseId   ||
    req.body?.course     ||
    req.query?.courseId  ||
    null
  );
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const requireStudentCourseEnrollment = (options = {}) => {
  const getCourseId    = options.getCourseId    || extractCourseId;
  const allowLecturer  = options.allowLecturer  || false;
  // When true, the course must also be published (student-facing default).
  const requirePublished = options.requirePublished !== false; // default true

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const courseId  = getCourseId(req);
      const companyId = req.companyId || req.user.company;

      if (!courseId) {
        return res.status(400).json({ error: "Course ID is required" });
      }

      // Load course — students only see published courses.
      let course;
      try {
        course = requirePublished
          ? await loadPublishedCourse(courseId, companyId)
          : await loadCourse(courseId, companyId);
      } catch (err) {
        if (err instanceof ResourceNotFoundError) {
          return res.status(404).json({ error: err.message });
        }
        throw err;
      }

      req.course = course;

      // Admin/superadmin: full access, no enrollment check.
      if (req.user.role === "superadmin" || req.user.role === "admin") {
        req.enrollment = null;
        return next();
      }

      // Lecturer: optional bypass for preview/read-only routes.
      if (allowLecturer && req.user.role === "lecturer") {
        req.enrollment = null;
        return next();
      }

      // Students must be enrolled.
      let enrollment;
      try {
        enrollment = await assertStudentEnrolled(
          req.user._id,
          courseId,
          companyId
        );
      } catch (err) {
        if (err instanceof StudentNotEnrolledError) {
          return res.status(403).json({ error: err.message });
        }
        throw err;
      }

      req.enrollment = enrollment;
      next();
    } catch (err) {
      console.error("[requireStudentCourseEnrollment]", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
};

// ---------------------------------------------------------------------------
// Default export — usable directly as middleware.
// ---------------------------------------------------------------------------

const defaultMiddleware = requireStudentCourseEnrollment();

module.exports = defaultMiddleware;
module.exports.requireStudentCourseEnrollment = requireStudentCourseEnrollment;

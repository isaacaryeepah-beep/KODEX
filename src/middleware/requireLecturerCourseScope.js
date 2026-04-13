"use strict";

/**
 * requireLecturerCourseScope
 *
 * Verifies that the authenticated lecturer is actively assigned to the course
 * referenced in the current request.
 *
 * Depends on:
 *   - authenticate        (req.user populated)
 *   - requireCompanyScope (req.companyId populated)
 *
 * Course ID resolution order (first match wins):
 *   1. req.params.courseId
 *   2. req.params.id  (when the route param IS the course)
 *   3. req.body.courseId | req.body.course
 *   4. req.query.courseId
 *
 * On success, attaches to req:
 *   req.course          — the Course document
 *   req.lecturerAssignment — the CourseLecturerAssignment document
 *
 * Admin / superadmin bypass:
 *   Users with role "admin" or "superadmin" skip the assignment check but still
 *   have the course loaded and validated for their company.
 *
 * Usage
 * ─────
 *   router.use(authenticate, requireCompanyScope, requireLecturerCourseScope);
 *
 *   // Or with explicit course ID extractor:
 *   router.post(
 *     "/quizzes",
 *     authenticate,
 *     requireCompanyScope,
 *     requireLecturerCourseScope,
 *     createQuizHandler
 *   );
 */

const {
  assertLecturerAssigned,
  loadCourse,
  LecturerNotAssignedError,
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
// Factory: requireLecturerCourseScope
//
// The factory form allows callers to override the course ID extractor,
// which is needed for routes where the course is nested differently.
//
//   router.use(authenticate, requireCompanyScope,
//     requireLecturerCourseScope({ getCourseId: (req) => req.params.cid })
//   );
// ---------------------------------------------------------------------------

const requireLecturerCourseScope = (options = {}) => {
  const getCourseId = options.getCourseId || extractCourseId;
  // When true, attach the course but don't enforce assignment (read-only preview).
  const readOnly    = options.readOnly    || false;

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

      // Load and tenant-verify the course.
      let course;
      try {
        course = await loadCourse(courseId, companyId);
      } catch (err) {
        if (err instanceof ResourceNotFoundError) {
          return res.status(404).json({ error: err.message });
        }
        throw err;
      }

      req.course = course;

      // Admin/superadmin bypass — can access any course in their company.
      if (req.user.role === "superadmin" || req.user.role === "admin") {
        req.lecturerAssignment = null;
        return next();
      }

      // Lecturers must be assigned to the course.
      if (!readOnly) {
        let assignment;
        try {
          assignment = await assertLecturerAssigned(
            req.user._id,
            courseId,
            companyId
          );
        } catch (err) {
          if (err instanceof LecturerNotAssignedError) {
            return res.status(403).json({ error: err.message });
          }
          throw err;
        }
        req.lecturerAssignment = assignment;
      }

      next();
    } catch (err) {
      console.error("[requireLecturerCourseScope]", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  };
};

// ---------------------------------------------------------------------------
// Default export: middleware usable directly without calling the factory.
// Equivalent to requireLecturerCourseScope() with default options.
// ---------------------------------------------------------------------------

const defaultMiddleware = requireLecturerCourseScope();

module.exports = defaultMiddleware;
module.exports.requireLecturerCourseScope = requireLecturerCourseScope;

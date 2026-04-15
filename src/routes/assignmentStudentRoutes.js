"use strict";

/**
 * assignmentStudentRoutes
 *
 * Mounted at: /api/student/assignments  (registered in server.js)
 *
 * Route summary
 * ─────────────
 * Discovery
 *   GET  /courses/:courseId/assignments             listAssignments
 *   GET  /assignments/:assignmentId                 getAssignment
 *
 * Submission lifecycle
 *   POST /assignments/:assignmentId/submissions     submit
 *   PUT  /assignments/:assignmentId/submissions/draft  saveDraft
 *   GET  /assignments/:assignmentId/submissions        listMySubmissions
 *   GET  /assignments/:assignmentId/submissions/:submissionId  getSubmission
 */

const express = require("express");
const router  = express.Router();

const authenticate             = require("../middleware/auth");
const { requireCompanyScope }  = require("../middleware/requireCompanyScope");
const { studentOnly }          = require("../middleware/requireAcademicRole");
const {
  requireStudentCourseEnrollment,
} = require("../middleware/requireStudentCourseEnrollment");
const ctrl = require("../controllers/assignmentStudentController");

// ─── Router-level middleware ──────────────────────────────────────────────────

router.use(authenticate);
router.use(requireCompanyScope);
router.use(studentOnly);

// ─── Enrollment guard for course-scoped routes ────────────────────────────────

const enrolledInCourse = requireStudentCourseEnrollment({
  getCourseId: (req) => req.params.courseId,
});

// ─── Discovery ────────────────────────────────────────────────────────────────

router.get("/courses/:courseId/assignments", enrolledInCourse, ctrl.listAssignments);
router.get("/assignments/:assignmentId",     ctrl.getAssignment);

// ─── Submission lifecycle ─────────────────────────────────────────────────────

// /draft must come before /:submissionId to avoid conflict.
router.put( "/assignments/:assignmentId/submissions/draft",             ctrl.saveDraft);
router.post("/assignments/:assignmentId/submissions",                   ctrl.submit);
router.get( "/assignments/:assignmentId/submissions",                   ctrl.listMySubmissions);
router.get( "/assignments/:assignmentId/submissions/:submissionId",     ctrl.getSubmission);

module.exports = router;

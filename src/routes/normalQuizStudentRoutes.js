"use strict";

/**
 * normalQuizStudentRoutes
 *
 * Mounted at: /api/student/normal-quizzes  (register in server.js)
 *
 * Middleware chain at router level:
 *   authenticate → requireCompanyScope → requireAcademicRole("student")
 *
 * Additional per-route middleware:
 *   requireStudentCourseEnrollment — verifies course enrollment where courseId is present.
 *
 * Route summary
 * ─────────────
 * Quiz discovery
 *   GET  /courses/:courseId/quizzes      listQuizzes
 *   GET  /quizzes/:quizId                getQuiz
 *
 * Attempt lifecycle
 *   POST /quizzes/:quizId/attempts/start                       startAttempt
 *   PUT  /quizzes/:quizId/attempts/:attemptId/responses        saveResponses
 *   POST /quizzes/:quizId/attempts/:attemptId/submit           submitAttempt
 *
 * Results & review
 *   GET  /quizzes/:quizId/result                               getResult
 *   GET  /quizzes/:quizId/attempts/:attemptId/review           reviewAttempt
 *
 * Passive anti-cheat event logging
 *   POST /quizzes/:quizId/attempts/:attemptId/events           logEvents
 */

const express = require("express");
const router  = express.Router();

const authenticate             = require("../middleware/auth");
const { requireCompanyScope }  = require("../middleware/requireCompanyScope");
const { studentOnly }          = require("../middleware/requireAcademicRole");
const {
  requireStudentCourseEnrollment,
} = require("../middleware/requireStudentCourseEnrollment");
const ctrl = require("../controllers/normalQuizStudentController");

// ─── Router-level middleware ──────────────────────────────────────────────────

router.use(authenticate);
router.use(requireCompanyScope);
router.use(studentOnly);

// ─── Enrollment guard for course-scoped routes ────────────────────────────────

const enrolledInCourse = requireStudentCourseEnrollment({
  getCourseId: (req) => req.params.courseId,
});

// ─── Quiz discovery ───────────────────────────────────────────────────────────

router.get("/courses/:courseId/quizzes", enrolledInCourse, ctrl.listQuizzes);
router.get("/quizzes/:quizId",           ctrl.getQuiz);

// ─── Attempt lifecycle ────────────────────────────────────────────────────────

router.post("/quizzes/:quizId/attempts/start",                    ctrl.startAttempt);
router.put( "/quizzes/:quizId/attempts/:attemptId/responses",     ctrl.saveResponses);
router.post("/quizzes/:quizId/attempts/:attemptId/submit",        ctrl.submitAttempt);

// ─── Results & review ─────────────────────────────────────────────────────────

router.get("/quizzes/:quizId/result",                             ctrl.getResult);
router.get("/quizzes/:quizId/attempts/:attemptId/review",         ctrl.reviewAttempt);

// ─── Passive anti-cheat event logging ────────────────────────────────────────

router.post("/quizzes/:quizId/attempts/:attemptId/events",        ctrl.logEvents);

module.exports = router;

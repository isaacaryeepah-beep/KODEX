"use strict";

/**
 * snapQuizStudentRoutes
 *
 * Mounted at: /api/student/snap-quizzes  (registered in server.js)
 *
 * Route summary
 * ─────────────
 * Quiz discovery
 *   GET  /courses/:courseId/quizzes              listQuizzes
 *   GET  /quizzes/:quizId                        getQuiz
 *
 * Attempt lifecycle
 *   POST /quizzes/:quizId/attempts/start                          startAttempt
 *   POST /quizzes/:quizId/attempts/:attemptId/heartbeat           heartbeat
 *   PUT  /quizzes/:quizId/attempts/:attemptId/responses           saveResponses
 *   POST /quizzes/:quizId/attempts/:attemptId/submit              submitAttempt
 *
 * Single-question fetch
 *   GET  /quizzes/:quizId/attempts/:attemptId/questions/:index    getQuestion
 *
 * Anti-cheat enforcement
 *   POST /quizzes/:quizId/attempts/:attemptId/violations          reportViolation
 *
 * Proctoring
 *   POST /quizzes/:quizId/attempts/:attemptId/snapshots           recordSnapshot
 *
 * Results & review
 *   GET  /quizzes/:quizId/result                                  getResult
 *   GET  /quizzes/:quizId/attempts/:attemptId/review              reviewAttempt
 *
 * Note on session-lock:
 *   The client must send the sessionToken (issued at startAttempt) as the
 *   X-Session-Token header on every request that goes through _loadLockedAttempt.
 *   A mismatch terminates the session and returns { terminated: true }.
 */

const express = require("express");
const router  = express.Router();

const authenticate             = require("../middleware/auth");
const { requireCompanyScope }  = require("../middleware/requireCompanyScope");
const { studentOnly }          = require("../middleware/requireAcademicRole");
const {
  requireStudentCourseEnrollment,
} = require("../middleware/requireStudentCourseEnrollment");
const requireNoDeviceLock        = require("../middleware/requireNoDeviceLock");
const snapQuizSecurityValidator  = require("../middleware/snapQuizSecurityValidator");
const { snapshotLimiter }        = require("../middleware/rateLimiter");
const ctrl = require("../controllers/snapQuizStudentController");

// ─── Router-level middleware ──────────────────────────────────────────────────

router.use(authenticate);
router.use(requireCompanyScope);
router.use(studentOnly);

// ─── Enrollment guard for course-scoped routes ────────────────────────────────

const enrolledInCourse = requireStudentCourseEnrollment({
  getCourseId: (req) => req.params.courseId,
});

// ─── Identity verification (called by snap-quiz.html before loading quizzes) ──

router.post("/verify-identity", ctrl.verifyIdentity);

// ─── Quiz discovery ───────────────────────────────────────────────────────────

router.get("/join/:code",                ctrl.joinByCode);
router.get("/quizzes",                   ctrl.listAllQuizzes);
router.get("/courses/:courseId/quizzes", enrolledInCourse, ctrl.listQuizzes);
router.get("/quizzes/:quizId",           ctrl.getQuiz);

// ─── Attempt lifecycle ────────────────────────────────────────────────────────

router.post("/quizzes/:quizId/attempts/start",                     requireNoDeviceLock, snapQuizSecurityValidator, ctrl.startAttempt);
router.post("/quizzes/:quizId/attempts/:attemptId/heartbeat",      snapQuizSecurityValidator, ctrl.heartbeat);
router.put( "/quizzes/:quizId/attempts/:attemptId/responses",      snapQuizSecurityValidator, ctrl.saveResponses);
router.post("/quizzes/:quizId/attempts/:attemptId/submit",         snapQuizSecurityValidator, ctrl.submitAttempt);

// ─── Single-question fetch (sequential delivery mode) ────────────────────────

router.get("/quizzes/:quizId/attempts/:attemptId/questions/:index", snapQuizSecurityValidator, ctrl.getQuestion);

// ─── Anti-cheat enforcement ───────────────────────────────────────────────────

router.post("/quizzes/:quizId/attempts/:attemptId/violations",     snapQuizSecurityValidator, ctrl.reportViolation);

// ─── Proctoring ───────────────────────────────────────────────────────────────

router.post("/quizzes/:quizId/attempts/:attemptId/snapshots",      snapshotLimiter, snapQuizSecurityValidator, ctrl.recordSnapshot);

// ─── Results & review ─────────────────────────────────────────────────────────

router.get("/quizzes/:quizId/result",                              ctrl.getResult);
router.get("/quizzes/:quizId/attempts/:attemptId/review",          ctrl.reviewAttempt);

module.exports = router;

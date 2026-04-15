"use strict";

/**
 * snapQuizLecturerRoutes
 *
 * Mounted at: /api/lecturer/snap-quizzes  (registered in server.js)
 *
 * Route summary
 * ─────────────
 * Quiz CRUD
 *   POST   /                                    createQuiz
 *   GET    /                                    listQuizzes
 *   GET    /:quizId                             getQuiz
 *   PUT    /:quizId                             updateQuiz
 *   PATCH  /:quizId/publish                     publishQuiz
 *   PATCH  /:quizId/open                        openQuiz
 *   PATCH  /:quizId/close                       closeQuiz
 *   DELETE /:quizId                             deleteQuiz
 *
 * Question CRUD
 *   POST   /:quizId/questions                   createQuestion
 *   GET    /:quizId/questions                   listQuestions
 *   PUT    /:quizId/questions/:questionId       updateQuestion
 *   DELETE /:quizId/questions/:questionId       deleteQuestion
 *   PATCH  /:quizId/questions/reorder           reorderQuestions
 *
 * Attempt monitoring
 *   GET    /:quizId/attempts                    listAttempts
 *   GET    /:quizId/attempts/:attemptId         getAttemptDetail
 *
 * Violation log
 *   GET    /:quizId/violations                  listViolations
 *
 * Proctoring review
 *   GET    /:quizId/proctoring                  listProctoringEvents
 *   PATCH  /:quizId/proctoring/:eventId         reviewProctoringEvent
 *
 * Manual grading
 *   PATCH  /:quizId/attempts/:attemptId/responses/:responseId/grade  gradeResponse
 *   PATCH  /:quizId/attempts/:attemptId/grade                        gradeBulk
 *
 * Result release
 *   GET    /:quizId/results                     listResults
 *   POST   /:quizId/results/release             releaseResults
 */

const express = require("express");
const router  = express.Router();

const authenticate               = require("../middleware/auth");
const { requireCompanyScope }    = require("../middleware/requireCompanyScope");
const { lecturerOrHod }          = require("../middleware/requireAcademicRole");
const requireAssessmentOwnership = require("../middleware/requireAssessmentOwnership");
const SnapQuiz                   = require("../models/SnapQuiz");
const ctrl                       = require("../controllers/snapQuizLecturerController");

// ─── Router-level middleware ──────────────────────────────────────────────────

router.use(authenticate);
router.use(requireCompanyScope);
router.use(lecturerOrHod);

// ─── Ownership guard ──────────────────────────────────────────────────────────

const ownsQuiz = requireAssessmentOwnership(SnapQuiz, {
  getAssessmentId: (req) => req.params.quizId,
});

// ─── Quiz CRUD ────────────────────────────────────────────────────────────────

router.post("/",                       ctrl.createQuiz);
router.get("/",                        ctrl.listQuizzes);
router.get("/:quizId",                 ownsQuiz, ctrl.getQuiz);
router.put("/:quizId",                 ownsQuiz, ctrl.updateQuiz);
router.patch("/:quizId/publish",       ownsQuiz, ctrl.publishQuiz);
router.patch("/:quizId/open",          ownsQuiz, ctrl.openQuiz);
router.patch("/:quizId/close",         ownsQuiz, ctrl.closeQuiz);
router.delete("/:quizId",              ownsQuiz, ctrl.deleteQuiz);

// ─── Question CRUD ────────────────────────────────────────────────────────────

router.patch("/:quizId/questions/reorder",        ownsQuiz, ctrl.reorderQuestions);
router.post( "/:quizId/questions",                ownsQuiz, ctrl.createQuestion);
router.get(  "/:quizId/questions",                ownsQuiz, ctrl.listQuestions);
router.put(  "/:quizId/questions/:questionId",    ownsQuiz, ctrl.updateQuestion);
router.delete("/:quizId/questions/:questionId",   ownsQuiz, ctrl.deleteQuestion);

// ─── Attempt monitoring ───────────────────────────────────────────────────────

router.get("/:quizId/attempts",              ownsQuiz, ctrl.listAttempts);
router.get("/:quizId/attempts/:attemptId",   ownsQuiz, ctrl.getAttemptDetail);

// ─── Violation log ────────────────────────────────────────────────────────────

router.get("/:quizId/violations",            ownsQuiz, ctrl.listViolations);

// ─── Proctoring review ────────────────────────────────────────────────────────

router.get(  "/:quizId/proctoring",             ownsQuiz, ctrl.listProctoringEvents);
router.patch("/:quizId/proctoring/:eventId",    ownsQuiz, ctrl.reviewProctoringEvent);

// ─── Manual grading ───────────────────────────────────────────────────────────

router.patch("/:quizId/attempts/:attemptId/responses/:responseId/grade", ownsQuiz, ctrl.gradeResponse);
router.patch("/:quizId/attempts/:attemptId/grade",                        ownsQuiz, ctrl.gradeBulk);

// ─── Result release ───────────────────────────────────────────────────────────

router.get( "/:quizId/results",          ownsQuiz, ctrl.listResults);
router.post("/:quizId/results/release",  ownsQuiz, ctrl.releaseResults);

module.exports = router;

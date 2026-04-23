"use strict";

/**
 * normalQuizLecturerRoutes
 *
 * Mounted at: /api/lecturer/normal-quizzes  (register in server.js)
 *
 * Middleware chain applied at router level:
 *   authenticate → requireCompanyScope → requireAcademicRole("lecturer","admin","hod")
 *
 * Per-route ownership guard:
 *   requireAssessmentOwnership(NormalQuiz) — ensures the lecturer owns the quiz
 *   and is still actively assigned to its course.
 *
 * Route summary
 * ─────────────
 * Quiz CRUD
 *   POST   /                                    createQuiz
 *   GET    /                                    listQuizzes
 *   GET    /:quizId                             getQuiz
 *   PUT    /:quizId                             updateQuiz
 *   PATCH  /:quizId/publish                     publishQuiz
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
 *   GET    /:quizId/attempts/:attemptId/suspicious-events  getSuspiciousEvents
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
const NormalQuiz                 = require("../models/NormalQuiz");
const ctrl                       = require("../controllers/normalQuizLecturerController");

// ─── Router-level middleware ──────────────────────────────────────────────────

router.use(authenticate);
router.use(requireCompanyScope);
router.use(lecturerOrHod);

// ─── Ownership guard factory for quiz-scoped routes ───────────────────────────

const ownsQuiz = requireAssessmentOwnership(NormalQuiz, {
  getAssessmentId: (req) => req.params.quizId,
});

// ─── Quiz CRUD ────────────────────────────────────────────────────────────────

router.post("/",          ctrl.createQuiz);
router.get("/",           ctrl.listQuizzes);
router.get("/:quizId",    ownsQuiz, ctrl.getQuiz);
router.put("/:quizId",    ownsQuiz, ctrl.updateQuiz);
router.patch("/:quizId/publish", ownsQuiz, ctrl.publishQuiz);
router.patch("/:quizId/close",   ownsQuiz, ctrl.closeQuiz);
router.delete("/:quizId", ownsQuiz, ctrl.deleteQuiz);

// ─── Question CRUD ────────────────────────────────────────────────────────────

// Reorder must come before /:questionId to avoid route conflict.
router.patch("/:quizId/questions/reorder",          ownsQuiz, ctrl.reorderQuestions);
router.post( "/:quizId/questions",                  ownsQuiz, ctrl.createQuestion);
router.get(  "/:quizId/questions",                  ownsQuiz, ctrl.listQuestions);
router.put(  "/:quizId/questions/:questionId",      ownsQuiz, ctrl.updateQuestion);
router.delete("/:quizId/questions/:questionId",     ownsQuiz, ctrl.deleteQuestion);

// ─── Attempt monitoring ───────────────────────────────────────────────────────

router.get("/:quizId/attempts",                                        ownsQuiz, ctrl.listAttempts);
router.get("/:quizId/attempts/:attemptId",                             ownsQuiz, ctrl.getAttemptDetail);
router.get("/:quizId/attempts/:attemptId/suspicious-events",           ownsQuiz, ctrl.getSuspiciousEvents);

// ─── Manual grading ───────────────────────────────────────────────────────────

router.patch("/:quizId/attempts/:attemptId/responses/:responseId/grade", ownsQuiz, ctrl.gradeResponse);
router.patch("/:quizId/attempts/:attemptId/grade",                        ownsQuiz, ctrl.gradeBulk);

// ─── Result release ───────────────────────────────────────────────────────────

router.get( "/:quizId/results",         ownsQuiz, ctrl.listResults);
router.post("/:quizId/results/release", ownsQuiz, ctrl.releaseResults);

module.exports = router;

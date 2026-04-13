"use strict";

/**
 * aiGeneratorRoutes
 *
 * Mounted at: /api/lecturer/ai-generator  (registered in server.js)
 *
 * Route summary
 * -------------
 * Generation
 *   POST   /generate                                    generate
 *
 * Draft management
 *   GET    /drafts                                      listDrafts
 *   GET    /drafts/:draftId                             getDraft
 *   DELETE /drafts/:draftId                             discardDraft
 *
 * Per-question review
 *   PATCH  /drafts/:draftId/questions/:index            editQuestion
 *   POST   /drafts/:draftId/questions/:index/approve    approveQuestion
 *   POST   /drafts/:draftId/questions/:index/reject     rejectQuestion
 *   POST   /drafts/:draftId/approve-all                 approveAll
 *
 * Apply
 *   POST   /drafts/:draftId/apply                       applyToQuiz
 *
 * Notes:
 *   - requireAssessmentOwnership uses skipCourseCheck: true for AIQuestionDraft
 *     (AI drafts have no course field; only createdBy ownership is checked).
 *   - PDF uploads are handled with multer memory storage inside the controller.
 */

const express = require("express");
const router  = express.Router();

const authenticate               = require("../middleware/authenticate");
const { requireCompanyScope }    = require("../middleware/requireCompanyScope");
const { lecturerOrHod }          = require("../middleware/requireAcademicRole");
const requireAssessmentOwnership = require("../middleware/requireAssessmentOwnership");
const AIQuestionDraft            = require("../models/AIQuestionDraft");
const ctrl                       = require("../controllers/aiGeneratorController");

// Router-level middleware
router.use(authenticate);
router.use(requireCompanyScope);
router.use(lecturerOrHod);

// Draft ownership guard (skipCourseCheck: true — no course field on AIQuestionDraft)
const ownsDraft = requireAssessmentOwnership(AIQuestionDraft, {
  getAssessmentId: (req) => req.params.draftId,
  skipCourseCheck: true,
});

// Generation
router.post("/generate", ctrl.generate);

// Draft management
router.get(   "/drafts",          ctrl.listDrafts);
router.get(   "/drafts/:draftId", ownsDraft, ctrl.getDraft);
router.delete("/drafts/:draftId", ownsDraft, ctrl.discardDraft);

// Per-question review (approve-all before /:index to avoid route conflict)
router.post( "/drafts/:draftId/approve-all",                ownsDraft, ctrl.approveAll);
router.patch("/drafts/:draftId/questions/:index",           ownsDraft, ctrl.editQuestion);
router.post( "/drafts/:draftId/questions/:index/approve",   ownsDraft, ctrl.approveQuestion);
router.post( "/drafts/:draftId/questions/:index/reject",    ownsDraft, ctrl.rejectQuestion);

// Apply approved questions to a quiz
router.post("/drafts/:draftId/apply", ownsDraft, ctrl.applyToQuiz);

module.exports = router;

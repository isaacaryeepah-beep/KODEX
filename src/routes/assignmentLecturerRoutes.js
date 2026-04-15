"use strict";

/**
 * assignmentLecturerRoutes
 *
 * Mounted at: /api/lecturer/assignments  (registered in server.js)
 *
 * Route summary
 * ─────────────
 * Assignment CRUD
 *   POST   /                                        createAssignment
 *   GET    /                                        listAssignments
 *   GET    /:assignmentId                           getAssignment
 *   PUT    /:assignmentId                           updateAssignment
 *   PATCH  /:assignmentId/publish                   publishAssignment
 *   PATCH  /:assignmentId/close                     closeAssignment
 *   DELETE /:assignmentId                           deleteAssignment
 *
 * Submission management
 *   GET    /:assignmentId/submissions               listSubmissions
 *   GET    /:assignmentId/submissions/:submissionId getSubmission
 *   PATCH  /:assignmentId/submissions/:submissionId/grade    gradeSubmission
 *   PATCH  /:assignmentId/submissions/:submissionId/return   returnSubmission
 *   POST   /:assignmentId/submissions/release       releaseResults
 *
 * Analytics
 *   GET    /:assignmentId/stats                     getStats
 */

const express = require("express");
const router  = express.Router();

const authenticate               = require("../middleware/auth");
const { requireCompanyScope }    = require("../middleware/requireCompanyScope");
const { lecturerOrHod }          = require("../middleware/requireAcademicRole");
const requireAssessmentOwnership = require("../middleware/requireAssessmentOwnership");
const Assignment                 = require("../models/Assignment");
const ctrl                       = require("../controllers/assignmentLecturerController");

// ─── Router-level middleware ──────────────────────────────────────────────────

router.use(authenticate);
router.use(requireCompanyScope);
router.use(lecturerOrHod);

// ─── Ownership guard ──────────────────────────────────────────────────────────

const ownsAssignment = requireAssessmentOwnership(Assignment, {
  getAssessmentId: (req) => req.params.assignmentId,
});

// ─── Assignment CRUD ──────────────────────────────────────────────────────────

router.post("/",                      ctrl.createAssignment);
router.get("/",                       ctrl.listAssignments);
router.get("/:assignmentId",          ownsAssignment, ctrl.getAssignment);
router.put("/:assignmentId",          ownsAssignment, ctrl.updateAssignment);
router.patch("/:assignmentId/publish", ownsAssignment, ctrl.publishAssignment);
router.patch("/:assignmentId/close",   ownsAssignment, ctrl.closeAssignment);
router.delete("/:assignmentId",        ownsAssignment, ctrl.deleteAssignment);

// ─── Submission management ────────────────────────────────────────────────────

// /release must come before /:submissionId to avoid route conflict.
router.post("/:assignmentId/submissions/release",               ownsAssignment, ctrl.releaseResults);
router.get( "/:assignmentId/submissions",                        ownsAssignment, ctrl.listSubmissions);
router.get( "/:assignmentId/submissions/:submissionId",          ownsAssignment, ctrl.getSubmission);
router.patch("/:assignmentId/submissions/:submissionId/grade",   ownsAssignment, ctrl.gradeSubmission);
router.patch("/:assignmentId/submissions/:submissionId/return",  ownsAssignment, ctrl.returnSubmission);

// ─── Analytics ────────────────────────────────────────────────────────────────

router.get("/:assignmentId/stats", ownsAssignment, ctrl.getStats);

module.exports = router;

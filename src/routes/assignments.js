const express  = require("express");
const authenticate              = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/assignmentController");

const router = express.Router();

const lecturerMW = [authenticate, requireMode("academic"), requireActiveSubscription, requireRole("lecturer", "admin", "superadmin")];
const studentMW  = [authenticate, requireMode("academic"), requireActiveSubscription, requireRole("student", "superadmin")];
const anyUserMW  = [authenticate, requireMode("academic"), requireActiveSubscription, requireRole("lecturer", "admin", "superadmin", "student")];

// ── Static lecturer routes (before dynamic /:id) ───────────────────────────
router.get("/lecturer",                                         ...lecturerMW, ctrl.listAssignments);
router.post("/lecturer",                                        ...lecturerMW, ctrl.createAssignment);

// Submission-level routes (static path segment "submissions")
router.post("/lecturer/submissions/:submissionId/grade",        ...lecturerMW, ctrl.gradeSubmission);
router.get("/lecturer/submissions/:submissionId/file",          ...lecturerMW, ctrl.downloadSubmissionFile);

// ── Dynamic lecturer routes /:id ───────────────────────────────────────────
router.get("/lecturer/:id",                                     ...lecturerMW, ctrl.getAssignment);
router.put("/lecturer/:id",                                     ...lecturerMW, ctrl.updateAssignment);
router.delete("/lecturer/:id",                                  ...lecturerMW, ctrl.deleteAssignment);

// PDF upload (multipart/form-data) and download
router.post("/lecturer/:id/pdf",                                ...lecturerMW, ctrl.uploadPdf);
router.get("/lecturer/:id/pdf",                                 ...lecturerMW, ctrl.downloadPdf);

// Questions
router.post("/lecturer/:id/questions",                          ...lecturerMW, ctrl.addQuestion);
router.put("/lecturer/:id/questions/:questionId",               ...lecturerMW, ctrl.updateQuestion);
router.delete("/lecturer/:id/questions/:questionId",            ...lecturerMW, ctrl.deleteQuestion);

// ── Student routes ─────────────────────────────────────────────────────────
router.get("/student",             ...studentMW, ctrl.studentList);
router.get("/student/:id",         ...studentMW, ctrl.studentGet);
router.get("/student/:id/pdf",     ...studentMW, ctrl.downloadPdf);        // students can download brief
router.post("/student/:id/submit", ...studentMW, ctrl.studentSubmit);      // multipart

module.exports = router;

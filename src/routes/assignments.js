const express  = require("express");
const authenticate              = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const { uploadLimiter }         = require("../middleware/rateLimiter");
const ctrl = require("../controllers/assignmentController");

const router = express.Router();

// lecturer + superadmin: full create/edit access
const lecturerMW = [authenticate, requireMode("academic"), requireActiveSubscription, requireRole("lecturer", "superadmin")];
// admin + superadmin: read + delete only (no create/edit)
const adminReadMW = [authenticate, requireMode("academic"), requireActiveSubscription, requireRole("admin", "superadmin")];
// all staff: list, view, download
const staffMW    = [authenticate, requireMode("academic"), requireActiveSubscription, requireRole("lecturer", "admin", "superadmin")];
const studentMW  = [authenticate, requireMode("academic"), requireActiveSubscription, requireRole("student", "superadmin")];
const anyUserMW  = [authenticate, requireMode("academic"), requireActiveSubscription, requireRole("lecturer", "admin", "superadmin", "student")];

// ── Static lecturer routes (before dynamic /:id) ───────────────────────────
router.get("/lecturer",                                         ...staffMW,    ctrl.listAssignments);
router.post("/lecturer",                                        ...lecturerMW, ctrl.createAssignment);   // admins cannot create

// Submission-level routes (static path segment "submissions")
router.get("/lecturer/submissions/:submissionId",               ...staffMW,    ctrl.getSubmission);
router.post("/lecturer/submissions/:submissionId/grade",        ...lecturerMW, ctrl.gradeSubmission);    // admins cannot grade
router.get("/lecturer/submissions/:submissionId/file",          ...staffMW,    ctrl.downloadSubmissionFile);

// ── Dynamic lecturer routes /:id ───────────────────────────────────────────
router.get("/lecturer/:id",                                     ...staffMW,    ctrl.getAssignment);
router.put("/lecturer/:id",                                     ...lecturerMW, ctrl.updateAssignment);   // admins cannot edit
router.delete("/lecturer/:id",                                  ...staffMW,    ctrl.deleteAssignment);   // admins can delete

// PDF upload (multipart/form-data) and download
router.post("/lecturer/:id/pdf",                                uploadLimiter, ...lecturerMW, ctrl.uploadPdf);          // admins cannot upload
router.get("/lecturer/:id/pdf",                                 ...staffMW,    ctrl.downloadPdf);

// Questions
router.post("/lecturer/:id/questions",                          ...lecturerMW, ctrl.addQuestion);        // admins cannot add questions
router.put("/lecturer/:id/questions/:questionId",               ...lecturerMW, ctrl.updateQuestion);
router.delete("/lecturer/:id/questions/:questionId",            ...lecturerMW, ctrl.deleteQuestion);

// ── Student routes ─────────────────────────────────────────────────────────
router.get("/student",             ...studentMW, ctrl.studentList);
router.get("/student/:id",         ...studentMW, ctrl.studentGet);
router.get("/student/:id/pdf",     ...studentMW, ctrl.downloadPdf);        // students can download brief
router.post("/student/:id/submit", uploadLimiter, ...studentMW, ctrl.studentSubmit);      // multipart

module.exports = router;

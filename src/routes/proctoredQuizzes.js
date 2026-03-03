const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/proctoredQuizController");

const router = express.Router();

// ── Student routes (mounted at /api/proctor) ────────────────────────────────
router.post(
  "/quiz/:id/start",
  authenticate,
  requireMode("academic"),
  requireActiveSubscription,
  requireRole("student", "superadmin"),
  ctrl.startProctoredSession
);

router.post(
  "/log-event",
  authenticate,
  requireMode("academic"),
  requireActiveSubscription,
  requireRole("student", "superadmin"),
  ctrl.logEvent
);

router.post(
  "/upload-snapshot",
  authenticate,
  requireMode("academic"),
  requireActiveSubscription,
  requireRole("student", "superadmin"),
  ctrl.uploadSnapshot
);

router.post(
  "/quiz/:id/submit",
  authenticate,
  requireMode("academic"),
  requireActiveSubscription,
  requireRole("student", "superadmin"),
  ctrl.submitProctoredQuiz
);

// ── Lecturer / Admin routes ─────────────────────────────────────────────────
// Static routes BEFORE dynamic /:quizId to avoid Express matching static segments as params
router.get(
  "/session/:sessionId/report",
  authenticate,
  requireMode("academic"),
  requireRole("lecturer", "admin", "superadmin"),
  ctrl.sessionReport
);

router.get(
  "/snapshot/:snapshotId",
  authenticate,
  requireMode("academic"),
  requireRole("lecturer", "admin", "superadmin"),
  ctrl.getSnapshotImage
);

router.get(
  "/quiz/:quizId/live-monitor",
  authenticate,
  requireMode("academic"),
  requireRole("lecturer", "admin", "superadmin"),
  ctrl.liveMonitor
);

module.exports = router;

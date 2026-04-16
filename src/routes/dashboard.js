"use strict";

/**
 * dashboard.js
 * Mounted at: /api/dashboard   (registered in server.js)
 *
 * Route summary
 * -------------
 * GET  /academic    institution overview (counts, trends, top courses)   [admin, superadmin]
 * GET  /corporate   workforce overview (attendance, payroll, leave, HR)   [admin, manager, superadmin]
 * GET  /lecturer    own courses, sessions, workload, ungraded work        [lecturer]
 * GET  /student     personal progress: attendance, assignments, quizzes   [student]
 * GET  /employee    personal HR: attendance, leave, payslip, goals        [employee, manager]
 *
 * All routes require authentication + active subscription.
 * No requireMode() gate — the controller handles empty results gracefully
 * when data for a given mode doesn't exist yet.
 */

const express  = require("express");
const router   = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole }               = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/dashboardController");

// Every dashboard route requires a valid session + active subscription
router.use(authenticate, requireActiveSubscription, companyIsolation);

// ── Admin / superadmin dashboards ────────────────────────────────���────────────
router.get(
  "/academic",
  requireRole("admin", "superadmin"),
  ctrl.academicOverview
);

router.get(
  "/corporate",
  requireRole("admin", "manager", "superadmin"),
  ctrl.corporateOverview
);

// ── Lecturer dashboard ────────────────────────────────────────────────────────
router.get(
  "/lecturer",
  requireRole("lecturer"),
  ctrl.lecturerDashboard
);

// ── Student dashboard ─────────────────────────────────────────────────────────
router.get(
  "/student",
  requireRole("student"),
  ctrl.studentDashboard
);

// ── Employee / manager dashboard ─────────────────────────────────��────────────
router.get(
  "/employee",
  requireRole("employee", "manager"),
  ctrl.employeeDashboard
);

module.exports = router;

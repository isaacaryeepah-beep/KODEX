"use strict";

/**
 * attendanceSummary.js
 * Mounted at: /api/attendance-summary   (registered in server.js)
 *
 * Route summary
 * -------------
 * POST   /run                  compute + create summary run for year+month  [admin]
 * GET    /                     list all summary runs                        [admin]
 * GET    /my                   employee: list own attendance summaries      [any]
 * GET    /my/:summaryId        employee: view one attendance summary        [any]
 * GET    /:runId               get run + all per-employee summaries         [admin]
 * PATCH  /:runId/finalize      finalize a draft run                         [admin]
 * PATCH  /:runId/cancel        cancel a draft or finalized run               [admin]
 * GET    /:runId/export        CSV download of all summaries                [admin]
 *
 * Corporate mode only. No pay amounts or currency anywhere in this module --
 * see attendanceSummaryController.js for the full rationale.
 */

const express  = require("express");
const router   = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole, requireMode }  = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/attendanceSummaryController");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const adminOnly = requireRole("admin", "superadmin");

// ── Employee self-service (declared first to prevent /:runId shadowing) ──────
router.get("/my",           ...mw, ctrl.getMyAttendanceSummaries);
router.get("/my/:summaryId",...mw, ctrl.getMyAttendanceSummary);

// ── Admin: run management ─────────────────────────────────────────────────────
router.post("/run",             ...mw, adminOnly, ctrl.runAttendanceSummary);
router.get("/",                 ...mw, adminOnly, ctrl.listAttendanceSummaryRuns);
router.get("/:runId/export",    ...mw, adminOnly, ctrl.exportAttendanceSummaryCSV);
router.get("/:runId",           ...mw, adminOnly, ctrl.getAttendanceSummaryRun);
router.patch("/:runId/finalize",...mw, adminOnly, ctrl.finalizeAttendanceSummaryRun);
router.patch("/:runId/cancel",  ...mw, adminOnly, ctrl.cancelAttendanceSummaryRun);

module.exports = router;

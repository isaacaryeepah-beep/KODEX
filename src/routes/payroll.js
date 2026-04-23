"use strict";

/**
 * payroll.js
 * Mounted at: /api/payroll   (registered in server.js)
 *
 * Route summary
 * -------------
 * POST   /run                  compute + create payroll run for year+month  [admin]
 * GET    /                     list all payroll runs                        [admin]
 * GET    /my                   employee: list own payslips                  [any]
 * GET    /my/:slipId           employee: view one payslip                   [any]
 * GET    /:runId               get run + all payslips                       [admin]
 * PATCH  /:runId/approve       approve a draft run                          [admin]
 * PATCH  /:runId/mark-paid     mark an approved run as paid                 [admin]
 * PATCH  /:runId/cancel        cancel a draft or approved run               [admin]
 * GET    /:runId/export        CSV download of all payslips                 [admin]
 *
 * Corporate mode only.
 */

const express  = require("express");
const router   = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole, requireMode }  = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/payrollController");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const adminOnly = requireRole("admin", "superadmin");

// ── Employee self-service (declared first to prevent /:runId shadowing) ──────
router.get("/my",        ...mw, ctrl.getMyPaySlips);
router.get("/my/:slipId",...mw, ctrl.getMyPaySlip);

// ── Admin: run management ─────────────────────────────────────────────────────
router.post("/run",                ...mw, adminOnly, ctrl.runPayroll);
router.get("/",                    ...mw, adminOnly, ctrl.listPayrollRuns);
router.get("/:runId/export",       ...mw, adminOnly, ctrl.exportPayrollCSV);
router.get("/:runId",              ...mw, adminOnly, ctrl.getPayrollRun);
router.patch("/:runId/approve",    ...mw, adminOnly, ctrl.approvePayrollRun);
router.patch("/:runId/mark-paid",  ...mw, adminOnly, ctrl.markPaid);
router.patch("/:runId/cancel",     ...mw, adminOnly, ctrl.cancelPayrollRun);

module.exports = router;

"use strict";

/**
 * Executive Dashboard routes — mounted at /api/executive
 *
 * GET /dashboard — aggregated workforce KPIs, chart series, and alerts
 * for admins, managers, and superadmins of corporate-mode companies.
 */

const express = require("express");
const router  = express.Router();

const authenticate                 = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const ctrl                         = require("../controllers/executiveController");

router.use(authenticate);

router.get(
  "/dashboard",
  requireRole("admin", "superadmin", "manager"),
  requireMode("corporate"),
  ctrl.dashboard
);

module.exports = router;

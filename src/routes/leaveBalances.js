"use strict";

/**
 * leaveBalances.js
 * Mounted at: /api/leave-balances   (registered in server.js)
 *
 * Route summary
 * -------------
 * GET  /my                          get my balances for a year
 * GET  /                            list all balances for a year  [admin/manager]
 * GET  /:employeeId                 balances for a specific employee [admin/manager]
 * PATCH /:id/adjust                 manual +/- adjustment          [admin]
 *
 * Balance mutations triggered by leave request lifecycle are handled
 * in the /api/leaves routes (approve increments `used`, submit increments
 * `pending`, cancel/reject decrements `pending`).
 *
 * Corporate mode only.
 */

const express = require("express");
const router  = express.Router();
const authenticate              = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const LeaveBalance = require("../models/LeaveBalance");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const adminOnly = requireRole("admin", "superadmin");
const canView   = requireRole("admin", "manager", "superadmin");

// ── GET /my  — own balances (current or specified year) ─────────────────────
router.get("/my", ...mw, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const balances = await LeaveBalance.find({
      company:  req.user.company,
      employee: req.user._id,
      year,
    })
      .populate("policy", "name code daysPerYear isPaid")
      .sort({ "policy.name": 1 });

    res.json({ balances, year });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch your leave balances" });
  }
});

// ── GET /  — all balances for a year (admin/manager) ─────────────────────────
router.get("/", ...mw, canView, async (req, res) => {
  try {
    const year     = parseInt(req.query.year) || new Date().getFullYear();
    const filter   = { company: req.user.company, year };
    if (req.query.policyId) filter.policy = req.query.policyId;

    const balances = await LeaveBalance.find(filter)
      .populate("employee", "name employeeId department role")
      .populate("policy",   "name code daysPerYear isPaid")
      .sort({ "employee.name": 1 });

    res.json({ balances, year, count: balances.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch leave balances" });
  }
});

// ── GET /:employeeId  — balances for a specific employee ─────────────────────
router.get("/:employeeId", ...mw, canView, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    const balances = await LeaveBalance.find({
      company:  req.user.company,
      employee: req.params.employeeId,
      year,
    })
      .populate("policy", "name code daysPerYear carryoverDays isPaid")
      .sort({ "policy.name": 1 });

    res.json({ balances, year });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch employee leave balances" });
  }
});

// ── PATCH /:id/adjust  — manual balance adjustment ───────────────────────────
router.patch("/:id/adjust", ...mw, adminOnly, async (req, res) => {
  try {
    const { delta, note } = req.body; // delta: number (positive or negative)
    if (delta == null || isNaN(Number(delta))) {
      return res.status(400).json({ error: "delta (number) is required" });
    }

    const balance = await LeaveBalance.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      {
        $inc: { adjustments: Number(delta) },
        $set: {
          lastAdjustedBy: req.user._id,
          lastAdjustedAt: new Date(),
          adjustmentNote: note || "",
        },
      },
      { new: true }
    ).populate("policy", "name code");

    if (!balance) return res.status(404).json({ error: "Balance record not found" });
    res.json({ balance });
  } catch (e) {
    res.status(500).json({ error: "Failed to adjust balance" });
  }
});

module.exports = router;

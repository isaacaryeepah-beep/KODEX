"use strict";

/**
 * leavePolicies.js
 * Mounted at: /api/leave-policies   (registered in server.js)
 *
 * Route summary
 * -------------
 * GET    /                       list active policies          [admin/manager]
 * POST   /                       create policy                 [admin]
 * GET    /:id                    get single policy             [admin/manager]
 * PATCH  /:id                    update policy                 [admin]
 * DELETE /:id                    deactivate policy             [admin]
 * POST   /:id/allocate           seed LeaveBalance for all
 *                                eligible employees for a year [admin]
 *
 * Corporate mode only.
 */

const express = require("express");
const router  = express.Router();
const authenticate              = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const LeavePolicy  = require("../models/LeavePolicy");
const LeaveBalance = require("../models/LeaveBalance");
const User         = require("../models/User");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const adminOnly = requireRole("admin", "superadmin");
const canView   = requireRole("admin", "manager", "superadmin");

// ── GET /  — list policies ───────────────────────────────────────────────────
router.get("/", ...mw, canView, async (req, res) => {
  try {
    const policies = await LeavePolicy.find({ company: req.user.company, isActive: true })
      .populate("createdBy", "name")
      .sort({ name: 1 });
    res.json({ policies });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch leave policies" });
  }
});

// ── POST /  — create policy ──────────────────────────────────────────────────
router.post("/", ...mw, adminOnly, async (req, res) => {
  try {
    const {
      name, code, description,
      daysPerYear, carryoverDays, accrualType,
      requiresApproval, requiresDocument, minimumServiceDays,
      targetEmploymentTypes, isPaid,
    } = req.body;

    if (!name) return res.status(400).json({ error: "Policy name is required" });
    if (!code) return res.status(400).json({ error: "Policy code is required" });
    if (daysPerYear == null) return res.status(400).json({ error: "daysPerYear is required" });

    const policy = await LeavePolicy.create({
      company:    req.user.company,
      name:       name.trim(),
      code:       code.trim().toUpperCase(),
      description: description || "",
      daysPerYear: Number(daysPerYear),
      carryoverDays: carryoverDays != null ? Number(carryoverDays) : 0,
      accrualType:  accrualType  || "annual",
      requiresApproval: requiresApproval !== false,
      requiresDocument: requiresDocument === true,
      minimumServiceDays: minimumServiceDays != null ? Number(minimumServiceDays) : 0,
      targetEmploymentTypes: Array.isArray(targetEmploymentTypes)
        ? targetEmploymentTypes
        : ["full_time", "part_time"],
      isPaid:     isPaid !== false,
      createdBy:  req.user._id,
    });

    res.status(201).json({ policy });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ error: "A policy with that code already exists" });
    }
    console.error(e);
    res.status(500).json({ error: "Failed to create policy" });
  }
});

// ── GET /:id  — single policy ────────────────────────────────────────────────
router.get("/:id", ...mw, canView, async (req, res) => {
  try {
    const policy = await LeavePolicy.findOne({
      _id: req.params.id,
      company: req.user.company,
    }).populate("createdBy", "name");

    if (!policy) return res.status(404).json({ error: "Policy not found" });
    res.json({ policy });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch policy" });
  }
});

// ── PATCH /:id  — update policy ──────────────────────────────────────────────
router.patch("/:id", ...mw, adminOnly, async (req, res) => {
  try {
    const allowed = [
      "name", "code", "description",
      "daysPerYear", "carryoverDays", "accrualType",
      "requiresApproval", "requiresDocument", "minimumServiceDays",
      "targetEmploymentTypes", "isPaid",
    ];
    const update = {};
    allowed.forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    if (update.code) update.code = update.code.trim().toUpperCase();

    const policy = await LeavePolicy.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!policy) return res.status(404).json({ error: "Policy not found" });
    res.json({ policy });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ error: "Policy code already exists" });
    }
    res.status(500).json({ error: "Failed to update policy" });
  }
});

// ── DELETE /:id  — deactivate policy ────────────────────────────────────────
router.delete("/:id", ...mw, adminOnly, async (req, res) => {
  try {
    const policy = await LeavePolicy.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { isActive: false },
      { new: true }
    );
    if (!policy) return res.status(404).json({ error: "Policy not found" });
    res.json({ message: "Policy deactivated" });
  } catch (e) {
    res.status(500).json({ error: "Failed to deactivate policy" });
  }
});

// ── POST /:id/allocate  — seed balances for all eligible employees ───────────
// Creates / updates LeaveBalance documents for a given year.
// Safe to call multiple times: uses upsert with $setOnInsert so existing
// balances are not overwritten.
router.post("/:id/allocate", ...mw, adminOnly, async (req, res) => {
  try {
    const year = parseInt(req.body.year) || new Date().getFullYear();

    const policy = await LeavePolicy.findOne({
      _id: req.params.id,
      company: req.user.company,
    });
    if (!policy) return res.status(404).json({ error: "Policy not found" });

    // Find all eligible employees
    const employeeFilter = {
      company: req.user.company,
      isActive: true,
      role: { $nin: ["admin", "superadmin"] },
    };
    if (policy.targetEmploymentTypes && policy.targetEmploymentTypes.length > 0) {
      // Filter by employment type if the EmployeeProfile exists — fall back to
      // including all employees if no profile is set (safe default).
      // We use a simple approach: allocate to all active employees and let
      // the profile filter be applied in the future once all profiles exist.
    }

    const employees = await User.find(employeeFilter).select("_id");
    let seeded = 0;

    for (const emp of employees) {
      await LeaveBalance.findOneAndUpdate(
        {
          company:  req.user.company,
          employee: emp._id,
          policy:   policy._id,
          year,
        },
        {
          $setOnInsert: {
            company:     req.user.company,
            employee:    emp._id,
            policy:      policy._id,
            year,
            entitlement: policy.daysPerYear,
            carryover:   0,
            adjustments: 0,
            used:        0,
            pending:     0,
          },
        },
        { upsert: true, new: true }
      );
      seeded++;
    }

    res.json({ message: `Allocated leave balances for ${seeded} employee(s)`, year, seeded });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to allocate leave balances" });
  }
});

module.exports = router;

"use strict";

/**
 * departments.js
 * Mounted at: /api/departments   (registered in server.js)
 *
 * Route summary
 * -------------
 * GET    /                         list all active departments
 * POST   /                         create department           [admin]
 * GET    /:id                      get single department
 * PATCH  /:id                      update department           [admin]
 * DELETE /:id                      soft-delete department      [admin]
 * GET    /:id/employees            list employees in department
 * PATCH  /:id/head                 assign / remove dept head   [admin]
 *
 * Corporate mode only.
 */

const express    = require("express");
const router     = express.Router();
const authenticate              = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const Department = require("../models/Department");
const User       = require("../models/User");
const { requirePeopleOpsAccess } = require("../utils/corporateScope");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const adminOnly = requireRole("admin", "superadmin");

// ── GET /  — list departments ────────────────────────────────────────────────
router.get("/", ...mw, requirePeopleOpsAccess, async (req, res) => {
  try {
    const depts = await Department.find({ company: req.user.company, isActive: true })
      .populate("head",             "name employeeId")
      .populate("parentDepartment", "name code")
      .sort({ name: 1 });

    // Attach live headcount via a single aggregation instead of N+1 queries
    const deptNames = depts.map(d => d.name);
    const countAgg  = await User.aggregate([
      { $match: { company: req.user.company, department: { $in: deptNames }, isActive: true } },
      { $group: { _id: "$department", headcount: { $sum: 1 } } },
    ]);
    const countMap = {};
    countAgg.forEach(r => { countMap[r._id] = r.headcount; });

    const withCount = depts.map(d => ({ ...d.toObject(), headcount: countMap[d.name] || 0 }));

    res.json({ departments: withCount });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch departments" });
  }
});

// ── POST /  — create department ──────────────────────────────────────────────
router.post("/", ...mw, adminOnly, async (req, res) => {
  try {
    const { name, code, description, parentDepartmentId, costCenter } = req.body;
    if (!name) return res.status(400).json({ error: "Department name is required" });

    const dept = await Department.create({
      company:          req.user.company,
      name:             name.trim(),
      code:             code ? code.trim().toUpperCase() : null,
      description:      description || "",
      parentDepartment: parentDepartmentId || null,
      costCenter:       costCenter || "",
      createdBy:        req.user._id,
    });

    res.status(201).json({ department: dept });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ error: "Department code already exists" });
    }
    console.error(e);
    res.status(500).json({ error: "Failed to create department" });
  }
});

// ── GET /:id  — single department ────────────────────────────────────────────
router.get("/:id", ...mw, requirePeopleOpsAccess, async (req, res) => {
  try {
    const dept = await Department.findOne({ _id: req.params.id, company: req.user.company })
      .populate("head",             "name employeeId role")
      .populate("parentDepartment", "name code")
      .populate("createdBy",        "name");

    if (!dept) return res.status(404).json({ error: "Department not found" });
    res.json({ department: dept });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch department" });
  }
});

// ── PATCH /:id  — update department ─────────────────────────────────────────
router.patch("/:id", ...mw, adminOnly, async (req, res) => {
  try {
    const allowed = ["name", "code", "description", "costCenter"];
    const update = {};
    allowed.forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    if (req.body.parentDepartmentId !== undefined) {
      update.parentDepartment = req.body.parentDepartmentId || null;
    }
    if (update.code) update.code = update.code.trim().toUpperCase();

    const dept = await Department.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $set: update },
      { new: true, runValidators: true }
    ).populate("head", "name employeeId");

    if (!dept) return res.status(404).json({ error: "Department not found" });
    res.json({ department: dept });
  } catch (e) {
    if (e.code === 11000) {
      return res.status(400).json({ error: "Department code already exists" });
    }
    res.status(500).json({ error: "Failed to update department" });
  }
});

// ── DELETE /:id  — soft-delete ───────────────────────────────────────────────
router.delete("/:id", ...mw, adminOnly, async (req, res) => {
  try {
    const dept = await Department.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { isActive: false },
      { new: true }
    );
    if (!dept) return res.status(404).json({ error: "Department not found" });
    res.json({ message: "Department deactivated" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete department" });
  }
});

// ── GET /:id/employees  — list employees in department ───────────────────────
router.get("/:id/employees", ...mw, requirePeopleOpsAccess, async (req, res) => {
  try {
    const dept = await Department.findOne({ _id: req.params.id, company: req.user.company });
    if (!dept) return res.status(404).json({ error: "Department not found" });

    const employees = await User.find({
      company:    req.user.company,
      department: dept.name,
      isActive:   true,
    }).select("name email employeeId role department branch").sort({ name: 1 });

    res.json({ department: { _id: dept._id, name: dept.name }, employees, count: employees.length });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch employees" });
  }
});

// ── PATCH /:id/head  — assign / clear department head ────────────────────────
router.patch("/:id/head", ...mw, adminOnly, async (req, res) => {
  try {
    const { userId } = req.body; // null to clear

    const dept = await Department.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { head: userId || null },
      { new: true }
    ).populate("head", "name employeeId role");

    if (!dept) return res.status(404).json({ error: "Department not found" });
    res.json({ department: dept });
  } catch (e) {
    res.status(500).json({ error: "Failed to update department head" });
  }
});

module.exports = router;

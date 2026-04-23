"use strict";

/**
 * teams.js
 * Mounted at: /api/teams   (registered in server.js)
 *
 * Route summary
 * -------------
 * GET    /                         list all active teams (optional ?departmentId)
 * POST   /                         create team               [admin/manager]
 * GET    /:id                      get single team
 * PATCH  /:id                      update team metadata      [admin/manager]
 * DELETE /:id                      soft-delete team          [admin]
 * POST   /:id/members              add members               [admin/manager]
 * DELETE /:id/members/:userId      remove member             [admin/manager]
 * PATCH  /:id/lead                 assign / clear team lead  [admin/manager]
 *
 * Corporate mode only.
 */

const express = require("express");
const router  = express.Router();
const authenticate              = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const Team = require("../models/Team");
const User = require("../models/User");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const adminOnly = requireRole("admin", "superadmin");
const canManage = requireRole("admin", "manager", "superadmin");
const canView   = requireRole("admin", "manager", "superadmin");

// ── GET /  — list teams ──────────────────────────────────────────────────────
router.get("/", ...mw, canView, async (req, res) => {
  try {
    const filter = { company: req.user.company, isActive: true };
    if (req.query.departmentId) filter.department = req.query.departmentId;

    const teams = await Team.find(filter)
      .populate("department", "name code")
      .populate("lead",       "name employeeId")
      .populate("members",    "name employeeId role")
      .sort({ name: 1 });

    res.json({ teams, count: teams.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

// ── POST /  — create team ────────────────────────────────────────────────────
router.post("/", ...mw, canManage, async (req, res) => {
  try {
    const { name, description, departmentId, leadId, memberIds } = req.body;
    if (!name) return res.status(400).json({ error: "Team name is required" });

    const team = await Team.create({
      company:    req.user.company,
      name:       name.trim(),
      description: description || "",
      department:  departmentId || null,
      lead:        leadId       || null,
      members:     Array.isArray(memberIds) ? memberIds : [],
      createdBy:   req.user._id,
    });

    const populated = await Team.findById(team._id)
      .populate("department", "name code")
      .populate("lead",       "name employeeId")
      .populate("members",    "name employeeId role");

    res.status(201).json({ team: populated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create team" });
  }
});

// ── GET /:id  — single team ──────────────────────────────────────────────────
router.get("/:id", ...mw, canView, async (req, res) => {
  try {
    const team = await Team.findOne({ _id: req.params.id, company: req.user.company })
      .populate("department", "name code")
      .populate("lead",       "name employeeId role")
      .populate("members",    "name employeeId role department")
      .populate("createdBy",  "name");

    if (!team) return res.status(404).json({ error: "Team not found" });
    res.json({ team });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch team" });
  }
});

// ── PATCH /:id  — update team metadata ──────────────────────────────────────
router.patch("/:id", ...mw, canManage, async (req, res) => {
  try {
    const allowed = ["name", "description"];
    const update = {};
    allowed.forEach((f) => {
      if (req.body[f] !== undefined) update[f] = req.body[f];
    });
    if (req.body.departmentId !== undefined) update.department = req.body.departmentId || null;

    const team = await Team.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $set: update },
      { new: true }
    )
      .populate("department", "name code")
      .populate("lead",       "name employeeId")
      .populate("members",    "name employeeId role");

    if (!team) return res.status(404).json({ error: "Team not found" });
    res.json({ team });
  } catch (e) {
    res.status(500).json({ error: "Failed to update team" });
  }
});

// ── DELETE /:id  — soft-delete ───────────────────────────────────────────────
router.delete("/:id", ...mw, adminOnly, async (req, res) => {
  try {
    const team = await Team.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { isActive: false },
      { new: true }
    );
    if (!team) return res.status(404).json({ error: "Team not found" });
    res.json({ message: "Team deactivated" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete team" });
  }
});

// ── POST /:id/members  — add members ────────────────────────────────────────
router.post("/:id/members", ...mw, canManage, async (req, res) => {
  try {
    const { userIds } = req.body; // array of user ObjectIds
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "userIds array is required" });
    }

    // Validate users belong to this company
    const validUsers = await User.find({
      _id: { $in: userIds },
      company: req.user.company,
    }).select("_id");

    const validIds = validUsers.map((u) => u._id);

    const team = await Team.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $addToSet: { members: { $each: validIds } } },
      { new: true }
    )
      .populate("members", "name employeeId role");

    if (!team) return res.status(404).json({ error: "Team not found" });
    res.json({ team, added: validIds.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to add members" });
  }
});

// ── DELETE /:id/members/:userId  — remove member ────────────────────────────
router.delete("/:id/members/:userId", ...mw, canManage, async (req, res) => {
  try {
    const team = await Team.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $pull: { members: req.params.userId } },
      { new: true }
    ).populate("members", "name employeeId role");

    if (!team) return res.status(404).json({ error: "Team not found" });
    res.json({ team });
  } catch (e) {
    res.status(500).json({ error: "Failed to remove member" });
  }
});

// ── PATCH /:id/lead  — assign / clear team lead ──────────────────────────────
router.patch("/:id/lead", ...mw, canManage, async (req, res) => {
  try {
    const { userId } = req.body;
    const team = await Team.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { lead: userId || null },
      { new: true }
    ).populate("lead", "name employeeId role");

    if (!team) return res.status(404).json({ error: "Team not found" });
    res.json({ team });
  } catch (e) {
    res.status(500).json({ error: "Failed to update team lead" });
  }
});

module.exports = router;

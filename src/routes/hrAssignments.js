"use strict";

/**
 * hrAssignments.js
 * Mounted at: /api/hr-assignments   (registered in server.js)
 *
 * Route summary
 * -------------
 * GET    /            list active HR assignments        [admin]
 * POST   /             grant HR capability to a user      [admin]
 * DELETE /:id          revoke an HR assignment            [admin]
 *
 * Corporate mode only. Grants an existing user (any base role) HR
 * capability -- see src/models/HRAssignment.js and
 * src/utils/corporateScope.js for the full mechanism.
 */

const express    = require("express");
const router     = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole, requireMode }  = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const HRAssignment = require("../models/HRAssignment");
const User          = require("../models/User");
const Department     = require("../models/Department");
const AuditLog        = require("../models/AuditLog");
const { AUDIT_ACTIONS } = AuditLog;

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const adminOnly = requireRole("admin", "superadmin");

// ── GET /  — list active assignments ────────────────────────────────────────
router.get("/", ...mw, adminOnly, async (req, res) => {
  try {
    const assignments = await HRAssignment.find({ company: req.user.company, revokedAt: null })
      .populate("user", "name email role employeeId")
      .populate("department", "name")
      .populate("assignedBy", "name")
      .sort({ assignedAt: -1 });
    res.json({ assignments });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch HR assignments" });
  }
});

// ── POST /  — grant HR capability ───────────────────────────────────────────
router.post("/", ...mw, adminOnly, async (req, res) => {
  try {
    const { userId, scope, departmentId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });
    if (!["company", "department"].includes(scope)) {
      return res.status(400).json({ error: "scope must be 'company' or 'department'" });
    }
    if (scope === "department" && !departmentId) {
      return res.status(400).json({ error: "departmentId is required when scope is 'department'" });
    }

    const targetUser = await User.findOne({
      _id: userId,
      company: req.user.company,
      role: { $in: ["employee", "manager"] },
    });
    if (!targetUser) return res.status(404).json({ error: "User not found, or must be an employee or manager" });

    if (scope === "department") {
      const dept = await Department.findOne({ _id: departmentId, company: req.user.company });
      if (!dept) return res.status(404).json({ error: "Department not found" });
    }

    // Revoke any existing active assignment for this user first -- at most
    // one active grant per user.
    await HRAssignment.updateMany(
      { company: req.user.company, user: userId, revokedAt: null },
      { revokedAt: new Date(), revokedBy: req.user._id }
    );

    const assignment = await HRAssignment.create({
      company: req.user.company,
      user: userId,
      scope,
      department: scope === "department" ? departmentId : null,
      assignedBy: req.user._id,
    });

    const populated = await HRAssignment.findById(assignment._id)
      .populate("user", "name email role employeeId")
      .populate("department", "name")
      .populate("assignedBy", "name");

    AuditLog.record({
      company:       req.user.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.CREATE,
      resource:      "HRAssignment",
      resourceId:    assignment._id,
      resourceLabel: `HR access granted to ${targetUser.name} (${scope})`,
      mode:          "corporate",
      req,
    });

    res.status(201).json({ assignment: populated });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to grant HR access" });
  }
});

// ── DELETE /:id  — revoke ────────────────────────────────────────────────────
router.delete("/:id", ...mw, adminOnly, async (req, res) => {
  try {
    const assignment = await HRAssignment.findOne({ _id: req.params.id, company: req.user.company, revokedAt: null });
    if (!assignment) return res.status(404).json({ error: "Active HR assignment not found" });

    assignment.revokedAt = new Date();
    assignment.revokedBy = req.user._id;
    await assignment.save();

    AuditLog.record({
      company:       req.user.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.UPDATE,
      resource:      "HRAssignment",
      resourceId:    assignment._id,
      resourceLabel: "HR access revoked",
      mode:          "corporate",
      req,
    });

    res.json({ message: "HR access revoked" });
  } catch (e) {
    res.status(500).json({ error: "Failed to revoke HR access" });
  }
});

module.exports = router;

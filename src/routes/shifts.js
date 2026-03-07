const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const Shift = require("../models/Shift");
const ShiftAssignment = require("../models/ShiftAssignment");
const User = require("../models/User");
const mongoose = require("mongoose");

const canManage = [requireRole("admin", "manager", "superadmin")];
const mw = [authenticate, requireMode("corporate"), requireActiveSubscription];

// ── GET all shifts for company ──────────────────────────────────────────────
router.get("/", ...mw, async (req, res) => {
  try {
    const shifts = await Shift.find({ company: req.user.company, isActive: true })
      .populate("createdBy", "name")
      .sort({ name: 1 });
    res.json({ shifts });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch shifts" });
  }
});

// ── CREATE shift ────────────────────────────────────────────────────────────
router.post("/", ...mw, ...canManage, async (req, res) => {
  try {
    const { name, startTime, endTime, gracePeriodMinutes, days, department } = req.body;
    if (!name || !startTime || !endTime) {
      return res.status(400).json({ error: "Name, start time and end time are required" });
    }
    const shift = await Shift.create({
      company: req.user.company,
      name, startTime, endTime,
      gracePeriodMinutes: gracePeriodMinutes || 15,
      days: days || ["Mon", "Tue", "Wed", "Thu", "Fri"],
      department: department || null,
      createdBy: req.user._id,
    });
    res.status(201).json({ shift });
  } catch (e) {
    res.status(500).json({ error: "Failed to create shift" });
  }
});

// ── UPDATE shift ────────────────────────────────────────────────────────────
router.put("/:id", ...mw, ...canManage, async (req, res) => {
  try {
    const shift = await Shift.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $set: req.body },
      { new: true }
    );
    if (!shift) return res.status(404).json({ error: "Shift not found" });
    res.json({ shift });
  } catch (e) {
    res.status(500).json({ error: "Failed to update shift" });
  }
});

// ── DELETE shift ────────────────────────────────────────────────────────────
router.delete("/:id", ...mw, ...canManage, async (req, res) => {
  try {
    await Shift.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { isActive: false }
    );
    res.json({ message: "Shift deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete shift" });
  }
});

// ── GET assignments for company ─────────────────────────────────────────────
router.get("/assignments", ...mw, async (req, res) => {
  try {
    const filter = { company: req.user.company, isActive: true };
    // Managers only see their department
    if (req.user.role === "manager" && req.user.department) {
      const deptEmployees = await User.find({
        company: req.user.company,
        department: req.user.department,
      }).select("_id");
      filter.employee = { $in: deptEmployees.map(u => u._id) };
    }
    const assignments = await ShiftAssignment.find(filter)
      .populate("employee", "name employeeId department")
      .populate("shift", "name startTime endTime days")
      .sort({ createdAt: -1 });
    res.json({ assignments });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch assignments" });
  }
});

// ── GET my shift assignment ─────────────────────────────────────────────────
router.get("/my-shift", ...mw, async (req, res) => {
  try {
    const assignment = await ShiftAssignment.findOne({
      company: req.user.company,
      employee: req.user._id,
      isActive: true,
    }).populate("shift");
    res.json({ assignment: assignment || null });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch your shift" });
  }
});

// ── ASSIGN shift to employee ────────────────────────────────────────────────
router.post("/assign", ...mw, ...canManage, async (req, res) => {
  try {
    const { employeeId, shiftId, startDate, endDate } = req.body;
    if (!employeeId || !shiftId || !startDate) {
      return res.status(400).json({ error: "Employee, shift and start date are required" });
    }
    // Deactivate any existing assignment
    await ShiftAssignment.updateMany(
      { company: req.user.company, employee: employeeId, isActive: true },
      { isActive: false }
    );
    const assignment = await ShiftAssignment.create({
      company: req.user.company,
      employee: employeeId,
      shift: shiftId,
      assignedBy: req.user._id,
      startDate: new Date(startDate),
      endDate: endDate ? new Date(endDate) : null,
    });
    const populated = await ShiftAssignment.findById(assignment._id)
      .populate("employee", "name employeeId department")
      .populate("shift", "name startTime endTime days");
    res.status(201).json({ assignment: populated });
  } catch (e) {
    res.status(500).json({ error: "Failed to assign shift" });
  }
});

// ── REMOVE assignment ───────────────────────────────────────────────────────
router.delete("/assignments/:id", ...mw, ...canManage, async (req, res) => {
  try {
    await ShiftAssignment.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { isActive: false }
    );
    res.json({ message: "Assignment removed" });
  } catch (e) {
    res.status(500).json({ error: "Failed to remove assignment" });
  }
});

module.exports = router;

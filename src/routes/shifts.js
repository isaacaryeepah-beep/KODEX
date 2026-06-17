const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const Shift = require("../models/Shift");
const ShiftAssignment = require("../models/ShiftAssignment");
const User = require("../models/User");
const { asyncHandler } = require("../utils/errors");

const canManage = [requireRole("admin", "manager", "superadmin")];
const mw = [authenticate, requireMode("corporate"), requireActiveSubscription];

// GET all shifts
router.get("/", ...mw, asyncHandler(async (req, res) => {
  const shifts = await Shift.find({ company: req.user.company, isActive: true })
    .populate("createdBy", "name").sort({ name: 1 });
  res.json({ shifts });
}));

// CREATE shift
router.post("/", ...mw, ...canManage, asyncHandler(async (req, res) => {
  const { name, startTime, endTime, gracePeriodMinutes, days, department } = req.body;
  if (!name || !startTime || !endTime)
    return res.status(400).json({ error: "Name, start time and end time are required" });
  const shift = await Shift.create({
    company: req.user.company, name, startTime, endTime,
    gracePeriodMinutes: gracePeriodMinutes || 15,
    days: days || ["Mon", "Tue", "Wed", "Thu", "Fri"],
    department: department || null,
    createdBy: req.user._id,
  });
  res.status(201).json({ shift });
}));

// UPDATE shift
router.put("/:id", ...mw, ...canManage, asyncHandler(async (req, res) => {
  const shift = await Shift.findOneAndUpdate(
    { _id: req.params.id, company: req.user.company },
    { $set: req.body }, { new: true }
  );
  if (!shift) return res.status(404).json({ error: "Shift not found" });
  res.json({ shift });
}));

// DELETE shift
router.delete("/:id", ...mw, ...canManage, asyncHandler(async (req, res) => {
  await Shift.findOneAndUpdate({ _id: req.params.id, company: req.user.company }, { isActive: false });
  res.json({ message: "Shift deleted" });
}));

// GET all assignments
router.get("/assignments", ...mw, asyncHandler(async (req, res) => {
  const filter = { company: req.user.company, isActive: true };
  if (req.user.role === "manager" && req.user.department) {
    const deptEmployees = await User.find({ company: req.user.company, department: req.user.department }).select("_id");
    filter.employee = { $in: deptEmployees.map(u => u._id) };
  }
  const assignments = await ShiftAssignment.find(filter)
    .populate("employee", "name employeeId department")
    .populate("shift", "name startTime endTime days")
    .sort({ createdAt: -1 });
  res.json({ assignments });
}));

// GET my shift
router.get("/my-shift", ...mw, asyncHandler(async (req, res) => {
  const assignment = await ShiftAssignment.findOne({
    company: req.user.company, employee: req.user._id, isActive: true,
  }).populate("shift");
  res.json({ assignment: assignment || null });
}));

// ASSIGN shift
router.post("/assign", ...mw, ...canManage, asyncHandler(async (req, res) => {
  const { employeeId, shiftId, startDate, endDate } = req.body;
  if (!employeeId || !shiftId || !startDate)
    return res.status(400).json({ error: "Employee, shift and start date are required" });
  await ShiftAssignment.updateMany(
    { company: req.user.company, employee: employeeId, isActive: true }, { isActive: false }
  );
  const assignment = await ShiftAssignment.create({
    company: req.user.company, employee: employeeId, shift: shiftId,
    assignedBy: req.user._id, startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : null,
  });
  const populated = await ShiftAssignment.findById(assignment._id)
    .populate("employee", "name employeeId department")
    .populate("shift", "name startTime endTime days");
  res.status(201).json({ assignment: populated });
}));

// REMOVE assignment
router.delete("/assignments/:id", ...mw, ...canManage, asyncHandler(async (req, res) => {
  await ShiftAssignment.findOneAndUpdate(
    { _id: req.params.id, company: req.user.company }, { isActive: false }
  );
  res.json({ message: "Assignment removed" });
}));

module.exports = router;

const express = require("express");
const router  = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const Branch     = require("../models/Branch");
const Company    = require("../models/Company");
const User       = require("../models/User");
const Timesheet  = require("../models/Timesheet");
const Expense    = require("../models/Expense");
const LeaveRequest = require("../models/LeaveRequest");
const Goal       = require("../models/Goal");
const Review     = require("../models/Review");
const TrainingProgress = require("../models/TrainingProgress");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const adminOnly = requireRole("admin", "superadmin");
const canManage = requireRole("admin", "manager", "superadmin");

// ─────────────────────────────────────────────────────────────
// BRANCHES
// ─────────────────────────────────────────────────────────────

router.get("/branches", ...mw, async (req, res) => {
  try {
    const branches = await Branch.find({ company: req.user.company, isActive: true })
      .populate("manager", "name employeeId")
      .sort({ name: 1 });

    // Attach headcount
    const withCount = await Promise.all(branches.map(async b => {
      const count = await User.countDocuments({ company: req.user.company, branch: b._id, isActive: true });
      return { ...b.toObject(), headcount: count };
    }));

    res.json({ branches: withCount });
  } catch (e) { res.status(500).json({ error: "Failed to fetch branches" }); }
});

router.post("/branches", ...mw, adminOnly, async (req, res) => {
  try {
    const { name, code, address, city, country, phone, managerId } = req.body;
    if (!name) return res.status(400).json({ error: "Branch name is required" });

    const branch = await Branch.create({
      company: req.user.company,
      name, code: code || "",
      address: address || "", city: city || "", country: country || "",
      phone: phone || "",
      manager: managerId || null,
      createdBy: req.user._id,
    });
    res.status(201).json({ branch });
  } catch (e) {
    if (e.code === 11000) return res.status(400).json({ error: "Branch code already exists" });
    res.status(500).json({ error: "Failed to create branch" });
  }
});

router.patch("/branches/:id", ...mw, adminOnly, async (req, res) => {
  try {
    const allowed = ["name","code","address","city","country","phone","manager"];
    const update = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f] || null; });
    if (req.body.managerId !== undefined) update.manager = req.body.managerId || null;

    const branch = await Branch.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $set: update }, { new: true }
    ).populate("manager", "name");

    if (!branch) return res.status(404).json({ error: "Branch not found" });
    res.json({ branch });
  } catch (e) { res.status(500).json({ error: "Failed to update branch" }); }
});

router.delete("/branches/:id", ...mw, adminOnly, async (req, res) => {
  try {
    await Branch.findOneAndUpdate({ _id: req.params.id, company: req.user.company }, { isActive: false });
    // Unset branch from all users in this branch
    await User.updateMany({ branch: req.params.id }, { $unset: { branch: 1 } });
    res.json({ message: "Branch removed" });
  } catch (e) { res.status(500).json({ error: "Failed to delete branch" }); }
});

// Assign employee to branch
router.patch("/branches/:id/assign-user", ...mw, canManage, async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findOneAndUpdate(
      { _id: userId, company: req.user.company },
      { branch: req.params.id },
      { new: true }
    ).select("name employeeId department branch");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (e) { res.status(500).json({ error: "Failed to assign user to branch" }); }
});

// Remove employee from branch
router.patch("/branches/:id/remove-user", ...mw, canManage, async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await User.findOneAndUpdate(
      { _id: userId, company: req.user.company },
      { $unset: { branch: 1 } },
      { new: true }
    ).select("name employeeId department");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user });
  } catch (e) { res.status(500).json({ error: "Failed to remove user from branch" }); }
});

// ─────────────────────────────────────────────────────────────
// WHITE-LABEL BRANDING
// ─────────────────────────────────────────────────────────────

router.get("/branding", ...mw, async (req, res) => {
  try {
    const company = await Company.findById(req.user.company).select("name branding");
    res.json({ branding: company?.branding || {}, companyName: company?.name });
  } catch (e) { res.status(500).json({ error: "Failed to fetch branding" }); }
});

router.patch("/branding", ...mw, adminOnly, async (req, res) => {
  try {
    const { logoUrl, primaryColor, accentColor, companyTagline, supportEmail, website } = req.body;
    const update = {};
    if (logoUrl       !== undefined) update["branding.logoUrl"]        = logoUrl;
    if (primaryColor  !== undefined) update["branding.primaryColor"]   = primaryColor;
    if (accentColor   !== undefined) update["branding.accentColor"]    = accentColor;
    if (companyTagline!== undefined) update["branding.companyTagline"] = companyTagline;
    if (supportEmail  !== undefined) update["branding.supportEmail"]   = supportEmail;
    if (website       !== undefined) update["branding.website"]        = website;

    const company = await Company.findByIdAndUpdate(
      req.user.company, { $set: update }, { new: true }
    ).select("name branding");

    res.json({ branding: company.branding, companyName: company.name });
  } catch (e) { res.status(500).json({ error: "Failed to update branding" }); }
});

// Payroll settings
router.patch("/payroll-settings", ...mw, adminOnly, async (req, res) => {
  try {
    const { currency, payPeriod, overtimeRate, standardHours } = req.body;
    const update = {};
    if (currency      !== undefined) update["payroll.currency"]      = currency;
    if (payPeriod     !== undefined) update["payroll.payPeriod"]     = payPeriod;
    if (overtimeRate  !== undefined) update["payroll.overtimeRate"]  = overtimeRate;
    if (standardHours !== undefined) update["payroll.standardHours"] = standardHours;

    const company = await Company.findByIdAndUpdate(
      req.user.company, { $set: update }, { new: true }
    ).select("payroll");

    res.json({ payroll: company.payroll });
  } catch (e) { res.status(500).json({ error: "Failed to update payroll settings" }); }
});

// ─────────────────────────────────────────────────────────────
// ADVANCED ANALYTICS
// ─────────────────────────────────────────────────────────────

router.get("/analytics", ...mw, canManage, async (req, res) => {
  try {
    const cId = req.user.company;

    // Headcount
    const totalEmployees = await User.countDocuments({ company: cId, isActive: true, role: { $in: ["employee","manager"] } });
    const byDept = await User.aggregate([
      { $match: { company: cId, isActive: true, role: { $in: ["employee","manager"] } } },
      { $group: { _id: "$department", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    // Leave stats (last 3 months)
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const leaveByStatus = await LeaveRequest.aggregate([
      { $match: { company: cId, createdAt: { $gte: threeMonthsAgo } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const leaveTrend = await LeaveRequest.aggregate([
      { $match: { company: cId, createdAt: { $gte: threeMonthsAgo } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Training completion rate
    const totalTraining = await TrainingProgress.countDocuments({ company: cId });
    const completedTraining = await TrainingProgress.countDocuments({ company: cId, status: "completed" });
    const trainingRate = totalTraining > 0 ? Math.round((completedTraining / totalTraining) * 100) : 0;

    // Performance: avg review score
    const reviewAgg = await Review.aggregate([
      { $match: { company: cId, status: "submitted", overallScore: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: "$overallScore" }, count: { $sum: 1 } } },
    ]);
    const avgReview = reviewAgg[0] ? reviewAgg[0].avg.toFixed(2) : null;

    // Goals completion rate
    const totalGoals = await Goal.countDocuments({ company: cId });
    const completedGoals = await Goal.countDocuments({ company: cId, status: "completed" });
    const goalRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

    // Expense totals (current month)
    const period = new Date().toISOString().slice(0, 7);
    const [yr, mo] = period.split('-').map(Number);
    const expAgg = await Expense.aggregate([
      { $match: { company: cId, status: "approved",
          date: { $gte: new Date(yr, mo-1, 1), $lte: new Date(yr, mo, 0, 23, 59, 59) } } },
      { $group: { _id: "$category", total: { $sum: "$amount" }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    // Timesheet hours this month
    const tsAgg = await Timesheet.aggregate([
      { $match: { company: cId, period, status: { $in: ["approved","submitted"] } } },
      { $group: { _id: null, totalHours: { $sum: "$totalHours" }, count: { $sum: 1 } } },
    ]);

    // Branch headcounts
    const branches = await Branch.find({ company: cId, isActive: true }).select("name");
    const branchStats = await Promise.all(branches.map(async b => ({
      name: b.name,
      count: await User.countDocuments({ company: cId, branch: b._id, isActive: true }),
    })));

    res.json({
      headcount: { total: totalEmployees, byDepartment: byDept, byBranch: branchStats },
      leave: { byStatus: leaveByStatus, trend: leaveTrend },
      training: { total: totalTraining, completed: completedTraining, rate: trainingRate },
      performance: { avgReview, totalReviews: reviewAgg[0]?.count || 0, goalRate, totalGoals, completedGoals },
      expenses: { byCategory: expAgg, period },
      timesheets: { totalHours: tsAgg[0]?.totalHours || 0, count: tsAgg[0]?.count || 0, period },
    });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch analytics" }); }
});

module.exports = router;

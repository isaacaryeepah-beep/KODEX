const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const Goal   = require("../models/Goal");
const Review = require("../models/Review");
const User   = require("../models/User");
const { asyncHandler } = require("../utils/errors");
const { getVisibleUserIds, requirePeopleOpsAccess } = require("../utils/corporateScope");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const canManage = requireRole("admin", "manager", "superadmin");

// ─────────────────────────────────────────────────────────────
// GOALS
// ─────────────────────────────────────────────────────────────

// GET goals (admin/manager: for their scope; employee: own)
router.get("/goals", ...mw, asyncHandler(async (req, res) => {
  const filter = { company: req.user.company };
  if (req.query.employeeId) {
    filter.employee = req.query.employeeId;
  } else {
    const visibleIds = await getVisibleUserIds(req.user);
    if (visibleIds) filter.employee = { $in: visibleIds };
  }
  if (req.query.period) filter.period = req.query.period;

  const goals = await Goal.find(filter)
    .populate("employee", "name employeeId department")
    .populate("createdBy", "name")
    .sort({ createdAt: -1 });
  res.json({ goals });
}));

// CREATE goal
router.post("/goals", ...mw, asyncHandler(async (req, res) => {
  const { employeeId, title, description, category, targetValue, unit, dueDate, period, weight } = req.body;
  if (!title) return res.status(400).json({ error: "Title is required" });

  // Employees can only create goals for themselves
  const target = ["admin","manager","superadmin"].includes(req.user.role) && employeeId
    ? employeeId
    : req.user._id;

  const goal = await Goal.create({
    company: req.user.company,
    employee: target,
    createdBy: req.user._id,
    title, description, category,
    targetValue: targetValue || null,
    currentValue: 0,
    unit: unit || "",
    dueDate: dueDate ? new Date(dueDate) : null,
    period: period || "quarterly",
    weight: weight || 1,
  });

  const populated = await Goal.findById(goal._id).populate("employee", "name employeeId");
  res.status(201).json({ goal: populated });
}));

// UPDATE goal progress
router.patch("/goals/:id", ...mw, asyncHandler(async (req, res) => {
  const allowed = ["currentValue","status","title","description","targetValue","dueDate"];
  const update = {};
  allowed.forEach(f => { if (req.body[f] !== undefined) update[f] = req.body[f]; });

  // Auto-complete if currentValue hits target
  const goal = await Goal.findOne({ _id: req.params.id, company: req.user.company });
  if (!goal) return res.status(404).json({ error: "Goal not found" });

  if (update.currentValue !== undefined && goal.targetValue !== null
      && update.currentValue >= goal.targetValue) {
    update.status = "completed";
  }

  const updated = await Goal.findByIdAndUpdate(
    req.params.id, { $set: update }, { new: true }
  ).populate("employee", "name employeeId");

  res.json({ goal: updated });
}));

// DELETE goal
router.delete("/goals/:id", ...mw, canManage, asyncHandler(async (req, res) => {
  await Goal.findOneAndDelete({ _id: req.params.id, company: req.user.company });
  res.json({ message: "Goal deleted" });
}));

// ─────────────────────────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────────────────────────

// GET reviews
router.get("/reviews", ...mw, asyncHandler(async (req, res) => {
  const filter = { company: req.user.company };
  if (req.query.employeeId) {
    filter.employee = req.query.employeeId;
  } else {
    const visibleIds = await getVisibleUserIds(req.user);
    if (visibleIds) filter.$or = [{ employee: { $in: visibleIds } }, { reviewer: req.user._id }];
  }
  if (req.query.period) filter.period = req.query.period;

  const reviews = await Review.find(filter)
    .populate("employee", "name employeeId department")
    .populate("reviewer", "name role")
    .sort({ createdAt: -1 });

  res.json({ reviews });
}));

// CREATE review
router.post("/reviews", ...mw, asyncHandler(async (req, res) => {
  const { employeeId, type, period, items, overallScore, summary, strengths, improvements } = req.body;
  if (!employeeId || !period) return res.status(400).json({ error: "Employee and period are required" });

  const review = await Review.create({
    company: req.user.company,
    employee: employeeId,
    reviewer: req.user._id,
    type: type || "manager",
    period, items: items || [],
    overallScore: overallScore || null,
    summary: summary || "",
    strengths: strengths || "",
    improvements: improvements || "",
    status: "draft",
  });

  const populated = await Review.findById(review._id)
    .populate("employee", "name employeeId department")
    .populate("reviewer", "name role");

  res.status(201).json({ review: populated });
}));

// UPDATE / submit review
router.patch("/reviews/:id", ...mw, asyncHandler(async (req, res) => {
  const { items, overallScore, summary, strengths, improvements, submit } = req.body;
  const update = {};
  if (items !== undefined)       update.items = items;
  if (overallScore !== undefined) update.overallScore = overallScore;
  if (summary !== undefined)     update.summary = summary;
  if (strengths !== undefined)   update.strengths = strengths;
  if (improvements !== undefined) update.improvements = improvements;
  if (submit) { update.status = "submitted"; update.submittedAt = new Date(); }

  const review = await Review.findOneAndUpdate(
    { _id: req.params.id, company: req.user.company },
    { $set: update }, { new: true }
  ).populate("employee", "name employeeId department")
   .populate("reviewer", "name role");

  if (!review) return res.status(404).json({ error: "Review not found" });
  res.json({ review });
}));

// DELETE review
router.delete("/reviews/:id", ...mw, canManage, asyncHandler(async (req, res) => {
  await Review.findOneAndDelete({ _id: req.params.id, company: req.user.company });
  res.json({ message: "Review deleted" });
}));

// ─────────────────────────────────────────────────────────────
// MY SCORECARD — employee self-view (no canManage guard)
// ─────────────────────────────────────────────────────────────

router.get("/my-scorecard", ...mw, asyncHandler(async (req, res) => {
  const empId = req.user._id;
  const employee = await User.findById(empId).select("name employeeId department role");

  const goals = await Goal.find({ employee: empId, company: req.user.company }).sort({ createdAt: -1 });
  const reviews = await Review.find({
    company: req.user.company,
    status: "submitted",
    $or: [{ employee: empId }, { reviewer: empId }],
  }).populate("reviewer", "name role").sort({ submittedAt: -1 });

  const totalGoals = goals.length;
  const completedGoals = goals.filter(g => g.status === "completed").length;
  const activeGoals = goals.filter(g => g.status === "active");

  let weightedProgress = 0, totalWeight = 0;
  activeGoals.forEach(g => {
    const w = g.weight || 1;
    const pct = g.targetValue ? Math.min((g.currentValue / g.targetValue) * 100, 100) : 0;
    weightedProgress += pct * w;
    totalWeight += w;
  });
  const avgProgress = totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;

  const scored = reviews.filter(r => r.overallScore != null);
  const avgReviewScore = scored.length
    ? (scored.reduce((s, r) => s + r.overallScore, 0) / scored.length).toFixed(1)
    : null;

  res.json({ employee, goals, reviews, stats: { totalGoals, completedGoals, avgProgress, avgReviewScore } });
}));

// ─────────────────────────────────────────────────────────────
// SCORECARD (manager dashboard — per employee overview)
// ─────────────────────────────────────────────────────────────

router.get("/scorecard/:employeeId", ...mw, requirePeopleOpsAccess, asyncHandler(async (req, res) => {
  const empId = req.params.employeeId;
  const employee = await User.findOne({ _id: empId, company: req.user.company })
    .select("name employeeId department role");
  if (!employee) return res.status(404).json({ error: "Employee not found" });

  const goals = await Goal.find({ employee: empId, company: req.user.company }).sort({ createdAt: -1 });
  const reviews = await Review.find({ employee: empId, company: req.user.company, status: "submitted" })
    .populate("reviewer", "name role").sort({ submittedAt: -1 });

  // Compute goal stats
  const totalGoals = goals.length;
  const completedGoals = goals.filter(g => g.status === "completed").length;
  const activeGoals = goals.filter(g => g.status === "active");

  // Weighted progress on active goals
  let weightedProgress = 0, totalWeight = 0;
  activeGoals.forEach(g => {
    const w = g.weight || 1;
    const pct = g.targetValue ? Math.min((g.currentValue / g.targetValue) * 100, 100) : 0;
    weightedProgress += pct * w;
    totalWeight += w;
  });
  const avgProgress = totalWeight > 0 ? Math.round(weightedProgress / totalWeight) : 0;

  // Average review score
  const scored = reviews.filter(r => r.overallScore != null);
  const avgReviewScore = scored.length
    ? (scored.reduce((s, r) => s + r.overallScore, 0) / scored.length).toFixed(1)
    : null;

  res.json({ employee, goals, reviews, stats: { totalGoals, completedGoals, avgProgress, avgReviewScore } });
}));

// GET team overview (manager)
router.get("/team-overview", ...mw, requirePeopleOpsAccess, asyncHandler(async (req, res) => {
  const filter = { company: req.user.company, role: { $in: ["employee","manager"] } };
  const visibleIds = await getVisibleUserIds(req.user);
  if (visibleIds) filter._id = { $in: visibleIds };

  const employees = await User.find(filter).select("name employeeId department role");

  const overview = await Promise.all(employees.map(async emp => {
    const goals = await Goal.find({ employee: emp._id, company: req.user.company });
    const completed = goals.filter(g => g.status === "completed").length;
    const reviews = await Review.find({ employee: emp._id, company: req.user.company, status: "submitted" });
    const scored = reviews.filter(r => r.overallScore != null);
    const avgScore = scored.length
      ? (scored.reduce((s, r) => s + r.overallScore, 0) / scored.length).toFixed(1)
      : null;
    return {
      employee: emp,
      totalGoals: goals.length,
      completedGoals: completed,
      reviewCount: reviews.length,
      avgScore,
    };
  }));

  res.json({ overview });
}));

module.exports = router;

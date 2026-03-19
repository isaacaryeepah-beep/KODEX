const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const Goal   = require("../models/Goal");
const Review = require("../models/Review");
const User   = require("../models/User");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const canManage = requireRole("admin", "manager", "superadmin");

// ─────────────────────────────────────────────────────────────
// GOALS
// ─────────────────────────────────────────────────────────────

// GET goals (admin/manager: for any employee; employee: own)
router.get("/goals", ...mw, async (req, res) => {
  try {
    const filter = { company: req.user.company };
    if (req.query.employeeId) {
      filter.employee = req.query.employeeId;
    } else if (!["admin","manager","superadmin"].includes(req.user.role)) {
      filter.employee = req.user._id;
    }
    if (req.query.period) filter.period = req.query.period;

    const goals = await Goal.find(filter)
      .populate("employee", "name employeeId department")
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });
    res.json({ goals });
  } catch (e) { res.status(500).json({ error: "Failed to fetch goals" }); }
});

// CREATE goal
router.post("/goals", ...mw, async (req, res) => {
  try {
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
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to create goal" }); }
});

// UPDATE goal progress
router.patch("/goals/:id", ...mw, async (req, res) => {
  try {
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
  } catch (e) { res.status(500).json({ error: "Failed to update goal" }); }
});

// DELETE goal
router.delete("/goals/:id", ...mw, canManage, async (req, res) => {
  try {
    await Goal.findOneAndDelete({ _id: req.params.id, company: req.user.company });
    res.json({ message: "Goal deleted" });
  } catch (e) { res.status(500).json({ error: "Failed to delete goal" }); }
});

// ─────────────────────────────────────────────────────────────
// REVIEWS
// ─────────────────────────────────────────────────────────────

// GET reviews
router.get("/reviews", ...mw, async (req, res) => {
  try {
    const filter = { company: req.user.company };
    if (req.query.employeeId) filter.employee = req.query.employeeId;
    else if (!["admin","manager","superadmin"].includes(req.user.role)) {
      filter.$or = [{ employee: req.user._id }, { reviewer: req.user._id }];
    }
    if (req.query.period) filter.period = req.query.period;

    const reviews = await Review.find(filter)
      .populate("employee", "name employeeId department")
      .populate("reviewer", "name role")
      .sort({ createdAt: -1 });

    res.json({ reviews });
  } catch (e) { res.status(500).json({ error: "Failed to fetch reviews" }); }
});

// CREATE review
router.post("/reviews", ...mw, async (req, res) => {
  try {
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
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to create review" }); }
});

// UPDATE / submit review
router.patch("/reviews/:id", ...mw, async (req, res) => {
  try {
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
  } catch (e) { res.status(500).json({ error: "Failed to update review" }); }
});

// DELETE review
router.delete("/reviews/:id", ...mw, canManage, async (req, res) => {
  try {
    await Review.findOneAndDelete({ _id: req.params.id, company: req.user.company });
    res.json({ message: "Review deleted" });
  } catch (e) { res.status(500).json({ error: "Failed to delete review" }); }
});

// ─────────────────────────────────────────────────────────────
// SCORECARD (manager dashboard -- per employee overview)
// ─────────────────────────────────────────────────────────────

router.get("/scorecard/:employeeId", ...mw, canManage, async (req, res) => {
  try {
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
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch scorecard" }); }
});

// GET team overview (manager)
router.get("/team-overview", ...mw, canManage, async (req, res) => {
  try {
    const filter = { company: req.user.company, role: { $in: ["employee","manager"] } };
    if (req.user.role === "manager" && req.user.department) filter.department = req.user.department;

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
  } catch (e) { res.status(500).json({ error: "Failed to fetch team overview" }); }
});

module.exports = router;

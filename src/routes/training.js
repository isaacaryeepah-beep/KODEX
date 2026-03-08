const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const TrainingModule = require("../models/TrainingModule");
const TrainingProgress = require("../models/TrainingProgress");
const User = require("../models/User");

const mw = [authenticate, requireMode("corporate"), requireActiveSubscription];
const canManage = requireRole("admin", "manager", "superadmin");

// ─────────────────────────────────────────────────────────────
// ADMIN / MANAGER — Module Management
// ─────────────────────────────────────────────────────────────

// GET all modules
router.get("/modules", ...mw, async (req, res) => {
  try {
    const modules = await TrainingModule.find({ company: req.user.company, isActive: true })
      .populate("createdBy", "name")
      .sort({ createdAt: -1 });

    // Attach completion stats to each module
    const withStats = await Promise.all(modules.map(async (m) => {
      const total = await TrainingProgress.countDocuments({ module: m._id });
      const completed = await TrainingProgress.countDocuments({ module: m._id, status: "completed" });
      const passed = await TrainingProgress.countDocuments({ module: m._id, passed: true });
      return { ...m.toObject(), stats: { total, completed, passed } };
    }));

    res.json({ modules: withStats });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch modules" });
  }
});

// CREATE module
router.post("/modules", ...mw, canManage, async (req, res) => {
  try {
    const { title, description, type, content, videoUrl, questions, passingScore, dueInDays, timeLimitMinutes, targetRoles, departments } = req.body;
    if (!title) return res.status(400).json({ error: "Title is required" });

    const module = await TrainingModule.create({
      company: req.user.company,
      title, description, type, content, videoUrl,
      questions: questions || [],
      passingScore: passingScore || 70,
      dueInDays: dueInDays || 7,
      timeLimitMinutes: timeLimitMinutes ? parseInt(timeLimitMinutes) : null,
      targetRoles: targetRoles || ["employee"],
      departments: departments || [],
      createdBy: req.user._id,
    });

    res.status(201).json({ module });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create module" });
  }
});

// ADD question to module
router.post("/modules/:id/questions", ...mw, canManage, async (req, res) => {
  try {
    const { questionText, options, correctAnswer, marks } = req.body;
    if (!questionText || !options || options.length < 2 || correctAnswer == null)
      return res.status(400).json({ error: "Question text, options and correct answer are required" });

    const module = await TrainingModule.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $push: { questions: { questionText, options, correctAnswer, marks: marks || 1 } } },
      { new: true }
    );
    if (!module) return res.status(404).json({ error: "Module not found" });
    res.json({ module });
  } catch (e) {
    res.status(500).json({ error: "Failed to add question" });
  }
});

// DELETE module
router.delete("/modules/:id", ...mw, canManage, async (req, res) => {
  try {
    await TrainingModule.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { isActive: false }
    );
    res.json({ message: "Module deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete module" });
  }
});

// ASSIGN module to employees
router.post("/modules/:id/assign", ...mw, canManage, async (req, res) => {
  try {
    const module = await TrainingModule.findOne({ _id: req.params.id, company: req.user.company });
    if (!module) return res.status(404).json({ error: "Module not found" });

    // Find target employees
    const filter = { company: req.user.company, role: { $in: module.targetRoles } };
    if (module.departments.length > 0) filter.department = { $in: module.departments };

    const employees = await User.find(filter).select("_id");
    const dueDate = new Date(Date.now() + module.dueInDays * 24 * 60 * 60 * 1000);

    let assigned = 0;
    for (const emp of employees) {
      await TrainingProgress.findOneAndUpdate(
        { employee: emp._id, module: module._id },
        {
          $setOnInsert: {
            company: req.user.company,
            employee: emp._id,
            module: module._id,
            status: "assigned",
            dueDate,
          }
        },
        { upsert: true, new: true }
      );
      assigned++;
    }

    res.json({ message: `Module assigned to ${assigned} employee(s)`, assigned });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to assign module" });
  }
});

// GET progress for a module (admin view)
router.get("/modules/:id/progress", ...mw, canManage, async (req, res) => {
  try {
    const progress = await TrainingProgress.find({ module: req.params.id })
      .populate("employee", "name employeeId department")
      .sort({ status: 1, updatedAt: -1 });
    res.json({ progress });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch progress" });
  }
});

// GET dashboard overview (admin)
router.get("/overview", ...mw, canManage, async (req, res) => {
  try {
    const modules = await TrainingModule.countDocuments({ company: req.user.company, isActive: true });
    const totalAssigned = await TrainingProgress.countDocuments({ company: req.user.company });
    const completed = await TrainingProgress.countDocuments({ company: req.user.company, status: "completed" });
    const passed = await TrainingProgress.countDocuments({ company: req.user.company, passed: true });
    const overdue = await TrainingProgress.countDocuments({
      company: req.user.company,
      status: { $nin: ["completed"] },
      dueDate: { $lt: new Date() },
    });

    // Recent completions
    const recent = await TrainingProgress.find({ company: req.user.company, status: "completed" })
      .populate("employee", "name")
      .populate("module", "title type")
      .sort({ completedAt: -1 })
      .limit(5);

    res.json({ stats: { modules, totalAssigned, completed, passed, overdue }, recent });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch overview" });
  }
});

// ─────────────────────────────────────────────────────────────
// EMPLOYEE — Take Training
// ─────────────────────────────────────────────────────────────

// GET my assigned modules
router.get("/my", ...mw, async (req, res) => {
  try {
    // Mark overdue
    await TrainingProgress.updateMany(
      {
        employee: req.user._id,
        status: { $in: ["assigned", "in_progress"] },
        dueDate: { $lt: new Date() },
      },
      { status: "overdue" }
    );

    const progress = await TrainingProgress.find({ employee: req.user._id })
      .populate("module", "title description type passingScore dueInDays timeLimitMinutes videoUrl content questions")
      .sort({ status: 1, createdAt: -1 });

    res.json({ progress });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch your training" });
  }
});

// START a module (marks in_progress)
router.post("/my/:id/start", ...mw, async (req, res) => {
  try {
    const progress = await TrainingProgress.findOneAndUpdate(
      { _id: req.params.id, employee: req.user._id },
      { status: "in_progress", startedAt: new Date() },
      { new: true }
    ).populate("module");

    if (!progress) return res.status(404).json({ error: "Training not found" });
    res.json({ progress });
  } catch (e) {
    res.status(500).json({ error: "Failed to start module" });
  }
});

// SUBMIT assessment
router.post("/my/:id/submit", ...mw, async (req, res) => {
  try {
    const { answers } = req.body; // [{ questionIndex, selectedAnswer }]
    const progress = await TrainingProgress.findOne({ _id: req.params.id, employee: req.user._id })
      .populate("module");

    if (!progress) return res.status(404).json({ error: "Training not found" });

    const module = progress.module;
    const questions = module.questions || [];

    let score = 0;
    const maxScore = questions.reduce((s, q) => s + (q.marks || 1), 0);

    const markedAnswers = (answers || []).map((a) => {
      const q = questions[a.questionIndex];
      const correct = q && q.correctAnswer === a.selectedAnswer;
      if (correct) score += q.marks || 1;
      return { questionIndex: a.questionIndex, selectedAnswer: a.selectedAnswer };
    });

    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const passed = percentage >= (module.passingScore || 70);

    await TrainingProgress.findByIdAndUpdate(progress._id, {
      answers: markedAnswers,
      score, maxScore, percentage, passed,
      status: passed ? "completed" : "failed",
      completedAt: new Date(),
      $inc: { attempts: 1 },
    });

    res.json({ score, maxScore, percentage, passed, passingScore: module.passingScore || 70 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to submit assessment" });
  }
});

// RETRY a failed module
router.post("/my/:id/retry", ...mw, async (req, res) => {
  try {
    const progress = await TrainingProgress.findOneAndUpdate(
      { _id: req.params.id, employee: req.user._id, status: { $in: ["failed", "overdue"] } },
      { status: "in_progress", startedAt: new Date(), answers: [], score: null, maxScore: null, percentage: null, passed: null },
      { new: true }
    ).populate("module");

    if (!progress) return res.status(404).json({ error: "Training not found or not retryable" });
    res.json({ progress });
  } catch (e) {
    res.status(500).json({ error: "Failed to retry module" });
  }
});

module.exports = router;

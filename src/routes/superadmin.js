const express      = require("express");
const jwt          = require("jsonwebtoken");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const Company      = require("../models/Company");
const User         = require("../models/User");
const PaymentLog   = require("../models/PaymentLog");

const bcrypt = require("bcryptjs");

const router = express.Router();

// ── POST /api/superadmin/login (public — no auth needed) ─────────────────────
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });
    const user = await User.findOne({ email, role: "superadmin" }).select("+password");
    if (!user) return res.status(401).json({ error: "Invalid credentials" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid credentials" });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "8h" });
    res.json({
      token,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, isApproved: true, mustChangePassword: false }
    });
  } catch (err) {
    console.error("superadmin login:", err);
    res.status(500).json({ error: "Server error" });
  }
});

router.use(authenticate);
router.use(requireRole("superadmin"));


// ── GET /api/superadmin/overview ─────────────────────────────────────────────
router.get("/overview", async (req, res) => {
  try {
    const companies = await Company.find({}).sort({ createdAt: -1 }).lean();

    const companyIds = companies.map(c => c._id);

    // User counts per company
    const userCounts = await User.aggregate([
      { $match: { company: { $in: companyIds } } },
      { $group: { _id: "$company", total: { $sum: 1 } } }
    ]);
    const countMap = {};
    userCounts.forEach(c => { countMap[c._id.toString()] = c.total; });

    // Total revenue per company from PaymentLog
    const revenues = await PaymentLog.aggregate([
      { $match: { company: { $in: companyIds } } },
      { $group: { _id: "$company", total: { $sum: "$amount" }, count: { $sum: 1 } } }
    ]);
    const revMap = {};
    revenues.forEach(r => { revMap[r._id.toString()] = { total: r.total, count: r.count }; });

    // Platform totals
    const totalRevenue = revenues.reduce((s, r) => s + r.total, 0);
    const totalPayments = revenues.reduce((s, r) => s + r.count, 0);

    const enriched = companies.map(c => {
      const id = c._id.toString();
      const trialDaysRemaining = c.trialEndDate
        ? Math.max(0, Math.ceil((new Date(c.trialEndDate) - Date.now()) / (1000*60*60*24)))
        : 0;
      return {
        ...c,
        userCount: countMap[id] || 0,
        revenue: revMap[id]?.total || 0,
        paymentCount: revMap[id]?.count || 0,
        trialDaysRemaining,
        isTrialActive: c.trialEndDate ? new Date(c.trialEndDate) > Date.now() && !c.trialUsed : false,
      };
    });

    res.json({ companies: enriched, total: companies.length, totalRevenue, totalPayments });
  } catch (err) {
    console.error("superadmin overview:", err);
    res.status(500).json({ error: "Failed to load overview" });
  }
});

// ── PATCH /api/superadmin/companies/:id/toggle ────────────────────────────────
router.patch("/companies/:id/toggle", async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: "Not found" });
    company.isActive = !company.isActive;
    await company.save();
    res.json({ isActive: company.isActive });
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle company" });
  }
});

// ── PATCH /api/superadmin/companies/:id/extend-trial ─────────────────────────
router.patch("/companies/:id/extend-trial", async (req, res) => {
  try {
    const { days } = req.body;
    if (!days || days < 1) return res.status(400).json({ error: "days must be >= 1" });

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: "Company not found" });

    // Extend from today if expired, otherwise from current end date
    const base = company.trialEndDate && new Date(company.trialEndDate) > Date.now()
      ? new Date(company.trialEndDate)
      : new Date();
    const newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);

    company.trialEndDate = newEnd;
    company.trialUsed    = false; // re-enable if it was marked used
    await company.save();

    res.json({
      message: `Trial extended by ${days} day(s). New end: ${newEnd.toDateString()}`,
      trialEndDate: newEnd,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to extend trial" });
  }
});

// ── GET /api/superadmin/payments ──────────────────────────────────────────────
router.get("/payments", async (req, res) => {
  try {
    const logs = await PaymentLog.find({})
      .populate("company", "name mode institutionCode")
      .sort({ paidAt: -1 })
      .limit(200)
      .lean();
    const total = await PaymentLog.aggregate([{ $group: { _id: null, sum: { $sum: "$amount" } } }]);
    res.json({ payments: logs, totalRevenue: total[0]?.sum || 0 });
  } catch (err) {
    res.status(500).json({ error: "Failed to load payments" });
  }
});

// ── POST /api/superadmin/impersonate/:companyId ───────────────────────────────
// Issues a short-lived token scoped to an admin of the given company
router.post("/impersonate/:companyId", async (req, res) => {
  try {
    const company = await Company.findById(req.params.companyId);
    if (!company) return res.status(404).json({ error: "Company not found" });

    // Find the primary admin of that company
    const admin = await User.findOne({ company: company._id, role: "admin", isActive: true });
    if (!admin) return res.status(404).json({ error: "No active admin found for this company" });

    // Issue a 1-hour impersonation token tagged so it can be identified
    const impersonateToken = jwt.sign(
      { id: admin._id, impersonatedBy: req.user._id, impersonation: true },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token: impersonateToken,
      admin: { id: admin._id, name: admin.name, email: admin.email },
      company: { id: company._id, name: company.name, mode: company.mode },
      expiresIn: "1 hour",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate impersonation token" });
  }
});

module.exports = router;

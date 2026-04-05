const express      = require("express");
const jwt          = require("jsonwebtoken");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const Company      = require("../models/Company");
const User         = require("../models/User");
const PaymentLog   = require("../models/PaymentLog");

const bcrypt = require("bcryptjs");
const emailService = require("../services/emailService");

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

    // User counts per company broken down by role
    const userCounts = await User.aggregate([
      { $match: { company: { $in: companyIds } } },
      { $group: { _id: { company: "$company", role: "$role" }, count: { $sum: 1 } } }
    ]);
    const countMap = {};
    userCounts.forEach(({ _id, count }) => {
      const id = _id.company.toString();
      if (!countMap[id]) countMap[id] = { total: 0, admin: 0, manager: 0, lecturer: 0, hod: 0, student: 0, employee: 0 };
      countMap[id][_id.role] = (countMap[id][_id.role] || 0) + count;
      countMap[id].total += count;
    });

    // Admin info (email + last login) per company
    const admins = await User.find({ company: { $in: companyIds }, role: { $in: ["admin", "manager"] } })
      .select("company email name lastLoginAt role").lean();
    const adminMap = {};
    admins.forEach(a => {
      const id = a.company.toString();
      if (!adminMap[id]) adminMap[id] = a;
    });

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
      const counts = countMap[id] || {};
      const adm = adminMap[id] || null;
      return {
        ...c,
        userCount: counts.total || 0,
        roleCounts: {
          admin: counts.admin || 0,
          manager: counts.manager || 0,
          lecturer: counts.lecturer || 0,
          hod: counts.hod || 0,
          student: counts.student || 0,
          employee: counts.employee || 0,
        },
        adminEmail: adm?.email || null,
        adminName: adm?.name || null,
        lastLoginAt: adm?.lastLoginAt || null,
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
    const { days, expiryDate } = req.body;

    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: "Company not found" });

    let newEnd;
    if (expiryDate) {
      // Set exact expiry date (can reduce or extend)
      newEnd = new Date(expiryDate);
      newEnd.setHours(23, 59, 59, 999); // end of that day
      if (isNaN(newEnd.getTime())) return res.status(400).json({ error: "Invalid date" });
    } else if (days) {
      // Legacy: extend by days from current end or today
      if (days < 1) return res.status(400).json({ error: "days must be >= 1" });
      const base = company.trialEndDate && new Date(company.trialEndDate) > Date.now()
        ? new Date(company.trialEndDate)
        : new Date();
      newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    } else {
      return res.status(400).json({ error: "Provide expiryDate or days" });
    }

    company.trialEndDate      = newEnd;
    company.trialUsed         = false;
    company.subscriptionStatus = 'trial';
    await company.save();

    res.json({
      message: `Trial expiry set to ${newEnd.toDateString()}`,
      trialEndDate: newEnd,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update trial" });
  }
});

// ── DELETE /api/superadmin/companies/:id ─────────────────────────────────────
router.delete("/companies/:id", async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: "Institution not found" });

    const companyId = company._id;
    const companyName = company.name;

    // Delete all related data
    await Promise.all([
      require('../models/User').deleteMany({ company: companyId }),
      require('../models/AttendanceSession').deleteMany({ company: companyId }),
      require('../models/AttendanceRecord').deleteMany({ company: companyId }),
      require('../models/Course').deleteMany({ company: companyId }),
      require('../models/Quiz').deleteMany({ company: companyId }),
      require('../models/Question').deleteMany({ company: companyId }),
      require('../models/Attempt').deleteMany({ company: companyId }),
      require('../models/Answer').deleteMany({ company: companyId }),
      require('../models/Assignment').deleteMany({ company: companyId }),
      require('../models/AssignmentSubmission').deleteMany({ company: companyId }),
      require('../models/Announcement').deleteMany({ company: companyId }),
      require('../models/StudentRoster').deleteMany({ company: companyId }),
      require('../models/GradeBook').deleteMany({ company: companyId }),
      require('../models/PaymentLog').deleteMany({ company: companyId }),
      require('../models/JitsiMeeting').deleteMany({ companyId }),
      require('../models/JitsiAttendance').deleteMany({ }),
    ]);

    // Hard delete the company document
    await Company.deleteOne({ _id: companyId });

    res.json({ message: `Institution "${companyName}" and all its data deleted successfully.` });
  } catch (err) {
    console.error("Delete company error:", err);
    res.status(500).json({ error: "Failed to delete institution" });
  }
});

// ── DELETE /api/superadmin/companies/by-name/:name ───────────────────────────
// Emergency cleanup — delete any company stuck by name
router.delete("/companies/by-name/:name", async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const companies = await Company.find({ name: { $regex: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } });
    if (!companies.length) return res.status(404).json({ error: "No company found with that name" });

    let deleted = 0;
    for (const company of companies) {
      const id = company._id;
      await Promise.all([
        require('../models/User').deleteMany({ company: id }),
        require('../models/AttendanceSession').deleteMany({ company: id }),
        require('../models/AttendanceRecord').deleteMany({ company: id }),
        require('../models/Course').deleteMany({ company: id }),
        require('../models/Quiz').deleteMany({ company: id }),
        require('../models/Question').deleteMany({ company: id }),
        require('../models/Attempt').deleteMany({ company: id }),
        require('../models/Answer').deleteMany({ company: id }),
        require('../models/Assignment').deleteMany({ company: id }),
        require('../models/AssignmentSubmission').deleteMany({ company: id }),
        require('../models/Announcement').deleteMany({ company: id }),
        require('../models/StudentRoster').deleteMany({ company: id }),
        require('../models/GradeBook').deleteMany({ company: id }),
        require('../models/PaymentLog').deleteMany({ company: id }),
      ]);
      await Company.deleteOne({ _id: id });
      deleted++;
    }
    res.json({ message: `Deleted ${deleted} company record(s) named "${name}"` });
  } catch(err) {
    console.error("Delete by name error:", err);
    res.status(500).json({ error: "Failed to delete" });
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

// ── POST /api/superadmin/email/:companyId ─────────────────────────────────────
router.post("/email/:companyId", async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) return res.status(400).json({ error: "Subject and message are required" });

    const company = await Company.findById(req.params.companyId).lean();
    if (!company) return res.status(404).json({ error: "Institution not found" });

    // Find the admin user for this company
    const admin = await User.findOne({ company: company._id, role: "admin" }).lean();
    if (!admin) return res.status(404).json({ error: "No admin found for this institution" });

    const result = await emailService.sendCustom({
      to: admin.email,
      toName: admin.name,
      subject,
      message,
    });

    if (!result.ok) return res.status(500).json({ error: result.error || "Failed to send email" });

    res.json({ ok: true, sentTo: admin.email });
  } catch (err) {
    console.error("superadmin email:", err);
    res.status(500).json({ error: "Server error" });
  }
});


// ── PATCH /api/superadmin/companies/:id/notes ─────────────────────────────────
router.patch("/companies/:id/notes", async (req, res) => {
  try {
    const { notes } = req.body;
    const company = await Company.findByIdAndUpdate(req.params.id, { $set: { "superadminNotes": notes } }, { new: true });
    if (!company) return res.status(404).json({ error: "Not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to save notes" });
  }
});

module.exports = router;

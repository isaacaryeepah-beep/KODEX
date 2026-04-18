const express      = require("express");
const jwt          = require("jsonwebtoken");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const Company      = require("../models/Company");
const User         = require("../models/User");
const PaymentLog        = require("../models/PaymentLog");
const PlatformSettings  = require("../models/PlatformSettings");

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

    // For legacy admin payments that landed on user.subscriptionExpiry but
    // never propagated to the company. We consider the institution effectively
    // subscribed if any of its admins still has an active personal sub.
    const adminSubs = await User.find({
      company: { $in: companyIds },
      role: "admin",
      subscriptionExpiry: { $gt: new Date() },
    }).select("company subscriptionExpiry").lean();
    const adminSubMap = {};
    adminSubs.forEach(a => {
      const id = a.company.toString();
      const cur = adminSubMap[id];
      if (!cur || new Date(a.subscriptionExpiry) > new Date(cur)) {
        adminSubMap[id] = a.subscriptionExpiry;
      }
    });

    const enriched = companies.map(c => {
      const id = c._id.toString();
      const trialDaysRemaining = c.trialEndDate
        ? Math.max(0, Math.ceil((new Date(c.trialEndDate) - Date.now()) / (1000*60*60*24)))
        : 0;
      const counts = countMap[id] || {};
      const adm = adminMap[id] || null;
      const adminSubEnd = adminSubMap[id] || null;
      // If company is not marked active but an admin has a live personal sub,
      // surface that as the effective subscription in the list.
      const effectiveSubActive = c.subscriptionActive || !!adminSubEnd;
      const effectiveSubEnd = c.subscriptionEndDate || adminSubEnd;
      return {
        ...c,
        subscriptionActive:  effectiveSubActive,
        subscriptionStatus:  effectiveSubActive ? "active" : c.subscriptionStatus,
        subscriptionEndDate: effectiveSubEnd,
        hasAccess:           c.hasAccess || !!adminSubEnd,
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

// ── GET /api/superadmin/companies/:id/lecturers ───────────────────────────────
router.get("/companies/:id/lecturers", async (req, res) => {
  try {
    const lecturers = await User.find({
      company: req.params.id,
      role: { $in: ["lecturer", "manager", "admin", "hod", "employee"] }
    }).select("name email role subscriptionStatus trialEndDate subscriptionExpiry semestersPaid createdAt").lean();

    // Auto-set trialEndDate for legacy accounts that don't have it
    const now = Date.now();
    const enriched = lecturers.map(l => {
      const trialEnd = l.trialEndDate || new Date(new Date(l.createdAt).getTime() + 30*24*60*60*1000);
      const subEnd   = l.subscriptionExpiry;
      const trialActive = trialEnd && new Date(trialEnd) > now;
      const subActive   = subEnd && new Date(subEnd) > now;
      return {
        ...l,
        trialEndDate: trialEnd,
        subscriptionStatus: subActive ? "active" : trialActive ? "trial" : "expired",
      };
    });

    res.json({ lecturers: enriched });
  } catch (err) {
    res.status(500).json({ error: "Failed to load lecturers" });
  }
});

// ── PATCH /api/superadmin/users/:id/extend-trial ─────────────────────────────
router.patch("/users/:id/extend-trial", async (req, res) => {
  try {
    const { expiryDate, days, action, adjustDays } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // ── Unsubscribe: wipe subscription + trial so access is revoked immediately
    if (action === 'unsubscribe') {
      user.subscriptionExpiry = null;
      user.subscriptionStatus = "expired";
      user.trialEndDate = new Date(Date.now() - 1000); // set to past
      await user.save();
      return res.json({ message: `${user.name} has been unsubscribed. Access revoked.` });
    }

    // ── Adjust days: add or subtract days from the active access window
    // Positive adjustDays extends, negative reduces. Operates on subscriptionExpiry
    // if the user is subscribed, otherwise on trialEndDate.
    if (typeof adjustDays === 'number' && adjustDays !== 0) {
      const now = Date.now();
      const isSubbed = user.subscriptionExpiry && new Date(user.subscriptionExpiry) > now;
      const field = isSubbed ? 'subscriptionExpiry' : 'trialEndDate';
      const base = user[field] ? new Date(user[field]) : new Date();
      const shifted = new Date(base.getTime() + adjustDays * 24 * 60 * 60 * 1000);
      user[field] = shifted;
      if (isSubbed && shifted <= now) {
        user.subscriptionStatus = "expired";
      }
      await user.save();
      const verb = adjustDays > 0 ? 'extended' : 'reduced';
      return res.json({
        message: `${user.name}'s ${isSubbed ? 'subscription' : 'trial'} ${verb} by ${Math.abs(adjustDays)} day(s). New end: ${shifted.toDateString()}`,
        [field]: shifted,
      });
    }

    let newEnd;
    if (expiryDate) {
      newEnd = new Date(expiryDate);
      newEnd.setHours(23, 59, 59, 999);
      if (isNaN(newEnd.getTime())) return res.status(400).json({ error: "Invalid date" });
    } else if (days) {
      const base = user.trialEndDate && new Date(user.trialEndDate) > Date.now()
        ? new Date(user.trialEndDate) : new Date();
      newEnd = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    } else if (req.body.semester) {
      // 1 semester = 16 weeks = 112 days
      const SEMESTER_DAYS = 112;
const SEMESTER_PRICE_GHS = 300;
      newEnd = new Date(Date.now() + SEMESTER_DAYS * 24 * 60 * 60 * 1000);
      user.subscriptionExpiry = newEnd;
      user.subscriptionStatus = "active";
      user.semestersPaid = (user.semestersPaid || 0) + 1;
      user.trialEndDate = user.trialEndDate || newEnd; // ensure trialEndDate is set
      await user.save();
      return res.json({ message: `Subscription activated for 1 semester (112 days) at GHS ${SEMESTER_PRICE_GHS}. Expires: ${newEnd.toDateString()}`, subscriptionExpiry: newEnd, price: SEMESTER_PRICE_GHS });
    } else {
      return res.status(400).json({ error: "Provide expiryDate or days" });
    }

    user.trialEndDate = newEnd;
    user.subscriptionStatus = "trial";
    await user.save();

    res.json({ message: `Trial set to ${newEnd.toDateString()}`, trialEndDate: newEnd });
  } catch (err) {
    res.status(500).json({ error: "Failed to update user trial" });
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

// ── GET /api/superadmin/analytics ────────────────────────────────────────────
router.get("/analytics", async (req, res) => {
  try {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ year: d.getFullYear(), month: d.getMonth() + 1, label: d.toLocaleString('en', { month: 'short', year: '2-digit' }) });
    }
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [userGrowth, revenueGrowth] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: sixMonthsAgo }, role: { $ne: "superadmin" } } },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, count: { $sum: 1 } } }
      ]),
      PaymentLog.aggregate([
        { $match: { paidAt: { $gte: sixMonthsAgo } } },
        { $group: { _id: { year: { $year: "$paidAt" }, month: { $month: "$paidAt" } }, total: { $sum: "$amount" } } }
      ])
    ]);

    const uMap = {}; userGrowth.forEach(r => { uMap[`${r._id.year}-${r._id.month}`] = r.count; });
    const rMap = {}; revenueGrowth.forEach(r => { rMap[`${r._id.year}-${r._id.month}`] = r.total; });

    res.json({
      labels:  months.map(m => m.label),
      users:   months.map(m => uMap[`${m.year}-${m.month}`] || 0),
      revenue: months.map(m => rMap[`${m.year}-${m.month}`] || 0),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

// ── GET /api/superadmin/issues ─────────────────────────────────────────────────
router.get("/issues", async (req, res) => {
  try {
    const [locked, suspended] = await Promise.all([
      User.find({ isLocked: true }).select("name email role company isLocked lockReason lockedAt failedLoginAttempts").populate("company","name mode").lean(),
      User.find({ isSuspended: true }).select("name email role company suspendedAt suspendedReason").populate("company","name mode").lean(),
    ]);
    const expiredCompanies = await Company.find({ subscriptionStatus: { $in: ["expired","inactive"] }, isActive: true })
      .select("name mode trialEndDate subscriptionStatus").lean();
    res.json({ locked, suspended, expiredCompanies });
  } catch (err) {
    res.status(500).json({ error: "Failed to load issues" });
  }
});

// ── GET /api/superadmin/users ──────────────────────────────────────────────────
router.get("/users", async (req, res) => {
  try {
    const { role, mode, search, page = 1 } = req.query;
    const limit = 100;
    const query = { role: { $ne: "superadmin" } };
    if (role) query.role = role;
    if (search) query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];

    let companyIds;
    if (mode) {
      const cos = await Company.find({ mode }).select("_id").lean();
      companyIds = cos.map(c => c._id);
      query.company = { $in: companyIds };
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("name email role company isActive isLocked createdAt subscriptionStatus trialEndDate subscriptionExpiry")
        .populate("company", "name mode institutionCode")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    res.json({ users, total, page: Number(page), pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: "Failed to load users" });
  }
});

// ── PATCH /api/superadmin/users/:id/role ──────────────────────────────────────
router.patch("/users/:id/role", async (req, res) => {
  try {
    const { role } = req.body;
    const allowed = ["admin","manager","employee","lecturer","hod","student"];
    if (!allowed.includes(role)) return res.status(400).json({ error: "Invalid role" });
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select("name email role");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ error: "Failed to update role" });
  }
});

// ── PATCH /api/superadmin/users/:id/unlock ────────────────────────────────────
router.patch("/users/:id/unlock", async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, {
      isLocked: false, lockReason: null, lockedAt: null, failedLoginAttempts: 0
    }, { new: true }).select("name email isLocked");
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ error: "Failed to unlock user" });
  }
});

// ── GET /api/superadmin/settings ─────────────────────────────────────────────
router.get("/settings", async (req, res) => {
  try {
    let s = await PlatformSettings.findOne();
    if (!s) s = await PlatformSettings.create({});
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: "Failed to load settings" });
  }
});

// ── POST /api/superadmin/settings ─────────────────────────────────────────────
router.post("/settings", async (req, res) => {
  try {
    const { trialDays, academicPrice, corporatePrice, currency } = req.body;
    const allowed = {};
    if (trialDays      != null) allowed.trialDays      = Math.max(1, Number(trialDays));
    if (academicPrice  != null) allowed.academicPrice  = Math.max(0, Number(academicPrice));
    if (corporatePrice != null) allowed.corporatePrice = Math.max(0, Number(corporatePrice));
    if (currency       != null) allowed.currency       = String(currency).slice(0, 10);
    const s = await PlatformSettings.findOneAndUpdate({}, { $set: allowed }, { upsert: true, new: true });
    res.json(s);
  } catch (err) {
    res.status(500).json({ error: "Failed to save settings" });
  }
});

// ── PATCH /api/superadmin/companies/:id/subscription ─────────────────────────
// body: { action: 'activate' | 'suspend' }
router.patch("/companies/:id/subscription", async (req, res) => {
  try {
    const { action } = req.body;
    if (!['activate', 'suspend'].includes(action)) {
      return res.status(400).json({ error: "action must be 'activate' or 'suspend'" });
    }
    const company = await Company.findById(req.params.id);
    if (!company) return res.status(404).json({ error: "Company not found" });

    if (action === 'activate') {
      company.subscriptionActive = true;
      company.subscriptionStatus = 'active';
      company.hasAccess = true;
      if (!company.subscriptionEndDate || new Date(company.subscriptionEndDate) < Date.now()) {
        const months = company.mode === 'corporate' ? 1 : 6;
        company.subscriptionEndDate = new Date(Date.now() + months * 30 * 24 * 60 * 60 * 1000);
      }
    } else {
      company.subscriptionActive = false;
      company.subscriptionStatus = 'inactive';
      company.hasAccess = false;
    }
    await company.save();
    res.json({ ok: true, subscriptionActive: company.subscriptionActive, subscriptionStatus: company.subscriptionStatus });
  } catch (err) {
    res.status(500).json({ error: "Failed to update subscription" });
  }
});

module.exports = router;

const express = require("express");
const router  = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const Branch     = require("../models/Branch");
const Company    = require("../models/Company");
const User       = require("../models/User");
const Timesheet  = require("../models/Timesheet");
const LeaveRequest = require("../models/LeaveRequest");
const Goal       = require("../models/Goal");
const Review     = require("../models/Review");
const TrainingProgress = require("../models/TrainingProgress");
const { asyncHandler } = require("../utils/errors");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const adminOnly = requireRole("admin", "superadmin");
const canManage = requireRole("admin", "manager", "superadmin");

// ─────────────────────────────────────────────────────────────
// BRANCHES
// ─────────────────────────────────────────────────────────────

router.get("/branches", ...mw, asyncHandler(async (req, res) => {
  const branches = await Branch.find({ company: req.user.company, isActive: true })
    .populate("manager", "name employeeId")
    .sort({ name: 1 });

  // Attach headcount
  const withCount = await Promise.all(branches.map(async b => {
    const count = await User.countDocuments({ company: req.user.company, branch: b._id, isActive: true });
    return { ...b.toObject(), headcount: count };
  }));

  res.json({ branches: withCount });
}));

router.post("/branches", ...mw, adminOnly, asyncHandler(async (req, res) => {
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
}));

router.patch("/branches/:id", ...mw, adminOnly, asyncHandler(async (req, res) => {
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
}));

router.delete("/branches/:id", ...mw, adminOnly, asyncHandler(async (req, res) => {
  await Branch.findOneAndUpdate({ _id: req.params.id, company: req.user.company }, { isActive: false });
  // Unset branch from all users in this branch
  await User.updateMany({ branch: req.params.id }, { $unset: { branch: 1 } });
  res.json({ message: "Branch removed" });
}));

// Assign employee to branch
router.patch("/branches/:id/assign-user", ...mw, canManage, asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const user = await User.findOneAndUpdate(
    { _id: userId, company: req.user.company },
    { branch: req.params.id },
    { new: true }
  ).select("name employeeId department branch");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
}));

// Remove employee from branch
router.patch("/branches/:id/remove-user", ...mw, canManage, asyncHandler(async (req, res) => {
  const { userId } = req.body;
  const user = await User.findOneAndUpdate(
    { _id: userId, company: req.user.company },
    { $unset: { branch: 1 } },
    { new: true }
  ).select("name employeeId department");
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user });
}));

// ─────────────────────────────────────────────────────────────
// WHITE-LABEL BRANDING
// ─────────────────────────────────────────────────────────────

router.get("/branding", ...mw, asyncHandler(async (req, res) => {
  const company = await Company.findById(req.user.company).select("name branding");
  res.json({ branding: company?.branding || {}, companyName: company?.name });
}));

router.patch("/branding", ...mw, adminOnly, asyncHandler(async (req, res) => {
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

  require("../services/push/pushService").clearBrandingCache(req.user.company);
  res.json({ branding: company.branding, companyName: company.name });
}));

// Direct logo file upload (multipart field "logo") — stores via the shared
// media storage (Cloudinary) and saves the resulting URL to branding.logoUrl,
// so admins don't need to host the image somewhere themselves and paste a URL.
const multer = require("multer");
const mediaStorage = require("../services/storage/mediaStorage");
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB — logos are small
});

router.post("/branding/logo", ...mw, adminOnly, logoUpload.single("logo"), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded (field name: logo)" });
  // No SVG: Cloudinary refuses to deliver SVG originals by default (security
  // setting), so an SVG upload "succeeds" but the logo never displays.
  if (!/^image\/(png|jpe?g|webp)$/.test(req.file.mimetype)) {
    return res.status(400).json({ error: "Logo must be a PNG, JPG, or WebP image (SVG isn't supported)" });
  }
  const uploaded = await mediaStorage.uploadImage(req.file.buffer, {
    folder:       "company-logos",
    filenameHint: `logo-${req.user.company}`,
    mimeType:     req.file.mimetype,
    fileSize:     req.file.size,
  });
  const company = await Company.findByIdAndUpdate(
    req.user.company,
    { $set: { "branding.logoUrl": uploaded.url } },
    { new: true }
  ).select("name branding");
  require("../services/push/pushService").clearBrandingCache(req.user.company);
  res.json({ logoUrl: uploaded.url, branding: company.branding, companyName: company.name });
}));

// ─────────────────────────────────────────────────────────────
// COMPANY SETTINGS (name, timezone, holidays, locations, permissions)
// ─────────────────────────────────────────────────────────────

router.get("/company-settings", ...mw, asyncHandler(async (req, res) => {
  const company = await Company.findById(req.user.company)
    .select("name timezone publicHolidays officeLocations modulePermissions clockSettings branding");
  res.json({ settings: company });
}));

router.patch("/company-settings", ...mw, adminOnly, asyncHandler(async (req, res) => {
  const { name, timezone, publicHolidays, officeLocations } = req.body;
  const update = {};
  if (name     !== undefined && String(name).trim()) update.name = String(name).trim();
  if (timezone !== undefined) update.timezone = String(timezone).trim();
  if (Array.isArray(publicHolidays)) {
    update.publicHolidays = publicHolidays
      .filter(h => h && h.name && h.date)
      .slice(0, 50)
      .map(h => ({ name: String(h.name).trim().slice(0, 100), date: new Date(h.date) }));
  }
  if (Array.isArray(officeLocations)) {
    update.officeLocations = officeLocations
      .filter(l => l && l.name)
      .slice(0, 50)
      .map(l => ({ name: String(l.name).trim().slice(0, 100), address: String(l.address || "").trim().slice(0, 300) }));
  }
  await Company.updateOne({ _id: req.user.company }, { $set: update });
  const company = await Company.findById(req.user.company)
    .select("name timezone publicHolidays officeLocations").lean();
  res.json({ settings: company });
}));

router.patch("/module-permissions", ...mw, adminOnly, asyncHandler(async (req, res) => {
  const { modulePermissions } = req.body;
  // Expected shape: { manager: ["users","shifts",...], employee: [...] } or null to reset.
  if (modulePermissions !== null && typeof modulePermissions !== "object") {
    return res.status(400).json({ error: "modulePermissions must be an object or null" });
  }
  let clean = null;
  if (modulePermissions) {
    clean = {};
    for (const [role, mods] of Object.entries(modulePermissions)) {
      if (!["manager", "employee"].includes(role)) continue; // admin always sees everything
      if (Array.isArray(mods)) clean[role] = mods.map(String).slice(0, 60);
    }
  }
  await Company.updateOne({ _id: req.user.company }, { $set: { modulePermissions: clean } });
  const company = await Company.findById(req.user.company).select("modulePermissions").lean();
  res.json({ modulePermissions: company.modulePermissions });
}));

// Attendance reporting settings — non-financial: just the cadence a company
// wants its hours/attendance export packaged on. Never a pay amount or
// currency; Dikly does not compute or store compensation.
router.patch("/attendance-reporting-settings", ...mw, adminOnly, asyncHandler(async (req, res) => {
  const { period, standardHours } = req.body;
  const update = {};
  if (period        !== undefined) update["attendanceReporting.period"]        = period;
  if (standardHours !== undefined) update["attendanceReporting.standardHours"] = standardHours;

  const company = await Company.findByIdAndUpdate(
    req.user.company, { $set: update }, { new: true }
  ).select("attendanceReporting");

  res.json({ attendanceReporting: company.attendanceReporting });
}));

// ─────────────────────────────────────────────────────────────
// ADVANCED ANALYTICS
// ─────────────────────────────────────────────────────────────

router.get("/analytics", ...mw, canManage, asyncHandler(async (req, res) => {
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

    const period = new Date().toISOString().slice(0, 7);

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
      timesheets: { totalHours: tsAgg[0]?.totalHours || 0, count: tsAgg[0]?.count || 0, period },
    });
}));

module.exports = router;

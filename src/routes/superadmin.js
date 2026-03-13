const express    = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const Company    = require("../models/Company");
const User       = require("../models/User");

const router = express.Router();
router.use(authenticate);
router.use(requireRole("superadmin"));

// GET /api/superadmin/overview — all companies + stats
router.get("/overview", async (req, res) => {
  try {
    const companies = await Company.find({}).sort({ createdAt: -1 }).lean();

    // Attach user counts per company
    const companyIds = companies.map(c => c._id);
    const userCounts = await User.aggregate([
      { $match: { company: { $in: companyIds } } },
      { $group: { _id: "$company", total: { $sum: 1 }, roles: { $push: "$role" } } }
    ]);
    const countMap = {};
    userCounts.forEach(c => { countMap[c._id.toString()] = { total: c.total, roles: c.roles }; });

    const enriched = companies.map(c => ({
      ...c,
      userCount: countMap[c._id.toString()]?.total || 0,
      trialDaysRemaining: c.trialEndDate
        ? Math.max(0, Math.ceil((new Date(c.trialEndDate) - Date.now()) / (1000*60*60*24)))
        : 0,
      isTrialActive: c.trialEndDate ? new Date(c.trialEndDate) > Date.now() : false,
    }));

    res.json({ companies: enriched, total: companies.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to load overview" });
  }
});

// PATCH /api/superadmin/companies/:id/toggle — activate/deactivate
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

module.exports = router;

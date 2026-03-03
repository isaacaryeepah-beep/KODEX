const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const mongoose = require("mongoose");
const User = require("../models/User");

router.use(authenticate);

// GET /api/search?q=john&role=student
router.get(
  "/",
  requireRole("admin", "manager", "lecturer", "superadmin"),
  async (req, res) => {
    try {
      const { q, role } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({ error: "Query must be at least 2 characters" });
      }

      // Safely extract company ID whether it's a string, ObjectId, or populated object
      let companyId = req.user.company;
      if (companyId && typeof companyId === "object" && companyId._id) {
        companyId = companyId._id;
      }
      companyId = String(companyId);

      console.log("[SEARCH] q:", q, "| companyId:", companyId, "| role filter:", role);

      // Find all users in the same company first (no regex yet) to debug
      const allInCompany = await User.find({ company: companyId }).select("name").lean();
      console.log("[SEARCH] Total users in company:", allInCompany.length, allInCompany.map(u => u.name));

      const searchRegex = new RegExp(q.trim(), "i");

      const filter = {
        company: companyId,
        _id: { $ne: req.user._id },
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { indexNumber: searchRegex },
          { employeeId: searchRegex },
        ],
      };

      if (role && role !== "all") {
        filter.role = role;
      }

      const users = await User.find(filter)
        .select("name email indexNumber employeeId role isActive createdAt department")
        .limit(50)
        .lean();

      console.log("[SEARCH] Results found:", users.length);

      return res.json({ users });
    } catch (e) {
      console.error("[SEARCH] Error:", e);
      return res.status(500).json({ error: "Search failed: " + e.message });
    }
  }
);

module.exports = router;

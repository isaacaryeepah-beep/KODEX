const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const mongoose = require("mongoose");
const User = require("../models/User");

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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


      const searchRegex = new RegExp(escapeRegex(q.trim()), "i");

      const filter = {
        company: companyId,
        _id: { $ne: req.user._id },
        $or: [
          { name: searchRegex },
          { email: searchRegex },
          { IndexNumber: searchRegex },
          { employeeId: searchRegex },
        ],
      };

      if (role && role !== "all") {
        filter.role = role;
      }

      const users = await User.find(filter)
        .select("name email IndexNumber employeeId role isActive createdAt department")
        .limit(50)
        .lean();

      return res.json({ users });
    } catch (e) {
      console.error("[SEARCH] Error:", e);
      return res.status(500).json({ error: "Search failed" });
    }
  }
);

module.exports = router;

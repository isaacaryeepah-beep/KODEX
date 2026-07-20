const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const User = require("../models/User");

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const STAFF = ["admin", "manager", "lecturer", "superadmin", "hod"];

router.use(authenticate);

// GET /api/search?q=john&role=student
router.get(
  "/",
  requireRole(...STAFF),
  async (req, res) => {
    try {
      const { q, role } = req.query;

      if (!q || q.trim().length < 2) {
        return res.status(400).json({ error: "Query must be at least 2 characters" });
      }

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
        .select("name email IndexNumber employeeId role isActive createdAt department programme studentLevel profilePhoto")
        .limit(50)
        .lean();

      return res.json({ users });
    } catch (e) {
      console.error("[SEARCH] Error:", e);
      return res.status(500).json({ error: "Search failed" });
    }
  }
);

// GET /api/search/student/:id — full profile for staff lookup
router.get(
  "/student/:id",
  requireRole(...STAFF),
  async (req, res) => {
    try {
      let companyId = req.user.company;
      if (companyId && typeof companyId === "object" && companyId._id) {
        companyId = companyId._id;
      }
      companyId = String(companyId);

      // Serves ANY user in the company, not just students: the search list
      // includes lecturers/HODs/admins (role tabs), and clicking one of
      // those rows used to 404 here because of a role:"student" filter.
      const student = await User.findOne({ _id: req.params.id, company: companyId })
        .select(
          "name email role IndexNumber employeeId phone programme department studentLevel studentGroup " +
          "sessionType semester academicYear isActive isLocked lockReason lockedAt " +
          "profilePhoto createdAt lastLoginAt isApproved selfRegistered isClassRep"
        )
        .lean();

      if (!student) return res.status(404).json({ error: "User not found" });

      return res.json({ student });
    } catch (e) {
      console.error("[SEARCH/student/:id] Error:", e);
      return res.status(500).json({ error: "Failed to fetch student profile" });
    }
  }
);

module.exports = router;

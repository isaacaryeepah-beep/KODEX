"use strict";

/**
 * employeeProfiles.js
 * Mounted at: /api/employee-profiles   (registered in server.js)
 *
 * Route summary
 * -------------
 * GET    /                         list all profiles          [admin/manager]
 * POST   /                         create profile             [admin]
 * GET    /my                       get my own profile
 * GET    /:userId                  get profile by user        [admin/manager/self]
 * PATCH  /:userId                  update profile             [admin/self-limited]
 * POST   /:userId/documents        attach a document ref      [admin]
 * DELETE /:userId/documents/:docId remove document ref        [admin]
 *
 * Corporate mode only.
 *
 * Access rules:
 *   - admin/manager can read any profile in their company
 *   - employee can only read/edit their own profile (limited fields)
 *   - sensitive fields (salary band, national ID, notes) are hidden from
 *     non-admin employees in their own profile view
 */

const express = require("express");
const router  = express.Router();
const authenticate              = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const EmployeeProfile = require("../models/EmployeeProfile");
const User            = require("../models/User");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const adminOnly = requireRole("admin", "superadmin");
const canManage = requireRole("admin", "manager", "superadmin");

// Fields an employee is NOT allowed to edit on their own profile
const SENSITIVE_FIELDS = new Set([
  "salaryBand", "nationalId", "notes",
  "terminationDate", "terminationReason",
  "hireDate", "probationEndDate", "employmentType",
]);

// ── GET /my  — own profile ───────────────────────────────────────────────────
// Must come BEFORE /:userId to avoid "my" being treated as an ObjectId
router.get("/my", ...mw, async (req, res) => {
  try {
    let profile = await EmployeeProfile.findOne({
      company: req.user.company,
      user:    req.user._id,
    })
      .populate("departmentRef", "name code")
      .populate("teamRef",       "name")
      .populate("branchRef",     "name city")
      .populate("manager",       "name employeeId");

    if (!profile) {
      // Auto-create a blank profile on first access
      profile = await EmployeeProfile.create({
        company: req.user.company,
        user:    req.user._id,
      });
    }

    // Strip sensitive fields from own view (admin can see everything)
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    const obj = profile.toObject();
    if (!isAdmin) {
      delete obj.salaryBand;
      delete obj.nationalId;
      delete obj.notes;
    }

    res.json({ profile: obj });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch your profile" });
  }
});

// ── GET /  — list all profiles (admin/manager) ───────────────────────────────
router.get("/", ...mw, canManage, async (req, res) => {
  try {
    const filter = { company: req.user.company };
    if (req.query.departmentId) filter.departmentRef = req.query.departmentId;
    if (req.query.employmentType) filter.employmentType = req.query.employmentType;

    const profiles = await EmployeeProfile.find(filter)
      .populate("user",          "name email employeeId role isActive")
      .populate("departmentRef", "name code")
      .populate("teamRef",       "name")
      .populate("branchRef",     "name city")
      .populate("manager",       "name employeeId")
      .sort({ createdAt: -1 });

    res.json({ profiles, count: profiles.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch profiles" });
  }
});

// ── POST /  — create profile ─────────────────────────────────────────────────
router.post("/", ...mw, adminOnly, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId is required" });

    // Verify user belongs to this company
    const user = await User.findOne({ _id: userId, company: req.user.company });
    if (!user) return res.status(404).json({ error: "User not found" });

    const {
      jobTitle, employmentType, hireDate, probationEndDate,
      departmentRef, teamRef, branchRef, manager,
      salaryBand, currency,
      dateOfBirth, gender, nationality, nationalId, address, city, country,
      workPhone, workEmail, emergencyContact,
      notes,
    } = req.body;

    const profile = await EmployeeProfile.findOneAndUpdate(
      { company: req.user.company, user: userId },
      {
        $setOnInsert: { company: req.user.company, user: userId },
        $set: {
          jobTitle:       jobTitle || "",
          employmentType: employmentType || "full_time",
          hireDate:       hireDate ? new Date(hireDate) : null,
          probationEndDate: probationEndDate ? new Date(probationEndDate) : null,
          departmentRef:  departmentRef || null,
          teamRef:        teamRef       || null,
          branchRef:      branchRef     || null,
          manager:        manager       || null,
          salaryBand:     salaryBand    || "",
          currency:       currency      || "GHS",
          dateOfBirth:    dateOfBirth ? new Date(dateOfBirth) : null,
          gender:         gender        || "",
          nationality:    nationality   || "",
          nationalId:     nationalId    || "",
          address:        address       || "",
          city:           city          || "",
          country:        country       || "",
          workPhone:      workPhone     || "",
          workEmail:      workEmail     || "",
          emergencyContact: emergencyContact || {},
          notes:          notes         || "",
          updatedBy:      req.user._id,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .populate("user",          "name email employeeId role")
      .populate("departmentRef", "name code")
      .populate("teamRef",       "name")
      .populate("branchRef",     "name city")
      .populate("manager",       "name employeeId");

    res.status(201).json({ profile });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create profile" });
  }
});

// ── GET /:userId  — single profile ───────────────────────────────────────────
router.get("/:userId", ...mw, async (req, res) => {
  try {
    const isSelf    = req.user._id.toString() === req.params.userId;
    const isManager = ["admin", "manager", "superadmin"].includes(req.user.role);
    if (!isSelf && !isManager) {
      return res.status(403).json({ error: "Access denied" });
    }

    const profile = await EmployeeProfile.findOne({
      company: req.user.company,
      user:    req.params.userId,
    })
      .populate("user",          "name email employeeId role isActive")
      .populate("departmentRef", "name code")
      .populate("teamRef",       "name")
      .populate("branchRef",     "name city")
      .populate("manager",       "name employeeId role");

    if (!profile) return res.status(404).json({ error: "Profile not found" });

    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    const obj = profile.toObject({ virtuals: true });
    if (!isAdmin && isSelf) {
      delete obj.salaryBand;
      delete obj.nationalId;
      delete obj.notes;
    }

    res.json({ profile: obj });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ── PATCH /:userId  — update profile ─────────────────────────────────────────
router.patch("/:userId", ...mw, async (req, res) => {
  try {
    const isSelf    = req.user._id.toString() === req.params.userId;
    const isAdmin   = ["admin", "superadmin"].includes(req.user.role);
    const isManager = req.user.role === "manager";

    if (!isSelf && !isAdmin && !isManager) {
      return res.status(403).json({ error: "Access denied" });
    }

    const update = {};
    const ALLOWED_ALL = [
      "jobTitle", "employmentType", "hireDate", "probationEndDate",
      "terminationDate", "terminationReason",
      "departmentRef", "teamRef", "branchRef", "manager",
      "salaryBand", "currency",
      "dateOfBirth", "gender", "nationality", "nationalId",
      "address", "city", "country",
      "workPhone", "workEmail", "emergencyContact",
      "notes", "onboardingComplete",
    ];
    const ALLOWED_SELF = [
      "address", "city", "country", "workPhone", "workEmail",
      "emergencyContact", "gender", "nationality", "dateOfBirth",
    ];

    const allowedFields = isAdmin ? ALLOWED_ALL : isManager ? ALLOWED_ALL : ALLOWED_SELF;
    allowedFields.forEach((f) => {
      if (req.body[f] !== undefined) {
        // Employees cannot edit sensitive fields even from ALLOWED_ALL
        if (!isAdmin && SENSITIVE_FIELDS.has(f)) return;
        update[f] = req.body[f];
      }
    });

    // Parse dates
    ["hireDate", "probationEndDate", "terminationDate", "dateOfBirth"].forEach((d) => {
      if (update[d]) update[d] = new Date(update[d]);
    });

    update.updatedBy = req.user._id;

    const profile = await EmployeeProfile.findOneAndUpdate(
      { company: req.user.company, user: req.params.userId },
      { $set: update },
      { new: true, upsert: false }
    )
      .populate("departmentRef", "name code")
      .populate("teamRef",       "name")
      .populate("manager",       "name employeeId");

    if (!profile) return res.status(404).json({ error: "Profile not found" });
    res.json({ profile });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ── POST /:userId/documents  — attach document reference ─────────────────────
router.post("/:userId/documents", ...mw, adminOnly, async (req, res) => {
  try {
    const { docType, name, url } = req.body;
    if (!url) return res.status(400).json({ error: "Document URL is required" });

    const profile = await EmployeeProfile.findOneAndUpdate(
      { company: req.user.company, user: req.params.userId },
      {
        $push: {
          documents: {
            docType:    docType    || "other",
            name:       name       || "",
            url,
            uploadedAt: new Date(),
            uploadedBy: req.user._id,
          },
        },
      },
      { new: true }
    );

    if (!profile) return res.status(404).json({ error: "Profile not found" });
    res.json({ documents: profile.documents });
  } catch (e) {
    res.status(500).json({ error: "Failed to attach document" });
  }
});

// ── DELETE /:userId/documents/:docId  — remove document reference ─────────────
router.delete("/:userId/documents/:docId", ...mw, adminOnly, async (req, res) => {
  try {
    const profile = await EmployeeProfile.findOneAndUpdate(
      { company: req.user.company, user: req.params.userId },
      { $pull: { documents: { _id: req.params.docId } } },
      { new: true }
    );
    if (!profile) return res.status(404).json({ error: "Profile not found" });
    res.json({ documents: profile.documents });
  } catch (e) {
    res.status(500).json({ error: "Failed to remove document" });
  }
});

module.exports = router;

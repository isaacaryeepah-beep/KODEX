"use strict";

/**
 * badges.js
 * Mounted at: /api/badges   (registered in server.js)
 *
 * Badge & Achievement system.
 * Admins define a badge catalog; staff award badges manually; an achievement
 * check endpoint auto-awards badges linked to standard criteria.
 *
 * Route summary
 * -------------
 * Badge catalog
 *   GET    /catalog              list active badges (all authenticated users)
 *   POST   /catalog              create a badge             [admin, superadmin]
 *   PATCH  /catalog/:id          update a badge             [admin, superadmin]
 *   DELETE /catalog/:id          deactivate a badge         [admin, superadmin]
 *
 * User badges
 *   GET    /my                   my earned (non-revoked) badges
 *   GET    /user/:userId         badges for a specific user [staff or self]
 *   POST   /award                manually award a badge     [staff]
 *   DELETE /awards/:awardId      revoke an award            [admin, superadmin]
 *
 * Achievements
 *   POST   /check/:userId        auto-award standard achievements  [staff]
 *   GET    /leaderboard          top badge earners in the company  [all]
 *
 * No requireMode() — badges span academic and corporate contexts.
 */

const express  = require("express");
const router   = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole }               = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");

const Badge    = require("../models/Badge");
const { BADGE_CATEGORIES, ACHIEVEMENT_KEYS } = Badge;
const UserBadge = require("../models/UserBadge");
const User      = require("../models/User");

// Models used by achievement checks
const StudentCourseEnrollment = require("../models/StudentCourseEnrollment");
const AttendanceSession       = require("../models/AttendanceSession");
const AttendanceRecord        = require("../models/AttendanceRecord");
const TrainingProgress        = require("../models/TrainingProgress");
const NormalQuizResult        = require("../models/NormalQuizResult");

// ── Shared middleware ────────────────────────────────────────────────────────
const mw    = [authenticate, requireActiveSubscription, companyIsolation];
const STAFF = ["lecturer", "hod", "manager", "admin", "superadmin"];
function isStaff(r) { return STAFF.includes(r); }

// ════════════════════════════════════════════════════════════════════════════
// ACHIEVEMENT CHECK LOGIC
// ════════════════════════════════════════════════════════════════════════════

/**
 * Returns true if the user meets the criterion for the given achievementKey.
 * Each checker is async and tenant-isolated.
 */
const achievementCheckers = {
  async COURSE_COMPLETE(userId, company) {
    const count = await StudentCourseEnrollment.countDocuments({
      company, student: userId, status: "completed",
    });
    return count >= 1;
  },

  async FIVE_COURSES(userId, company) {
    const count = await StudentCourseEnrollment.countDocuments({
      company, student: userId, status: "completed",
    });
    return count >= 5;
  },

  async TEN_COURSES(userId, company) {
    const count = await StudentCourseEnrollment.countDocuments({
      company, student: userId, status: "completed",
    });
    return count >= 10;
  },

  async PERFECT_ATTENDANCE(userId, company) {
    // Find any course where the student attended every stopped session (min 3)
    const allSessions = await AttendanceSession.find(
      { company, status: "stopped", course: { $ne: null } },
      { _id: 1, course: 1 }
    ).lean();

    // Group session IDs by course
    const byCourse = {};
    for (const s of allSessions) {
      const key = s.course.toString();
      (byCourse[key] = byCourse[key] || []).push(s._id);
    }

    for (const sessionIds of Object.values(byCourse)) {
      if (sessionIds.length < 3) continue; // need at least 3 sessions to be meaningful
      const attended = await AttendanceRecord.countDocuments({
        company,
        user:    userId,
        session: { $in: sessionIds },
        status:  { $in: ["present", "late"] },
      });
      if (attended === sessionIds.length) return true;
    }
    return false;
  },

  async TRAINING_COMPLETE(userId, company) {
    const count = await TrainingProgress.countDocuments({
      company, employee: userId, status: "completed",
    });
    return count >= 1;
  },

  async FIVE_TRAININGS(userId, company) {
    const count = await TrainingProgress.countDocuments({
      company, employee: userId, status: "completed",
    });
    return count >= 5;
  },

  async QUIZ_ACE(userId, company) {
    const result = await NormalQuizResult.findOne({
      company,
      student:    userId,
      isReleased: true,
      percentage: { $gte: 90 },
    }).select("_id").lean();
    return !!result;
  },
};

// ════════════════════════════════════════════════════════════════════════════
// BADGE CATALOG ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// GET /catalog  — list active badges
// ---------------------------------------------------------------------------
router.get("/catalog", ...mw, async (req, res) => {
  try {
    const filter = { company: req.user.company, isActive: true };
    if (req.query.category) filter.category = req.query.category;

    const badges = await Badge.find(filter)
      .populate("createdBy", "name")
      .sort({ category: 1, name: 1 })
      .lean();

    res.json({ badges, count: badges.length });
  } catch (err) {
    console.error("list badges:", err);
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

// ---------------------------------------------------------------------------
// POST /catalog  — create a badge  [admin, superadmin]
// ---------------------------------------------------------------------------
router.post("/catalog", ...mw, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const company = req.user.company;
    const { name, description, icon, color, category, achievementKey } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: "name is required" });

    if (category && !BADGE_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${BADGE_CATEGORIES.join(", ")}` });
    }
    if (achievementKey && !ACHIEVEMENT_KEYS.includes(achievementKey)) {
      return res.status(400).json({ error: `achievementKey must be one of: ${ACHIEVEMENT_KEYS.join(", ")}` });
    }

    const badge = await Badge.create({
      company,
      name:           name.trim(),
      description:    (description || "").trim(),
      icon:           icon   || "🏅",
      color:          color  || "#6366f1",
      category:       category       || "general",
      achievementKey: achievementKey || null,
      createdBy:      req.user._id,
    });

    res.status(201).json({ badge });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "A badge with this achievementKey already exists for your company" });
    }
    console.error("create badge:", err);
    res.status(500).json({ error: "Failed to create badge" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /catalog/:id  — update a badge  [admin, superadmin]
// ---------------------------------------------------------------------------
router.patch("/catalog/:id", ...mw, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const company = req.user.company;
    const badge   = await Badge.findOne({ _id: req.params.id, company });
    if (!badge) return res.status(404).json({ error: "Badge not found" });

    const EDITABLE = ["name", "description", "icon", "color", "category", "isActive"];
    for (const key of EDITABLE) {
      if (req.body[key] !== undefined) badge[key] = req.body[key];
    }
    badge.updatedBy = req.user._id;
    await badge.save();

    res.json({ badge });
  } catch (err) {
    res.status(500).json({ error: "Failed to update badge" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /catalog/:id  — deactivate (soft) a badge  [admin, superadmin]
// ---------------------------------------------------------------------------
router.delete("/catalog/:id", ...mw, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const company = req.user.company;
    const badge   = await Badge.findOneAndUpdate(
      { _id: req.params.id, company },
      { $set: { isActive: false, updatedBy: req.user._id } },
      { new: true }
    );
    if (!badge) return res.status(404).json({ error: "Badge not found" });
    res.json({ message: "Badge deactivated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to deactivate badge" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// USER BADGE ROUTES
// Declare /my, /leaderboard, /check/* BEFORE /user/:userId and /awards/:awardId
// to prevent Express shadowing.
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// GET /my  — current user's earned badges
// ---------------------------------------------------------------------------
router.get("/my", ...mw, async (req, res) => {
  try {
    const awards = await UserBadge.find({
      company:   req.user.company,
      user:      req.user._id,
      isRevoked: false,
    })
      .populate("badge",     "name description icon color category")
      .populate("awardedBy", "name")
      .sort({ awardedAt: -1 })
      .lean();

    res.json({ awards, count: awards.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your badges" });
  }
});

// ---------------------------------------------------------------------------
// GET /leaderboard  — top badge earners (top 20)
// ---------------------------------------------------------------------------
router.get("/leaderboard", ...mw, async (req, res) => {
  try {
    const company = req.user.company;

    const rows = await UserBadge.aggregate([
      { $match: { company, isRevoked: false } },
      { $group: { _id: "$user", badgeCount: { $sum: 1 } } },
      { $sort: { badgeCount: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from:         "users",
          localField:   "_id",
          foreignField: "_id",
          as:           "userDoc",
        },
      },
      { $unwind: "$userDoc" },
      {
        $project: {
          _id:        0,
          userId:     "$_id",
          badgeCount: 1,
          name:       "$userDoc.name",
          role:       "$userDoc.role",
        },
      },
    ]);

    res.json({ leaderboard: rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

// ---------------------------------------------------------------------------
// POST /check/:userId  — run achievement checks, auto-award qualifying badges  [staff]
// ---------------------------------------------------------------------------
router.post("/check/:userId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company = req.user.company;
    const userId  = req.params.userId;

    // Verify user belongs to same company
    const target = await User.findOne({ _id: userId, company, isActive: true }).select("_id name").lean();
    if (!target) return res.status(404).json({ error: "User not found" });

    // Find all active badges with achievementKeys in this company
    const autoBadges = await Badge.find({
      company,
      isActive:       true,
      achievementKey: { $in: ACHIEVEMENT_KEYS },
    }).lean();

    if (autoBadges.length === 0) {
      return res.json({ awarded: [], message: "No auto-award badges configured for this company" });
    }

    // Find badges the user already holds (not revoked)
    const existing = await UserBadge.find({
      company,
      user:      userId,
      isRevoked: false,
    }).select("badge").lean();
    const alreadyHas = new Set(existing.map(ub => ub.badge.toString()));

    const awarded   = [];
    const skipped   = [];

    for (const badge of autoBadges) {
      if (alreadyHas.has(badge._id.toString())) {
        skipped.push({ badgeId: badge._id, name: badge.name, reason: "already_earned" });
        continue;
      }

      const checker = achievementCheckers[badge.achievementKey];
      if (!checker) {
        skipped.push({ badgeId: badge._id, name: badge.name, reason: "no_checker" });
        continue;
      }

      const qualifies = await checker(userId, company);
      if (!qualifies) {
        skipped.push({ badgeId: badge._id, name: badge.name, reason: "criteria_not_met" });
        continue;
      }

      // Award (upsert in case of a revoked record)
      await UserBadge.findOneAndUpdate(
        { company, user: userId, badge: badge._id },
        {
          $set: {
            isRevoked:    false,
            revokedBy:    null,
            revokedAt:    null,
            revokeReason: null,
            awardedBy:    null,  // system award
            awardedAt:    new Date(),
            note:         `Auto-awarded: ${badge.achievementKey}`,
          },
        },
        { upsert: true }
      );
      awarded.push({ badgeId: badge._id, name: badge.name, icon: badge.icon });
    }

    res.json({
      userId:   target._id,
      userName: target.name,
      awarded,
      skipped,
      message: `${awarded.length} badge(s) awarded, ${skipped.length} skipped`,
    });
  } catch (err) {
    console.error("check achievements:", err);
    res.status(500).json({ error: "Failed to run achievement check" });
  }
});

// ---------------------------------------------------------------------------
// POST /award  — manually award a badge  [staff]
// Body: { userId, badgeId, note? }
// ---------------------------------------------------------------------------
router.post("/award", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company = req.user.company;
    const { userId, badgeId, note } = req.body;

    if (!userId || !badgeId) {
      return res.status(400).json({ error: "userId and badgeId are required" });
    }

    // Verify user and badge belong to same company
    const [target, badge] = await Promise.all([
      User.findOne({ _id: userId, company, isActive: true }).select("name role").lean(),
      Badge.findOne({ _id: badgeId, company, isActive: true }).select("name icon").lean(),
    ]);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!badge)  return res.status(404).json({ error: "Badge not found or inactive" });

    // Upsert: restore if previously revoked
    const award = await UserBadge.findOneAndUpdate(
      { company, user: userId, badge: badgeId },
      {
        $set: {
          awardedBy:    req.user._id,
          awardedAt:    new Date(),
          note:         (note || "").trim(),
          isRevoked:    false,
          revokedBy:    null,
          revokedAt:    null,
          revokeReason: null,
        },
      },
      { upsert: true, new: true }
    );

    await award.populate("badge",     "name description icon color category");
    await award.populate("awardedBy", "name");

    res.status(201).json({ award, badgeName: badge.name });
  } catch (err) {
    console.error("award badge:", err);
    res.status(500).json({ error: "Failed to award badge" });
  }
});

// ---------------------------------------------------------------------------
// GET /user/:userId  — badges for a specific user  [staff or self]
// ---------------------------------------------------------------------------
router.get("/user/:userId", ...mw, async (req, res) => {
  try {
    const company = req.user.company;
    const userId  = req.params.userId;

    // Non-staff may only view their own badges
    if (!isStaff(req.user.role) && userId !== req.user._id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    const target = await User.findOne({ _id: userId, company }).select("name role").lean();
    if (!target) return res.status(404).json({ error: "User not found" });

    const filter = { company, user: userId };
    if (!isStaff(req.user.role)) filter.isRevoked = false; // non-staff only see active badges

    const awards = await UserBadge.find(filter)
      .populate("badge",     "name description icon color category achievementKey")
      .populate("awardedBy", "name")
      .sort({ awardedAt: -1 })
      .lean();

    res.json({ user: target, awards, count: awards.filter(a => !a.isRevoked).length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch badges" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /awards/:awardId  — revoke an award  [admin, superadmin]
// Body: { reason? }
// ---------------------------------------------------------------------------
router.delete("/awards/:awardId", ...mw, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const company = req.user.company;
    const award   = await UserBadge.findOne({ _id: req.params.awardId, company });
    if (!award)          return res.status(404).json({ error: "Award not found" });
    if (award.isRevoked) return res.status(400).json({ error: "Award is already revoked" });

    award.isRevoked    = true;
    award.revokedBy    = req.user._id;
    award.revokedAt    = new Date();
    award.revokeReason = req.body.reason?.trim() || null;
    await award.save();

    res.json({ message: "Award revoked" });
  } catch (err) {
    res.status(500).json({ error: "Failed to revoke award" });
  }
});

module.exports = router;

"use strict";

/**
 * engagement.js
 * Mounted at: /api/engagement   (registered in server.js)
 *
 * Resource Engagement Tracking — records and reports when enrolled students
 * open / view CourseResource items.
 *
 * Route summary
 * -------------
 * POST   /view                              student records a resource view
 *
 * Analytics (staff: lecturer, hod, admin, superadmin)
 *   GET    /course/:courseId                course-level engagement overview
 *   GET    /course/:courseId/resource/:resourceId   per-resource details
 *   GET    /course/:courseId/student/:studentId     per-student engagement in a course
 *
 * Student self-service
 *   GET    /my/:courseId                    own engagement in a course
 *
 * No requireMode() — serves both academic and corporate course contexts.
 */

const express   = require("express");
const router    = express.Router();
const mongoose  = require("mongoose");
const authenticate                  = require("../middleware/auth");
const { requireRole }               = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const ResourceView   = require("../models/ResourceView");
const CourseResource = require("../models/CourseResource");
const Course         = require("../models/Course");
const User           = require("../models/User");
const { Types: { ObjectId } } = mongoose;

// ── Middleware ───────────────────────────────────────────────────────────────
const mw    = [authenticate, requireActiveSubscription, companyIsolation];
const STAFF = ["lecturer", "hod", "admin", "superadmin"];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Resolve a course by id scoped to the request's company. */
async function resolveCourse(courseId, company) {
  return Course.findOne({ _id: courseId, company }).select("_id title code lecturer enrolledStudents").lean();
}

/** Ensure the requesting lecturer owns the course or is admin/superadmin. */
function canAccessCourse(user, course) {
  if (["admin", "superadmin", "hod"].includes(user.role)) return true;
  if (user.role === "lecturer") {
    return course.lecturer?.toString() === user._id.toString();
  }
  return false;
}

// ════════════════════════════════════════════════════════════════════════════
// POST /view  — student records a resource view (upsert)
// ════════════════════════════════════════════════════════════════════════════

router.post("/view", ...mw, requireRole("student"), async (req, res) => {
  try {
    const company = req.user.company;
    const { resourceId } = req.body;

    if (!resourceId) return res.status(400).json({ error: "resourceId is required" });

    // Verify the resource exists and is visible to students
    const resource = await CourseResource.findOne({
      _id:                 resourceId,
      company,
      isVisibleToStudents: true,
    }).select("_id course").lean();
    if (!resource) return res.status(404).json({ error: "Resource not found" });

    // Verify student is enrolled in the course
    const course = await Course.findOne({
      _id:              resource.course,
      company,
      enrolledStudents: req.user._id,
    }).select("_id").lean();
    if (!course) return res.status(403).json({ error: "You are not enrolled in this course" });

    // Upsert: increment viewCount and update lastViewedAt
    const now = new Date();
    const view = await ResourceView.findOneAndUpdate(
      { company, resource: resourceId, student: req.user._id },
      {
        $inc: { viewCount: 1 },
        $set: { lastViewedAt: now, course: resource.course },
        $setOnInsert: { firstViewedAt: now },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ recorded: true, viewCount: view.viewCount });
  } catch (err) {
    console.error("record view:", err);
    res.status(500).json({ error: "Failed to record view" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /my/:courseId  — student's own engagement in a course
// Declared before /course/:courseId to prevent shadowing.
// ════════════════════════════════════════════════════════════════════════════

router.get("/my/:courseId", ...mw, requireRole("student"), async (req, res) => {
  try {
    const company  = req.user.company;
    const courseId = req.params.courseId;

    const course = await resolveCourse(courseId, company);
    if (!course) return res.status(404).json({ error: "Course not found" });

    const enrolled = (course.enrolledStudents || []).some(
      id => id.toString() === req.user._id.toString()
    );
    if (!enrolled) return res.status(403).json({ error: "You are not enrolled in this course" });

    // All visible resources for the course
    const resources = await CourseResource.find({
      company, course: courseId, isVisibleToStudents: true,
    }).select("_id title type order").sort({ order: 1, createdAt: 1 }).lean();

    // My view records for this course
    const views = await ResourceView.find({
      company, course: courseId, student: req.user._id,
    }).lean();

    const viewMap = {};
    for (const v of views) viewMap[v.resource.toString()] = v;

    const engagement = resources.map(r => {
      const v = viewMap[r._id.toString()];
      return {
        resource:     { _id: r._id, title: r.title, type: r.type, order: r.order },
        viewed:       !!v,
        viewCount:    v?.viewCount || 0,
        firstViewedAt: v?.firstViewedAt || null,
        lastViewedAt:  v?.lastViewedAt  || null,
      };
    });

    const viewedCount = engagement.filter(e => e.viewed).length;
    const pctViewed   = resources.length > 0
      ? Math.round((viewedCount / resources.length) * 100)
      : null;

    res.json({
      course: { _id: course._id, title: course.title, code: course.code },
      engagement,
      summary: { total: resources.length, viewed: viewedCount, pctViewed },
    });
  } catch (err) {
    console.error("my engagement:", err);
    res.status(500).json({ error: "Failed to fetch engagement" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /course/:courseId/resource/:resourceId  — per-resource engagement
// Declared before /course/:courseId to prevent shadowing.
// ════════════════════════════════════════════════════════════════════════════

router.get("/course/:courseId/resource/:resourceId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company    = req.user.company;
    const { courseId, resourceId } = req.params;

    const course = await resolveCourse(courseId, company);
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (!canAccessCourse(req.user, course)) {
      return res.status(403).json({ error: "Access denied to this course" });
    }

    const resource = await CourseResource.findOne({ _id: resourceId, company, course: courseId })
      .select("_id title type isVisibleToStudents").lean();
    if (!resource) return res.status(404).json({ error: "Resource not found" });

    const views = await ResourceView.find({ company, resource: resourceId })
      .populate("student", "name email IndexNumber")
      .sort({ lastViewedAt: -1 })
      .lean();

    const totalEnrolled = (course.enrolledStudents || []).length;
    const uniqueViewers = views.length;
    const totalViews    = views.reduce((sum, v) => sum + v.viewCount, 0);

    res.json({
      resource,
      views,
      summary: {
        totalEnrolled,
        uniqueViewers,
        totalViews,
        pctReached: totalEnrolled > 0 ? Math.round((uniqueViewers / totalEnrolled) * 100) : null,
      },
    });
  } catch (err) {
    console.error("resource engagement:", err);
    res.status(500).json({ error: "Failed to fetch resource engagement" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /course/:courseId/student/:studentId  — per-student engagement in a course
// Declared before /course/:courseId to prevent shadowing.
// ════════════════════════════════════════════════════════════════════════════

router.get("/course/:courseId/student/:studentId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company   = req.user.company;
    const { courseId, studentId } = req.params;

    const course = await resolveCourse(courseId, company);
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (!canAccessCourse(req.user, course)) {
      return res.status(403).json({ error: "Access denied to this course" });
    }

    const student = await User.findOne({ _id: studentId, company, role: "student" })
      .select("name email IndexNumber").lean();
    if (!student) return res.status(404).json({ error: "Student not found" });

    // All resources for the course (staff sees all, including hidden)
    const resources = await CourseResource.find({ company, course: courseId })
      .select("_id title type isVisibleToStudents order").sort({ order: 1, createdAt: 1 }).lean();

    const views = await ResourceView.find({
      company, course: courseId, student: studentId,
    }).lean();

    const viewMap = {};
    for (const v of views) viewMap[v.resource.toString()] = v;

    const engagement = resources.map(r => {
      const v = viewMap[r._id.toString()];
      return {
        resource: { _id: r._id, title: r.title, type: r.type, order: r.order, isVisibleToStudents: r.isVisibleToStudents },
        viewed:        !!v,
        viewCount:     v?.viewCount    || 0,
        firstViewedAt: v?.firstViewedAt || null,
        lastViewedAt:  v?.lastViewedAt  || null,
      };
    });

    const visibleResources = resources.filter(r => r.isVisibleToStudents).length;
    const viewedVisible    = engagement.filter(e => e.viewed && e.resource.isVisibleToStudents).length;

    res.json({
      course:  { _id: course._id, title: course.title, code: course.code },
      student,
      engagement,
      summary: {
        totalResources:  resources.length,
        visibleToStudent: visibleResources,
        viewedVisible,
        pctViewed: visibleResources > 0 ? Math.round((viewedVisible / visibleResources) * 100) : null,
      },
    });
  } catch (err) {
    console.error("student engagement:", err);
    res.status(500).json({ error: "Failed to fetch student engagement" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /course/:courseId  — course-level engagement overview
// ════════════════════════════════════════════════════════════════════════════

router.get("/course/:courseId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company  = req.user.company;
    const courseId = req.params.courseId;

    const course = await resolveCourse(courseId, company);
    if (!course) return res.status(404).json({ error: "Course not found" });
    if (!canAccessCourse(req.user, course)) {
      return res.status(403).json({ error: "Access denied to this course" });
    }

    const resources = await CourseResource.find({ company, course: courseId })
      .select("_id title type isVisibleToStudents order").sort({ order: 1, createdAt: 1 }).lean();

    // Aggregate view counts per resource
    const viewAgg = await ResourceView.aggregate([
      { $match: { company: new ObjectId(company), course: new ObjectId(courseId) } },
      { $group: {
        _id:           "$resource",
        uniqueViewers: { $sum: 1 },
        totalViews:    { $sum: "$viewCount" },
        lastActivity:  { $max: "$lastViewedAt" },
      }},
    ]);

    const aggMap = {};
    for (const a of viewAgg) aggMap[a._id.toString()] = a;

    const totalEnrolled = (course.enrolledStudents || []).length;

    const resourceStats = resources.map(r => {
      const a = aggMap[r._id.toString()];
      return {
        resource:     { _id: r._id, title: r.title, type: r.type, order: r.order, isVisibleToStudents: r.isVisibleToStudents },
        uniqueViewers: a?.uniqueViewers || 0,
        totalViews:    a?.totalViews    || 0,
        lastActivity:  a?.lastActivity  || null,
        pctReached:    totalEnrolled > 0 ? Math.round(((a?.uniqueViewers || 0) / totalEnrolled) * 100) : null,
      };
    });

    const totalResourceViews = resourceStats.reduce((s, r) => s + r.totalViews, 0);
    const resourcesViewed    = resourceStats.filter(r => r.uniqueViewers > 0).length;

    res.json({
      course:      { _id: course._id, title: course.title, code: course.code },
      resources:   resourceStats,
      summary: {
        totalEnrolled,
        totalResources:  resources.length,
        resourcesViewed,
        totalResourceViews,
      },
    });
  } catch (err) {
    console.error("course engagement:", err);
    res.status(500).json({ error: "Failed to fetch course engagement" });
  }
});

module.exports = router;

"use strict";

/**
 * courseResources.js
 * Mounted at: /api/courses/:courseId/resources   (server.js uses mergeParams)
 *
 * Route summary
 * -------------
 * GET    /          list resources for the course      [enrolled student, lecturer, admin]
 * POST   /          add a resource                     [lecturer, admin, superadmin]
 * PATCH  /reorder   bulk-reorder by { order: [{id,order}] }  [lecturer, admin, superadmin]
 * PATCH  /:id       update a resource                  [lecturer (own course), admin, superadmin]
 * DELETE /:id       delete a resource                  [lecturer (own course), admin, superadmin]
 *
 * Students see only isVisibleToStudents=true resources; must be enrolled.
 * Lecturers can manage resources on their own courses only.
 * Admins/superadmins can manage any course in their company.
 */

const express        = require("express");
const router         = express.Router({ mergeParams: true }); // inherits :courseId from parent
const authenticate                  = require("../middleware/auth");
const { requireRole }               = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const CourseResource = require("../models/CourseResource");
const Course         = require("../models/Course");

const mw    = [authenticate, requireActiveSubscription, companyIsolation];
const STAFF = ["lecturer", "admin", "superadmin"];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function getCourse(req, res) {
  const course = await Course.findOne({ _id: req.params.courseId, company: req.user.company }).lean();
  if (!course) { res.status(404).json({ error: "Course not found" }); return null; }
  return course;
}

function isStaff(role) {
  return ["lecturer", "admin", "superadmin", "hod"].includes(role);
}

// Check lecturer owns this course; admins skip this check
async function assertLecturerOwns(req, res, courseId) {
  if (req.user.role !== "lecturer") return true; // admins always pass
  const course = await Course.findOne({ _id: courseId, company: req.user.company })
    .select("lecturer")
    .lean();
  if (!course) { res.status(404).json({ error: "Course not found" }); return false; }
  if (course.lecturer?.toString() !== req.user._id.toString()) {
    res.status(403).json({ error: "You can only manage resources on your own courses" });
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// GET /  — list resources
// ---------------------------------------------------------------------------
router.get("/", ...mw, async (req, res) => {
  try {
    const company    = req.user.company;
    const { courseId } = req.params;

    const course = await getCourse(req, res);
    if (!course) return;

    // Students must be enrolled
    if (req.user.role === "student") {
      const enrolled = (course.enrolledStudents || []).some(
        id => id.toString() === req.user._id.toString()
      );
      if (!enrolled) return res.status(403).json({ error: "You are not enrolled in this course" });
    }

    const filter = { company, course: courseId };
    if (!isStaff(req.user.role)) filter.isVisibleToStudents = true;

    const resources = await CourseResource.find(filter)
      .populate("createdBy", "name")
      .sort({ order: 1, createdAt: 1 })
      .lean();

    res.json({ resources, count: resources.length });
  } catch (err) {
    console.error("list resources:", err);
    res.status(500).json({ error: "Failed to fetch resources" });
  }
});

// ---------------------------------------------------------------------------
// POST /  — add a resource
// ---------------------------------------------------------------------------
router.post("/", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company      = req.user.company;
    const { courseId } = req.params;

    if (!(await assertLecturerOwns(req, res, courseId))) return;

    const { title, description, type, url, content, isVisibleToStudents, order, tags } = req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: "title is required" });
    }
    if (!["link", "file_ref", "video_link", "note"].includes(type)) {
      return res.status(400).json({ error: "type must be link, file_ref, video_link, or note" });
    }
    if (["link", "file_ref", "video_link"].includes(type) && !url?.trim()) {
      return res.status(400).json({ error: "url is required for this resource type" });
    }

    // Auto-assign order (append after last)
    let resourceOrder = order != null ? Number(order) : null;
    if (resourceOrder == null) {
      const last = await CourseResource.findOne({ company, course: courseId })
        .sort({ order: -1 })
        .select("order")
        .lean();
      resourceOrder = (last?.order ?? -1) + 1;
    }

    const resource = await CourseResource.create({
      company,
      course:              courseId,
      createdBy:           req.user._id,
      title:               title.trim(),
      description:         (description || "").trim(),
      type,
      url:                 url?.trim() || "",
      content:             content || "",
      isVisibleToStudents: isVisibleToStudents !== false,
      order:               resourceOrder,
      tags:                Array.isArray(tags)
        ? tags.map(t => String(t).trim()).filter(Boolean)
        : [],
    });

    res.status(201).json({ resource });
  } catch (err) {
    console.error("add resource:", err);
    res.status(500).json({ error: "Failed to add resource" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /reorder  — reorder multiple resources at once
// Body: { order: [{ id: "<resourceId>", order: <number> }, ...] }
// Must be declared BEFORE /:id to avoid Express shadowing it.
// ---------------------------------------------------------------------------
router.patch("/reorder", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company      = req.user.company;
    const { courseId } = req.params;

    if (!(await assertLecturerOwns(req, res, courseId))) return;

    const { order } = req.body;
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ error: "order must be a non-empty array of { id, order }" });
    }

    await Promise.all(
      order.map(({ id, order: o }) =>
        CourseResource.updateOne(
          { _id: id, company, course: courseId },
          { $set: { order: Number(o) } }
        )
      )
    );

    res.json({ message: "Reordered" });
  } catch (err) {
    res.status(500).json({ error: "Failed to reorder resources" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /:id  — update a resource
// ---------------------------------------------------------------------------
router.patch("/:id", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company      = req.user.company;
    const { courseId, id } = req.params;

    if (!(await assertLecturerOwns(req, res, courseId))) return;

    const resource = await CourseResource.findOne({ _id: id, company, course: courseId });
    if (!resource) return res.status(404).json({ error: "Resource not found" });

    const EDITABLE = ["title", "description", "type", "url", "content", "isVisibleToStudents", "order", "tags"];
    for (const key of EDITABLE) {
      if (req.body[key] === undefined) continue;
      resource[key] = key === "tags"
        ? req.body[key].map(t => String(t).trim()).filter(Boolean)
        : req.body[key];
    }
    resource.updatedBy = req.user._id;
    await resource.save();

    res.json({ resource });
  } catch (err) {
    res.status(500).json({ error: "Failed to update resource" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /:id  — delete a resource
// ---------------------------------------------------------------------------
router.delete("/:id", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company          = req.user.company;
    const { courseId, id } = req.params;

    if (!(await assertLecturerOwns(req, res, courseId))) return;

    const resource = await CourseResource.findOne({ _id: id, company, course: courseId });
    if (!resource) return res.status(404).json({ error: "Resource not found" });

    await resource.deleteOne();
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete resource" });
  }
});

module.exports = router;

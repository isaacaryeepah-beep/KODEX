"use strict";

/**
 * enrollments.js
 * Mounted at: /api/enrollments   (registered in server.js)
 *
 * Exposes the StudentCourseEnrollment model as a first-class API.
 * This model coexists with the legacy Course.enrolledStudents array;
 * the /sync endpoint migrates existing data into SCE records.
 *
 * Route summary
 * -------------
 * GET    /my                        student: own active enrollments + course details
 * GET    /course/:courseId          staff: all SCE records for a course (any status)
 * GET    /course/:courseId/active   staff: active enrollments only (fast roster view)
 * POST   /sync/:courseId            admin: bulk-create SCE records from enrolledStudents array
 * PATCH  /:id/status                staff: drop | complete | suspend an enrollment
 * PATCH  /:id/grade                 staff: set / update final grade on a completed enrollment
 *
 * Academic mode only.
 */

const express  = require("express");
const router   = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole, requireMode }  = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const StudentCourseEnrollment       = require("../models/StudentCourseEnrollment");
const { ENROLLMENT_STATUSES, ENROLLMENT_METHODS } = StudentCourseEnrollment;
const Course  = require("../models/Course");
const User    = require("../models/User");

const mw      = [authenticate, requireMode("academic"), requireActiveSubscription, companyIsolation];
const STAFF   = ["lecturer", "admin", "superadmin", "hod"];
const canManage = requireRole(...STAFF);

// ---------------------------------------------------------------------------
// GET /my  — student: own active enrollments
// ---------------------------------------------------------------------------
router.get("/my", ...mw, requireRole("student"), async (req, res) => {
  try {
    const enrollments = await StudentCourseEnrollment.find({
      company: req.user.company,
      student: req.user._id,
      status:  ENROLLMENT_STATUSES.ACTIVE,
    })
      .populate("course", "title code academicYear semester level group studyType lecturerId")
      .sort({ enrolledAt: -1 })
      .lean();

    res.json({ enrollments, count: enrollments.length });
  } catch (err) {
    console.error("getMyEnrollments:", err);
    res.status(500).json({ error: "Failed to fetch your enrollments" });
  }
});

// ---------------------------------------------------------------------------
// GET /course/:courseId/active  — fast active-only roster (staff)
// Declared BEFORE /course/:courseId to prevent shadowing.
// ---------------------------------------------------------------------------
router.get("/course/:courseId/active", ...mw, canManage, async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;

    const enrollments = await StudentCourseEnrollment.find({
      company, course: courseId, status: ENROLLMENT_STATUSES.ACTIVE,
    })
      .populate("student",   "name email IndexNumber")
      .populate("enrolledBy","name")
      .sort({ enrolledAt: 1 })
      .lean();

    res.json({ enrollments, count: enrollments.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch active enrollments" });
  }
});

// ---------------------------------------------------------------------------
// GET /course/:courseId  — full enrollment history for a course (staff)
// ---------------------------------------------------------------------------
router.get("/course/:courseId", ...mw, canManage, async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;
    const filter       = { company, course: courseId };

    if (req.query.status) filter.status = req.query.status;

    const enrollments = await StudentCourseEnrollment.find(filter)
      .populate("student",         "name email IndexNumber")
      .populate("enrolledBy",      "name")
      .populate("statusChangedBy", "name")
      .populate("finalGrade.gradedBy", "name")
      .sort({ enrolledAt: -1 })
      .lean();

    const summary = {
      active:    enrollments.filter(e => e.status === ENROLLMENT_STATUSES.ACTIVE).length,
      dropped:   enrollments.filter(e => e.status === ENROLLMENT_STATUSES.DROPPED).length,
      completed: enrollments.filter(e => e.status === ENROLLMENT_STATUSES.COMPLETED).length,
      suspended: enrollments.filter(e => e.status === ENROLLMENT_STATUSES.SUSPENDED).length,
    };

    res.json({ enrollments, summary, count: enrollments.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch enrollments" });
  }
});

// ---------------------------------------------------------------------------
// POST /sync/:courseId  — admin: bulk-create SCE records from enrolledStudents
//
// Safe to run multiple times (upserts, won't duplicate).
// Creates one SCE record per student in course.enrolledStudents who does
// not already have an active record.
// ---------------------------------------------------------------------------
router.post("/sync/:courseId", ...mw, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;

    const course = await Course.findOne({ _id: courseId, company }).lean();
    if (!course) return res.status(404).json({ error: "Course not found" });

    const studentIds = course.enrolledStudents || [];
    if (studentIds.length === 0) {
      return res.json({ message: "No students in course.enrolledStudents to sync", created: 0, skipped: 0 });
    }

    // Fetch existing active SCE records to avoid duplicates
    const existing = await StudentCourseEnrollment.find({
      company, course: courseId, status: ENROLLMENT_STATUSES.ACTIVE,
    }).select("student").lean();
    const existingSet = new Set(existing.map(e => e.student.toString()));

    // Fetch user documents for snapshot building
    const users = await User.find({ _id: { $in: studentIds } })
      .select("name programme studentLevel studentGroup sessionType semester department")
      .lean();
    const userMap = {};
    for (const u of users) userMap[u._id.toString()] = u;

    const toInsert = [];
    for (const sid of studentIds) {
      if (existingSet.has(sid.toString())) continue;
      const user     = userMap[sid.toString()];
      const snapshot = user
        ? StudentCourseEnrollment.buildSnapshot(user, course)
        : {};
      toInsert.push({
        company,
        course:           courseId,
        student:          sid,
        enrolledBy:       req.user._id,
        enrollmentMethod: ENROLLMENT_METHODS.ROSTER_SYNC,
        academicSnapshot: snapshot,
        status:           ENROLLMENT_STATUSES.ACTIVE,
        enrolledAt:       new Date(),
      });
    }

    let created = 0;
    if (toInsert.length) {
      try {
        const result = await StudentCourseEnrollment.insertMany(toInsert, { ordered: false });
        created = result.length;
      } catch (bulkErr) {
        created = bulkErr.insertedDocs?.length ?? toInsert.length;
        console.warn("SCE sync partial failure:", bulkErr.message);
      }
    }

    res.json({
      message: `Synced ${created} enrollment(s). ${studentIds.length - existingSet.size - toInsert.length} already existed.`,
      total:   studentIds.length,
      created,
      skipped: existingSet.size,
    });
  } catch (err) {
    console.error("sync enrollments:", err);
    res.status(500).json({ error: "Failed to sync enrollments" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /:id/status  — drop | complete | suspend an enrollment
// Body: { status: "dropped"|"completed"|"suspended", reason?: string }
// ---------------------------------------------------------------------------
router.patch("/:id/status", ...mw, canManage, async (req, res) => {
  try {
    const company    = req.user.company;
    const { status, reason } = req.body;

    const allowed = [ENROLLMENT_STATUSES.DROPPED, ENROLLMENT_STATUSES.COMPLETED, ENROLLMENT_STATUSES.SUSPENDED];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${allowed.join(", ")}` });
    }

    const enrollment = await StudentCourseEnrollment.findOne({ _id: req.params.id, company });
    if (!enrollment) return res.status(404).json({ error: "Enrollment not found" });
    if (enrollment.status !== ENROLLMENT_STATUSES.ACTIVE) {
      return res.status(400).json({ error: `Cannot change status of an enrollment that is already '${enrollment.status}'` });
    }

    const now = new Date();
    enrollment.status            = status;
    enrollment.statusChangedBy   = req.user._id;
    enrollment.statusChangeReason= reason || null;
    if (status === ENROLLMENT_STATUSES.DROPPED)    enrollment.droppedAt   = now;
    if (status === ENROLLMENT_STATUSES.COMPLETED)  enrollment.completedAt = now;
    if (status === ENROLLMENT_STATUSES.SUSPENDED)  enrollment.suspendedAt = now;

    await enrollment.save();

    // Mirror into Course.enrolledStudents for backward compat
    if (status === ENROLLMENT_STATUSES.DROPPED || status === ENROLLMENT_STATUSES.SUSPENDED) {
      await Course.findByIdAndUpdate(enrollment.course, {
        $pull: { enrolledStudents: enrollment.student },
      });
    }

    res.json({ enrollment });
  } catch (err) {
    console.error("update enrollment status:", err);
    res.status(500).json({ error: "Failed to update enrollment status" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /:id/grade  — set / update final grade
// Body: { score?, grade?, remarks? }  (all optional; at least one required)
// ---------------------------------------------------------------------------
router.patch("/:id/grade", ...mw, canManage, async (req, res) => {
  try {
    const company = req.user.company;
    const { score, grade, remarks } = req.body;

    if (score === undefined && !grade && !remarks) {
      return res.status(400).json({ error: "Provide at least one of score, grade, remarks" });
    }

    const enrollment = await StudentCourseEnrollment.findOne({ _id: req.params.id, company });
    if (!enrollment) return res.status(404).json({ error: "Enrollment not found" });

    if (score !== undefined) {
      const n = Number(score);
      if (isNaN(n) || n < 0 || n > 100) {
        return res.status(400).json({ error: "score must be 0–100" });
      }
      enrollment.finalGrade.score = n;
    }
    if (grade)   enrollment.finalGrade.grade   = String(grade).trim();
    if (remarks) enrollment.finalGrade.remarks  = String(remarks).trim();
    enrollment.finalGrade.gradedBy = req.user._id;
    enrollment.finalGrade.gradedAt = new Date();

    await enrollment.save();
    res.json({ enrollment });
  } catch (err) {
    console.error("set enrollment grade:", err);
    res.status(500).json({ error: "Failed to set grade" });
  }
});

module.exports = router;

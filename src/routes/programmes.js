"use strict";

/**
 * programmes.js
 * Mounted at: /api/programmes   (registered in server.js)
 *
 * Academic programme / curriculum management.
 * Admins define programmes with course requirements; the progress endpoint
 * computes how far a student has advanced through their programme.
 *
 * Route summary
 * -------------
 * GET    /                        list active programmes
 * POST   /                        create programme         [admin, superadmin]
 * GET    /:id                     get programme + requirements
 * PATCH  /:id                     update programme          [admin, superadmin]
 * DELETE /:id                     deactivate                [admin, superadmin]
 *
 * Requirements
 *   POST   /:id/requirements      add a course requirement  [admin, superadmin]
 *   DELETE /:id/requirements/:reqId  remove a requirement   [admin, superadmin]
 *
 * Students
 *   GET    /:id/students          list enrolled students in this programme
 *   GET    /:id/progress/:studentId  student's completion progress
 *   GET    /my-progress           student: own progress through assigned programme
 *
 * Academic mode only.
 */

const express  = require("express");
const router   = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole, requireMode }  = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const Programme = require("../models/Programme");
const { QUALIFICATION_TYPES } = Programme;
const StudentCourseEnrollment = require("../models/StudentCourseEnrollment");
const { ENROLLMENT_STATUSES }        = StudentCourseEnrollment;
const Course = require("../models/Course");
const User   = require("../models/User");

// ── Middleware ───────────────────────────────────────────────────────────────
const mw    = [authenticate, requireMode("academic"), requireActiveSubscription, companyIsolation];
const ADMIN = ["admin", "superadmin"];

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute a student's progress through a programme.
 * Returns counts, credit totals, and per-requirement status.
 */
async function computeProgress(programme, studentId, company) {
  const reqCourseIds = programme.requirements.map(r => r.course._id || r.course);

  // All enrollments for this student in courses that are part of the programme
  const enrollments = await StudentCourseEnrollment.find({
    company,
    student: studentId,
    course:  { $in: reqCourseIds },
  }).lean();

  const enrollmentMap = {};
  for (const e of enrollments) {
    const key = e.course.toString();
    // Prefer completed > active > dropped > suspended
    const existing = enrollmentMap[key];
    const priority = { completed: 4, active: 3, suspended: 2, dropped: 1 };
    if (!existing || (priority[e.status] || 0) > (priority[existing.status] || 0)) {
      enrollmentMap[key] = e;
    }
  }

  let earnedCredits        = 0;
  let earnedElectiveCredits = 0;
  let completedRequired    = 0;
  let completedElectives   = 0;
  let inProgressCount      = 0;

  const requirementProgress = programme.requirements.map(req => {
    const cId = (req.course._id || req.course).toString();
    const enr  = enrollmentMap[cId];
    const status = enr?.status || "not_enrolled";
    const completed = status === ENROLLMENT_STATUSES.COMPLETED;

    if (completed) {
      if (req.isElective) {
        earnedElectiveCredits += req.credits || 0;
        completedElectives++;
      } else {
        earnedCredits += req.credits || 0;
        completedRequired++;
      }
    }
    if (status === ENROLLMENT_STATUSES.ACTIVE) inProgressCount++;

    return {
      requirement: req,
      enrollmentStatus: status,
      finalGrade:  enr?.finalGrade || null,
      completed,
    };
  });

  const totalRequired  = programme.requirements.filter(r => !r.isElective).length;
  const totalElectives = programme.requirements.filter(r => r.isElective).length;
  const totalCredits   = earnedCredits + earnedElectiveCredits;

  const creditsMet  = programme.totalCreditsRequired
    ? totalCredits >= programme.totalCreditsRequired
    : null;
  const requiredMet = completedRequired >= totalRequired;
  const electiveMet = programme.minElectiveCredits
    ? earnedElectiveCredits >= programme.minElectiveCredits
    : true;

  const pctRequired = totalRequired > 0
    ? Math.round((completedRequired / totalRequired) * 100)
    : null;

  return {
    requirements: requirementProgress,
    summary: {
      totalRequired,
      totalElectives,
      completedRequired,
      completedElectives,
      inProgressCount,
      earnedCredits,
      earnedElectiveCredits,
      totalCreditsEarned: totalCredits,
      totalCreditsRequired: programme.totalCreditsRequired || null,
      pctRequired,
      creditsMet,
      requiredMet,
      electiveMet,
      graduationEligible: requiredMet && electiveMet && (creditsMet !== false),
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Declare /my-progress before /:id to prevent shadowing
// ════════════════════════════════════════════════════════════════════════════

router.get("/my-progress", ...mw, requireRole("student"), async (req, res) => {
  try {
    const company = req.user.company;
    const student = req.user;

    // Find programme by student's programme name
    if (!student.programme) {
      return res.status(404).json({ error: "You have not been assigned to a programme" });
    }

    const programme = await Programme.findOne({
      company,
      name:     student.programme,
      isActive: true,
    }).populate("requirements.course", "title code").lean();

    if (!programme) {
      return res.status(404).json({ error: `Programme "${student.programme}" not found` });
    }

    const progress = await computeProgress(programme, student._id, company);
    res.json({ programme, ...progress });
  } catch (err) {
    console.error("my-progress:", err);
    res.status(500).json({ error: "Failed to compute progress" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PROGRAMME CRUD
// ════════════════════════════════════════════════════════════════════════════

router.get("/", ...mw, async (req, res) => {
  try {
    const filter = { company: req.user.company, isActive: true };
    if (req.query.department) filter.department = req.query.department;

    const programmes = await Programme.find(filter)
      .select("-requirements")
      .sort({ name: 1 })
      .lean();

    // Attach student counts
    const withCounts = await Promise.all(programmes.map(async p => {
      const count = await User.countDocuments({
        company:   req.user.company,
        role:      "student",
        programme: p.name,
        isActive:  true,
      });
      return { ...p, studentCount: count };
    }));

    res.json({ programmes: withCounts, count: withCounts.length });
  } catch (err) {
    console.error("list programmes:", err);
    res.status(500).json({ error: "Failed to fetch programmes" });
  }
});

router.post("/", ...mw, requireRole(...ADMIN), async (req, res) => {
  try {
    const company = req.user.company;
    const {
      name, code, description, qualificationType, department,
      durationSemesters, totalCreditsRequired, minElectiveCredits,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: "name is required" });

    if (qualificationType && !QUALIFICATION_TYPES.includes(qualificationType)) {
      return res.status(400).json({ error: `qualificationType must be one of: ${QUALIFICATION_TYPES.join(", ")}` });
    }

    const programme = await Programme.create({
      company,
      name:                name.trim(),
      code:                (code || "").trim().toUpperCase(),
      description:         (description || "").trim(),
      qualificationType:   qualificationType || null,
      department:          department?.trim() || null,
      durationSemesters:   durationSemesters  || null,
      totalCreditsRequired:totalCreditsRequired || null,
      minElectiveCredits:  minElectiveCredits   || 0,
      createdBy:           req.user._id,
    });

    res.status(201).json({ programme });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "A programme with this name already exists" });
    console.error("create programme:", err);
    res.status(500).json({ error: "Failed to create programme" });
  }
});

// ── /:id routes ─────────────────────────────────────────────────────────────

router.get("/:id", ...mw, async (req, res) => {
  try {
    const programme = await Programme.findOne({ _id: req.params.id, company: req.user.company })
      .populate("requirements.course", "title code academicYear semester level")
      .lean();
    if (!programme) return res.status(404).json({ error: "Programme not found" });
    res.json({ programme });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch programme" });
  }
});

router.patch("/:id", ...mw, requireRole(...ADMIN), async (req, res) => {
  try {
    const company    = req.user.company;
    const programme  = await Programme.findOne({ _id: req.params.id, company });
    if (!programme) return res.status(404).json({ error: "Programme not found" });

    const EDITABLE = ["name", "code", "description", "qualificationType", "department",
      "durationSemesters", "totalCreditsRequired", "minElectiveCredits", "isActive"];
    for (const key of EDITABLE) {
      if (req.body[key] !== undefined) programme[key] = req.body[key];
    }
    programme.updatedBy = req.user._id;
    await programme.save();

    res.json({ programme });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: "Programme name already taken" });
    res.status(500).json({ error: "Failed to update programme" });
  }
});

router.delete("/:id", ...mw, requireRole(...ADMIN), async (req, res) => {
  try {
    const prog = await Programme.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $set: { isActive: false, updatedBy: req.user._id } }
    );
    if (!prog) return res.status(404).json({ error: "Programme not found" });
    res.json({ message: "Programme deactivated" });
  } catch (err) {
    res.status(500).json({ error: "Failed to deactivate programme" });
  }
});

// ── Requirements ─────────────────────────────────────────────────────────────

router.post("/:id/requirements", ...mw, requireRole(...ADMIN), async (req, res) => {
  try {
    const company    = req.user.company;
    const programme  = await Programme.findOne({ _id: req.params.id, company });
    if (!programme) return res.status(404).json({ error: "Programme not found" });

    const { courseId, credits, isElective, semester, isRequired } = req.body;
    if (!courseId) return res.status(400).json({ error: "courseId is required" });

    const course = await Course.findOne({ _id: courseId, companyId: company }).select("_id title code").lean();
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Prevent duplicate course in requirements
    const alreadyAdded = programme.requirements.some(
      r => (r.course._id || r.course).toString() === courseId.toString()
    );
    if (alreadyAdded) return res.status(409).json({ error: "Course already in programme requirements" });

    programme.requirements.push({
      course:     courseId,
      credits:    credits    ?? 3,
      isElective: !!isElective,
      semester:   semester   || null,
      isRequired: isRequired !== false,
    });
    programme.updatedBy = req.user._id;
    await programme.save();

    res.status(201).json({ requirements: programme.requirements });
  } catch (err) {
    console.error("add requirement:", err);
    res.status(500).json({ error: "Failed to add requirement" });
  }
});

router.delete("/:id/requirements/:reqId", ...mw, requireRole(...ADMIN), async (req, res) => {
  try {
    const company   = req.user.company;
    const programme = await Programme.findOne({ _id: req.params.id, company });
    if (!programme) return res.status(404).json({ error: "Programme not found" });

    const before = programme.requirements.length;
    programme.requirements = programme.requirements.filter(
      r => r._id.toString() !== req.params.reqId
    );
    if (programme.requirements.length === before) {
      return res.status(404).json({ error: "Requirement not found" });
    }
    programme.updatedBy = req.user._id;
    await programme.save();

    res.json({ message: "Requirement removed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove requirement" });
  }
});

// ── Students & Progress ───────────────────────────────────────────────────────

router.get("/:id/students", ...mw, requireRole("lecturer", "hod", ...ADMIN), async (req, res) => {
  try {
    const company   = req.user.company;
    const programme = await Programme.findOne({ _id: req.params.id, company }).lean();
    if (!programme) return res.status(404).json({ error: "Programme not found" });

    const students = await User.find({
      company,
      role:      "student",
      programme: programme.name,
      isActive:  true,
    }).select("name email IndexNumber department studentLevel").lean();

    res.json({ programme: { _id: programme._id, name: programme.name }, students, count: students.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch students" });
  }
});

router.get("/:id/progress/:studentId", ...mw, requireRole("lecturer", "hod", ...ADMIN), async (req, res) => {
  try {
    const company = req.user.company;
    const programme = await Programme.findOne({ _id: req.params.id, company })
      .populate("requirements.course", "title code academicYear semester level").lean();
    if (!programme) return res.status(404).json({ error: "Programme not found" });

    const student = await User.findOne({ _id: req.params.studentId, company, role: "student" })
      .select("name email IndexNumber programme").lean();
    if (!student) return res.status(404).json({ error: "Student not found" });

    const progress = await computeProgress(programme, req.params.studentId, company);
    res.json({ programme, student, ...progress });
  } catch (err) {
    console.error("student progress:", err);
    res.status(500).json({ error: "Failed to compute progress" });
  }
});

module.exports = router;

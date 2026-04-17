"use strict";

const User     = require("../models/User");
const Course   = require("../models/Course");
const AuditLog = require("../models/AuditLog");
const { AUDIT_ACTIONS } = AuditLog;

// ── Helpers ───────────────────────────────────────────────────────────────────
function hodDeptFilter(req, base = {}) {
  const filter = { ...base, company: req.user.company };
  if (req.user.department) filter.department = req.user.department;
  return filter;
}

// ─── GET /api/hod/locked-students ────────────────────────────────────────────
exports.listLockedStudents = async (req, res) => {
  try {
    const filter = hodDeptFilter(req, { role: "student", isLocked: true });

    const students = await User.find(filter)
      .select("name IndexNumber department lockReason lockedAt lockedBy failedLoginAttempts lastFailedLoginAt")
      .populate("lockedBy", "name role")
      .sort({ lockedAt: -1 })
      .lean();

    res.json({ students, count: students.length });
  } catch (err) {
    console.error("[HOD] listLockedStudents:", err);
    res.status(500).json({ error: "Failed to fetch locked students" });
  }
};

// ─── PATCH /api/hod/unlock/:userId ───────────────────────────────────────────
exports.unlockStudent = async (req, res) => {
  try {
    const filter = hodDeptFilter(req, {
      _id:      req.params.userId,
      role:     "student",
      isLocked: true,
    });

    const student = await User.findOne(filter);
    if (!student) {
      return res.status(404).json({ error: "Locked student not found in your department scope" });
    }

    const prevReason = student.lockReason;

    student.isLocked            = false;
    student.lockedAt            = null;
    student.lockReason          = null;
    student.lockedBy            = null;
    student.failedLoginAttempts = 0;
    student.lastFailedLoginAt   = null;
    await student.save();

    // Audit trail
    AuditLog.record({
      company:       req.user.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.ACCOUNT_REACTIVATED,
      resource:      "User",
      resourceId:    student._id,
      resourceLabel: student.name,
      changes: {
        before: { isLocked: true,  lockReason: prevReason },
        after:  { isLocked: false, lockReason: null },
      },
      metadata: { note: req.body.note || `Unlocked by HOD ${req.user.name}` },
      req,
    }).catch(() => {});

    res.json({
      message: `${student.name}'s account has been unlocked successfully.`,
      student: {
        _id:        student._id,
        name:       student.name,
        IndexNumber: student.IndexNumber,
        isLocked:   false,
      },
    });
  } catch (err) {
    console.error("[HOD] unlockStudent:", err);
    res.status(500).json({ error: "Failed to unlock student account" });
  }
};

// ─── GET /api/hod/pending-courses ────────────────────────────────────────────
exports.listPendingCourses = async (req, res) => {
  try {
    const companyId = req.user.company;
    const filter    = { companyId, approvalStatus: "pending", needsApproval: true };

    // Scope HOD to their department (departmentId or lecturer's department)
    // We match courses where the creating lecturer is in the HOD's department.
    // If no departmentId set on course, we fall back to all pending in company.
    if (req.user.department) {
      filter.departmentId = req.user.department;
    }

    const courses = await Course.find(filter)
      .populate("lecturerId", "name email department")
      .populate("createdBy",  "name email department")
      .sort({ createdAt: -1 })
      .lean();

    res.json({ courses, count: courses.length });
  } catch (err) {
    console.error("[HOD] listPendingCourses:", err);
    res.status(500).json({ error: "Failed to fetch pending courses" });
  }
};

// ─── PATCH /api/hod/courses/:id/approve ──────────────────────────────────────
exports.approveCourse = async (req, res) => {
  try {
    const companyId = req.user.company;
    const filter    = { _id: req.params.id, companyId, approvalStatus: "pending" };
    if (req.user.department) filter.departmentId = req.user.department;

    const course = await Course.findOne(filter);
    if (!course) {
      return res.status(404).json({ error: "Pending course not found in your scope" });
    }

    course.approvalStatus = "approved";
    course.approvedBy     = req.user._id;
    course.approvedAt     = new Date();
    course.approvalNote   = req.body.note || null;
    course.isPublished    = true;
    await course.save();

    AuditLog.record({
      company:       req.user.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.APPROVE,
      resource:      "Course",
      resourceId:    course._id,
      resourceLabel: `${course.code} – ${course.title}`,
      req,
    }).catch(() => {});

    res.json({ message: `Course "${course.title}" approved and published.`, course });
  } catch (err) {
    console.error("[HOD] approveCourse:", err);
    res.status(500).json({ error: "Failed to approve course" });
  }
};

// ─── PATCH /api/hod/courses/:id/reject ───────────────────────────────────────
exports.rejectCourse = async (req, res) => {
  try {
    const companyId = req.user.company;
    const filter    = { _id: req.params.id, companyId, approvalStatus: "pending" };
    if (req.user.department) filter.departmentId = req.user.department;

    const course = await Course.findOne(filter);
    if (!course) {
      return res.status(404).json({ error: "Pending course not found in your scope" });
    }

    course.approvalStatus = "rejected";
    course.approvedBy     = req.user._id;
    course.approvedAt     = new Date();
    course.approvalNote   = req.body.note || null;
    await course.save();

    AuditLog.record({
      company:       req.user.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.REJECT,
      resource:      "Course",
      resourceId:    course._id,
      resourceLabel: `${course.code} – ${course.title}`,
      metadata: { note: req.body.note },
      req,
    }).catch(() => {});

    res.json({ message: `Course "${course.title}" rejected.`, course });
  } catch (err) {
    console.error("[HOD] rejectCourse:", err);
    res.status(500).json({ error: "Failed to reject course" });
  }
};

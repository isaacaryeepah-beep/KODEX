"use strict";

const User              = require("../models/User");
const Course            = require("../models/Course");
const AuditLog          = require("../models/AuditLog");
const { AUDIT_ACTIONS } = AuditLog;
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord  = require("../models/AttendanceRecord");
const Conversation      = require("../models/Conversation");
const Message           = require("../models/Message");

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

// ─── GET /api/hod/dashboard-stats ────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
  try {
    const company = req.user.company;
    const dept    = req.user.department;
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const sessions = await AttendanceSession.find({ company, createdAt: { $gte: since30 } })
      .populate("createdBy", "name department")
      .lean();

    const deptSessions = dept
      ? sessions.filter(s => s.createdBy?.department === dept)
      : sessions;

    const ended = deptSessions.filter(s => s.status !== "active");
    const totalAtt = ended.reduce((sum, s) => sum + (s.totalMarked || 0), 0);
    const avgAtt   = ended.length ? Math.round(totalAtt / ended.length) : 0;

    // Group by course title
    const byCourse = {};
    ended.forEach(s => {
      const name = s.title || "Untitled";
      if (!byCourse[name]) byCourse[name] = { sessions: 0, attendance: 0 };
      byCourse[name].sessions++;
      byCourse[name].attendance += (s.totalMarked || 0);
    });
    const courseEntries = Object.entries(byCourse).sort((a, b) => b[1].attendance - a[1].attendance);
    const bestCourse   = courseEntries[0] ? { name: courseEntries[0][0], ...courseEntries[0][1] } : null;

    // Group by lecturer
    const byLecturer = {};
    deptSessions.forEach(s => {
      const name = s.createdBy?.name || "Unknown";
      if (!byLecturer[name]) byLecturer[name] = { sessions: 0, attendance: 0, active: 0 };
      byLecturer[name].sessions++;
      byLecturer[name].attendance += (s.totalMarked || 0);
      if (s.status === "active") byLecturer[name].active++;
    });
    const lecturerSummary = Object.entries(byLecturer)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.sessions - a.sessions);

    res.json({ totalSessions: deptSessions.length, endedSessions: ended.length, totalAttendance: totalAtt, avgAttendance: avgAtt, bestCourse, lecturerSummary });
  } catch (err) {
    console.error("[HOD] getDashboardStats:", err);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
};

// ─── GET /api/hod/alerts ─────────────────────────────────────────────────────
exports.getAlerts = async (req, res) => {
  try {
    const company = req.user.company;
    const dept    = req.user.department;
    const since14 = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // All lecturers in dept
    const lecturerFilter = { company, role: "lecturer" };
    if (dept) lecturerFilter.department = dept;
    const lecturers = await User.find(lecturerFilter).select("_id name email department").lean();

    // Recent sessions (last 14 days)
    const recentSessions = await AttendanceSession.find({ company, createdAt: { $gte: since14 } })
      .populate("createdBy", "name department")
      .lean();
    const deptRecent = dept
      ? recentSessions.filter(s => s.createdBy?.department === dept)
      : recentSessions;
    const activeIds = new Set(deptRecent.map(s => String(s.createdBy?._id)).filter(Boolean));
    const inactiveLecturers = lecturers.filter(l => !activeIds.has(String(l._id)));

    // Inactive courses (published, no sessions in 14 days)
    const courseFilter = { companyId: company, isPublished: true };
    if (dept) courseFilter.departmentId = dept;
    const courses = await Course.find(courseFilter).select("_id title code lecturerId").populate("lecturerId", "name").lean();
    const activeCourseIds = new Set(deptRecent.map(s => s.course ? String(s.course) : null).filter(Boolean));
    const inactiveCourses = courses.filter(c => !activeCourseIds.has(String(c._id)));

    // Repeated absentees: 3+ absences in last 30 days
    const absentAgg = await AttendanceRecord.aggregate([
      { $match: { company, status: "absent", createdAt: { $gte: since30 } } },
      { $group: { _id: "$user", count: { $sum: 1 } } },
      { $match: { count: { $gte: 3 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);
    const absentMap  = new Map(absentAgg.map(r => [String(r._id), r.count]));
    const absentStus = await User.find({ _id: { $in: absentAgg.map(r => r._id) }, company, role: "student" })
      .select("name IndexNumber department").lean();
    const repeatedAbsentees = absentStus
      .map(s => ({ ...s, absentCount: absentMap.get(String(s._id)) || 0 }))
      .sort((a, b) => b.absentCount - a.absentCount);

    // Low attendance: students with < 50% attendance over sessions in last 30 days (min 5 sessions)
    const pastSessions = await AttendanceSession.find({ company, status: { $ne: "active" }, createdAt: { $gte: since30 } })
      .populate("createdBy", "department").lean();
    const deptPast = dept ? pastSessions.filter(s => s.createdBy?.department === dept) : pastSessions;

    let lowAttendanceStudents = [];
    if (deptPast.length >= 5) {
      const attAgg = await AttendanceRecord.aggregate([
        { $match: { company, session: { $in: deptPast.map(s => s._id) }, status: { $in: ["present", "late"] } } },
        { $group: { _id: "$user", attended: { $sum: 1 } } },
        { $match: { attended: { $lt: Math.ceil(deptPast.length * 0.5) } } },
        { $sort: { attended: 1 } },
        { $limit: 20 },
      ]);
      const attMap    = new Map(attAgg.map(r => [String(r._id), r.attended]));
      const lowStus   = await User.find({ _id: { $in: attAgg.map(r => r._id) }, company, role: "student" })
        .select("name IndexNumber department").lean();
      lowAttendanceStudents = lowStus.map(s => ({
        ...s,
        attended: attMap.get(String(s._id)) || 0,
        total:    deptPast.length,
        rate:     Math.round(((attMap.get(String(s._id)) || 0) / deptPast.length) * 100),
      })).sort((a, b) => a.rate - b.rate);
    }

    res.json({ inactiveLecturers, inactiveCourses: inactiveCourses.slice(0, 20), repeatedAbsentees, lowAttendanceStudents });
  } catch (err) {
    console.error("[HOD] getAlerts:", err);
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
};

// ─── POST /api/hod/bulk-unlock ────────────────────────────────────────────────
exports.bulkUnlockStudents = async (req, res) => {
  try {
    const { userIds, note } = req.body;
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "userIds array required" });
    }
    if (userIds.length > 50) {
      return res.status(400).json({ error: "Maximum 50 accounts per bulk unlock" });
    }

    const filter   = hodDeptFilter(req, { _id: { $in: userIds }, role: "student", isLocked: true });
    const students = await User.find(filter).lean();

    await User.updateMany(
      { _id: { $in: students.map(s => s._id) } },
      { $set: { isLocked: false, lockedAt: null, lockReason: null, lockedBy: null, failedLoginAttempts: 0, lastFailedLoginAt: null } }
    );

    await Promise.allSettled(students.map(s =>
      AuditLog.record({
        company: req.user.company, actor: req.user, action: AUDIT_ACTIONS.ACCOUNT_REACTIVATED,
        resource: "User", resourceId: s._id, resourceLabel: s.name,
        changes: { before: { isLocked: true }, after: { isLocked: false } },
        metadata: { note: note || `Bulk unlocked by HOD ${req.user.name}` }, req,
      }).catch(() => {})
    ));

    res.json({ message: `${students.length} student account${students.length !== 1 ? "s" : ""} unlocked.`, unlockedCount: students.length, unlockedIds: students.map(s => s._id) });
  } catch (err) {
    console.error("[HOD] bulkUnlockStudents:", err);
    res.status(500).json({ error: "Failed to bulk unlock accounts" });
  }
};

// ─── POST /api/hod/send-group-message ────────────────────────────────────────
exports.sendGroupMessage = async (req, res) => {
  try {
    const { target, body: bodyText } = req.body;
    if (!["lecturers", "students"].includes(target)) {
      return res.status(400).json({ error: "target must be: lecturers or students" });
    }
    if (!bodyText?.trim()) {
      return res.status(400).json({ error: "message body is required" });
    }

    const company = req.user.company;
    const dept    = req.user.department;
    const myId    = req.user._id;

    const roles      = target === "lecturers" ? ["lecturer"] : ["student"];
    const userFilter = { company, role: { $in: roles } };
    if (dept) userFilter.department = dept;
    const recipients = await User.find(userFilter).select("_id name").lean();

    if (recipients.length === 0) {
      return res.status(400).json({ error: "No recipients found in your department" });
    }
    if (recipients.length > 100) {
      return res.status(400).json({ error: "Too many recipients (max 100). Use announcements instead." });
    }

    const trimmed = bodyText.trim();
    let sent = 0;

    for (const recip of recipients) {
      try {
        const existing = await Conversation.findOne({
          company, isGroup: false, type: "direct_message",
          "participants.user": { $all: [myId, recip._id] },
        });

        if (existing) {
          const msg = await Message.create({ company, conversation: existing._id, sender: myId, body: trimmed });
          await Conversation.updateOne(
            { _id: existing._id },
            { $set: { "lastMessage.body": trimmed, "lastMessage.sender": myId, "lastMessage.sentAt": msg.createdAt }, $inc: { messageCount: 1 } }
          );
          await Conversation.updateOne(
            { _id: existing._id, "participants.user": recip._id },
            { $inc: { "participants.$.unreadCount": 1 } }
          );
        } else {
          const convo = await Conversation.create({
            company,
            participants: [{ user: myId, unreadCount: 0 }, { user: recip._id, unreadCount: 1 }],
            isGroup: false, type: "direct_message", createdBy: myId,
            lastMessage: { body: trimmed, sender: myId, sentAt: new Date() },
            messageCount: 1,
          });
          await Message.create({ company, conversation: convo._id, sender: myId, body: trimmed });
        }
        sent++;
      } catch (_) { /* skip individual failures */ }
    }

    res.json({ message: `Message delivered to ${sent} ${target}.`, sentCount: sent });
  } catch (err) {
    console.error("[HOD] sendGroupMessage:", err);
    res.status(500).json({ error: "Failed to send group message" });
  }
};

// ─── GET /api/hod/course-overview ────────────────────────────────────────────
exports.getCourseOverview = async (req, res) => {
  try {
    const company  = req.user.company;
    const dept     = req.user.department;
    const since30  = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const since14  = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const courseFilter = { companyId: company };
    if (dept) courseFilter.departmentId = dept;
    const courses = await Course.find(courseFilter)
      .populate("lecturerId", "name email department")
      .lean();

    const sessions = await AttendanceSession.find({
      company,
      course: { $in: courses.map(c => c._id) },
      createdAt: { $gte: since30 },
    }).select("course createdAt totalMarked status").lean();

    const byId = {};
    sessions.forEach(s => {
      const id = String(s.course);
      if (!byId[id]) byId[id] = { sessions30: 0, sessions14: 0, lastAt: null, totalAtt: 0 };
      byId[id].sessions30++;
      if (s.createdAt >= since14) byId[id].sessions14++;
      byId[id].totalAtt += (s.totalMarked || 0);
      if (!byId[id].lastAt || s.createdAt > byId[id].lastAt) byId[id].lastAt = s.createdAt;
    });

    const overview = courses.map(c => ({
      _id:         c._id,
      title:       c.title,
      code:        c.code,
      lecturer:    c.lecturerId,
      enrolled:    c.enrolledStudents?.length || 0,
      isPublished: c.isPublished,
      approvalStatus: c.approvalStatus,
      sessions30:  byId[String(c._id)]?.sessions30 || 0,
      sessions14:  byId[String(c._id)]?.sessions14 || 0,
      lastSessionAt: byId[String(c._id)]?.lastAt || null,
      totalAttendance: byId[String(c._id)]?.totalAtt || 0,
    }));

    res.json({ courses: overview, count: overview.length });
  } catch (err) {
    console.error("[HOD] getCourseOverview:", err);
    res.status(500).json({ error: "Failed to fetch course overview" });
  }
};

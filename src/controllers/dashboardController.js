"use strict";

/**
 * dashboardController.js
 *
 * Real-time JSON dashboard endpoints — designed for live UI widgets,
 * not for PDF export.  Each function returns a self-contained snapshot
 * of the most relevant data for the caller's role.
 *
 * Endpoints
 * ---------
 * GET /api/dashboard/academic     admin/superadmin — institution overview
 * GET /api/dashboard/corporate    admin/manager/superadmin — workforce overview
 * GET /api/dashboard/lecturer     lecturer — own courses + workload
 * GET /api/dashboard/student      student — personal academic progress
 * GET /api/dashboard/employee     employee/manager — personal HR snapshot
 *
 * All queries are company-isolated via req.user.company.
 */

// ── Academic models ───────────────────────────────────────────────────────────
const Course              = require("../models/Course");
const User                = require("../models/User");
const AttendanceSession   = require("../models/AttendanceSession");
const AttendanceRecord    = require("../models/AttendanceRecord");
const GradeBook           = require("../models/GradeBook");
const Quiz                = require("../models/Quiz");
const Attempt             = require("../models/Attempt");
const NormalQuiz          = require("../models/NormalQuiz");
const SnapQuiz            = require("../models/SnapQuiz");
const Assignment          = require("../models/Assignment");
const AssignmentSubmission= require("../models/AssignmentSubmission");
const Announcement        = require("../models/Announcement");

// ── Corporate models ──────────────────────────────────────────────────────────
const CorporateAttendance = require("../models/CorporateAttendance");
const LeaveRequest        = require("../models/LeaveRequest");
const LeaveBalance        = require("../models/LeaveBalance");
const PayrollRun          = require("../models/PayrollRun");
const PaySlip             = require("../models/PaySlip");
const Goal                = require("../models/Goal");
const TrainingProgress    = require("../models/TrainingProgress");

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function utcDayStart(d) {
  const out = new Date(d);
  out.setUTCHours(0, 0, 0, 0);
  return out;
}

function utcMonthBounds(date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  return {
    start: new Date(Date.UTC(y, m, 1)),
    end:   new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)),
  };
}

// ---------------------------------------------------------------------------
// GET /api/dashboard/academic
// Admin / superadmin — institution-wide view
// ---------------------------------------------------------------------------
exports.academicOverview = async (req, res) => {
  try {
    const company = req.user.company;
    const now     = new Date();
    const ago30   = addDays(now, -30);
    const ahead7  = addDays(now, 7);

    // ── Headline counts ────────────────────────────────────────────────────
    const [
      totalCourses,
      totalStudents,
      totalLecturers,
      totalSessions,
      activeSessions,
    ] = await Promise.all([
      Course.countDocuments({ company }),
      User.countDocuments({ company, role: "student", isApproved: true }),
      User.countDocuments({ company, role: "lecturer", isApproved: true }),
      AttendanceSession.countDocuments({ company }),
      AttendanceSession.countDocuments({ company, status: "active" }),
    ]);

    // ── Assessment inventory ───────────────────────────────────────────────
    const [quizCount, nqCount, sqCount, asgCount, upcomingDeadlines] = await Promise.all([
      Quiz.countDocuments({ company, isActive: true }),
      NormalQuiz.countDocuments({ company, status: { $ne: "archived" } }),
      SnapQuiz.countDocuments({ company, status: { $ne: "archived" } }),
      Assignment.countDocuments({ company, status: { $ne: "archived" } }),
      Assignment.countDocuments({ company, status: "published", dueDate: { $gte: now, $lte: ahead7 } }),
    ]);

    // ── GradeBook stats ────────────────────────────────────────────────────
    const gradeBooks = await GradeBook.find({ company }).select("manualEntries").lean();
    const gradeBooksWithEntries = gradeBooks.filter(gb => gb.manualEntries?.length > 0).length;

    // ── Attendance trend — last 30 days ────────────────────────────────────
    const attendanceTrend = await AttendanceRecord.aggregate([
      {
        $match: {
          company,
          checkInTime: { $gte: ago30, $lte: now },
        },
      },
      {
        $group: {
          _id:     { $dateToString: { format: "%Y-%m-%d", date: "$checkInTime" } },
          present: { $sum: { $cond: [{ $in: ["$status", ["present", "late"]] }, 1, 0] } },
          total:   { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // ── Top 5 courses by enrollment ────────────────────────────────────────
    const allCourses = await Course.find({ company })
      .select("title code enrolledStudents lecturer")
      .populate("lecturer", "name")
      .lean();
    const topCourses = allCourses
      .map(c => ({
        _id:          c._id,
        title:        c.title,
        code:         c.code,
        lecturer:     c.lecturer?.name || "—",
        enrolledCount:c.enrolledStudents?.length || 0,
      }))
      .sort((a, b) => b.enrolledCount - a.enrolledCount)
      .slice(0, 5);

    // ── Recent announcements (last 5) ──────────────────────────────────────
    const recentAnnouncements = await Announcement.find({ company })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("title createdAt")
      .lean();

    res.json({
      totals: {
        courses:              totalCourses,
        students:             totalStudents,
        lecturers:            totalLecturers,
        sessions:             totalSessions,
        activeSessions,
        gradeBooks:           gradeBooks.length,
        gradeBooksWithEntries,
      },
      assessments: {
        legacyQuizzes:    quizCount,
        normalQuizzes:    nqCount,
        snapQuizzes:      sqCount,
        assignments:      asgCount,
        upcomingDeadlines,
      },
      attendanceTrend,
      topCourses,
      recentAnnouncements,
    });
  } catch (err) {
    console.error("academicOverview:", err);
    res.status(500).json({ error: "Failed to load academic dashboard" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/dashboard/corporate
// Admin / manager / superadmin — workforce overview
// ---------------------------------------------------------------------------
exports.corporateOverview = async (req, res) => {
  try {
    const company = req.user.company;
    const now     = new Date();
    const today   = utcDayStart(now);
    const todayEnd = new Date(today); todayEnd.setUTCHours(23, 59, 59, 999);
    const { start: monthStart, end: monthEnd } = utcMonthBounds(now);

    // ── Workforce count ────────────────────────────────────────────────────
    const totalEmployees = await User.countDocuments({
      company,
      role:     { $in: ["employee", "manager"] },
      isActive: true,
    });

    // ── Today's attendance breakdown ───────────────────────────────────────
    const todayAgg = await CorporateAttendance.aggregate([
      { $match: { company, date: { $gte: today, $lte: todayEnd } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const todayStats = { present: 0, late: 0, absent: 0, on_leave: 0, half_day: 0, remote: 0 };
    for (const row of todayAgg) {
      if (row._id in todayStats) todayStats[row._id] = row.count;
    }
    const clockedIn = totalEmployees > 0
      ? Math.round(((todayStats.present + todayStats.late) / totalEmployees) * 1000) / 10
      : 0;

    // ── Latest payroll run ─────────────────────────────────────────────────
    const latestRun = await PayrollRun.findOne({ company })
      .sort({ year: -1, month: -1 })
      .select("year month status totalGross totalNet employeeCount approvedAt paidAt")
      .lean();

    // ── Leave stats (this month + pending) ─────────────────────────────────
    const [pendingLeaves, approvedThisMonth, leaveByType] = await Promise.all([
      LeaveRequest.countDocuments({ company, status: "pending" }),
      LeaveRequest.countDocuments({
        company, status: "approved",
        startDate: { $lte: monthEnd },
        endDate:   { $gte: monthStart },
      }),
      LeaveRequest.aggregate([
        {
          $match: {
            company,
            status:    "approved",
            startDate: { $lte: monthEnd },
            endDate:   { $gte: monthStart },
          },
        },
        { $group: { _id: "$type", days: { $sum: "$days" } } },
        { $sort: { days: -1 } },
      ]),
    ]);

    // ── Training progress ──────────────────────────────────────────────────
    const tpAgg = await TrainingProgress.aggregate([
      { $match: { company } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const trainingStats = { assigned: 0, completed: 0, inProgress: 0, overdue: 0, failed: 0 };
    for (const row of tpAgg) {
      trainingStats.assigned += row.count;
      if (row._id === "completed")   trainingStats.completed  = row.count;
      if (row._id === "in_progress") trainingStats.inProgress = row.count;
      if (row._id === "overdue")     trainingStats.overdue    = row.count;
      if (row._id === "failed")      trainingStats.failed     = row.count;
    }
    const trainingCompletionRate = trainingStats.assigned > 0
      ? Math.round((trainingStats.completed / trainingStats.assigned) * 1000) / 10
      : 0;

    // ── Attendance trend — last 30 days ────────────────────────────────────
    const attendanceTrend = await CorporateAttendance.aggregate([
      {
        $match: {
          company,
          date: { $gte: addDays(now, -30), $lte: now },
        },
      },
      {
        $group: {
          _id:     { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
          present: { $sum: { $cond: [{ $in: ["$status", ["present", "late"]] }, 1, 0] } },
          absent:  { $sum: { $cond: [{ $eq:  ["$status", "absent"] },          1, 0] } },
          total:   { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      workforce: {
        total: totalEmployees,
        ...todayStats,
        percentClockedIn: clockedIn,
      },
      payrollSummary: latestRun,
      leaveStats: {
        pendingRequests:  pendingLeaves,
        approvedThisMonth,
        byType:           leaveByType,
      },
      training: {
        ...trainingStats,
        completionRate: trainingCompletionRate,
      },
      attendanceTrend,
    });
  } catch (err) {
    console.error("corporateOverview:", err);
    res.status(500).json({ error: "Failed to load corporate dashboard" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/dashboard/lecturer
// Lecturer — own courses, workload, upcoming deadlines
// ---------------------------------------------------------------------------
exports.lecturerDashboard = async (req, res) => {
  try {
    const company  = req.user.company;
    const userId   = req.user._id;
    const now      = new Date();
    const ahead7   = addDays(now, 7);

    // My courses
    const myCourses = await Course.find({ company, lecturer: userId })
      .select("title code enrolledStudents")
      .lean();
    const courseIds   = myCourses.map(c => c._id);
    const totalEnrolled = myCourses.reduce((s, c) => s + (c.enrolledStudents?.length || 0), 0);

    // Active + recent sessions
    const [activeSessions, recentSessions] = await Promise.all([
      AttendanceSession.countDocuments({ company, createdBy: userId, status: "active" }),
      AttendanceSession.find({ company, createdBy: userId })
        .sort({ startedAt: -1 })
        .limit(5)
        .select("title status startedAt course")
        .populate("course", "code title")
        .lean(),
    ]);

    // Assessment counts across my courses
    const [quizCount, nqCount, sqCount, asgCount, ungradedCount, upcomingDeadlines] = courseIds.length
      ? await Promise.all([
          Quiz.countDocuments({ company, course: { $in: courseIds }, isActive: true }),
          NormalQuiz.countDocuments({ company, course: { $in: courseIds }, status: { $ne: "archived" } }),
          SnapQuiz.countDocuments({ company, course: { $in: courseIds }, status: { $ne: "archived" } }),
          Assignment.countDocuments({ company, course: { $in: courseIds }, status: { $ne: "archived" } }),
          // Ungraded: submitted but not yet graded
          Assignment.find({ company, course: { $in: courseIds } })
            .distinct("_id")
            .then(ids =>
              ids.length
                ? AssignmentSubmission.countDocuments({ company, assignment: { $in: ids }, status: "submitted" })
                : 0
            ),
          Assignment.find({
            company,
            course:  { $in: courseIds },
            status:  { $ne: "archived" },
            dueDate: { $gte: now, $lte: ahead7 },
          })
            .select("title dueDate course")
            .populate("course", "code title")
            .sort({ dueDate: 1 })
            .lean(),
        ])
      : [0, 0, 0, 0, 0, []];

    res.json({
      courses: {
        count:         myCourses.length,
        totalEnrolled,
        list:          myCourses.map(c => ({
          _id:          c._id,
          title:        c.title,
          code:         c.code,
          enrolledCount:c.enrolledStudents?.length || 0,
        })),
      },
      sessions: {
        active: activeSessions,
        recent: recentSessions,
      },
      assessments: {
        quizzes:             quizCount,
        normalQuizzes:       nqCount,
        snapQuizzes:         sqCount,
        assignments:         asgCount,
        ungradedSubmissions: ungradedCount,
      },
      upcomingDeadlines,
    });
  } catch (err) {
    console.error("lecturerDashboard:", err);
    res.status(500).json({ error: "Failed to load lecturer dashboard" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/dashboard/student
// Student — personal academic progress across all enrolled courses
// ---------------------------------------------------------------------------
exports.studentDashboard = async (req, res) => {
  try {
    const company   = req.user.company;
    const studentId = req.user._id;
    const now       = new Date();
    const ahead7    = addDays(now, 7);

    // Enrolled courses
    const courses = await Course.find({ company, enrolledStudents: studentId })
      .select("title code lecturer")
      .populate("lecturer", "name")
      .lean();
    const courseIds = courses.map(c => c._id);

    // Attendance — sessions per course and how many the student attended
    const [allSessions, attendedRecords] = await Promise.all([
      courseIds.length
        ? AttendanceSession.find({ company, course: { $in: courseIds } }).select("_id course").lean()
        : [],
      courseIds.length
        ? AttendanceRecord.find({
            company,
            session: {
              $in: await AttendanceSession.find({ company, course: { $in: courseIds } }).distinct("_id"),
            },
            user: studentId,
          }).select("session").lean()
        : [],
    ]);

    const attendedSet = new Set(attendedRecords.map(r => r.session.toString()));
    const sessionsByCourse = {};
    for (const s of allSessions) {
      const cid = s.course?.toString();
      if (!cid) continue;
      if (!sessionsByCourse[cid]) sessionsByCourse[cid] = { total: 0, attended: 0 };
      sessionsByCourse[cid].total++;
      if (attendedSet.has(s._id.toString())) sessionsByCourse[cid].attended++;
    }

    const courseSummaries = courses.map(c => {
      const att = sessionsByCourse[c._id.toString()] || { total: 0, attended: 0 };
      return {
        _id:      c._id,
        title:    c.title,
        code:     c.code,
        lecturer: c.lecturer?.name || "—",
        attendance: {
          attended: att.attended,
          total:    att.total,
          pct:      att.total > 0 ? Math.round((att.attended / att.total) * 1000) / 10 : null,
        },
      };
    });

    // Assignment stats + upcoming deadlines
    const [submittedCount, totalPublished, upcomingDeadlines] = courseIds.length
      ? await Promise.all([
          AssignmentSubmission.countDocuments({
            company,
            student: studentId,
            status:  { $in: ["submitted", "graded", "late"] },
          }),
          Assignment.countDocuments({ company, course: { $in: courseIds }, status: "published" }),
          Assignment.find({
            company,
            course:  { $in: courseIds },
            status:  "published",
            dueDate: { $gte: now, $lte: ahead7 },
          })
            .select("title dueDate course")
            .populate("course", "code title")
            .sort({ dueDate: 1 })
            .lean(),
        ])
      : [0, 0, []];

    // Last 5 best quiz attempts
    const recentAttempts = await Attempt.find({
      student:     studentId,
      isSubmitted: true,
      isBestScore: true,
    })
      .sort({ submittedAt: -1 })
      .limit(5)
      .populate("quiz", "title")
      .select("score maxScore submittedAt quiz")
      .lean();

    res.json({
      enrolledCourses: courses.length,
      courseSummaries,
      attendance: {
        totalAttended:  attendedRecords.length,
        totalSessions:  allSessions.length,
        overallPct:     allSessions.length > 0
          ? Math.round((attendedRecords.length / allSessions.length) * 1000) / 10
          : null,
      },
      assignments: {
        totalPublished,
        submitted:  submittedCount,
        pending:    Math.max(0, totalPublished - submittedCount),
      },
      upcomingDeadlines,
      recentQuizAttempts: recentAttempts.map(a => ({
        quizTitle:   a.quiz?.title || "—",
        score:       a.score,
        maxScore:    a.maxScore,
        pct:         a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 1000) / 10 : 0,
        submittedAt: a.submittedAt,
      })),
    });
  } catch (err) {
    console.error("studentDashboard:", err);
    res.status(500).json({ error: "Failed to load student dashboard" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/dashboard/employee
// Employee / manager — personal HR snapshot
// ---------------------------------------------------------------------------
exports.employeeDashboard = async (req, res) => {
  try {
    const company    = req.user.company;
    const employeeId = req.user._id;
    const now        = new Date();
    const { start: monthStart, end: monthEnd } = utcMonthBounds(now);
    const today      = utcDayStart(now);
    const todayEnd   = new Date(today); todayEnd.setUTCHours(23, 59, 59, 999);

    // ── This month's attendance ────────────────────────────────────────────
    const monthAttendance = await CorporateAttendance.find({
      company,
      employee: employeeId,
      date:     { $gte: monthStart, $lte: monthEnd },
    }).lean();

    const daysPresent    = monthAttendance.filter(r => r.clockIn?.time).length;
    const daysLate       = monthAttendance.filter(r => r.clockIn?.isLate).length;
    const totalHoursWorked = Math.round(
      monthAttendance.reduce((s, r) => s + (r.hoursWorked || 0), 0) * 100
    ) / 100;

    // Today
    const todayRecord = await CorporateAttendance.findOne({
      company, employee: employeeId, date: { $gte: today, $lte: todayEnd },
    }).lean();

    // ── Leave balances ─────────────────────────────────────────────────────
    const [leaveBalances, pendingLeaves] = await Promise.all([
      LeaveBalance.find({ company, employee: employeeId })
        .populate("policy", "name leaveType")
        .lean(),
      LeaveRequest.countDocuments({ company, employee: employeeId, status: "pending" }),
    ]);

    // ── Latest payslip ─────────────────────────────────────────────────────
    const latestSlip = await PaySlip.findOne({ company, employee: employeeId })
      .sort({ year: -1, month: -1 })
      .select("year month grossPay netPay status currency")
      .lean();

    // ── Training modules ───────────────────────────────────────────────────
    const myTraining = await TrainingProgress.find({ company, employee: employeeId })
      .select("status dueDate module")
      .populate("module", "title")
      .lean();
    const training = { assigned: myTraining.length, completed: 0, inProgress: 0, overdue: 0, failed: 0 };
    for (const t of myTraining) {
      if (t.status === "completed")   training.completed++;
      else if (t.status === "in_progress") training.inProgress++;
      else if (t.status === "overdue")     training.overdue++;
      else if (t.status === "failed")      training.failed++;
    }

    // ── Active goals ───────────────────────────────────────────────────────
    const goals = await Goal.find({
      company,
      employee: employeeId,
      status:   { $nin: ["cancelled", "completed"] },
    })
      .select("title progress target unit dueDate status")
      .sort({ dueDate: 1 })
      .limit(5)
      .lean();

    res.json({
      attendance: {
        month:             `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`,
        daysPresent,
        daysLate,
        totalHoursWorked,
        today: todayRecord
          ? {
              clockedIn:  !!todayRecord.clockIn?.time,
              clockedOut: !!todayRecord.clockOut?.time,
              status:     todayRecord.status,
              lateMinutes:todayRecord.lateMinutes || 0,
            }
          : null,
      },
      leaveBalances: leaveBalances.map(b => ({
        type:        b.policy?.leaveType || b.policy?.name || "—",
        entitlement: b.entitlement,
        used:        b.used,
        pending:     b.pending,
        carryover:   b.carryover  || 0,
        adjustments: b.adjustments|| 0,
        remaining:   b.entitlement + (b.carryover || 0) + (b.adjustments || 0) - b.used - b.pending,
      })),
      pendingLeaveRequests: pendingLeaves,
      latestPayslip:        latestSlip,
      training,
      activeGoals:          goals,
    });
  } catch (err) {
    console.error("employeeDashboard:", err);
    res.status(500).json({ error: "Failed to load employee dashboard" });
  }
};

const { randomUUID } = require("crypto");
const PDFDocument = require("pdfkit");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord = require("../models/AttendanceRecord");
const User = require("../models/User");
const Course = require("../models/Course");
const Quiz = require("../models/Quiz");
const QuizSubmission = require("../models/QuizSubmission"); // legacy — kept for reference
const Attempt = require("../models/Attempt");
const Company = require("../models/Company");
const { buildDateFilter } = require("../utils/controllerHelpers");
const pdf = require("../utils/pdfHelpers");

// In-memory store for one-time download tokens (TTL: 3 minutes)
const _downloadTokens = new Map();
const _TOKEN_TTL_MS = 3 * 60 * 1000;

function _pruneTokens() {
  const now = Date.now();
  for (const [k, v] of _downloadTokens) {
    if (v.expiresAt < now) _downloadTokens.delete(k);
  }
}

exports.createDownloadLink = (req, res) => {
  _pruneTokens();
  const { type } = req.params;
  const allowed = ["attendance", "sessions", "performance"];
  if (!allowed.includes(type)) {
    return res.status(400).json({ error: "Invalid report type" });
  }
  const uuid = randomUUID();
  _downloadTokens.set(uuid, {
    type,
    user: {
      _id:     req.user._id,
      role:    req.user.role,
      company: req.user.company,
    },
    query:     req.query,
    expiresAt: Date.now() + _TOKEN_TTL_MS,
  });
  res.json({ url: `/api/reports/download/${uuid}` });
};

exports.downloadByToken = async (req, res) => {
  _pruneTokens();
  const token = _downloadTokens.get(req.params.uuid);
  if (!token || token.expiresAt < Date.now()) {
    return res.status(410).json({ error: "Download link expired or not found. Please try again." });
  }
  _downloadTokens.delete(req.params.uuid);

  // Reconstruct a minimal req-like object and delegate to the real handler
  const fakeReq = { user: token.user, query: token.query };
  const handler = {
    attendance:  exports.attendanceReport,
    sessions:    exports.sessionReport,
    performance: exports.performanceReport,
  }[token.type];

  return handler(fakeReq, res);
};

// PDF helpers imported from shared utility
const drawHeader = pdf.drawSimpleHeader;
const drawTableRow = pdf.drawTableRow;
const checkPage = (doc, y, margin = 60) => pdf.checkPage(doc, y, { margin });
const drawSummaryBox = pdf.drawSummaryBox;

exports.attendanceReport = async (req, res) => {
  try {
    const { sessionId, startDate, endDate } = req.query;
    const filter = { company: req.user.company };

    if (req.user.role === "lecturer") {
      const lecturerSessions = await AttendanceSession.find({
        company: req.user.company,
        createdBy: req.user._id,
      }).select("_id");
      const sessionIds = lecturerSessions.map((s) => s._id);

      if (sessionId) {
        if (!sessionIds.some((id) => id.toString() === sessionId)) {
          return res.status(403).json({ error: "Access denied: session does not belong to you" });
        }
        filter.session = sessionId;
      } else {
        filter.session = { $in: sessionIds };
      }
    } else if (req.user.role === "student" || req.user.role === "employee") {
      filter.user = req.user._id;
      if (sessionId) filter.session = sessionId;
    } else {
      if (sessionId) filter.session = sessionId;
    }

    if (startDate || endDate) {
      filter.checkInTime = {};
      if (startDate) filter.checkInTime.$gte = new Date(startDate);
      if (endDate) { const ed = new Date(endDate); ed.setHours(23,59,59,999); filter.checkInTime.$lte = ed; }
    }

    const [records, company] = await Promise.all([
      AttendanceRecord.find(filter)
        .populate("user", "name email IndexNumber role")
        .populate("session", "title startedAt stoppedAt")
        .sort({ checkInTime: -1 }),
      Company.findById(req.user.company).select("name"),
    ]);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=attendance-report.pdf");
    res.setHeader("Cache-Control", "no-cache");
    doc.pipe(res);

    drawHeader(doc, "Attendance Report", company?.name);

    const statusCounts = records.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    doc._summaryX = 50;
    doc._summaryY = doc.y;
    drawSummaryBox(doc, "Total Records", records.length);
    drawSummaryBox(doc, "Present", statusCounts.present || 0);
    drawSummaryBox(doc, "Late", statusCounts.late || 0);
    drawSummaryBox(doc, "Absent", statusCounts.absent || 0);

    doc.y = (doc._summaryY || doc.y) + 60;
    doc.moveDown(1);

    if (records.length === 0) {
      doc.fontSize(13).font("Helvetica").text("No attendance records found.", { align: "center" });
    } else {
      const colWidths = [130, 90, 110, 80, 60, 60];
      const headers = [
        { text: "Name", width: colWidths[0] },
        { text: "ID", width: colWidths[1] },
        { text: "Session", width: colWidths[2] },
        { text: "Check-in", width: colWidths[3] },
        { text: "Status", width: colWidths[4] },
        { text: "Method", width: colWidths[5] },
      ];

      let y = doc.y;
      y = drawTableRow(doc, headers, y, { bold: true, bg: "#e5e7eb" });

      records.forEach((record) => {
        y = checkPage(doc, y);
        const userName = record.user ? record.user.name : "Unknown";
        const identifier = record.user ? (record.user.IndexNumber || record.user.email || "") : "";
        const sessionTitle = record.session ? record.session.title || "Untitled" : "N/A";
        const checkIn = record.checkInTime ? new Date(record.checkInTime).toLocaleDateString() : "N/A";
        const status = record.status || "N/A";
        const methodLabels = { qr_mark: "QR", code_mark: "Code", ble_mark: "BLE", jitsi_join: "Jitsi", manual: "Manual", gps_mark: "GPS" };
        const method = methodLabels[record.method] || record.method || "N/A";

        const row = [
          { text: userName, width: colWidths[0] },
          { text: identifier, width: colWidths[1] },
          { text: sessionTitle, width: colWidths[2] },
          { text: checkIn, width: colWidths[3] },
          { text: status, width: colWidths[4] },
          { text: method, width: colWidths[5] },
        ];
        y = drawTableRow(doc, row, y);
      });
    }

    doc.end();
  } catch (error) {
    console.error("Attendance report error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate attendance report" });
    }
  }
};

exports.sessionReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = { company: req.user.company };

    if (req.user.role === "lecturer") {
      filter.createdBy = req.user._id;
    }

    if (startDate || endDate) {
      filter.startedAt = {};
      if (startDate) filter.startedAt.$gte = new Date(startDate);
      if (endDate) { const ed = new Date(endDate); ed.setHours(23,59,59,999); filter.startedAt.$lte = ed; }
    }

    const [sessions, company] = await Promise.all([
      AttendanceSession.find(filter)
        .populate("createdBy", "name email")
        .populate("stoppedBy", "name email")
        .populate("course", "title code")
        .sort({ startedAt: -1 }),
      Company.findById(req.user.company).select("name"),
    ]);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=sessions-report.pdf");
    res.setHeader("Cache-Control", "no-cache");
    doc.pipe(res);

    drawHeader(doc, "Sessions Report", company?.name);

    const active = sessions.filter(s => s.status === "active").length;
    const stopped = sessions.filter(s => s.status === "stopped").length;

    doc._summaryX = 50;
    doc._summaryY = doc.y;
    drawSummaryBox(doc, "Total Sessions", sessions.length);
    drawSummaryBox(doc, "Active", active);
    drawSummaryBox(doc, "Completed", stopped);

    doc.y = (doc._summaryY || doc.y) + 60;
    doc.moveDown(1);

    if (sessions.length === 0) {
      doc.fontSize(13).font("Helvetica").text("No sessions found.", { align: "center" });
    } else {
      const colWidths = [120, 80, 100, 100, 60, 70];
      const headers = [
        { text: "Title", width: colWidths[0] },
        { text: "Course", width: colWidths[1] },
        { text: "Started", width: colWidths[2] },
        { text: "Ended", width: colWidths[3] },
        { text: "Status", width: colWidths[4] },
        { text: "Created By", width: colWidths[5] },
      ];

      let y = doc.y;
      y = drawTableRow(doc, headers, y, { bold: true, bg: "#e5e7eb" });

      sessions.forEach((s) => {
        y = checkPage(doc, y);
        const row = [
          { text: s.title || "Untitled", width: colWidths[0] },
          { text: s.course ? `${s.course.code}` : "-", width: colWidths[1] },
          { text: new Date(s.startedAt).toLocaleDateString(), width: colWidths[2] },
          { text: s.stoppedAt ? new Date(s.stoppedAt).toLocaleDateString() : "Active", width: colWidths[3] },
          { text: s.status, width: colWidths[4] },
          { text: s.createdBy?.name || "N/A", width: colWidths[5] },
        ];
        y = drawTableRow(doc, row, y);
      });
    }

    doc.end();
  } catch (error) {
    console.error("Session report error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate session report" });
    }
  }
};

exports.performanceReport = async (req, res) => {
  try {
    const { courseId, userId } = req.query;
    const filter = { company: req.user.company };

    if (req.user.role === "lecturer") {
      const lecturerCourses = await Course.find({
        companyId: req.user.company,
        lecturerId: req.user._id,
      }).select("_id");
      const courseIds = lecturerCourses.map((c) => c._id);

      if (courseId) {
        if (!courseIds.some((id) => id.toString() === courseId)) {
          return res.status(403).json({ error: "Access denied: course does not belong to you" });
        }
        const quizzes = await Quiz.find({ course: courseId }).select("_id");
        filter.quiz = { $in: quizzes.map((q) => q._id) };
      } else {
        const quizzes = await Quiz.find({ course: { $in: courseIds } }).select("_id");
        filter.quiz = { $in: quizzes.map((q) => q._id) };
      }
    } else if (req.user.role === "student") {
      filter.student = req.user._id;
      if (courseId) {
        const quizzes = await Quiz.find({ course: courseId }).select("_id");
        filter.quiz = { $in: quizzes.map((q) => q._id) };
      }
    } else {
      if (courseId) {
        const quizzes = await Quiz.find({ course: courseId }).select("_id");
        filter.quiz = { $in: quizzes.map((q) => q._id) };
      }
    }

    if (userId && req.user.role !== "student") {
      filter.student = userId;
    }

    const [submissions, company] = await Promise.all([
      Attempt.find({ ...filter, isSubmitted: true })
        .populate("student", "name email IndexNumber")
        .populate("quiz", "title")
        .sort({ submittedAt: -1 }),
      Company.findById(req.user.company).select("name"),
    ]);

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=performance-report.pdf");
    res.setHeader("Cache-Control", "no-cache");
    doc.pipe(res);

    drawHeader(doc, "Performance Report", company?.name);

    const avgScore = submissions.length > 0
      ? (submissions.reduce((sum, s) => sum + (s.maxScore > 0 ? (s.score / s.maxScore) * 100 : 0), 0) / submissions.length).toFixed(1)
      : "0";

    doc._summaryX = 50;
    doc._summaryY = doc.y;
    drawSummaryBox(doc, "Submissions", submissions.length);
    drawSummaryBox(doc, "Avg Score", `${avgScore}%`);

    doc.y = (doc._summaryY || doc.y) + 60;
    doc.moveDown(1);

    if (submissions.length === 0) {
      doc.fontSize(13).font("Helvetica").text("No quiz submissions found.", { align: "center" });
    } else {
      const colWidths = [130, 100, 120, 80, 100];
      const headers = [
        { text: "Student", width: colWidths[0] },
        { text: "ID", width: colWidths[1] },
        { text: "Quiz", width: colWidths[2] },
        { text: "Score", width: colWidths[3] },
        { text: "Date", width: colWidths[4] },
      ];

      let y = doc.y;
      y = drawTableRow(doc, headers, y, { bold: true, bg: "#e5e7eb" });

      submissions.forEach((sub) => {
        y = checkPage(doc, y);
        const studentName = sub.student ? sub.student.name : "Unknown";
        const identifier = sub.student ? (sub.student.IndexNumber || sub.student.email || "") : "";
        const quizTitle = sub.quiz ? sub.quiz.title : "N/A";
        const percentage = sub.maxScore > 0 ? ((sub.score / sub.maxScore) * 100).toFixed(1) : "0";

        const row = [
          { text: studentName, width: colWidths[0] },
          { text: identifier, width: colWidths[1] },
          { text: quizTitle, width: colWidths[2] },
          { text: `${sub.score}/${sub.maxScore} (${percentage}%)`, width: colWidths[3] },
          { text: new Date(sub.submittedAt).toLocaleDateString(), width: colWidths[4] },
        ];
        y = drawTableRow(doc, row, y);
      });
    }

    doc.end();
  } catch (error) {
    console.error("Performance report error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate performance report" });
    }
  }
};

/**
 * GET /api/reports/attendance/csv
 * Export attendance records as a CSV file (same filters as attendanceReport).
 */
exports.attendanceCsv = async (req, res) => {
  try {
    const { sessionId, startDate, endDate } = req.query;
    const filter = { company: req.user.company };

    if (req.user.role === "lecturer") {
      const lecturerSessions = await AttendanceSession.find({
        company: req.user.company,
        createdBy: req.user._id,
      }).select("_id");
      const sessionIds = lecturerSessions.map((s) => s._id);
      if (sessionId) {
        if (!sessionIds.some((id) => id.toString() === sessionId)) {
          return res.status(403).json({ error: "Access denied: session does not belong to you" });
        }
        filter.session = sessionId;
      } else {
        filter.session = { $in: sessionIds };
      }
    } else if (req.user.role === "student" || req.user.role === "employee") {
      filter.user = req.user._id;
      if (sessionId) filter.session = sessionId;
    } else {
      if (sessionId) filter.session = sessionId;
    }

    if (startDate || endDate) {
      filter.checkInTime = {};
      if (startDate) filter.checkInTime.$gte = new Date(startDate);
      if (endDate) { const ed = new Date(endDate); ed.setHours(23, 59, 59, 999); filter.checkInTime.$lte = ed; }
    }

    const records = await AttendanceRecord.find(filter)
      .populate("user", "name email IndexNumber role department")
      .populate("session", "title startedAt stoppedAt")
      .sort({ checkInTime: -1 });

    const methodLabels = { qr_mark: "QR", code_mark: "Code", ble_mark: "BLE", jitsi_join: "Jitsi", manual: "Manual", gps_mark: "GPS" };

    const escape = (v) => {
      const s = String(v ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = [
      ["Name", "Student ID / Email", "Session", "Check-in Time", "Status", "Method"].map(escape).join(","),
      ...records.map((r) => [
        r.user?.name ?? "Unknown",
        r.user?.IndexNumber || r.user?.email || "",
        r.session?.title || "Untitled",
        r.checkInTime ? new Date(r.checkInTime).toISOString().replace("T", " ").substring(0, 19) : "",
        r.status || "",
        methodLabels[r.method] || r.method || "",
      ].map(escape).join(",")),
    ];

    const csv = rows.join("\r\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=attendance-report.csv");
    res.setHeader("Cache-Control", "no-cache");
    res.send(csv);
  } catch (error) {
    console.error("Attendance CSV error:", error);
    res.status(500).json({ error: "Failed to generate CSV" });
  }
};

const PDFDocument = require("pdfkit");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord = require("../models/AttendanceRecord");
const User = require("../models/User");
const Course = require("../models/Course");
const Quiz = require("../models/Quiz");
const QuizSubmission = require("../models/QuizSubmission");
const Company = require("../models/Company");

function drawHeader(doc, title, institution) {
  doc.fontSize(22).font("Helvetica-Bold").text(title, { align: "center" });
  doc.moveDown(0.3);
  if (institution) {
    doc.fontSize(12).font("Helvetica").text(institution, { align: "center" });
    doc.moveDown(0.3);
  }
  doc.fontSize(9).font("Helvetica").fillColor("#666666")
    .text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
  doc.fillColor("#000000");
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(doc.page.width - 50, doc.y).strokeColor("#cccccc").stroke();
  doc.moveDown(1);
}

function drawTableRow(doc, columns, y, options = {}) {
  const { bold = false, bg = null, fontSize = 9 } = options;
  const startX = 50;
  const rowHeight = 20;

  if (bg) {
    doc.rect(startX, y - 2, doc.page.width - 100, rowHeight).fill(bg);
    doc.fillColor("#000000");
  }

  doc.fontSize(fontSize).font(bold ? "Helvetica-Bold" : "Helvetica");
  let x = startX;
  columns.forEach(({ text, width }) => {
    doc.text(text || "", x + 4, y, { width: width - 8, height: rowHeight, ellipsis: true });
    x += width;
  });

  return y + rowHeight;
}

function checkPage(doc, y, margin = 60) {
  if (y > doc.page.height - margin) {
    doc.addPage();
    return 50;
  }
  return y;
}

function drawSummaryBox(doc, label, value) {
  const boxW = 120;
  const boxH = 50;
  const x = doc._summaryX || 50;
  const y = doc._summaryY || doc.y;

  doc.rect(x, y, boxW, boxH).fill("#f3f4f6");
  doc.fillColor("#6b7280").fontSize(8).font("Helvetica")
    .text(label, x, y + 8, { width: boxW, align: "center" });
  doc.fillColor("#111827").fontSize(16).font("Helvetica-Bold")
    .text(String(value), x, y + 22, { width: boxW, align: "center" });
  doc.fillColor("#000000");

  doc._summaryX = x + boxW + 12;
  if (doc._summaryX + boxW > doc.page.width - 50) {
    doc._summaryX = 50;
    doc._summaryY = y + boxH + 8;
  }
}

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
      if (endDate) filter.checkInTime.$lte = new Date(endDate);
    }

    const [records, company] = await Promise.all([
      AttendanceRecord.find(filter)
        .populate("user", "name email indexNumber role")
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
        const identifier = record.user ? (record.user.indexNumber || record.user.email || "") : "";
        const sessionTitle = record.session ? record.session.title || "Untitled" : "N/A";
        const checkIn = record.checkInTime ? new Date(record.checkInTime).toLocaleDateString() : "N/A";
        const status = record.status || "N/A";
        const methodLabels = { qr_mark: "QR", code_mark: "Code", ble_mark: "BLE", jitsi_join: "Jitsi", manual: "Manual" };
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
      if (endDate) filter.startedAt.$lte = new Date(endDate);
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
        company: req.user.company,
        lecturer: req.user._id,
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
      QuizSubmission.find(filter)
        .populate("student", "name email indexNumber")
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
      ? (submissions.reduce((sum, s) => sum + (s.maxScore > 0 ? (s.totalScore / s.maxScore) * 100 : 0), 0) / submissions.length).toFixed(1)
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
        const identifier = sub.student ? (sub.student.indexNumber || sub.student.email || "") : "";
        const quizTitle = sub.quiz ? sub.quiz.title : "N/A";
        const percentage = sub.maxScore > 0 ? ((sub.totalScore / sub.maxScore) * 100).toFixed(1) : "0";

        const row = [
          { text: studentName, width: colWidths[0] },
          { text: identifier, width: colWidths[1] },
          { text: quizTitle, width: colWidths[2] },
          { text: `${sub.totalScore}/${sub.maxScore} (${percentage}%)`, width: colWidths[3] },
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

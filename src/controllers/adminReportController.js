const PDFDocument = require("pdfkit");
const mongoose = require("mongoose");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord = require("../models/AttendanceRecord");
const User = require("../models/User");
const Course = require("../models/Course");
const Quiz = require("../models/Quiz");
const QuizSubmission = require("../models/QuizSubmission");
const Company = require("../models/Company");

function drawHeader(doc, title, institution) {
  doc.rect(0, 0, doc.page.width, 90).fill("#4f46e5");
  doc.fillColor("#ffffff").fontSize(24).font("Helvetica-Bold")
    .text(title, 50, 25, { align: "center" });
  if (institution) {
    doc.fontSize(11).font("Helvetica")
      .text(institution, 50, 55, { align: "center" });
  }
  doc.fillColor("#000000");
  doc.y = 110;
  doc.fontSize(9).font("Helvetica").fillColor("#888888")
    .text(`Generated: ${new Date().toLocaleString()}`, { align: "right" });
  doc.fillColor("#000000");
  doc.moveDown(1);
}

function drawSectionTitle(doc, title) {
  const y = doc.y;
  doc.rect(50, y, doc.page.width - 100, 26).fill("#f3f4f6");
  doc.fillColor("#1f2937").fontSize(13).font("Helvetica-Bold")
    .text(title, 58, y + 6);
  doc.fillColor("#000000");
  doc.y = y + 34;
}

function drawSummaryRow(doc, items) {
  const totalW = doc.page.width - 100;
  const boxW = Math.min(130, (totalW - (items.length - 1) * 10) / items.length);
  const startX = 50;
  const y = doc.y;

  items.forEach((item, i) => {
    const x = startX + i * (boxW + 10);
    doc.rect(x, y, boxW, 52).lineWidth(1).strokeColor("#e5e7eb").stroke();
    doc.fillColor("#6b7280").fontSize(8).font("Helvetica")
      .text(item.label, x, y + 8, { width: boxW, align: "center" });
    doc.fillColor("#111827").fontSize(18).font("Helvetica-Bold")
      .text(String(item.value), x, y + 24, { width: boxW, align: "center" });
    doc.fillColor("#000000");
  });

  doc.y = y + 62;
}

function drawTableHeader(doc, columns, y) {
  doc.rect(50, y - 2, doc.page.width - 100, 20).fill("#4f46e5");
  doc.fillColor("#ffffff").fontSize(8).font("Helvetica-Bold");
  let x = 54;
  columns.forEach(({ text, width }) => {
    doc.text(text, x, y + 2, { width: width - 8, height: 16, ellipsis: true });
    x += width;
  });
  doc.fillColor("#000000");
  return y + 20;
}

function drawTableRow(doc, columns, y, even) {
  if (even) {
    doc.rect(50, y - 1, doc.page.width - 100, 18).fill("#f9fafb");
    doc.fillColor("#000000");
  }
  doc.fontSize(8).font("Helvetica");
  let x = 54;
  columns.forEach(({ text, width }) => {
    doc.text(text || "-", x, y + 2, { width: width - 8, height: 16, ellipsis: true });
    x += width;
  });
  return y + 18;
}

function checkPage(doc, y, columns) {
  if (y > doc.page.height - 60) {
    doc.addPage();
    if (columns) {
      return drawTableHeader(doc, columns, 50);
    }
    return 50;
  }
  return y;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1️⃣  ATTENDANCE REPORT (Institution Overview)
// GET /api/admin/reports/attendance
// Filters: lecturerId, classId, startDate, endDate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
exports.attendanceOverview = async (req, res) => {
  try {
    const companyId = req.user.company;
    const { lecturerId, classId, startDate, endDate } = req.query;

    const sessionFilter = { company: companyId };
    if (lecturerId) sessionFilter.createdBy = lecturerId;
    if (classId) sessionFilter.course = classId;
    if (startDate || endDate) {
      sessionFilter.startedAt = {};
      if (startDate) sessionFilter.startedAt.$gte = new Date(startDate);
      if (endDate) sessionFilter.startedAt.$lte = new Date(endDate);
    }

    const [sessions, courses, company] = await Promise.all([
      AttendanceSession.find(sessionFilter)
        .populate("createdBy", "name email")
        .populate("course", "title code"),
      Course.find({ company: companyId }).populate("lecturer", "name").populate("enrolledStudents"),
      Company.findById(companyId).select("name mode"),
    ]);

    const sessionIds = sessions.map(s => s._id);

    const [records, allStudents] = await Promise.all([
      AttendanceRecord.find({ company: companyId, session: { $in: sessionIds } })
        .populate("user", "name email indexNumber role")
        .populate("session", "title startedAt stoppedAt course createdBy"),
      User.find({
        company: companyId,
        role: { $in: ["student", "employee"] },
        isApproved: true,
      }).countDocuments(),
    ]);

    const totalPresent = records.filter(r => r.status === "present" || r.status === "late").length;
    const totalAbsent = records.filter(r => r.status === "absent").length;

    const sessionDetailRows = [];
    sessions.forEach(s => {
      const courseId = s.course?._id?.toString() || "no-course";
      const courseName = s.course?.title || s.title || "General Session";
      const courseCode = s.course?.code || "";
      const lecName = s.createdBy?.name || "Unknown";
      const enrolled = s.course
        ? (courses.find(c => c._id.toString() === courseId)?.enrolledStudents?.length || 0)
        : allStudents;
      const sessionDate = s.startedAt ? new Date(s.startedAt).toLocaleDateString() : "N/A";

      const sessionRecords = records.filter(r => r.session?._id?.toString() === s._id.toString());
      const present = sessionRecords.filter(r => r.status === "present" || r.status === "late").length;
      const absent = sessionRecords.filter(r => r.status === "absent").length;
      const pct = enrolled > 0 ? ((present / enrolled) * 100).toFixed(1) : "0.0";

      sessionDetailRows.push({
        classId: courseId,
        className: courseCode ? `${courseCode} - ${courseName}` : courseName,
        lecturerName: lecName,
        totalStudents: enrolled,
        presentCount: present,
        absentCount: absent,
        attendancePercentage: pct,
        sessionDate,
      });
    });

    const uniqueClasses = new Set(sessionDetailRows.map(r => r.classId));
    const totalSessions = sessions.length;
    const totalClasses = uniqueClasses.size;

    const averageAttendanceRate = sessionDetailRows.length > 0
      ? (sessionDetailRows.reduce((s, r) => s + parseFloat(r.attendancePercentage), 0) / sessionDetailRows.length).toFixed(1) + "%"
      : "0.0%";

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=admin-attendance-report.pdf");
    res.setHeader("Cache-Control", "no-cache");
    doc.pipe(res);

    drawHeader(doc, "Attendance Report", company?.name);

    drawSectionTitle(doc, "Aggregated Summary");
    doc.moveDown(0.3);
    drawSummaryRow(doc, [
      { label: "Total Students", value: allStudents },
      { label: "Total Classes", value: totalClasses },
      { label: "Total Sessions", value: totalSessions },
    ]);
    drawSummaryRow(doc, [
      { label: "Avg Attendance Rate", value: averageAttendanceRate },
      { label: "Total Present", value: totalPresent },
      { label: "Total Absent", value: totalAbsent },
    ]);

    if (lecturerId || classId || startDate || endDate) {
      const parts = [];
      if (lecturerId) {
        const lec = await User.findById(lecturerId).select("name");
        parts.push(`Lecturer: ${lec?.name || lecturerId}`);
      }
      if (classId) {
        const cls = await Course.findById(classId).select("title code");
        parts.push(`Class: ${cls?.code || classId}`);
      }
      if (startDate) parts.push(`From: ${new Date(startDate).toLocaleDateString()}`);
      if (endDate) parts.push(`To: ${new Date(endDate).toLocaleDateString()}`);
      doc.fontSize(9).font("Helvetica").fillColor("#6b7280")
        .text(`Filters: ${parts.join(" | ")}`, 50);
      doc.fillColor("#000000");
      doc.moveDown(0.5);
    }

    doc.moveDown(0.5);
    drawSectionTitle(doc, "Per-Class / Per-Session Breakdown");
    doc.moveDown(0.3);

    if (sessionDetailRows.length === 0) {
      doc.fontSize(12).font("Helvetica").text("No class data found.", { align: "center" });
    } else {
      const cols = [
        { text: "Class", width: 110 },
        { text: "Lecturer", width: 80 },
        { text: "Students", width: 50 },
        { text: "Present", width: 45 },
        { text: "Absent", width: 45 },
        { text: "Attendance %", width: 65 },
        { text: "Session Date", width: 70 },
      ];
      let y = drawTableHeader(doc, cols, doc.y);

      sessionDetailRows.forEach((r, i) => {
        y = checkPage(doc, y, cols);
        y = drawTableRow(doc, [
          { text: r.className, width: cols[0].width },
          { text: r.lecturerName, width: cols[1].width },
          { text: String(r.totalStudents), width: cols[2].width },
          { text: String(r.presentCount), width: cols[3].width },
          { text: String(r.absentCount), width: cols[4].width },
          { text: `${r.attendancePercentage}%`, width: cols[5].width },
          { text: r.sessionDate, width: cols[6].width },
        ], y, i % 2 === 0);
      });
    }

    doc.moveDown(1.5);
    drawSectionTitle(doc, "Individual Attendance Records");
    doc.moveDown(0.3);

    if (records.length === 0) {
      doc.fontSize(12).font("Helvetica").text("No attendance records found.", { align: "center" });
    } else {
      const detailCols = [
        { text: "Name", width: 100 },
        { text: "ID / Email", width: 90 },
        { text: "Session", width: 95 },
        { text: "Date", width: 70 },
        { text: "Status", width: 50 },
        { text: "Method", width: 60 },
      ];
      let y2 = drawTableHeader(doc, detailCols, doc.y);
      const methodLabels = { qr_mark: "QR Code", code_mark: "6-Digit Code", ble_mark: "BLE", jitsi_join: "Jitsi", manual: "Manual" };

      records.forEach((r, i) => {
        y2 = checkPage(doc, y2, detailCols);
        y2 = drawTableRow(doc, [
          { text: r.user?.name || "Unknown", width: detailCols[0].width },
          { text: r.user?.indexNumber || r.user?.email || "", width: detailCols[1].width },
          { text: r.session?.title || "Untitled", width: detailCols[2].width },
          { text: r.checkInTime ? new Date(r.checkInTime).toLocaleDateString() : "N/A", width: detailCols[3].width },
          { text: r.status || "N/A", width: detailCols[4].width },
          { text: methodLabels[r.method] || r.method || "N/A", width: detailCols[5].width },
        ], y2, i % 2 === 0);
      });
    }

    doc.end();
  } catch (error) {
    console.error("Admin attendance overview error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate attendance report" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2️⃣  SESSION REPORT (Lecturer Activity Tracking)
// GET /api/admin/reports/sessions
// Filters: lecturerId, classId, startDate, endDate
// Duration calc + suspicious session flagging
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
exports.sessionAnalytics = async (req, res) => {
  try {
    const companyId = req.user.company;
    const { lecturerId, classId, startDate, endDate } = req.query;

    const filter = { company: companyId };
    if (lecturerId) filter.createdBy = lecturerId;
    if (classId) filter.course = classId;
    if (startDate || endDate) {
      filter.startedAt = {};
      if (startDate) filter.startedAt.$gte = new Date(startDate);
      if (endDate) filter.startedAt.$lte = new Date(endDate);
    }

    const [sessions, company, courses] = await Promise.all([
      AttendanceSession.find(filter)
        .populate("createdBy", "name email")
        .populate("course", "title code")
        .sort({ startedAt: -1 }),
      Company.findById(companyId).select("name mode"),
      Course.find({ company: companyId }).populate("enrolledStudents"),
    ]);

    const sessionIds = sessions.map(s => s._id);
    const records = await AttendanceRecord.find({ company: companyId, session: { $in: sessionIds } })
      .select("session status");

    const sessionRecordMap = {};
    records.forEach(r => {
      const sid = r.session.toString();
      if (!sessionRecordMap[sid]) sessionRecordMap[sid] = { total: 0, present: 0, late: 0, absent: 0 };
      sessionRecordMap[sid].total++;
      if (r.status === "present") sessionRecordMap[sid].present++;
      else if (r.status === "late") sessionRecordMap[sid].late++;
      else if (r.status === "absent") sessionRecordMap[sid].absent++;
    });

    const courseStudentMap = {};
    courses.forEach(c => {
      courseStudentMap[c._id.toString()] = c.enrolledStudents?.length || 0;
    });

    const sessionData = sessions.map(s => {
      const rm = sessionRecordMap[s._id.toString()] || { total: 0, present: 0, late: 0, absent: 0 };
      const courseId = s.course?._id?.toString();
      const totalStudents = courseId ? (courseStudentMap[courseId] || rm.total) : rm.total;

      let durationMin = null;
      let suspicious = false;
      if (s.stoppedAt && s.startedAt) {
        durationMin = Math.round((new Date(s.stoppedAt) - new Date(s.startedAt)) / 60000);
        if (durationMin < 5) suspicious = true;
      }

      return {
        sessionId: s._id.toString(),
        className: s.course ? `${s.course.code} - ${s.course.title}` : (s.title || "General Session"),
        lecturerName: s.createdBy?.name || "Unknown",
        startTime: s.startedAt,
        endTime: s.stoppedAt,
        duration: durationMin,
        status: s.status,
        totalStudents,
        presentCount: rm.present + rm.late,
        absentCount: rm.absent,
        suspicious,
      };
    });

    const suspiciousCount = sessionData.filter(s => s.suspicious).length;
    const totalPresent = sessionData.reduce((s, d) => s + d.presentCount, 0);
    const avgDuration = sessionData.filter(s => s.duration !== null).length > 0
      ? Math.round(sessionData.filter(s => s.duration !== null).reduce((s, d) => s + d.duration, 0) / sessionData.filter(s => s.duration !== null).length)
      : 0;

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=admin-session-report.pdf");
    res.setHeader("Cache-Control", "no-cache");
    doc.pipe(res);

    drawHeader(doc, "Session Report", company?.name);

    drawSectionTitle(doc, "Summary");
    doc.moveDown(0.3);
    drawSummaryRow(doc, [
      { label: "Total Sessions", value: sessionData.length },
      { label: "Active", value: sessionData.filter(s => s.status === "active").length },
      { label: "Completed", value: sessionData.filter(s => s.status === "stopped").length },
    ]);
    drawSummaryRow(doc, [
      { label: "Avg Duration (min)", value: avgDuration },
      { label: "Total Present", value: totalPresent },
      { label: "Suspicious (<5min)", value: suspiciousCount },
    ]);

    if (lecturerId || classId || startDate || endDate) {
      const parts = [];
      if (lecturerId) {
        const lec = await User.findById(lecturerId).select("name");
        parts.push(`Lecturer: ${lec?.name || lecturerId}`);
      }
      if (classId) {
        const cls = await Course.findById(classId).select("code");
        parts.push(`Class: ${cls?.code || classId}`);
      }
      if (startDate) parts.push(`From: ${new Date(startDate).toLocaleDateString()}`);
      if (endDate) parts.push(`To: ${new Date(endDate).toLocaleDateString()}`);
      doc.fontSize(9).font("Helvetica").fillColor("#6b7280")
        .text(`Filters: ${parts.join(" | ")}`, 50);
      doc.fillColor("#000000");
      doc.moveDown(0.5);
    }

    doc.moveDown(0.5);
    drawSectionTitle(doc, "Session Details");
    doc.moveDown(0.3);

    if (sessionData.length === 0) {
      doc.fontSize(12).font("Helvetica").text("No sessions found.", { align: "center" });
    } else {
      const cols = [
        { text: "Class", width: 95 },
        { text: "Lecturer", width: 75 },
        { text: "Start", width: 60 },
        { text: "End", width: 60 },
        { text: "Dur (min)", width: 45 },
        { text: "Students", width: 45 },
        { text: "Present", width: 40 },
        { text: "Flag", width: 50 },
      ];
      let y = drawTableHeader(doc, cols, doc.y);

      sessionData.forEach((s, i) => {
        y = checkPage(doc, y, cols);

        const startStr = s.startTime ? new Date(s.startTime).toLocaleDateString() : "N/A";
        const endStr = s.endTime ? new Date(s.endTime).toLocaleDateString() : "Active";
        const durStr = s.duration !== null ? String(s.duration) : "Active";
        const flag = s.suspicious ? "TOO SHORT" : (s.status === "active" ? "Active" : "OK");

        y = drawTableRow(doc, [
          { text: s.className, width: cols[0].width },
          { text: s.lecturerName, width: cols[1].width },
          { text: startStr, width: cols[2].width },
          { text: endStr, width: cols[3].width },
          { text: durStr, width: cols[4].width },
          { text: String(s.totalStudents), width: cols[5].width },
          { text: String(s.presentCount), width: cols[6].width },
          { text: flag, width: cols[7].width },
        ], y, i % 2 === 0);
      });
    }

    if (suspiciousCount > 0) {
      doc.moveDown(1.5);
      drawSectionTitle(doc, "Suspicious Sessions (< 5 minutes)");
      doc.moveDown(0.3);
      doc.fontSize(9).font("Helvetica").fillColor("#dc2626")
        .text(`${suspiciousCount} session(s) lasted less than 5 minutes and may need review.`);
      doc.fillColor("#000000");
      doc.moveDown(0.3);

      const susCols = [
        { text: "Class", width: 130 },
        { text: "Lecturer", width: 100 },
        { text: "Date", width: 80 },
        { text: "Duration", width: 60 },
        { text: "Present", width: 60 },
      ];
      let y3 = drawTableHeader(doc, susCols, doc.y);

      sessionData.filter(s => s.suspicious).forEach((s, i) => {
        y3 = checkPage(doc, y3, susCols);
        y3 = drawTableRow(doc, [
          { text: s.className, width: susCols[0].width },
          { text: s.lecturerName, width: susCols[1].width },
          { text: s.startTime ? new Date(s.startTime).toLocaleDateString() : "N/A", width: susCols[2].width },
          { text: `${s.duration} min`, width: susCols[3].width },
          { text: String(s.presentCount), width: susCols[4].width },
        ], y3, i % 2 === 0);
      });
    }

    doc.end();
  } catch (error) {
    console.error("Admin session report error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate session report" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3️⃣  PERFORMANCE REPORT
// GET /api/admin/reports/performance
// Aggregated quiz/academic performance analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
exports.performanceReport = async (req, res) => {
  try {
    const companyId = req.user.company;
    const { lecturerId, classId, startDate, endDate } = req.query;

    const courseFilter = { company: companyId };
    if (lecturerId) courseFilter.lecturer = lecturerId;
    if (classId) courseFilter._id = classId;

    const [courses, company] = await Promise.all([
      Course.find(courseFilter)
        .populate("lecturer", "name email")
        .populate("enrolledStudents", "name indexNumber email"),
      Company.findById(companyId).select("name mode"),
    ]);

    const courseIds = courses.map(c => c._id);

    const quizFilter = { company: companyId, course: { $in: courseIds } };
    const quizzes = await Quiz.find(quizFilter).select("title course");

    const quizIds = quizzes.map(q => q._id);
    const submissionFilter = { company: companyId, quiz: { $in: quizIds } };
    if (startDate || endDate) {
      submissionFilter.submittedAt = {};
      if (startDate) submissionFilter.submittedAt.$gte = new Date(startDate);
      if (endDate) submissionFilter.submittedAt.$lte = new Date(endDate);
    }

    const submissions = await QuizSubmission.find(submissionFilter)
      .populate("student", "name indexNumber email")
      .populate("quiz", "title course");

    const courseQuizMap = {};
    quizzes.forEach(q => {
      const cid = q.course.toString();
      if (!courseQuizMap[cid]) courseQuizMap[cid] = [];
      courseQuizMap[cid].push(q);
    });

    const courseSubMap = {};
    submissions.forEach(sub => {
      const quizCourse = sub.quiz?.course?.toString();
      if (!quizCourse) return;
      if (!courseSubMap[quizCourse]) courseSubMap[quizCourse] = [];
      courseSubMap[quizCourse].push(sub);
    });

    const coursePerformance = courses.map(c => {
      const cid = c._id.toString();
      const subs = courseSubMap[cid] || [];
      const quizCount = (courseQuizMap[cid] || []).length;
      const avgScore = subs.length > 0
        ? (subs.reduce((s, sub) => s + (sub.maxScore > 0 ? (sub.totalScore / sub.maxScore) * 100 : 0), 0) / subs.length).toFixed(1)
        : "N/A";
      const highestScore = subs.length > 0
        ? Math.max(...subs.map(sub => sub.maxScore > 0 ? (sub.totalScore / sub.maxScore) * 100 : 0)).toFixed(1)
        : "N/A";
      const lowestScore = subs.length > 0
        ? Math.min(...subs.map(sub => sub.maxScore > 0 ? (sub.totalScore / sub.maxScore) * 100 : 0)).toFixed(1)
        : "N/A";

      return {
        courseCode: c.code,
        courseTitle: c.title,
        lecturerName: c.lecturer?.name || "N/A",
        enrolledStudents: c.enrolledStudents?.length || 0,
        quizCount,
        submissions: subs.length,
        avgScore,
        highestScore,
        lowestScore,
      };
    });

    const totalQuizzes = quizzes.length;
    const totalSubmissions = submissions.length;
    const overallAvg = submissions.length > 0
      ? (submissions.reduce((s, sub) => s + (sub.maxScore > 0 ? (sub.totalScore / sub.maxScore) * 100 : 0), 0) / submissions.length).toFixed(1) + "%"
      : "N/A";
    const passRate = submissions.length > 0
      ? ((submissions.filter(sub => sub.maxScore > 0 && (sub.totalScore / sub.maxScore) >= 0.5).length / submissions.length) * 100).toFixed(1) + "%"
      : "N/A";

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=admin-performance-report.pdf");
    res.setHeader("Cache-Control", "no-cache");
    doc.pipe(res);

    drawHeader(doc, "Performance Report", company?.name);

    drawSectionTitle(doc, "Summary");
    doc.moveDown(0.3);
    drawSummaryRow(doc, [
      { label: "Total Courses", value: courses.length },
      { label: "Total Quizzes", value: totalQuizzes },
      { label: "Total Submissions", value: totalSubmissions },
    ]);
    drawSummaryRow(doc, [
      { label: "Overall Avg Score", value: overallAvg },
      { label: "Pass Rate (≥50%)", value: passRate },
    ]);

    if (lecturerId || classId || startDate || endDate) {
      const parts = [];
      if (lecturerId) {
        const lec = await User.findById(lecturerId).select("name");
        parts.push(`Lecturer: ${lec?.name || lecturerId}`);
      }
      if (classId) {
        const cls = await Course.findById(classId).select("code");
        parts.push(`Class: ${cls?.code || classId}`);
      }
      if (startDate) parts.push(`From: ${new Date(startDate).toLocaleDateString()}`);
      if (endDate) parts.push(`To: ${new Date(endDate).toLocaleDateString()}`);
      doc.fontSize(9).font("Helvetica").fillColor("#6b7280")
        .text(`Filters: ${parts.join(" | ")}`, 50);
      doc.fillColor("#000000");
      doc.moveDown(0.5);
    }

    doc.moveDown(0.5);
    drawSectionTitle(doc, "Per-Course Performance");
    doc.moveDown(0.3);

    if (coursePerformance.length === 0) {
      doc.fontSize(12).font("Helvetica").text("No course data found.", { align: "center" });
    } else {
      const cols = [
        { text: "Course", width: 85 },
        { text: "Lecturer", width: 75 },
        { text: "Students", width: 45 },
        { text: "Quizzes", width: 40 },
        { text: "Subs", width: 35 },
        { text: "Avg", width: 40 },
        { text: "High", width: 40 },
        { text: "Low", width: 40 },
      ];
      let y = drawTableHeader(doc, cols, doc.y);

      coursePerformance.forEach((c, i) => {
        y = checkPage(doc, y, cols);
        y = drawTableRow(doc, [
          { text: c.courseCode, width: cols[0].width },
          { text: c.lecturerName, width: cols[1].width },
          { text: String(c.enrolledStudents), width: cols[2].width },
          { text: String(c.quizCount), width: cols[3].width },
          { text: String(c.submissions), width: cols[4].width },
          { text: c.avgScore !== "N/A" ? `${c.avgScore}%` : "N/A", width: cols[5].width },
          { text: c.highestScore !== "N/A" ? `${c.highestScore}%` : "N/A", width: cols[6].width },
          { text: c.lowestScore !== "N/A" ? `${c.lowestScore}%` : "N/A", width: cols[7].width },
        ], y, i % 2 === 0);
      });
    }

    if (submissions.length > 0) {
      doc.moveDown(1.5);
      drawSectionTitle(doc, "Individual Submissions");
      doc.moveDown(0.3);

      const subCols = [
        { text: "Student", width: 95 },
        { text: "ID", width: 80 },
        { text: "Quiz", width: 100 },
        { text: "Score", width: 70 },
        { text: "Date", width: 70 },
      ];
      let y2 = drawTableHeader(doc, subCols, doc.y);

      submissions.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
      submissions.forEach((sub, i) => {
        y2 = checkPage(doc, y2, subCols);
        const pct = sub.maxScore > 0 ? ((sub.totalScore / sub.maxScore) * 100).toFixed(1) : "0";
        y2 = drawTableRow(doc, [
          { text: sub.student?.name || "Unknown", width: subCols[0].width },
          { text: sub.student?.indexNumber || sub.student?.email || "", width: subCols[1].width },
          { text: sub.quiz?.title || "N/A", width: subCols[2].width },
          { text: `${sub.totalScore}/${sub.maxScore} (${pct}%)`, width: subCols[3].width },
          { text: new Date(sub.submittedAt).toLocaleDateString(), width: subCols[4].width },
        ], y2, i % 2 === 0);
      });
    }

    doc.end();
  } catch (error) {
    console.error("Admin performance report error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate performance report" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4️⃣  LECTURER PERFORMANCE REPORT
// GET /api/admin/reports/lecturers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
exports.lecturerPerformance = async (req, res) => {
  try {
    const companyId = req.user.company;

    const [lecturers, sessions, courses, company] = await Promise.all([
      User.find({ company: companyId, role: "lecturer", isApproved: true }).select("name email"),
      AttendanceSession.find({ company: companyId }).populate("createdBy", "name"),
      Course.find({ company: companyId }).populate("lecturer", "name").populate("enrolledStudents", "name"),
      Company.findById(companyId).select("name"),
    ]);

    const lecturerMap = {};
    lecturers.forEach(l => {
      lecturerMap[l._id.toString()] = {
        name: l.name,
        email: l.email,
        sessions: 0,
        activeSessions: 0,
        courses: 0,
        totalStudents: 0,
      };
    });

    sessions.forEach(s => {
      const lid = s.createdBy?._id?.toString();
      if (lid && lecturerMap[lid]) {
        lecturerMap[lid].sessions++;
        if (s.status === "active") lecturerMap[lid].activeSessions++;
      }
    });

    courses.forEach(c => {
      const lid = c.lecturer?._id?.toString();
      if (lid && lecturerMap[lid]) {
        lecturerMap[lid].courses++;
        lecturerMap[lid].totalStudents += (c.enrolledStudents?.length || 0);
      }
    });

    const lecturerData = Object.values(lecturerMap);

    const recordCounts = await Promise.all(
      Object.keys(lecturerMap).map(async lid => {
        const lecturerSessions = sessions.filter(s => s.createdBy?._id?.toString() === lid).map(s => s._id);
        if (lecturerSessions.length === 0) return { lid, count: 0 };
        const count = await AttendanceRecord.countDocuments({ company: companyId, session: { $in: lecturerSessions } });
        return { lid, count };
      })
    );

    recordCounts.forEach(({ lid, count }) => {
      if (lecturerMap[lid]) lecturerMap[lid].attendanceRecords = count;
    });

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=admin-lecturer-performance.pdf");
    res.setHeader("Cache-Control", "no-cache");
    doc.pipe(res);

    drawHeader(doc, "Lecturer Performance Report", company?.name);

    drawSectionTitle(doc, "Summary");
    doc.moveDown(0.3);
    drawSummaryRow(doc, [
      { label: "Total Lecturers", value: lecturerData.length },
      { label: "Total Sessions", value: sessions.length },
      { label: "Total Courses", value: courses.length },
    ]);

    doc.moveDown(0.5);
    drawSectionTitle(doc, "Lecturer Breakdown");
    doc.moveDown(0.3);

    const cols = [
      { text: "Lecturer", width: 120 },
      { text: "Email", width: 130 },
      { text: "Courses", width: 55 },
      { text: "Sessions", width: 55 },
      { text: "Students", width: 60 },
      { text: "Records", width: 60 },
    ];
    let y = drawTableHeader(doc, cols, doc.y);

    lecturerData.forEach((l, i) => {
      y = checkPage(doc, y, cols);
      y = drawTableRow(doc, [
        { text: l.name, width: cols[0].width },
        { text: l.email, width: cols[1].width },
        { text: String(l.courses), width: cols[2].width },
        { text: String(l.sessions), width: cols[3].width },
        { text: String(l.totalStudents), width: cols[4].width },
        { text: String(l.attendanceRecords || 0), width: cols[5].width },
      ], y, i % 2 === 0);
    });

    doc.end();
  } catch (error) {
    console.error("Admin lecturer performance error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate report" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5️⃣  STUDENT/EMPLOYEE ANALYTICS
// GET /api/admin/reports/students
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
exports.studentAnalytics = async (req, res) => {
  try {
    const companyId = req.user.company;
    const company = await Company.findById(companyId).select("name mode");
    const mode = company?.mode || "academic";
    const studentRole = mode === "academic" ? "student" : "employee";

    const students = await User.find({ company: companyId, role: studentRole, isApproved: true })
      .select("name email indexNumber employeeId");

    const allRecords = await AttendanceRecord.find({ company: companyId })
      .select("user status session");

    const allSessions = await AttendanceSession.find({ company: companyId }).select("_id");
    const totalSessions = allSessions.length;

    let courseEnrollments = {};
    let quizData = {};
    if (mode === "academic") {
      const courses = await Course.find({ company: companyId }).select("enrolledStudents");
      courses.forEach(c => {
        (c.enrolledStudents || []).forEach(sid => {
          const key = sid.toString();
          courseEnrollments[key] = (courseEnrollments[key] || 0) + 1;
        });
      });

      const submissions = await QuizSubmission.find({ company: companyId })
        .select("student totalScore maxScore");
      submissions.forEach(sub => {
        const key = sub.student.toString();
        if (!quizData[key]) quizData[key] = { total: 0, sum: 0, count: 0 };
        quizData[key].count++;
        quizData[key].sum += sub.maxScore > 0 ? (sub.totalScore / sub.maxScore) * 100 : 0;
      });
    }

    const studentRecords = {};
    allRecords.forEach(r => {
      const uid = r.user.toString();
      if (!studentRecords[uid]) studentRecords[uid] = { present: 0, late: 0, absent: 0, total: 0 };
      studentRecords[uid].total++;
      if (r.status === "present") studentRecords[uid].present++;
      else if (r.status === "late") studentRecords[uid].late++;
      else if (r.status === "absent") studentRecords[uid].absent++;
    });

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=admin-${studentRole}-analytics.pdf`);
    res.setHeader("Cache-Control", "no-cache");
    doc.pipe(res);

    const title = mode === "academic" ? "Student Analytics Report" : "Employee Analytics Report";
    drawHeader(doc, title, company?.name);

    const avgAttendance = students.length > 0
      ? (students.reduce((s, st) => {
          const rec = studentRecords[st._id.toString()];
          return s + (rec && totalSessions > 0 ? (rec.present / totalSessions) * 100 : 0);
        }, 0) / students.length).toFixed(1) + "%"
      : "0%";

    drawSectionTitle(doc, "Summary");
    doc.moveDown(0.3);
    drawSummaryRow(doc, [
      { label: `Total ${mode === "academic" ? "Students" : "Employees"}`, value: students.length },
      { label: "Total Sessions", value: totalSessions },
      { label: "Avg Attendance", value: avgAttendance },
    ]);

    doc.moveDown(0.5);
    drawSectionTitle(doc, `${mode === "academic" ? "Student" : "Employee"} Detail`);
    doc.moveDown(0.3);

    const isAcademic = mode === "academic";
    const cols = isAcademic
      ? [
          { text: "Name", width: 100 },
          { text: "Index No.", width: 80 },
          { text: "Present", width: 50 },
          { text: "Late", width: 40 },
          { text: "Absent", width: 45 },
          { text: "Rate", width: 45 },
          { text: "Courses", width: 50 },
          { text: "Avg Quiz", width: 55 },
        ]
      : [
          { text: "Name", width: 120 },
          { text: "Email", width: 130 },
          { text: "Present", width: 55 },
          { text: "Late", width: 50 },
          { text: "Absent", width: 50 },
          { text: "Rate", width: 60 },
        ];

    let y = drawTableHeader(doc, cols, doc.y);

    students.forEach((st, i) => {
      y = checkPage(doc, y, cols);
      const rec = studentRecords[st._id.toString()] || { present: 0, late: 0, absent: 0 };
      const rate = totalSessions > 0 ? ((rec.present / totalSessions) * 100).toFixed(1) + "%" : "0%";

      const row = [
        { text: st.name, width: cols[0].width },
        { text: isAcademic ? (st.indexNumber || "") : (st.email || ""), width: cols[1].width },
        { text: String(rec.present), width: cols[2].width },
        { text: String(rec.late), width: cols[3].width },
        { text: String(rec.absent), width: cols[4].width },
        { text: rate, width: cols[5].width },
      ];

      if (isAcademic) {
        const qd = quizData[st._id.toString()];
        row.push({ text: String(courseEnrollments[st._id.toString()] || 0), width: cols[6].width });
        row.push({ text: qd ? (qd.sum / qd.count).toFixed(1) + "%" : "-", width: cols[7].width });
      }

      y = drawTableRow(doc, row, y, i % 2 === 0);
    });

    doc.end();
  } catch (error) {
    console.error("Admin student analytics error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate report" });
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6️⃣  INSTITUTION SUMMARY
// GET /api/admin/reports/summary
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
exports.institutionSummary = async (req, res) => {
  try {
    const companyId = req.user.company;

    const [company, users, sessions, records, courses, quizzes, submissions] = await Promise.all([
      Company.findById(companyId),
      User.find({ company: companyId, isApproved: true }).select("role name"),
      AttendanceSession.find({ company: companyId }),
      AttendanceRecord.find({ company: companyId }).select("status method checkInTime"),
      Course.find({ company: companyId }).populate("lecturer", "name").populate("enrolledStudents"),
      Quiz.find({ company: companyId }),
      QuizSubmission.find({ company: companyId }),
    ]);

    const roleCounts = users.reduce((acc, u) => {
      acc[u.role] = (acc[u.role] || 0) + 1;
      return acc;
    }, {});

    const statusCounts = records.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});

    const methodCounts = records.reduce((acc, r) => {
      acc[r.method] = (acc[r.method] || 0) + 1;
      return acc;
    }, {});

    const last30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentRecords = records.filter(r => r.checkInTime >= last30).length;
    const recentSessions = sessions.filter(s => s.startedAt >= last30).length;

    const doc = new PDFDocument({ margin: 50, size: "A4" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=admin-institution-summary.pdf");
    res.setHeader("Cache-Control", "no-cache");
    doc.pipe(res);

    drawHeader(doc, "Institution Summary Report", company?.name);

    drawSectionTitle(doc, "Institution Info");
    doc.moveDown(0.3);
    doc.fontSize(10).font("Helvetica");
    doc.text(`Institution Name: ${company?.name || "N/A"}`);
    doc.text(`Mode: ${(company?.mode || "N/A").toUpperCase()}`);
    doc.text(`Institution Code: ${company?.institutionCode || "N/A"}`);
    doc.text(`Subscription: ${company?.subscriptionStatus || "N/A"} (${company?.subscriptionPlan || "none"})`);
    if (company?.subscriptionStatus === "trial") {
      const trialEnd = company.trialEndDate ? new Date(company.trialEndDate).toLocaleDateString() : "N/A";
      doc.text(`Trial Ends: ${trialEnd}`);
    }
    doc.moveDown(1);

    drawSectionTitle(doc, "People Overview");
    doc.moveDown(0.3);
    const isAcademic = company?.mode === "academic";
    drawSummaryRow(doc, [
      { label: "Total Users", value: users.length },
      { label: "Admins", value: roleCounts.admin || 0 },
      { label: isAcademic ? "Lecturers" : "Managers", value: isAcademic ? (roleCounts.lecturer || 0) : (roleCounts.manager || 0) },
      { label: isAcademic ? "Students" : "Employees", value: isAcademic ? (roleCounts.student || 0) : (roleCounts.employee || 0) },
    ]);

    doc.moveDown(0.5);
    drawSectionTitle(doc, "Attendance Summary");
    doc.moveDown(0.3);
    drawSummaryRow(doc, [
      { label: "Total Sessions", value: sessions.length },
      { label: "Total Records", value: records.length },
      { label: "Last 30 Days (Rec)", value: recentRecords },
      { label: "Last 30 Days (Ses)", value: recentSessions },
    ]);

    drawSummaryRow(doc, [
      { label: "Present", value: statusCounts.present || 0 },
      { label: "Late", value: statusCounts.late || 0 },
      { label: "Absent", value: statusCounts.absent || 0 },
      { label: "Excused", value: statusCounts.excused || 0 },
    ]);

    doc.moveDown(0.5);
    drawSectionTitle(doc, "Check-in Methods");
    doc.moveDown(0.3);
    const methodLabels = { qr_mark: "QR Code", code_mark: "6-Digit Code", ble_mark: "BLE", jitsi_join: "Jitsi", manual: "Manual" };
    Object.entries(methodCounts).forEach(([method, count]) => {
      const pct = records.length > 0 ? ((count / records.length) * 100).toFixed(1) : "0";
      doc.fontSize(10).font("Helvetica").text(`${methodLabels[method] || method}: ${count} (${pct}%)`, 58);
    });

    if (isAcademic) {
      doc.moveDown(1);
      drawSectionTitle(doc, "Academic Summary");
      doc.moveDown(0.3);
      const avgQuiz = submissions.length > 0
        ? (submissions.reduce((s, sub) => s + (sub.maxScore > 0 ? (sub.totalScore / sub.maxScore) * 100 : 0), 0) / submissions.length).toFixed(1) + "%"
        : "N/A";
      drawSummaryRow(doc, [
        { label: "Courses", value: courses.length },
        { label: "Quizzes", value: quizzes.length },
        { label: "Submissions", value: submissions.length },
        { label: "Avg Quiz Score", value: avgQuiz },
      ]);

      if (courses.length > 0) {
        doc.moveDown(0.5);
        drawSectionTitle(doc, "Courses Overview");
        doc.moveDown(0.3);
        const courseCols = [
          { text: "Course Code", width: 90 },
          { text: "Title", width: 150 },
          { text: "Lecturer", width: 110 },
          { text: "Students", width: 65 },
        ];
        let y = drawTableHeader(doc, courseCols, doc.y);
        courses.forEach((c, i) => {
          y = checkPage(doc, y, courseCols);
          y = drawTableRow(doc, [
            { text: c.code, width: courseCols[0].width },
            { text: c.title, width: courseCols[1].width },
            { text: c.lecturer?.name || "N/A", width: courseCols[2].width },
            { text: String(c.enrolledStudents?.length || 0), width: courseCols[3].width },
          ], y, i % 2 === 0);
        });
      }
    }

    doc.end();
  } catch (error) {
    console.error("Admin institution summary error:", error);
    if (!res.headersSent) res.status(500).json({ error: "Failed to generate report" });
  }
};

exports.dashboard = async (req, res) => {
  try {
    const companyId = req.user.company;

    const [totalStudents, totalLecturers, totalClasses, totalSessions] = await Promise.all([
      User.countDocuments({ company: companyId, role: { $in: ["student", "employee"] }, isApproved: true }),
      User.countDocuments({ company: companyId, role: { $in: ["lecturer", "manager"] }, isApproved: true }),
      Course.countDocuments({ company: companyId }),
      AttendanceSession.countDocuments({ company: companyId }),
    ]);

    let averageAttendanceRate = 0;
    if (totalSessions > 0) {
      const sessions = await AttendanceSession.find({ company: companyId }).select("_id course").lean();
      const sessionIds = sessions.map(s => s._id);

      const courseIds = [...new Set(sessions.filter(s => s.course).map(s => s.course.toString()))];
      const courses = await Course.find({ _id: { $in: courseIds } }).select("enrolledStudents").lean();
      const courseEnrollMap = {};
      courses.forEach(c => { courseEnrollMap[c._id.toString()] = c.enrolledStudents?.length || 0; });

      const totalPresentRecords = await AttendanceRecord.countDocuments({
        company: companyId,
        session: { $in: sessionIds },
        status: { $in: ["present", "late"] },
      });

      let totalPossible = 0;
      sessions.forEach(s => {
        const enrolled = s.course ? (courseEnrollMap[s.course.toString()] || 0) : totalStudents;
        totalPossible += enrolled;
      });

      averageAttendanceRate = totalPossible > 0
        ? parseFloat(((totalPresentRecords / totalPossible) * 100).toFixed(1))
        : 0;
    }

    res.json({
      totalStudents,
      totalLecturers,
      totalClasses,
      totalSessions,
      averageAttendanceRate,
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    res.status(500).json({ error: "Failed to load dashboard data" });
  }
};

exports.chartData = async (req, res) => {
  try {
    const companyId = req.user.company;
    const { startDate, endDate } = req.query;

    const sessionFilter = { company: companyId };
    if (startDate || endDate) {
      sessionFilter.startedAt = {};
      if (startDate) sessionFilter.startedAt.$gte = new Date(startDate);
      if (endDate) sessionFilter.startedAt.$lte = new Date(endDate);
    }

    const [sessions, courses, records, totalStudentsFallback] = await Promise.all([
      AttendanceSession.find(sessionFilter).select("_id course createdBy startedAt").lean(),
      Course.find({ company: companyId }).select("_id enrolledStudents lecturer title code").lean(),
      AttendanceRecord.find({ company: companyId }).select("session user status").lean(),
      User.countDocuments({ company: companyId, role: { $in: ["student", "employee"] }, isApproved: true }),
    ]);

    const sessionIds = new Set(sessions.map(s => s._id.toString()));
    const filteredRecords = records.filter(r => sessionIds.has(r.session?.toString()));

    const courseEnrollMap = {};
    const courseInfoMap = {};
    courses.forEach(c => {
      courseEnrollMap[c._id.toString()] = c.enrolledStudents?.length || 0;
      courseInfoMap[c._id.toString()] = { code: c.code, title: c.title, lecturerId: c.lecturer?.toString() };
    });

    const lecturerIds = [...new Set(sessions.filter(s => s.createdBy).map(s => s.createdBy.toString()))];
    const lecturers = await User.find({ _id: { $in: lecturerIds }, company: companyId }).select("name").lean();
    const lecturerNameMap = {};
    lecturers.forEach(l => { lecturerNameMap[l._id.toString()] = l.name; });

    const recordsBySession = {};
    filteredRecords.forEach(r => {
      const sid = r.session.toString();
      if (!recordsBySession[sid]) recordsBySession[sid] = [];
      recordsBySession[sid].push(r);
    });

    const trendMap = {};
    sessions.forEach(s => {
      const date = s.startedAt ? new Date(s.startedAt).toISOString().split("T")[0] : "unknown";
      if (!trendMap[date]) trendMap[date] = { sessions: 0, present: 0, totalPossible: 0 };
      trendMap[date].sessions++;

      const enrolled = s.course ? (courseEnrollMap[s.course.toString()] || 0) : totalStudentsFallback;
      trendMap[date].totalPossible += enrolled;

      const recs = recordsBySession[s._id.toString()] || [];
      trendMap[date].present += recs.filter(r => r.status === "present" || r.status === "late").length;
    });

    const attendanceTrend = Object.entries(trendMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, d]) => ({
        date,
        sessions: d.sessions,
        present: d.present,
        totalPossible: d.totalPossible,
        attendanceRate: d.totalPossible > 0 ? parseFloat(((d.present / d.totalPossible) * 100).toFixed(1)) : 0,
      }));

    const lecMap = {};
    sessions.forEach(s => {
      if (!s.createdBy) return;
      const lid = s.createdBy.toString();
      if (!lecMap[lid]) lecMap[lid] = { totalSessions: 0, totalPresent: 0, totalPossible: 0 };
      lecMap[lid].totalSessions++;

      const enrolled = s.course ? (courseEnrollMap[s.course.toString()] || 0) : totalStudentsFallback;
      lecMap[lid].totalPossible += enrolled;

      const recs = recordsBySession[s._id.toString()] || [];
      lecMap[lid].totalPresent += recs.filter(r => r.status === "present" || r.status === "late").length;
    });

    const lecturerComparison = Object.entries(lecMap)
      .map(([lid, d]) => ({
        lecturerId: lid,
        lecturerName: lecturerNameMap[lid] || "Unknown",
        totalSessions: d.totalSessions,
        totalPresent: d.totalPresent,
        totalPossible: d.totalPossible,
        attendanceRate: d.totalPossible > 0 ? parseFloat(((d.totalPresent / d.totalPossible) * 100).toFixed(1)) : 0,
      }))
      .sort((a, b) => b.attendanceRate - a.attendanceRate);

    const classMap = {};
    sessions.forEach(s => {
      if (!s.course) return;
      const cid = s.course.toString();
      if (!classMap[cid]) classMap[cid] = { totalSessions: 0, totalPresent: 0, totalPossible: 0 };
      classMap[cid].totalSessions++;

      const enrolled = courseEnrollMap[cid] || 0;
      classMap[cid].totalPossible += enrolled;

      const recs = recordsBySession[s._id.toString()] || [];
      classMap[cid].totalPresent += recs.filter(r => r.status === "present" || r.status === "late").length;
    });

    const classPerformance = Object.entries(classMap)
      .map(([cid, d]) => {
        const info = courseInfoMap[cid] || {};
        return {
          classId: cid,
          className: info.code && info.title ? `${info.code} - ${info.title}` : "Unknown Class",
          totalSessions: d.totalSessions,
          totalPresent: d.totalPresent,
          totalPossible: d.totalPossible,
          attendanceRate: d.totalPossible > 0 ? parseFloat(((d.totalPresent / d.totalPossible) * 100).toFixed(1)) : 0,
        };
      })
      .sort((a, b) => b.attendanceRate - a.attendanceRate);

    res.json({
      attendanceTrend,
      lecturerComparison,
      classPerformance,
    });
  } catch (error) {
    console.error("Admin chart data error:", error);
    res.status(500).json({ error: "Failed to load chart data" });
  }
};

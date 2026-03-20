/**
 * gradeBookController.js
 *
 * Grade Book aggregates three components per student per course:
 *   1. Quizzes     — best/last score from Attempt model
 *   2. Attendance  — % of sessions attended for this course
 *   3. Manual      — lecturer-entered grades (midterm, lab, project, etc.)
 *
 * Letter grade scale (Ghana/standard):
 *   A  80–100   B  70–79   C  60–69   D  50–59   F  0–49
 */

const GradeBook         = require("../models/GradeBook");
const Course            = require("../models/Course");
const Quiz              = require("../models/Quiz");
const Attempt           = require("../models/Attempt");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord  = require("../models/AttendanceRecord");
const User              = require("../models/User");
const mongoose          = require("mongoose");

// ── Helpers ───────────────────────────────────────────────────────────────────

function letterGrade(pct) {
  if (pct >= 80) return "A";
  if (pct >= 70) return "B";
  if (pct >= 60) return "C";
  if (pct >= 50) return "D";
  return "F";
}

function gradeColor(letter) {
  return { A: "#22c55e", B: "#84cc16", C: "#f59e0b", D: "#f97316", F: "#ef4444" }[letter] || "#6b7280";
}

// GET /api/gradebook/course/:courseId  — full class view (lecturer/admin)
exports.getCourseGrades = async (req, res) => {
  try {
    const { courseId } = req.params;
    const company = req.user.company;

    const course = await Course.findOne({ _id: courseId, company }).populate("lecturer", "name");
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Only the course lecturer or admin can view
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    const isLecturer = course.lecturer?._id?.toString() === req.user._id.toString();
    if (!isAdmin && !isLecturer) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get or create grade book config
    let gb = await GradeBook.findOne({ course: courseId, company });
    if (!gb) {
      gb = await GradeBook.create({ course: courseId, company, createdBy: req.user._id });
    }

    // ── Students enrolled ────────────────────────────────────────────────────
    const studentIds = course.enrolledStudents || [];
    if (!studentIds.length) {
      return res.json({ course, gradeBook: gb, grades: [], weights: gb.weights });
    }

    const students = await User.find({ _id: { $in: studentIds } })
      .select("name email IndexNumber").lean();

    // ── Quiz scores ──────────────────────────────────────────────────────────
    const quizzes = await Quiz.find({ course: courseId, company, isActive: true }).lean();
    const quizIds = quizzes.map(q => q._id);

    // Get best attempts per student per quiz
    const attempts = await Attempt.find({
      quiz: { $in: quizIds },
      student: { $in: studentIds },
      isSubmitted: true,
      isBestScore: true,
    }).lean();

    // Map: studentId → { quizId → { score, maxScore } }
    const attemptMap = {};
    for (const a of attempts) {
      const sid = a.student.toString();
      const qid = a.quiz.toString();
      if (!attemptMap[sid]) attemptMap[sid] = {};
      attemptMap[sid][qid] = { score: a.score || 0, maxScore: a.maxScore || 0 };
    }

    // ── Attendance ───────────────────────────────────────────────────────────
    const sessions = await AttendanceSession.find({ course: courseId, company }).lean();
    const sessionIds = sessions.map(s => s._id);
    const totalSessions = sessionIds.length;

    const attendanceRecords = totalSessions
      ? await AttendanceRecord.find({
          session: { $in: sessionIds },
          user: { $in: studentIds },
          company,
        }).lean()
      : [];

    // Map: studentId → attended count
    const attendedMap = {};
    for (const r of attendanceRecords) {
      const sid = r.user.toString();
      attendedMap[sid] = (attendedMap[sid] || 0) + 1;
    }

    // ── Manual grades ────────────────────────────────────────────────────────
    // Map: studentId → { entryId → score }
    const manualMap = {};
    for (const entry of gb.manualEntries) {
      for (const s of entry.scores) {
        const sid = s.student.toString();
        if (!manualMap[sid]) manualMap[sid] = {};
        manualMap[sid][entry._id.toString()] = { score: s.score, maxScore: entry.maxScore };
      }
    }

    // ── Compute final grades ─────────────────────────────────────────────────
    const w = gb.weights;
    const activeWeightSum = w.quizzes + w.attendance + w.manual;
    const normalizer = activeWeightSum > 0 ? 100 / activeWeightSum : 1;

    const grades = students.map(student => {
      const sid = student._id.toString();

      // Quiz component
      let quizPct = 0;
      if (quizIds.length > 0) {
        const totalQuizMax = quizzes.reduce((sum, q) => sum + (q.totalMarks || 0), 0);
        const earned = quizIds.reduce((sum, qid) => {
          const a = attemptMap[sid]?.[qid.toString()];
          return sum + (a ? a.score : 0);
        }, 0);
        quizPct = totalQuizMax > 0 ? (earned / totalQuizMax) * 100 : 0;
      }

      // Attendance component
      const attPct = totalSessions > 0
        ? ((attendedMap[sid] || 0) / totalSessions) * 100
        : 0;

      // Manual component
      let manualPct = 0;
      if (gb.manualEntries.length > 0) {
        const totalManualMax = gb.manualEntries.reduce((s, e) => s + e.maxScore, 0);
        const manualEarned = gb.manualEntries.reduce((s, e) => {
          return s + (manualMap[sid]?.[e._id.toString()]?.score || 0);
        }, 0);
        manualPct = totalManualMax > 0 ? (manualEarned / totalManualMax) * 100 : 0;
      }

      // Weighted final
      const weighted =
        (quizPct * w.quizzes + attPct * w.attendance + manualPct * w.manual)
        * normalizer / 100;

      const finalPct = Math.round(weighted * 10) / 10;
      const letter = letterGrade(finalPct);

      return {
        student: { _id: student._id, name: student.name, email: student.email, studentId: student.IndexNumber || student.email },
        quizPct:    Math.round(quizPct * 10) / 10,
        attPct:     Math.round(attPct * 10) / 10,
        manualPct:  Math.round(manualPct * 10) / 10,
        finalPct,
        letter,
        color: gradeColor(letter),
        attendedSessions: attendedMap[sid] || 0,
        totalSessions,
        quizScores: quizIds.map(qid => ({
          quizId: qid,
          title: quizzes.find(q => q._id.toString() === qid.toString())?.title || "—",
          score: attemptMap[sid]?.[qid.toString()]?.score ?? null,
          maxScore: quizzes.find(q => q._id.toString() === qid.toString())?.totalMarks || 0,
        })),
        manualScores: gb.manualEntries.map(e => ({
          entryId: e._id,
          label: e.label,
          score: manualMap[sid]?.[e._id.toString()]?.score ?? null,
          maxScore: e.maxScore,
        })),
      };
    });

    // Sort by final percentage desc
    grades.sort((a, b) => b.finalPct - a.finalPct);

    res.json({
      course: { _id: course._id, title: course.title, code: course.code, lecturer: course.lecturer },
      gradeBook: { _id: gb._id, weights: gb.weights, manualEntries: gb.manualEntries.map(e => ({ _id: e._id, label: e.label, maxScore: e.maxScore })) },
      quizzes: quizzes.map(q => ({ _id: q._id, title: q.title, totalMarks: q.totalMarks })),
      totalSessions,
      grades,
    });
  } catch (err) {
    console.error("getCourseGrades:", err);
    res.status(500).json({ error: "Failed to load grade book" });
  }
};

// GET /api/gradebook/my/:courseId  — student's own grades
exports.getMyGrades = async (req, res) => {
  try {
    const { courseId } = req.params;
    const company  = req.user.company;
    const studentId = req.user._id;

    const course = await Course.findOne({ _id: courseId, company });
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Must be enrolled
    const enrolled = course.enrolledStudents.some(id => id.toString() === studentId.toString());
    if (!enrolled && req.user.role === "student") {
      return res.status(403).json({ error: "You are not enrolled in this course" });
    }

    let gb = await GradeBook.findOne({ course: courseId, company });
    if (!gb) gb = { weights: { quizzes: 50, attendance: 20, manual: 30 }, manualEntries: [] };

    const w = gb.weights || { quizzes: 50, attendance: 20, manual: 30 };

    // Quizzes
    const quizzes = await Quiz.find({ course: courseId, company, isActive: true }).lean();
    const quizIds = quizzes.map(q => q._id);
    const attempts = await Attempt.find({
      quiz: { $in: quizIds }, student: studentId, isSubmitted: true, isBestScore: true,
    }).lean();
    const attemptMap = {};
    for (const a of attempts) attemptMap[a.quiz.toString()] = a;

    const totalQuizMax = quizzes.reduce((s, q) => s + (q.totalMarks || 0), 0);
    const quizEarned   = quizzes.reduce((s, q) => s + (attemptMap[q._id.toString()]?.score || 0), 0);
    const quizPct = totalQuizMax > 0 ? (quizEarned / totalQuizMax) * 100 : 0;

    // Attendance
    const sessions = await AttendanceSession.find({ course: courseId, company }).lean();
    const sessionIds = sessions.map(s => s._id);
    const attended = sessionIds.length
      ? await AttendanceRecord.countDocuments({ session: { $in: sessionIds }, user: studentId, company })
      : 0;
    const attPct = sessionIds.length > 0 ? (attended / sessionIds.length) * 100 : 0;

    // Manual
    let manualPct = 0;
    const manualBreakdown = (gb.manualEntries || []).map(e => {
      const s = e.scores?.find(s => s.student.toString() === studentId.toString());
      return { label: e.label, score: s?.score ?? null, maxScore: e.maxScore };
    });
    const totalManualMax = (gb.manualEntries || []).reduce((s, e) => s + e.maxScore, 0);
    const manualEarned   = manualBreakdown.reduce((s, e) => s + (e.score || 0), 0);
    manualPct = totalManualMax > 0 ? (manualEarned / totalManualMax) * 100 : 0;

    const activeWeightSum = w.quizzes + w.attendance + w.manual;
    const normalizer = activeWeightSum > 0 ? 100 / activeWeightSum : 1;
    const finalPct = Math.round(
      ((quizPct * w.quizzes + attPct * w.attendance + manualPct * w.manual) * normalizer / 100) * 10
    ) / 10;
    const letter = letterGrade(finalPct);

    res.json({
      course: { _id: course._id, title: course.title, code: course.code },
      weights: w,
      quizPct:    Math.round(quizPct * 10) / 10,
      attPct:     Math.round(attPct * 10) / 10,
      manualPct:  Math.round(manualPct * 10) / 10,
      finalPct,
      letter,
      color: gradeColor(letter),
      quizBreakdown: quizzes.map(q => ({
        title: q.title,
        score: attemptMap[q._id.toString()]?.score ?? null,
        maxScore: q.totalMarks || 0,
      })),
      attendanceBreakdown: { attended, total: sessionIds.length },
      manualBreakdown,
    });
  } catch (err) {
    console.error("getMyGrades:", err);
    res.status(500).json({ error: "Failed to load grades" });
  }
};

// PATCH /api/gradebook/course/:courseId/weights
exports.updateWeights = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { quizzes, attendance, manual } = req.body;
    const company = req.user.company;

    const vals = [quizzes, attendance, manual].map(Number);
    if (vals.some(isNaN) || vals.some(v => v < 0 || v > 100)) {
      return res.status(400).json({ error: "Each weight must be 0–100" });
    }

    let gb = await GradeBook.findOne({ course: courseId, company });
    if (!gb) gb = new GradeBook({ course: courseId, company, createdBy: req.user._id });
    gb.weights = { quizzes: vals[0], attendance: vals[1], manual: vals[2] };
    await gb.save();
    res.json({ weights: gb.weights });
  } catch (err) {
    res.status(500).json({ error: "Failed to update weights" });
  }
};

// POST /api/gradebook/course/:courseId/manual-entry
exports.addManualEntry = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { label, maxScore } = req.body;
    const company = req.user.company;

    if (!label?.trim() || !maxScore || Number(maxScore) <= 0) {
      return res.status(400).json({ error: "Label and maxScore are required" });
    }

    let gb = await GradeBook.findOne({ course: courseId, company });
    if (!gb) gb = new GradeBook({ course: courseId, company, createdBy: req.user._id });
    gb.manualEntries.push({ label: label.trim(), maxScore: Number(maxScore), scores: [] });
    await gb.save();
    const entry = gb.manualEntries[gb.manualEntries.length - 1];
    res.status(201).json({ entry: { _id: entry._id, label: entry.label, maxScore: entry.maxScore } });
  } catch (err) {
    res.status(500).json({ error: "Failed to add entry" });
  }
};

// DELETE /api/gradebook/course/:courseId/manual-entry/:entryId
exports.deleteManualEntry = async (req, res) => {
  try {
    const { courseId, entryId } = req.params;
    const gb = await GradeBook.findOne({ course: courseId, company: req.user.company });
    if (!gb) return res.status(404).json({ error: "Grade book not found" });
    gb.manualEntries = gb.manualEntries.filter(e => e._id.toString() !== entryId);
    await gb.save();
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete entry" });
  }
};

// PUT /api/gradebook/course/:courseId/manual-entry/:entryId/scores
// Body: { scores: [{ studentId, score, note? }] }
exports.saveManualScores = async (req, res) => {
  try {
    const { courseId, entryId } = req.params;
    const { scores } = req.body;
    const company = req.user.company;

    if (!Array.isArray(scores)) return res.status(400).json({ error: "scores must be an array" });

    const gb = await GradeBook.findOne({ course: courseId, company });
    if (!gb) return res.status(404).json({ error: "Grade book not found" });

    const entry = gb.manualEntries.id(entryId);
    if (!entry) return res.status(404).json({ error: "Entry not found" });

    for (const { studentId, score, note } of scores) {
      if (score === null || score === undefined || score === "") continue;
      const numScore = Number(score);
      if (isNaN(numScore) || numScore < 0 || numScore > entry.maxScore) continue;

      const existing = entry.scores.find(s => s.student.toString() === studentId);
      if (existing) {
        existing.score = numScore;
        existing.note = note || "";
        existing.enteredBy = req.user._id;
        existing.enteredAt = new Date();
      } else {
        entry.scores.push({ student: studentId, score: numScore, note: note || "", enteredBy: req.user._id });
      }
    }
    await gb.save();
    res.json({ message: "Scores saved" });
  } catch (err) {
    console.error("saveManualScores:", err);
    res.status(500).json({ error: "Failed to save scores" });
  }
};

// GET /api/gradebook/courses  — list courses with grade book for lecturer/admin
exports.listCourses = async (req, res) => {
  try {
    const company = req.user.company;
    const filter = { company };
    if (req.user.role === "lecturer") filter.lecturer = req.user._id;

    const courses = await Course.find(filter).populate("lecturer", "name").lean();
    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: "Failed to list courses" });
  }
};

// GET /api/gradebook/my-courses  — courses + my grade summary for student
exports.myCoursesGrades = async (req, res) => {
  try {
    const company   = req.user.company;
    const studentId = req.user._id;

    const courses = await Course.find({
      company,
      enrolledStudents: studentId,
    }).populate("lecturer", "name").lean();

    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: "Failed to list courses" });
  }
};

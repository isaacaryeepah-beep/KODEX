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

const GradeBook            = require("../models/GradeBook");
const Course               = require("../models/Course");
const Quiz                 = require("../models/Quiz");
const Attempt              = require("../models/Attempt");
const AttendanceSession    = require("../models/AttendanceSession");
const AttendanceRecord     = require("../models/AttendanceRecord");
const User                 = require("../models/User");
const StudentRoster        = require("../models/StudentRoster");
const mongoose             = require("mongoose");
// Phase 3–5 assessment models
const NormalQuiz           = require("../models/NormalQuiz");
const NormalQuizResult     = require("../models/NormalQuizResult");
const SnapQuiz             = require("../models/SnapQuiz");
const SnapQuizResult       = require("../models/SnapQuizResult");
const Assignment           = require("../models/Assignment");
const AssignmentSubmission = require("../models/AssignmentSubmission");

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

// ---------------------------------------------------------------------------
// Phase 3–5 assessment aggregation helpers
// ---------------------------------------------------------------------------

/**
 * Fetch NormalQuiz results for a course + student list.
 * Returns:
 *   normalQuizzes    — NormalQuiz docs for the course
 *   nqMap            — { studentId: { earned, max } }
 *   totalNqMaxMarks  — sum of totalMarks across all NormalQuizzes
 */
async function _fetchNormalQuizData(courseId, company, studentIds) {
  const normalQuizzes = await NormalQuiz.find({ course: courseId, company, status: { $ne: "archived" } }).lean();
  const nqIds = normalQuizzes.map(q => q._id);
  const totalNqMaxMarks = normalQuizzes.reduce((s, q) => s + (q.totalMarks || 0), 0);

  const nqMap = {};
  if (nqIds.length && studentIds.length) {
    const results = await NormalQuizResult.find({
      quiz:    { $in: nqIds },
      student: { $in: studentIds },
    }).lean();
    for (const r of results) {
      const sid = r.student.toString();
      if (!nqMap[sid]) nqMap[sid] = { earned: 0, max: 0 };
      if (r.rawScore != null) {
        nqMap[sid].earned += r.rawScore;
        nqMap[sid].max    += (r.maxScore || 0);
      }
    }
  }
  return { normalQuizzes, nqMap, totalNqMaxMarks };
}

/**
 * Fetch SnapQuiz results for a course + student list.
 * Returns:
 *   snapQuizzes      — SnapQuiz docs for the course
 *   sqMap            — { studentId: { earned, max, integrityFlag } }
 *   totalSqMaxMarks  — sum of totalMarks across all SnapQuizzes
 */
async function _fetchSnapQuizData(courseId, company, studentIds) {
  const snapQuizzes = await SnapQuiz.find({ course: courseId, company, status: { $ne: "archived" } }).lean();
  const sqIds = snapQuizzes.map(q => q._id);
  const totalSqMaxMarks = snapQuizzes.reduce((s, q) => s + (q.totalMarks || 0), 0);

  const sqMap = {};
  if (sqIds.length && studentIds.length) {
    const results = await SnapQuizResult.find({
      quiz:    { $in: sqIds },
      student: { $in: studentIds },
    }).lean();
    for (const r of results) {
      const sid = r.student.toString();
      if (!sqMap[sid]) sqMap[sid] = { earned: 0, max: 0, integrityFlag: false };
      if (r.rawScore != null) {
        sqMap[sid].earned += r.rawScore;
        sqMap[sid].max    += (r.maxScore || 0);
      }
      if (r.integrityFlag) sqMap[sid].integrityFlag = true;
    }
  }
  return { snapQuizzes, sqMap, totalSqMaxMarks };
}

/**
 * Fetch Assignment submissions (counted + graded) for a course + student list.
 * Returns:
 *   assignments      — Assignment docs for the course
 *   asgMap           — { studentId: { earned, max } }
 *   totalAsgMaxMarks — sum of totalMarks across all Assignments
 */
async function _fetchAssignmentData(courseId, company, studentIds) {
  const assignments = await Assignment.find({ course: courseId, company, status: { $ne: "archived" } }).lean();
  const asgIds = assignments.map(a => a._id);
  const totalAsgMaxMarks = assignments.reduce((s, a) => s + (a.totalMarks || 0), 0);

  const asgMap = {};
  if (asgIds.length && studentIds.length) {
    const submissions = await AssignmentSubmission.find({
      assignment:        { $in: asgIds },
      student:           { $in: studentIds },
      isCountedSubmission: true,
      status:            { $in: ["graded", "submitted", "late"] },
    }).lean();
    for (const s of submissions) {
      const sid = s.student.toString();
      if (!asgMap[sid]) asgMap[sid] = { earned: 0, max: 0 };
      if (s.earnedMarks != null) {
        asgMap[sid].earned += s.earnedMarks;
        asgMap[sid].max    += (s.maxMarks || 0);
      }
    }
  }
  return { assignments, asgMap, totalAsgMaxMarks };
}

/**
 * Compute percentage for a component given the student's earned/max data,
 * falling back to the course-level totalMax when the student has no result yet.
 */
function _componentPct(map, sid, courseTotalMax) {
  const data = map[sid];
  if (!data) return 0;
  const denominator = Math.max(data.max || 0, courseTotalMax);
  return denominator > 0 ? (data.earned / denominator) * 100 : 0;
}

/**
 * Compute the weighted final grade from all six components.
 * Safe when any weight is 0 (contributes nothing).
 */
function _computeFinalPct(w, quizPct, nqPct, sqPct, asgPct, attPct, manualPct) {
  const totalWeight =
    (w.quizzes      || 0) +
    (w.normalQuizzes|| 0) +
    (w.snapQuizzes  || 0) +
    (w.assignments  || 0) +
    (w.attendance   || 0) +
    (w.manual       || 0);

  if (totalWeight === 0) return 0;

  const weighted =
    quizPct   * (w.quizzes      || 0) +
    nqPct     * (w.normalQuizzes|| 0) +
    sqPct     * (w.snapQuizzes  || 0) +
    asgPct    * (w.assignments  || 0) +
    attPct    * (w.attendance   || 0) +
    manualPct * (w.manual       || 0);

  return Math.round((weighted / totalWeight) * 10) / 10;
}

// GET /api/gradebook/course/:courseId  — full class view (lecturer/admin)
exports.getCourseGrades = async (req, res) => {
  try {
    const { courseId } = req.params;
    const company = req.user.company;

    const course = await Course.findOne({ _id: courseId, companyId: company }).populate("lecturerId", "name");
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Only the course lecturer or admin can view
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    const isLecturer = course.lecturerId?._id?.toString() === req.user._id.toString();
    if (!isAdmin && !isLecturer) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get or create grade book config — upsert avoids duplicate-key race condition
    let gb = await GradeBook.findOneAndUpdate(
      { course: courseId, company },
      { $setOnInsert: { course: courseId, company, createdBy: req.user._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // ── Students enrolled ─────────────────────────────────────────────────────
    const registeredStudentIds = course.enrolledStudents || [];

    // Fetch all roster entries for this course
    const rosterEntries = await StudentRoster.find({ course: courseId, company }).lean();

    console.log(`[GRADEBOOK] courseId=${courseId} enrolledStudents=${registeredStudentIds.length} rosterEntries=${rosterEntries.length}`);

    // Collect ALL unique user IDs from both sources
    const allUserIdSet = new Set(registeredStudentIds.map(id => id.toString()));
    for (const r of rosterEntries) {
      if (r.registeredUser) allUserIdSet.add(r.registeredUser.toString());
    }

    // FALLBACK: if both sources are empty, query User model directly
    // This catches students enrolled via other flows (CSV bulk upload etc)
    let registeredStudents = [];
    if (allUserIdSet.size > 0) {
      registeredStudents = await User.find({ _id: { $in: [...allUserIdSet] } })
        .select("name email IndexNumber").lean();
    } else {
      // Direct fallback: find all active students in this company enrolled in this course
      registeredStudents = await User.find({
        company,
        role: "student",
        isActive: true,
        _id: { $in: registeredStudentIds }, // empty array = no results unless we skip
      }).select("name email IndexNumber").lean();
    }

    // If STILL empty and enrolledStudents has IDs, the company filter may be wrong — query without it
    if (registeredStudents.length === 0 && registeredStudentIds.length > 0) {
      console.log(`[GRADEBOOK] Fallback: querying users without company filter`);
      registeredStudents = await User.find({ _id: { $in: registeredStudentIds } })
        .select("name email IndexNumber").lean();
    }

    console.log(`[GRADEBOOK] registeredStudents found: ${registeredStudents.length}`);

    const registeredIndexSet = new Set(
      registeredStudents.map(s => (s.IndexNumber || "").toUpperCase()).filter(Boolean)
    );
    const registeredUserIdSet = new Set(registeredStudents.map(s => s._id.toString()));

    const unregisteredRoster = rosterEntries.filter(r => {
      if (r.registeredUser && registeredUserIdSet.has(r.registeredUser.toString())) return false;
      const id = (r.studentId || "").toUpperCase();
      return id && !registeredIndexSet.has(id);
    });

    console.log(`[GRADEBOOK] unregisteredRoster: ${unregisteredRoster.length}`);

    const registeredStudentList = registeredStudents.map(s => ({
      _id: s._id,
      name: s.name,
      email: s.email,
      studentId: s.IndexNumber || s.email,
      isRegistered: true,
    }));

    const unregisteredStudentList = unregisteredRoster.map(r => ({
      _id: null,
      rosterId: r._id,
      name: r.name || r.studentId,
      email: null,
      studentId: r.studentId,
      isRegistered: false,
    }));

    const allStudents = [...registeredStudentList, ...unregisteredStudentList];

    console.log(`[GRADEBOOK] allStudents total: ${allStudents.length}`);

    if (!allStudents.length) {
      return res.json({ course, gradeBook: gb, grades: [], weights: gb.weights });
    }

    // ── Legacy Quiz scores (Quiz/Attempt models) ─────────────────────────────
    const quizzes = await Quiz.find({ course: courseId, company, isActive: true }).lean();
    const quizIds = quizzes.map(q => q._id);
    const attempts = registeredStudentIds.length && quizIds.length
      ? await Attempt.find({
          quiz: { $in: quizIds },
          student: { $in: registeredStudentIds },
          isSubmitted: true,
          isBestScore: true,
        }).lean()
      : [];
    const attemptMap = {};
    for (const a of attempts) {
      const sid = a.student.toString();
      const qid = a.quiz.toString();
      if (!attemptMap[sid]) attemptMap[sid] = {};
      attemptMap[sid][qid] = { score: a.score || 0, maxScore: a.maxScore || 0 };
    }
    const totalLegacyQuizMax = quizzes.reduce((s, q) => s + (q.totalMarks || 0), 0);

    // ── Phase 3–5: NormalQuiz / SnapQuiz / Assignment ─────────────────────────
    const [nqData, sqData, asgData] = await Promise.all([
      _fetchNormalQuizData(courseId, company, registeredStudentIds),
      _fetchSnapQuizData(courseId, company, registeredStudentIds),
      _fetchAssignmentData(courseId, company, registeredStudentIds),
    ]);
    const { nqMap, totalNqMaxMarks, normalQuizzes } = nqData;
    const { sqMap, totalSqMaxMarks, snapQuizzes }   = sqData;
    const { asgMap, totalAsgMaxMarks, assignments }  = asgData;

    // ── Attendance ───────────────────────────────────────────────────────────
    const sessions = await AttendanceSession.find({ course: courseId, company }).lean();
    const sessionIds = sessions.map(s => s._id);
    const totalSessions = sessionIds.length;
    const attendanceRecords = (totalSessions && registeredStudentIds.length)
      ? await AttendanceRecord.find({
          session: { $in: sessionIds },
          user:    { $in: registeredStudentIds },
          company,
        }).lean()
      : [];
    const attendedMap = {};
    for (const r of attendanceRecords) {
      const sid = r.user.toString();
      attendedMap[sid] = (attendedMap[sid] || 0) + 1;
    }

    // ── Manual grades ────────────────────────────────────────────────────────
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

    const grades = allStudents.map(student => {
      const sid = student._id ? student._id.toString() : null;

      if (!student.isRegistered || !sid) {
        return {
          student: {
            _id: student.rosterId || null,
            name: student.name,
            email: student.email || "—",
            studentId: student.studentId,
            isRegistered: false,
          },
          quizPct: 0, nqPct: 0, sqPct: 0, asgPct: 0,
          attPct: 0, manualPct: 0, finalPct: 0,
          letter: "—", color: "#9ca3af",
          attendedSessions: 0, totalSessions,
          pending: true,
          quizScores:   quizIds.map(qid => ({ quizId: qid, title: quizzes.find(q => q._id.toString() === qid.toString())?.title || "—", score: null, maxScore: quizzes.find(q => q._id.toString() === qid.toString())?.totalMarks || 0 })),
          manualScores: gb.manualEntries.map(e => ({ entryId: e._id, label: e.label, score: null, maxScore: e.maxScore })),
        };
      }

      // Legacy quiz component
      let quizPct = 0;
      if (quizIds.length > 0) {
        const earned = quizIds.reduce((sum, qid) => sum + (attemptMap[sid]?.[qid.toString()]?.score || 0), 0);
        quizPct = totalLegacyQuizMax > 0 ? (earned / totalLegacyQuizMax) * 100 : 0;
      }

      // Phase 3–5 components
      const nqPct  = _componentPct(nqMap,  sid, totalNqMaxMarks);
      const sqPct  = _componentPct(sqMap,  sid, totalSqMaxMarks);
      const asgPct = _componentPct(asgMap, sid, totalAsgMaxMarks);

      // Attendance component
      const attPct = totalSessions > 0
        ? ((attendedMap[sid] || 0) / totalSessions) * 100
        : 0;

      // Manual component
      const totalManualMax = gb.manualEntries.reduce((s, e) => s + e.maxScore, 0);
      const manualEarned   = gb.manualEntries.reduce((s, e) => s + (manualMap[sid]?.[e._id.toString()]?.score || 0), 0);
      const manualPct = totalManualMax > 0 ? (manualEarned / totalManualMax) * 100 : 0;

      const finalPct = _computeFinalPct(w, quizPct, nqPct, sqPct, asgPct, attPct, manualPct);
      const letter   = letterGrade(finalPct);

      return {
        student: { _id: student._id, name: student.name, email: student.email, studentId: student.studentId, isRegistered: true },
        quizPct:   Math.round(quizPct  * 10) / 10,
        nqPct:     Math.round(nqPct    * 10) / 10,
        sqPct:     Math.round(sqPct    * 10) / 10,
        asgPct:    Math.round(asgPct   * 10) / 10,
        attPct:    Math.round(attPct   * 10) / 10,
        manualPct: Math.round(manualPct* 10) / 10,
        finalPct,
        letter,
        color: gradeColor(letter),
        integrityFlag: sqMap[sid]?.integrityFlag || false,
        attendedSessions: attendedMap[sid] || 0,
        totalSessions,
        pending: false,
        quizScores: quizIds.map(qid => ({
          quizId: qid,
          title:  quizzes.find(q => q._id.toString() === qid.toString())?.title || "—",
          score:  attemptMap[sid]?.[qid.toString()]?.score ?? null,
          maxScore: quizzes.find(q => q._id.toString() === qid.toString())?.totalMarks || 0,
        })),
        manualScores: gb.manualEntries.map(e => ({
          entryId: e._id, label: e.label,
          score: manualMap[sid]?.[e._id.toString()]?.score ?? null,
          maxScore: e.maxScore,
        })),
      };
    });

    grades.sort((a, b) => {
      if (a.pending && !b.pending) return 1;
      if (!a.pending && b.pending) return -1;
      return b.finalPct - a.finalPct;
    });

    res.json({
      course: { _id: course._id, title: course.title, code: course.code, lecturer: course.lecturer },
      gradeBook: { _id: gb._id, weights: gb.weights, manualEntries: gb.manualEntries.map(e => ({ _id: e._id, label: e.label, maxScore: e.maxScore })) },
      assessments: {
        legacyQuizzes:  quizzes.map(q => ({ _id: q._id, title: q.title, totalMarks: q.totalMarks })),
        normalQuizzes:  normalQuizzes.map(q => ({ _id: q._id, title: q.title, totalMarks: q.totalMarks })),
        snapQuizzes:    snapQuizzes.map(q => ({ _id: q._id, title: q.title, totalMarks: q.totalMarks })),
        assignments:    assignments.map(a => ({ _id: a._id, title: a.title, totalMarks: a.totalMarks })),
      },
      totalSessions,
      totalStudents: allStudents.length,
      registeredCount: registeredStudentList.length,
      pendingCount: unregisteredStudentList.length,
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
    const company   = req.user.company;
    const studentId = req.user._id;
    const sid       = studentId.toString();

    // Course model uses 'companyId', not 'company'
    const course = await Course.findOne({ _id: courseId, companyId: company });
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Must be enrolled
    const enrolled = course.enrolledStudents.some(id => id.toString() === sid);
    if (!enrolled && req.user.role === "student") {
      return res.status(403).json({ error: "You are not enrolled in this course" });
    }

    const gb = await GradeBook.findOne({ course: courseId, company })
      || { weights: { quizzes: 50, normalQuizzes: 0, snapQuizzes: 0, assignments: 0, attendance: 20, manual: 30 }, manualEntries: [] };

    const w = gb.weights;

    // Legacy quizzes
    const quizzes = await Quiz.find({ course: courseId, company, isActive: true }).lean();
    const quizIds = quizzes.map(q => q._id);
    const attempts = quizIds.length
      ? await Attempt.find({ quiz: { $in: quizIds }, student: studentId, isSubmitted: true, isBestScore: true }).lean()
      : [];
    const attemptMap = {};
    for (const a of attempts) attemptMap[a.quiz.toString()] = a;

    const totalQuizMax = quizzes.reduce((s, q) => s + (q.totalMarks || 0), 0);
    const quizEarned   = quizzes.reduce((s, q) => s + (attemptMap[q._id.toString()]?.score || 0), 0);
    const quizPct = totalQuizMax > 0 ? (quizEarned / totalQuizMax) * 100 : 0;

    // Phase 3–5 components (single-student fetch)
    const [nqData, sqData, asgData] = await Promise.all([
      _fetchNormalQuizData(courseId, company, [studentId]),
      _fetchSnapQuizData(courseId, company, [studentId]),
      _fetchAssignmentData(courseId, company, [studentId]),
    ]);
    const nqPct  = _componentPct(nqData.nqMap,   sid, nqData.totalNqMaxMarks);
    const sqPct  = _componentPct(sqData.sqMap,   sid, sqData.totalSqMaxMarks);
    const asgPct = _componentPct(asgData.asgMap, sid, asgData.totalAsgMaxMarks);

    // Attendance
    const sessions = await AttendanceSession.find({ course: courseId, company }).lean();
    const sessionIds = sessions.map(s => s._id);
    const attended = sessionIds.length
      ? await AttendanceRecord.countDocuments({ session: { $in: sessionIds }, user: studentId, company })
      : 0;
    const attPct = sessionIds.length > 0 ? (attended / sessionIds.length) * 100 : 0;

    // Manual
    const manualBreakdown = (gb.manualEntries || []).map(e => {
      const s = e.scores?.find(s => s.student.toString() === sid);
      return { label: e.label, score: s?.score ?? null, maxScore: e.maxScore };
    });
    const totalManualMax = (gb.manualEntries || []).reduce((s, e) => s + e.maxScore, 0);
    const manualEarned   = manualBreakdown.reduce((s, e) => s + (e.score || 0), 0);
    const manualPct = totalManualMax > 0 ? (manualEarned / totalManualMax) * 100 : 0;

    const finalPct = _computeFinalPct(w, quizPct, nqPct, sqPct, asgPct, attPct, manualPct);
    const letter   = letterGrade(finalPct);

    res.json({
      course: { _id: course._id, title: course.title, code: course.code },
      weights: w,
      quizPct:    Math.round(quizPct  * 10) / 10,
      nqPct:      Math.round(nqPct    * 10) / 10,
      sqPct:      Math.round(sqPct    * 10) / 10,
      asgPct:     Math.round(asgPct   * 10) / 10,
      attPct:     Math.round(attPct   * 10) / 10,
      manualPct:  Math.round(manualPct* 10) / 10,
      finalPct,
      letter,
      color: gradeColor(letter),
      integrityFlag: sqData.sqMap[sid]?.integrityFlag || false,
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
    const company = req.user.company;

    const ALLOWED = ["quizzes", "normalQuizzes", "snapQuizzes", "assignments", "attendance", "manual"];
    const $set = {};
    for (const key of ALLOWED) {
      if (req.body[key] === undefined || req.body[key] === null) continue;
      const n = Number(req.body[key]);
      if (isNaN(n) || n < 0 || n > 100) {
        return res.status(400).json({ error: `Weight '${key}' must be 0–100` });
      }
      $set[`weights.${key}`] = n;
    }
    if (Object.keys($set).length === 0) {
      return res.status(400).json({ error: "Provide at least one weight to update" });
    }

    const gb = await GradeBook.findOneAndUpdate(
      { course: courseId, company },
      { $set, $setOnInsert: { createdBy: req.user._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
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

    let gb = await GradeBook.findOneAndUpdate(
      { course: courseId, company },
      { $setOnInsert: { course: courseId, company, createdBy: req.user._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
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
    const filter = { companyId: company, isActive: true };
    if (req.user.role === "lecturer") filter.lecturerId = req.user._id;
    // HOD sees all courses in their department (if set), otherwise all company courses
    if (req.user.role === "hod" && req.user.department) {
      filter.departmentId = req.user.department;
    }

    const courses = await Course.find(filter).populate("lecturerId", "name").lean();

    // For each course, get the real student count from StudentRoster
    // (not just enrolledStudents which only counts registered users)
    const courseIds = courses.map(c => c._id);
    const rosterCounts = await StudentRoster.aggregate([
      { $match: { course: { $in: courseIds }, company: company } },
      { $group: { _id: "$course", count: { $sum: 1 } } },
    ]);
    const rosterCountMap = {};
    for (const r of rosterCounts) rosterCountMap[r._id.toString()] = r.count;

    const coursesWithCount = courses.map(c => ({
      ...c,
      totalStudents: rosterCountMap[c._id.toString()] || c.enrolledStudents?.length || 0,
    }));

    res.json({ courses: coursesWithCount });
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
      companyId: company,
      enrolledStudents: studentId,
    }).populate("lecturerId", "name").lean();

    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: "Failed to list courses" });
  }
};

// GET /api/gradebook/course/:courseId/export  — CSV download (lecturer/admin)
exports.exportGrades = async (req, res) => {
  try {
    const { courseId } = req.params;
    const company = req.user.company;

    // Course model uses 'companyId', lecturer field is 'lecturerId'
    const course = await Course.findOne({ _id: courseId, companyId: company }).lean();
    if (!course) return res.status(404).json({ error: "Course not found" });

    const isAdmin    = ["admin", "superadmin", "hod"].includes(req.user.role);
    const isLecturer = course.lecturerId?.toString() === req.user._id.toString();
    if (!isAdmin && !isLecturer) return res.status(403).json({ error: "Access denied" });

    const gb = await GradeBook.findOneAndUpdate(
      { course: courseId, company },
      { $setOnInsert: { course: courseId, company, createdBy: req.user._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    const registeredStudentIds = course.enrolledStudents || [];
    const students = registeredStudentIds.length
      ? await User.find({ _id: { $in: registeredStudentIds } }).select("name email IndexNumber").lean()
      : [];

    const [quizzes, sessions, nqData, sqData, asgData] = await Promise.all([
      Quiz.find({ course: courseId, company, isActive: true }).lean(),
      AttendanceSession.find({ course: courseId, company }).lean(),
      _fetchNormalQuizData(courseId, company, registeredStudentIds),
      _fetchSnapQuizData(courseId, company, registeredStudentIds),
      _fetchAssignmentData(courseId, company, registeredStudentIds),
    ]);

    const quizIds = quizzes.map(q => q._id);
    const attempts = (registeredStudentIds.length && quizIds.length)
      ? await Attempt.find({
          quiz: { $in: quizIds }, student: { $in: registeredStudentIds },
          isSubmitted: true, isBestScore: true,
        }).lean()
      : [];
    const attemptMap = {};
    for (const a of attempts) {
      const sid = a.student.toString();
      if (!attemptMap[sid]) attemptMap[sid] = {};
      attemptMap[sid][a.quiz.toString()] = a.score || 0;
    }
    const totalLegacyQuizMax = quizzes.reduce((s, q) => s + (q.totalMarks || 0), 0);

    const sessionIds = sessions.map(s => s._id);
    const totalSessions = sessionIds.length;
    const attendanceRecords = (totalSessions && registeredStudentIds.length)
      ? await AttendanceRecord.find({
          session: { $in: sessionIds }, user: { $in: registeredStudentIds }, company,
        }).lean()
      : [];
    const attendedMap = {};
    for (const r of attendanceRecords) {
      const sid = r.user.toString();
      attendedMap[sid] = (attendedMap[sid] || 0) + 1;
    }

    const manualEarnedMap = {};
    for (const entry of gb.manualEntries) {
      for (const s of entry.scores) {
        const sid = s.student.toString();
        manualEarnedMap[sid] = (manualEarnedMap[sid] || 0) + (s.score || 0);
      }
    }
    const totalManualMax = gb.manualEntries.reduce((s, e) => s + e.maxScore, 0);

    const w = gb.weights;
    const { nqMap, totalNqMaxMarks } = nqData;
    const { sqMap, totalSqMaxMarks } = sqData;
    const { asgMap, totalAsgMaxMarks } = asgData;

    // CSV header
    const q = s => `"${String(s || "").replace(/"/g, '""')}"`;
    const header = "Name,Student ID,Email,Quiz %,NormalQuiz %,SnapQuiz %,Assignment %,Attendance %,Manual %,Final %,Grade,Integrity Flag";
    const rows = students.map(student => {
      const sid = student._id.toString();

      const quizEarned = quizIds.reduce((sum, qid) => sum + (attemptMap[sid]?.[qid.toString()] || 0), 0);
      const quizPct = totalLegacyQuizMax > 0 ? (quizEarned / totalLegacyQuizMax) * 100 : 0;

      const nqPct  = _componentPct(nqMap,  sid, totalNqMaxMarks);
      const sqPct  = _componentPct(sqMap,  sid, totalSqMaxMarks);
      const asgPct = _componentPct(asgMap, sid, totalAsgMaxMarks);

      const attPct    = totalSessions > 0 ? ((attendedMap[sid] || 0) / totalSessions) * 100 : 0;
      const manualPct = totalManualMax > 0 ? ((manualEarnedMap[sid] || 0) / totalManualMax) * 100 : 0;

      const finalPct = _computeFinalPct(w, quizPct, nqPct, sqPct, asgPct, attPct, manualPct);
      const letter   = letterGrade(finalPct);
      const flag     = sqMap[sid]?.integrityFlag ? "YES" : "NO";

      return [
        q(student.name),
        q(student.IndexNumber || ""),
        q(student.email || ""),
        Math.round(quizPct  * 10) / 10,
        Math.round(nqPct    * 10) / 10,
        Math.round(sqPct    * 10) / 10,
        Math.round(asgPct   * 10) / 10,
        Math.round(attPct   * 10) / 10,
        Math.round(manualPct* 10) / 10,
        finalPct,
        letter,
        flag,
      ].join(",");
    });

    const csv      = [header, ...rows].join("\n");
    const filename = `grades_${(course.code || courseId).toString().replace(/\s+/g, "_")}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error("exportGrades:", err);
    res.status(500).json({ error: "Failed to export grades" });
  }
};

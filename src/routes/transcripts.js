"use strict";

/**
 * transcripts.js
 * Mounted at: /api/transcripts   (registered in server.js)
 *
 * Academic transcript and course-completion certificate system.
 *
 * Route summary
 * -------------
 * Transcripts
 *   GET /me                    student: own full transcript
 *   GET /:studentId            admin / lecturer: a student's transcript
 *
 * Certificates
 *   POST   /certificates                 issue a certificate   [admin, lecturer, hod]
 *   GET    /certificates/me              my certificates       [student]
 *   GET    /certificates/:studentId      certificates for a student  [admin, lecturer, hod]
 *   PATCH  /certificates/:certId/revoke  revoke a certificate  [admin, superadmin]
 *   GET    /verify/:code                 PUBLIC verification — no auth required
 *
 * Academic mode only (except /verify which is fully public).
 */

const express  = require("express");
const router   = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole, requireMode }  = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");

const StudentCourseEnrollment = require("../models/StudentCourseEnrollment");
const { ENROLLMENT_STATUSES }        = StudentCourseEnrollment;
const IssuedCertificate = require("../models/IssuedCertificate");
const Course            = require("../models/Course");
const User              = require("../models/User");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord  = require("../models/AttendanceRecord");
const Company           = require("../models/Company");

// ── Middleware stacks ────────────────────────────────────────────────────────
const mw        = [authenticate, requireMode("academic"), requireActiveSubscription, companyIsolation];
const STAFF     = ["lecturer", "hod", "admin", "superadmin"];
const CERT_MGRS = ["admin", "superadmin"]; // revoke

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Simple GPA calculation on a 4.3 scale.
 * Returns null if no scores are available.
 */
function scoreToGradePoints(score) {
  if (score == null) return null;
  if (score >= 90) return 4.3;
  if (score >= 80) return 4.0;
  if (score >= 70) return 3.0;
  if (score >= 60) return 2.0;
  if (score >= 50) return 1.0;
  return 0.0;
}

/**
 * Compute attendance statistics for a specific student in a specific course.
 * Returns { totalSessions, attended, pct }
 */
async function courseAttendance(courseId, studentId, company) {
  // Count sessions that belong to this course
  const sessions = await AttendanceSession.find({
    company,
    course: courseId,
    status: "stopped",
  }).select("_id").lean();

  const totalSessions = sessions.length;
  if (totalSessions === 0) return { totalSessions: 0, attended: 0, pct: null };

  const sessionIds = sessions.map(s => s._id);
  const attended   = await AttendanceRecord.countDocuments({
    company,
    session: { $in: sessionIds },
    user:    studentId,
    status:  { $in: ["present", "late"] },
  });

  const pct = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : null;
  return { totalSessions, attended, pct };
}

/**
 * Build the full transcript data object for a given student.
 */
async function buildTranscript(studentId, company) {
  const [student, institution, enrollments] = await Promise.all([
    User.findOne({ _id: studentId, company }).select("name email IndexNumber programme department studentLevel").lean(),
    Company.findById(company).select("name").lean(),
    StudentCourseEnrollment.find({ company, student: studentId })
      .populate("course", "title code academicYear semester level group studyType")
      .sort({ enrolledAt: -1 })
      .lean(),
  ]);

  if (!student) return null;

  // Fetch all certificates for this student in one query
  const certs = await IssuedCertificate.find({ company, student: studentId, isRevoked: false })
    .select("course verificationCode issuedAt courseName")
    .lean();
  const certByCourse = {};
  for (const c of certs) {
    certByCourse[c.course.toString()] = c;
  }

  // Build per-course rows (attendance fetched in parallel)
  const courseRows = await Promise.all(
    enrollments.map(async (enr) => {
      const courseId  = enr.course?._id;
      const courseStr = courseId?.toString();

      const attendance = courseId
        ? await courseAttendance(courseId, studentId, company)
        : { totalSessions: 0, attended: 0, pct: null };

      const cert = courseStr ? certByCourse[courseStr] || null : null;

      return {
        enrollmentId: enr._id,
        course: enr.course
          ? {
              _id:          enr.course._id,
              title:        enr.course.title,
              code:         enr.course.code,
              academicYear: enr.course.academicYear,
              semester:     enr.course.semester,
              level:        enr.course.level,
              group:        enr.course.group,
              studyType:    enr.course.studyType,
            }
          : null,
        enrollment: {
          status:      enr.status,
          enrolledAt:  enr.enrolledAt,
          droppedAt:   enr.droppedAt    || null,
          completedAt: enr.completedAt  || null,
          suspendedAt: enr.suspendedAt  || null,
        },
        finalGrade:  enr.finalGrade,
        attendance,
        certificate: cert
          ? { verificationCode: cert.verificationCode, issuedAt: cert.issuedAt }
          : null,
      };
    })
  );

  // Summary stats
  const completed  = courseRows.filter(r => r.enrollment.status === ENROLLMENT_STATUSES.COMPLETED);
  const withScores = completed.filter(r => r.finalGrade?.score != null);
  const avgScore   = withScores.length
    ? Math.round(withScores.reduce((s, r) => s + r.finalGrade.score, 0) / withScores.length)
    : null;

  const gpas = withScores.map(r => scoreToGradePoints(r.finalGrade.score)).filter(g => g != null);
  const gpa  = gpas.length
    ? parseFloat((gpas.reduce((s, g) => s + g, 0) / gpas.length).toFixed(2))
    : null;

  return {
    student: {
      _id:         student._id,
      name:        student.name,
      email:       student.email       || null,
      indexNumber: student.IndexNumber || null,
      programme:   student.programme   || null,
      department:  student.department  || null,
      level:       student.studentLevel|| null,
    },
    institution: institution?.name || null,
    generatedAt:  new Date().toISOString(),
    courses: courseRows,
    summary: {
      totalCourses:     courseRows.length,
      activeCourses:    courseRows.filter(r => r.enrollment.status === ENROLLMENT_STATUSES.ACTIVE).length,
      completedCourses: completed.length,
      droppedCourses:   courseRows.filter(r => r.enrollment.status === ENROLLMENT_STATUSES.DROPPED).length,
      averageScore:     avgScore,
      gpa,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// TRANSCRIPT ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// GET /me  — student: own transcript
// ---------------------------------------------------------------------------
router.get("/me", ...mw, requireRole("student"), async (req, res) => {
  try {
    const transcript = await buildTranscript(req.user._id, req.user.company);
    if (!transcript) return res.status(404).json({ error: "Student not found" });
    res.json({ transcript });
  } catch (err) {
    console.error("transcript/me:", err);
    res.status(500).json({ error: "Failed to generate transcript" });
  }
});

// ---------------------------------------------------------------------------
// GET /:studentId  — admin / lecturer: view a student's transcript
// Must be declared AFTER all /certificates/* routes to avoid shadowing.
// ---------------------------------------------------------------------------
router.get("/certificates/me", ...mw, requireRole("student"), async (req, res) => {
  try {
    const company = req.user.company;
    const certs   = await IssuedCertificate.find({ company, student: req.user._id })
      .sort({ issuedAt: -1 })
      .lean();
    res.json({ certificates: certs, count: certs.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch certificates" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CERTIFICATE ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// POST /certificates  — issue a certificate  [staff]
// Body: { studentId, courseId, note? }
// ---------------------------------------------------------------------------
router.post("/certificates", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company = req.user.company;
    const { studentId, courseId } = req.body;

    if (!studentId || !courseId) {
      return res.status(400).json({ error: "studentId and courseId are required" });
    }

    // Verify student belongs to same company
    const student = await User.findOne({ _id: studentId, company, role: "student" })
      .select("name email IndexNumber programme department studentLevel").lean();
    if (!student) return res.status(404).json({ error: "Student not found" });

    // Verify course belongs to same company
    const course = await Course.findOne({ _id: courseId, companyId: company })
      .select("title code academicYear semester level").lean();
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Look up enrollment for grade snapshot
    const enrollment = await StudentCourseEnrollment.findOne({
      company,
      student: studentId,
      course:  courseId,
    }).sort({ enrolledAt: -1 }).lean();

    // Prevent duplicate active certificate
    const existing = await IssuedCertificate.findOne({
      company,
      student:   studentId,
      course:    courseId,
      isRevoked: false,
    });
    if (existing) {
      return res.status(409).json({
        error: "An active certificate already exists for this student and course",
        certificate: existing,
      });
    }

    // Get institution name
    const institution = await Company.findById(company).select("name").lean();

    const cert = await IssuedCertificate.create({
      company,
      course:    courseId,
      student:   studentId,
      enrollment: enrollment?._id || null,
      issuedBy:   req.user._id,

      // Snapshots
      studentName:        student.name,
      studentEmail:       student.email || "",
      studentIndexNumber: student.IndexNumber || "",
      institutionName:    institution?.name || "",
      courseName:         course.title,
      courseCode:         course.code,
      academicYear:       course.academicYear || "",
      semester:           course.semester     || "",
      level:              course.level        || "",
      programme:          student.programme   || "",

      finalGrade: enrollment?.finalGrade
        ? {
            score:   enrollment.finalGrade.score   ?? null,
            grade:   enrollment.finalGrade.grade   ?? null,
            remarks: enrollment.finalGrade.remarks ?? null,
          }
        : { score: null, grade: null, remarks: null },
    });

    res.status(201).json({ certificate: cert });
  } catch (err) {
    console.error("issue certificate:", err);
    res.status(500).json({ error: "Failed to issue certificate" });
  }
});

// ---------------------------------------------------------------------------
// GET /certificates/:studentId  — list certificates for a student  [staff]
// Must be declared BEFORE /:studentId to prevent shadowing.
// ---------------------------------------------------------------------------
router.get("/certificates/:studentId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company = req.user.company;

    // Verify student belongs to same company
    const student = await User.findOne({ _id: req.params.studentId, company, role: "student" })
      .select("name email IndexNumber").lean();
    if (!student) return res.status(404).json({ error: "Student not found" });

    const certs = await IssuedCertificate.find({ company, student: req.params.studentId })
      .populate("issuedBy", "name")
      .sort({ issuedAt: -1 })
      .lean();

    res.json({ student, certificates: certs, count: certs.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch certificates" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /certificates/:certId/revoke  — revoke a certificate  [admin, superadmin]
// Must be declared BEFORE /:studentId to prevent shadowing.
// Body: { reason? }
// ---------------------------------------------------------------------------
router.patch("/certificates/:certId/revoke", ...mw, requireRole(...CERT_MGRS), async (req, res) => {
  try {
    const company = req.user.company;

    const cert = await IssuedCertificate.findOne({ _id: req.params.certId, company });
    if (!cert) return res.status(404).json({ error: "Certificate not found" });
    if (cert.isRevoked) return res.status(400).json({ error: "Certificate is already revoked" });

    cert.isRevoked    = true;
    cert.revokedBy    = req.user._id;
    cert.revokedAt    = new Date();
    cert.revokeReason = req.body.reason?.trim() || null;
    await cert.save();

    res.json({ certificate: cert });
  } catch (err) {
    res.status(500).json({ error: "Failed to revoke certificate" });
  }
});

// ---------------------------------------------------------------------------
// GET /verify/:code  — PUBLIC certificate verification (no auth required)
// ---------------------------------------------------------------------------
router.get("/verify/:code", async (req, res) => {
  try {
    const cert = await IssuedCertificate.findOne({ verificationCode: req.params.code })
      .populate("issuedBy", "name")
      .lean();

    if (!cert) {
      return res.status(404).json({ valid: false, error: "Certificate not found" });
    }

    res.json({
      valid:      !cert.isRevoked,
      isRevoked:  cert.isRevoked,
      revokedAt:  cert.revokedAt   || null,
      revokeReason: cert.revokeReason || null,
      certificate: {
        verificationCode:   cert.verificationCode,
        studentName:        cert.studentName,
        studentEmail:       cert.studentEmail,
        studentIndexNumber: cert.studentIndexNumber,
        institutionName:    cert.institutionName,
        courseName:         cert.courseName,
        courseCode:         cert.courseCode,
        academicYear:       cert.academicYear,
        semester:           cert.semester,
        level:              cert.level,
        programme:          cert.programme,
        finalGrade:         cert.finalGrade,
        issuedAt:           cert.issuedAt,
        issuedBy:           cert.issuedBy?.name || null,
      },
    });
  } catch (err) {
    console.error("verify certificate:", err);
    res.status(500).json({ valid: false, error: "Verification failed" });
  }
});

// ---------------------------------------------------------------------------
// GET /:studentId  — admin / lecturer: a student's full transcript
// Declared LAST — after all /certificates/* and /verify/* paths.
// ---------------------------------------------------------------------------
router.get("/:studentId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company = req.user.company;

    // Verify student belongs to same company
    const student = await User.findOne({ _id: req.params.studentId, company, role: "student" })
      .select("_id").lean();
    if (!student) return res.status(404).json({ error: "Student not found" });

    const transcript = await buildTranscript(req.params.studentId, company);
    if (!transcript) return res.status(404).json({ error: "Student not found" });

    res.json({ transcript });
  } catch (err) {
    console.error("transcript/:studentId:", err);
    res.status(500).json({ error: "Failed to generate transcript" });
  }
});

module.exports = router;

const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const courseController = require("../controllers/courseController");

const router = express.Router();

router.use(authenticate);
router.use(requireMode("academic"));
router.use(requireActiveSubscription);

router.post("/", requireRole("lecturer", "admin", "superadmin"), companyIsolation, courseController.createCourse);
router.get("/", companyIsolation, courseController.listCourses);
router.get("/:id", companyIsolation, courseController.getCourse);
router.patch("/:id", requireRole("lecturer", "admin", "superadmin"), companyIsolation, courseController.updateCourse);
router.post("/:id/enroll", requireRole("lecturer", "admin", "superadmin"), companyIsolation, courseController.enrollStudents);
router.delete("/:id/students/:studentId", requireRole("lecturer", "admin", "superadmin"), companyIsolation, courseController.removeStudent);

// POST /:id/email-students -- bulk email to enrolled students
router.post("/:id/email-students", requireRole("lecturer", "admin", "superadmin"), companyIsolation, async (req, res) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) return res.status(400).json({ error: "Subject and message are required" });

    const Course = require("../models/Course");
    const User = require("../models/User");
    const { sendCustom } = require("../services/emailService");

    const course = await Course.findOne({ _id: req.params.id, company: req.user.company })
      .populate("enrolledStudents", "email name").lean();
    if (!course) return res.status(404).json({ error: "Course not found" });

    const students = (course.enrolledStudents || []).filter(s => s.email);
    if (!students.length) return res.status(400).json({ error: "No students with email addresses in this course" });

    let sentCount = 0;
    for (const student of students) {
      try {
        await sendCustom({ to: student.email, toName: student.name, subject, message });
        sentCount++;
      } catch(e) {
        console.error(`[BulkEmail] Failed to send to ${student.email}:`, e.message);
      }
    }

    res.json({ ok: true, sentCount, total: students.length });
  } catch (err) {
    console.error("Bulk email error:", err);
    res.status(500).json({ error: "Failed to send emails" });
  }
});

module.exports = router;

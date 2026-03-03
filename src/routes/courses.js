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

module.exports = router;

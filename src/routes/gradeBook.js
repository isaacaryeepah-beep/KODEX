const express      = require("express");
const authenticate = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { requireRole } = require("../middleware/role");
const ctrl = require("../controllers/gradeBookController");

const router = express.Router();
router.use(authenticate);
router.use(requireActiveSubscription);

const STAFF = ["admin", "superadmin", "lecturer"];

// Lecturer / admin routes
router.get("/courses",                                          requireRole(...STAFF), ctrl.listCourses);
router.get("/course/:courseId/export",                          requireRole(...STAFF), ctrl.exportGrades);
router.get("/course/:courseId",                                 requireRole(...STAFF), ctrl.getCourseGrades);
router.patch("/course/:courseId/weights",                       requireRole(...STAFF), ctrl.updateWeights);
router.post("/course/:courseId/manual-entry",                   requireRole(...STAFF), ctrl.addManualEntry);
router.delete("/course/:courseId/manual-entry/:entryId",        requireRole(...STAFF), ctrl.deleteManualEntry);
router.put("/course/:courseId/manual-entry/:entryId/scores",    requireRole(...STAFF), ctrl.saveManualScores);

// Student routes
router.get("/my-courses",       requireRole("student"), ctrl.myCoursesGrades);
router.get("/my/:courseId",     requireRole("student"), ctrl.getMyGrades);

module.exports = router;

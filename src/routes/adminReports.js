const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const adminReportController = require("../controllers/adminReportController");

const router = express.Router();

router.use(authenticate);
router.use(requireActiveSubscription);
router.use(requireRole("admin", "superadmin"));
router.use(companyIsolation);

router.get("/attendance", adminReportController.attendanceOverview);
router.get("/sessions", adminReportController.sessionAnalytics);
router.get("/performance", adminReportController.performanceReport);
router.get("/lecturers", adminReportController.lecturerPerformance);
router.get("/students", adminReportController.studentAnalytics);
router.get("/summary", adminReportController.institutionSummary);
router.get("/charts", adminReportController.chartData);

module.exports = router;

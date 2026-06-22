const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const { reportLimiter } = require("../middleware/rateLimiter");
const reportController = require("../controllers/reportController");

const router = express.Router();

// One-time download token endpoint — no auth middleware (UUID is the credential)
router.get("/download/:uuid", reportController.downloadByToken);

router.use(authenticate);
router.use(requireActiveSubscription);
router.use(reportLimiter);

// Create a one-time download link (native app uses this to open PDF in external browser)
router.get(
  "/download-link/:type",
  requireRole("manager", "lecturer", "admin", "superadmin", "employee", "student"),
  companyIsolation,
  reportController.createDownloadLink
);

router.get(
  "/attendance",
  requireRole("manager", "lecturer", "admin", "superadmin", "employee", "student"),
  companyIsolation,
  reportController.attendanceReport
);

router.get(
  "/attendance/csv",
  requireRole("manager", "lecturer", "admin", "superadmin", "employee", "student"),
  companyIsolation,
  reportController.attendanceCsv
);

router.get(
  "/sessions",
  requireRole("manager", "lecturer", "admin", "superadmin"),
  companyIsolation,
  reportController.sessionReport
);

router.get(
  "/performance",
  requireRole("lecturer", "admin", "superadmin", "student"),
  companyIsolation,
  reportController.performanceReport
);

module.exports = router;

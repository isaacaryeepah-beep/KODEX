const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const reportController = require("../controllers/reportController");

const router = express.Router();

router.use(authenticate);
router.use(requireActiveSubscription);

router.get(
  "/attendance",
  requireRole("manager", "lecturer", "admin", "superadmin", "employee", "student"),
  companyIsolation,
  reportController.attendanceReport
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

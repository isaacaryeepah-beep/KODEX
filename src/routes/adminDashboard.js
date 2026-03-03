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

router.get("/dashboard", adminReportController.dashboard);

module.exports = router;

const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole, requireMinRole } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const { enforceLogoutRestriction } = require("../middleware/deviceValidation");
const attendanceController = require("../controllers/attendanceController");
const router = express.Router();

router.use(authenticate);
router.use(requireActiveSubscription);

router.post("/start", requireRole("admin", "manager", "lecturer", "superadmin"), companyIsolation, attendanceController.startSession);
router.post("/:id/stop", requireRole("admin", "manager", "lecturer", "superadmin"), companyIsolation, attendanceController.stopSession);
router.get("/", requireRole("manager", "lecturer", "admin", "superadmin"), companyIsolation, attendanceController.listSessions);
router.get("/active", companyIsolation, attendanceController.getActiveSession);
router.get("/my-attendance", attendanceController.getMyAttendance);
router.get("/sign-in-status", attendanceController.getSignInStatus);
router.post("/sign-in", requireRole("employee"), attendanceController.employeeSignIn);
router.post("/sign-out", requireRole("employee"), attendanceController.employeeSignOut);
router.get("/:id", companyIsolation, attendanceController.getSession);
router.post("/mark", enforceLogoutRestriction, attendanceController.markAttendance);

module.exports = router;

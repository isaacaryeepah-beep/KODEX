const express = require(“express”);
const authenticate = require(”../middleware/auth”);
const { requireRole, requireMinRole } = require(”../middleware/role”);
const { companyIsolation } = require(”../middleware/companyIsolation”);
const { requireActiveSubscription } = require(”../middleware/subscription”);
const { enforceLogoutRestriction } = require(”../middleware/deviceValidation”);
const attendanceController = require(”../controllers/attendanceController”);
const router = express.Router();

// ESP32 offline sync - must be before authenticate middleware (uses its own secret)
router.post(”/esp32-sync”, attendanceController.esp32Sync);

router.use(authenticate);
router.use(requireActiveSubscription);

router.post(”/start”, requireRole(“admin”, “manager”, “lecturer”, “superadmin”), companyIsolation, attendanceController.startSession);
router.post(”/:id/stop”, requireRole(“admin”, “manager”, “lecturer”, “superadmin”), companyIsolation, attendanceController.stopSession);
router.get(”/”, requireRole(“manager”, “lecturer”, “admin”, “superadmin”, “hod”), companyIsolation, attendanceController.listSessions);
router.get(”/active”, companyIsolation, attendanceController.getActiveSession);
router.get(”/my-attendance”, attendanceController.getMyAttendance);
router.get(”/sign-in-status”, attendanceController.getSignInStatus);
router.post(”/sign-in”, requireRole(“employee”, “admin”, “manager”), attendanceController.employeeSignIn);
router.post(”/sign-out”, requireRole(“employee”, “admin”, “manager”), attendanceController.employeeSignOut);
router.post(”/mark”, enforceLogoutRestriction, attendanceController.markAttendance);
router.get(”/:id/records”, companyIsolation, attendanceController.getSessionRecords);
router.get(”/:id”, companyIsolation, attendanceController.getSession);

module.exports = router;
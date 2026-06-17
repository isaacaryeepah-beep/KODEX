const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole, requireMinRole } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const { enforceLogoutRestriction } = require("../middleware/deviceValidation");
const requireNoDeviceLock = require("../middleware/requireNoDeviceLock");
const attendanceController = require("../controllers/attendanceController");
const router = express.Router();

// POST /offline-sync — called by ESP32 device JWT (not user JWT), must be before authenticate
router.post("/offline-sync", attendanceController.offlineSync);

router.use(authenticate);
router.use(requireActiveSubscription);

router.post("/start", requireRole("admin", "manager", "lecturer", "superadmin"), companyIsolation, attendanceController.startSession);
// NOTE: POST /:id/stop is handled by sessionDashboard router (mounted at same prefix in server.js)
// which returns richer summary data. This avoids a double-mount shadow.
router.get("/", requireRole("manager", "lecturer", "admin", "superadmin", "hod"), companyIsolation, attendanceController.listSessions);
router.get("/active", companyIsolation, attendanceController.getActiveSession);
router.get("/my-attendance", attendanceController.getMyAttendance);
router.get("/sign-in-status", attendanceController.getSignInStatus);
router.post("/sign-in", requireRole("employee", "admin", "manager"), attendanceController.employeeSignIn);
router.post("/sign-out", requireRole("employee", "admin", "manager"), attendanceController.employeeSignOut);
router.post("/mark", requireRole("student", "employee"), requireNoDeviceLock, enforceLogoutRestriction, attendanceController.markAttendance);
router.get("/flagged/new-devices", requireRole("lecturer", "hod", "admin", "superadmin"), companyIsolation, attendanceController.getFlaggedNewDevices);
router.post("/flagged/:recordId/resolve", requireRole("lecturer", "hod", "admin", "superadmin"), companyIsolation, attendanceController.resolveFlaggedRecord);
router.post("/flagged/:recordId/trust", requireRole("lecturer", "hod", "admin", "superadmin"), companyIsolation, attendanceController.trustFlaggedDevice);
router.get("/:id/current-code", requireRole("lecturer", "admin", "superadmin"), companyIsolation, attendanceController.getCurrentCode);
router.get("/:id/records", requireRole("lecturer", "hod", "admin", "superadmin", "manager"), companyIsolation, attendanceController.getSessionRecords);
router.get("/:id", requireRole("lecturer", "hod", "admin", "superadmin", "manager"), companyIsolation, attendanceController.getSession);

module.exports = router;

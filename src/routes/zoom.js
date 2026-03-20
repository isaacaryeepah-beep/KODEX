const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/zoomController");

const router = express.Router();

router.use(authenticate);
router.use(requireActiveSubscription);

router.post("/", requireRole("manager", "admin", "lecturer", "superadmin"), ctrl.createMeeting);
router.get("/", ctrl.listMeetings);
router.get("/:id", ctrl.getMeeting);
router.get("/:id/attendees", ctrl.getMeetingAttendees);
router.post("/:id/start", requireRole("manager", "admin", "lecturer", "superadmin"), ctrl.startMeeting);
router.post("/:id/join", ctrl.joinMeeting);
router.post("/:id/end", requireRole("manager", "admin", "lecturer", "superadmin"), ctrl.endMeeting);
router.post("/:id/cancel", requireRole("manager", "admin", "lecturer", "superadmin"), ctrl.cancelMeeting);

router.patch("/:id/invite-link", requireRole("manager", "admin", "lecturer", "superadmin"), ctrl.setInviteLink);

router.get("/:id/attendance", requireRole("admin", "manager", "lecturer", "superadmin"), ctrl.getMeetingAttendance);
router.get("/:id/attendance/csv", requireRole("admin", "manager", "lecturer", "superadmin"), ctrl.getMeetingAttendanceCSV);

module.exports = router;

const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/zoomController");

const router = express.Router();

router.use(authenticate);
router.use(requireActiveSubscription);

router.post("/", requireRole("manager", "lecturer", "admin", "superadmin"), ctrl.createMeeting);
router.get("/", ctrl.listMeetings);
router.get("/:id", ctrl.getMeeting);
router.get("/:id/attendees", ctrl.getMeetingAttendees);
router.post("/:id/start", requireRole("manager", "lecturer", "admin", "superadmin"), ctrl.startMeeting);
router.post("/:id/join", ctrl.joinMeeting);
router.post("/:id/end", requireRole("manager", "lecturer", "admin", "superadmin"), ctrl.endMeeting);
router.post("/:id/cancel", requireRole("manager", "lecturer", "admin", "superadmin"), ctrl.cancelMeeting);

module.exports = router;

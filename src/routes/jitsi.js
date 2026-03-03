const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const ctrl = require("../controllers/jitsiController");

const router = express.Router();

router.use(authenticate);

router.post("/create", requireRole("manager", "lecturer", "admin", "superadmin"), ctrl.createMeeting);

router.post("/end", ctrl.endMeeting);

router.get("/join/:roomName", ctrl.joinMeeting);

router.post("/attendance", ctrl.trackAttendance);

module.exports = router;

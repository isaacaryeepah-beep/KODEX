const express         = require("express");
const router          = express.Router();
const ctrl            = require("../controllers/esp32Controller");
const authenticate    = require("../middleware/auth");
const { requireRole } = require("../middleware/role");

function esp32Auth(req, res, next) {
  const secret = req.headers["x-esp32-secret"];
  if (!secret || secret !== process.env.ESP32_SECRET) {
    return res.status(401).json({ error: "Unauthorized — invalid ESP32 secret" });
  }
  next();
}

// Device-side routes (x-esp32-secret header)
router.post("/register",  esp32Auth, ctrl.register);
router.post("/heartbeat", esp32Auth, ctrl.heartbeat);
router.get ("/poll",      esp32Auth, ctrl.poll);
router.post("/sync",      esp32Auth, ctrl.sync);

// Web app-side routes (JWT)
router.post("/command",       authenticate, requireRole("admin","lecturer","manager","superadmin"), ctrl.sendCommand);
router.get ("/device-status", authenticate, ctrl.deviceStatus);

module.exports = router;

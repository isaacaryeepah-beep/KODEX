const express = require("express");
const router = express.Router();

// POST /api/esp32/ping  — basic health-check from a device
router.post("/ping", (req, res) => {
  const { deviceId } = req.body;
  if (!deviceId) {
    return res.status(400).json({ error: "deviceId is required" });
  }
  res.json({ ok: true, deviceId, serverTime: new Date().toISOString() });
});

// Add your ESP32-specific routes below this line
// e.g. router.post("/attendance", ...)

module.exports = router;

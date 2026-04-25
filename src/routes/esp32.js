// ──────────────────────────────────────────────────────────────────────────
//  Legacy /api/esp32/* routes — RETIRED.
//
//  The KODEX classroom-device protocol was rewritten to use a per-lecturer
//  Device model + JWT-authenticated heartbeats. The old company-wide flow
//  (x-esp32-secret + x-esp32-token + polling for commands) is gone.
//
//  This stub returns HTTP 410 Gone with the new endpoint paths so any old
//  firmware in the field gets a clear migration message instead of a silent
//  500. Once all devices are reflashed, this file can be deleted.
//
//  New endpoints (see routes/deviceSessionRoutes.js):
//    POST /api/devices/pair          — pair using lecturer pairing code
//    POST /api/devices/heartbeat     — every 5 s (Authorization: Bearer …)
//    POST /api/devices/sync          — offline batch sync
//    GET  /api/devices/my            — lecturer-side status (web)
// ──────────────────────────────────────────────────────────────────────────
const express = require("express");
const router  = express.Router();

const GONE = (res, replacement) => res.status(410).json({
  error: "This ESP32 endpoint has been retired.",
  message: "Reflash the device with the latest KODEX firmware. The new flow uses /api/devices/* with a paired device JWT.",
  replacement,
});

router.post("/register",     (_, res) => GONE(res, "POST /api/devices/pair"));
router.post("/heartbeat",    (_, res) => GONE(res, "POST /api/devices/heartbeat"));
router.get ("/poll",         (_, res) => GONE(res, "POST /api/devices/heartbeat (returns active session)"));
router.post("/sync",         (_, res) => GONE(res, "POST /api/devices/sync"));
router.post("/command",      (_, res) => GONE(res, "Commands are delivered via /api/devices/heartbeat response"));
router.post("/ble-verify",   (_, res) => GONE(res, "BLE verification has been removed"));
router.get ("/device-status",(_, res) => GONE(res, "GET /api/devices/my"));

module.exports = router;

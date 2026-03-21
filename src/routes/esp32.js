/**
 * esp32.js  —  KODEX ESP32 Device Routes
 * ─────────────────────────────────────────────────────────────────────────────
 * All business logic lives in esp32Controller.js.
 * This file only declares routes and applies middleware.
 *
 * Auth split:
 *   Device routes  → esp32Auth (x-esp32-secret header)
 *   Web app routes → authenticate + requireRole (JWT)
 *
 * Set in .env:  ESP32_SECRET=your_shared_secret_here
 * ─────────────────────────────────────────────────────────────────────────────
 */

const express         = require("express");
const router          = express.Router();
const esp32Ctrl       = require("../controllers/esp32Controller");
const authenticate    = require("../middleware/auth");
const { requireRole } = require("../middleware/role");

// ── Device secret middleware ──────────────────────────────────────────────────
function esp32Auth(req, res, next) {
  const secret = req.headers["x-esp32-secret"];
  if (!secret || secret !== process.env.ESP32_SECRET) {
    return res.status(401).json({ error: "Unauthorized ESP32 request" });
  }
  next();
}

// ── Device-side routes (x-esp32-secret) ──────────────────────────────────────
router.post("/register",     esp32Auth, esp32Ctrl.register);
router.get ("/poll",         esp32Auth, esp32Ctrl.poll);
router.post("/mark",         esp32Auth, esp32Ctrl.mark);
router.get ("/student-list", esp32Auth, esp32Ctrl.studentList);
router.post("/ping",         esp32Auth, esp32Ctrl.ping);
router.get ("/session",      esp32Auth, esp32Ctrl.getSession);
router.get ("/qr",           esp32Auth, esp32Ctrl.getQr);
router.post("/scan",         esp32Auth, esp32Ctrl.scan);
router.post("/heartbeat",    esp32Auth, esp32Ctrl.heartbeat);

// ── Web app-side routes (JWT) ─────────────────────────────────────────────────
router.post("/command",       authenticate, requireRole("admin", "manager", "lecturer", "superadmin"), esp32Ctrl.sendCommand);
router.get ("/device-status", authenticate, esp32Ctrl.deviceStatus);

module.exports = router;

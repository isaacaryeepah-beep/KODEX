/**
 * esp32.js — KODEX ESP32 Routes
 * ─────────────────────────────────────────────────────
 * Thin routing layer. All logic is in esp32Controller.js.
 *
 * Device routes  → esp32Auth middleware (x-esp32-secret header)
 * Web app routes → authenticate + requireRole (JWT)
 *
 * .env must contain: ESP32_SECRET=kodex-esp32-secret-2024
 */

const express         = require("express");
const router          = express.Router();
const ctrl            = require("../controllers/esp32Controller");
const authenticate    = require("../middleware/auth");
const { requireRole } = require("../middleware/role");

// ── Device secret auth middleware ─────────────────────────
function esp32Auth(req, res, next) {
  const secret = req.headers["x-esp32-secret"];
  if (!secret || secret !== process.env.ESP32_SECRET) {
    return res.status(401).json({ error: "Unauthorized — invalid ESP32 secret" });
  }
  next();
}

// ── Device-side routes (x-esp32-secret) ──────────────────
router.post("/register",  esp32Auth, ctrl.register);
router.post("/heartbeat", esp32Auth, ctrl.heartbeat);
router.get ("/poll",      esp32Auth, ctrl.poll);
router.post("/sync",      esp32Auth, ctrl.sync);

// ── Web app-side routes (JWT) ─────────────────────────────
router.post("/command",       authenticate, requireRole("admin", "lecturer", "manager", "superadmin"), ctrl.sendCommand);
router.get ("/device-status", authenticate, ctrl.deviceStatus);

module.exports = router;

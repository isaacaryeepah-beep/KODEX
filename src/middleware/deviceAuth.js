// ──────────────────────────────────────────────────────────────────────────
//  deviceAuth.js — JWT auth for ESP32 attendance devices.
//
//  Devices are paired via /api/devices/pair → server returns a long-lived
//  JWT containing { deviceId, lecturerId, companyId }. Devices send this on
//  every heartbeat / sync request as `Authorization: Bearer <token>`.
//
//  Validating the token here is enough — there is no separate device DB
//  password to check. Tokens are revoked by deleting the Device record
//  (unlink) which makes the lookup below return null.
// ──────────────────────────────────────────────────────────────────────────
const jwt    = require("jsonwebtoken");
const Device = require("../models/Device");

module.exports = async function authenticateDevice(req, res, next) {
  try {
    const authHeader = req.headers["authorization"] || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ message: "Device token required" });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ message: "Invalid or expired device token" });
    }

    if (!payload.deviceId || !payload.lecturerId || !payload.companyId) {
      return res.status(401).json({ message: "Malformed device token" });
    }

    const device = await Device.findOne({
      deviceId:   payload.deviceId,
      lecturerId: payload.lecturerId,
      companyId:  payload.companyId,
      token,
    });
    if (!device) {
      return res.status(401).json({ message: "Device not found or token revoked. Re-pair the device." });
    }

    req.device = device;
    next();
  } catch (err) {
    console.error("[deviceAuth]", err);
    return res.status(500).json({ message: "Device authentication failed" });
  }
};

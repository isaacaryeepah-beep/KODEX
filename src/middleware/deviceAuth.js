// ──────────────────────────────────────────────────────────────────────────
//  deviceAuth.js — JWT auth for ESP32 attendance devices.
//
//  Devices are paired via /api/devices/pair → server returns a long-lived
//  JWT containing { deviceId, companyId }. Devices send this on every
//  heartbeat / sync request as `Authorization: Bearer <token>`.
//
//  Backward-compatible: old JWTs that still carry lecturerId will still
//  authenticate correctly because `token` is the unique revocation key.
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

    if (!payload.deviceId || !payload.companyId) {
      return res.status(401).json({ message: "Malformed device token" });
    }

    // Look up by deviceId + companyId + token (token is the revocation key).
    // lecturerId is NOT required — devices are institution-owned, not lecturer-owned.
    const device = await Device.findOne({
      deviceId:  payload.deviceId,
      companyId: payload.companyId,
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

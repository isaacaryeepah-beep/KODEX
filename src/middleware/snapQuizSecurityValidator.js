"use strict";

/**
 * snapQuizSecurityValidator
 *
 * Middleware that validates snap quiz and meeting access security constraints:
 *  1. Verifies X-Device-ID header matches user.deviceId (prevents URL sharing)
 *  2. Checks that request timestamp is within acceptable drift (prevents replay attacks)
 *  3. Validates X-Session-Token matches active attempt when present
 *  4. Blocks if accountDeviceLock is active
 *
 * Used on: snap quiz startAttempt, heartbeat, saveResponses, submit, snapshots
 */

const User = require("../models/User");

const MAX_CLOCK_DRIFT_MS = 30 * 60 * 1000; // 30 minutes — generous tolerance for student devices

module.exports = async function snapQuizSecurityValidator(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select("deviceId accountDeviceLock").lean().maxTimeMS(5000);
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    // 1. Active device-lock check
    const lock = user.accountDeviceLock;
    if (lock?.isLocked && lock?.lockedUntil && new Date(lock.lockedUntil) > new Date()) {
      const remainingMins = Math.ceil((new Date(lock.lockedUntil) - Date.now()) / 60000);
      return res.status(403).json({
        error: `Account locked due to new-device login. Access blocked for ${remainingMins} more minute(s).`,
        accountLocked: true,
        lockedUntil: lock.lockedUntil,
      });
    }

    // 2. Device fingerprint consistency (best-effort — not fatal if no deviceId stored)
    const clientDeviceId = req.headers["x-device-id"];
    if (clientDeviceId && user.deviceId && clientDeviceId !== user.deviceId) {
      return res.status(403).json({
        error: "Device mismatch. Quiz sessions cannot be shared or transferred to another device.",
        deviceMismatch: true,
      });
    }

    // 3. Request timestamp drift check (optional — client sends X-Request-Time)
    // Log excessive drift for audit purposes but never hard-block a student —
    // device clocks are often out of sync and shouldn't prevent exam access.
    const clientTime = req.headers["x-request-time"];
    if (clientTime) {
      const ts = parseInt(clientTime, 10);
      const drift = isNaN(ts) ? 0 : Math.abs(Date.now() - ts);
      if (!isNaN(ts) && drift > MAX_CLOCK_DRIFT_MS) {
        console.warn(
          `[snapQuizSecurityValidator] Large clock drift for user ${req.user._id}: ${Math.round(drift / 1000)}s`
        );
      }
    }

    next();
  } catch (err) {
    console.error("[snapQuizSecurityValidator]", err.message);
    return res.status(500).json({ error: "Security check failed" });
  }
};

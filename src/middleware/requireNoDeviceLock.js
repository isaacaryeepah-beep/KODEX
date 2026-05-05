"use strict";

const User = require("../models/User");

/**
 * requireNoDeviceLock
 *
 * Blocks access to snap-quiz start/join and meeting join endpoints when the
 * student's accountDeviceLock is active (new-device 6-hour lock).
 *
 * Attach after `authenticate` on any route that must be gated:
 *   router.post("/start", authenticate, requireNoDeviceLock, ctrl.start);
 */
module.exports = async function requireNoDeviceLock(req, res, next) {
  try {
    const user = await User.findById(req.user._id).select("accountDeviceLock role");
    if (!user) return res.status(401).json({ error: "Unauthorized" });

    const lock = user.accountDeviceLock;
    if (!lock || !lock.isLocked) return next();

    const now = new Date();
    const lockExpiry = lock.lockedUntil ? new Date(lock.lockedUntil) : null;

    if (!lockExpiry || lockExpiry <= now) {
      // Expired — clear it silently and allow through
      await User.findByIdAndUpdate(req.user._id, {
        "accountDeviceLock.isLocked": false,
      });
      return next();
    }

    const remainingMs = lockExpiry - now;
    const remainingMins = Math.ceil(remainingMs / 60000);
    const remainingHours = (remainingMs / 3600000).toFixed(1);

    return res.status(403).json({
      error: `Your account is locked due to a new device login. You cannot access quizzes or meetings for ${remainingHours} hour(s). Contact your admin or HOD to unlock early.`,
      accountLocked: true,
      lockedUntil: lockExpiry.toISOString(),
      remainingMins,
      remainingHours: parseFloat(remainingHours),
    });
  } catch (err) {
    console.error("[requireNoDeviceLock] error:", err.message);
    return res.status(500).json({ error: "Device lock check failed" });
  }
};

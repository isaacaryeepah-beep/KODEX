"use strict";

/**
 * arrivalIQ.js
 * Mounted at: /api/arrival-iq   (registered in server.js)
 *
 * Route summary (Phase 1 — config + consent only)
 * ------------------------------------------------
 * GET    /status           any employee: is ArrivalIQ enabled for my company?
 * GET    /settings         admin/manager: read full ArrivalIQ config
 * PATCH  /settings         admin: update ArrivalIQ config
 * GET    /consent          employee: read my own consent state
 * POST   /consent          employee: grant/revoke notification + location consent
 *
 * Later phases add: departure-time prediction, geofence-arrival events,
 * the late-arrival form + manager review queue, and punctuality analytics.
 *
 * Corporate mode only — reuses corporateSettings.officeLatitude/
 * officeLongitude/geofenceRadiusMeters (Company model) for office location,
 * and Shift.startTime/gracePeriodMinutes for per-shift timing, rather than
 * duplicating either.
 */

const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const Company = require("../models/Company");
const User = require("../models/User");

const mw = [authenticate, requireMode("corporate"), requireActiveSubscription];
const adminOnly = requireRole("admin", "superadmin");
const canManage = requireRole("admin", "manager", "superadmin");

// ---------------------------------------------------------------------------
// GET /status — minimal, non-sensitive read for any employee (is the
// feature on at all, before they see the opt-in/consent screen)
// ---------------------------------------------------------------------------
router.get("/status", ...mw, async (req, res) => {
  try {
    const company = await Company.findById(req.user.company).select("arrivalIQ").lean();
    res.json({ enabled: company?.arrivalIQ?.enabled || false });
  } catch (error) {
    console.error("ArrivalIQ get status error:", error);
    res.status(500).json({ error: "Failed to fetch ArrivalIQ status" });
  }
});

// ---------------------------------------------------------------------------
// GET /settings — read ArrivalIQ config (admin/manager)
// ---------------------------------------------------------------------------
router.get("/settings", ...mw, canManage, async (req, res) => {
  try {
    const company = await Company.findById(req.user.company)
      .select("arrivalIQ corporateSettings.officeLatitude corporateSettings.officeLongitude corporateSettings.geofenceRadiusMeters")
      .lean();
    const a = company?.arrivalIQ || {};
    const cs = company?.corporateSettings || {};
    res.json({
      enabled:              a.enabled       || false,
      bufferMinutes:        a.bufferMinutes ?? 10,
      pushEnabled:          a.pushEnabled   !== false,
      officeLatitude:       cs.officeLatitude       ?? null,
      officeLongitude:      cs.officeLongitude      ?? null,
      geofenceRadiusMeters: cs.geofenceRadiusMeters || 150,
    });
  } catch (error) {
    console.error("ArrivalIQ get settings error:", error);
    res.status(500).json({ error: "Failed to fetch ArrivalIQ settings" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /settings — update ArrivalIQ config (admin only)
// ---------------------------------------------------------------------------
router.patch("/settings", ...mw, adminOnly, async (req, res) => {
  try {
    const { enabled, bufferMinutes, pushEnabled, officeLatitude, officeLongitude, geofenceRadiusMeters } = req.body;
    const update = {};
    if (enabled       !== undefined) update["arrivalIQ.enabled"]       = Boolean(enabled);
    if (bufferMinutes !== undefined) update["arrivalIQ.bufferMinutes"] = Math.min(120, Math.max(0, Number(bufferMinutes) || 0));
    if (pushEnabled   !== undefined) update["arrivalIQ.pushEnabled"]   = Boolean(pushEnabled);
    // Office location/geofence radius are shared with strict-attendance
    // settings, so ArrivalIQ can set them here too (same underlying fields).
    if (officeLatitude       !== undefined) update["corporateSettings.officeLatitude"]       = officeLatitude  != null ? Number(officeLatitude)  : null;
    if (officeLongitude      !== undefined) update["corporateSettings.officeLongitude"]      = officeLongitude != null ? Number(officeLongitude) : null;
    if (geofenceRadiusMeters !== undefined) update["corporateSettings.geofenceRadiusMeters"] = Number(geofenceRadiusMeters) || 150;
    await Company.findByIdAndUpdate(req.user.company, { $set: update });
    res.json({ message: "ArrivalIQ settings updated" });
  } catch (error) {
    console.error("ArrivalIQ update settings error:", error);
    res.status(500).json({ error: "Failed to update ArrivalIQ settings" });
  }
});

// ---------------------------------------------------------------------------
// GET /consent — read my own consent state (employee)
// ---------------------------------------------------------------------------
router.get("/consent", ...mw, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("arrivalIQConsent").lean();
    const c = user?.arrivalIQConsent || {};
    res.json({
      locationGranted:     c.locationGranted     || false,
      notificationGranted: c.notificationGranted || false,
      grantedAt:           c.grantedAt           || null,
    });
  } catch (error) {
    console.error("ArrivalIQ get consent error:", error);
    res.status(500).json({ error: "Failed to fetch consent status" });
  }
});

// ---------------------------------------------------------------------------
// POST /consent — grant/revoke consent (employee)
// ---------------------------------------------------------------------------
router.post("/consent", ...mw, async (req, res) => {
  try {
    const { locationGranted, notificationGranted } = req.body;
    const update = {};
    if (locationGranted     !== undefined) update["arrivalIQConsent.locationGranted"]     = Boolean(locationGranted);
    if (notificationGranted !== undefined) update["arrivalIQConsent.notificationGranted"] = Boolean(notificationGranted);
    if (Object.keys(update).length) update["arrivalIQConsent.grantedAt"] = new Date();
    await User.findByIdAndUpdate(req.user._id, { $set: update });
    res.json({ message: "Consent updated" });
  } catch (error) {
    console.error("ArrivalIQ update consent error:", error);
    res.status(500).json({ error: "Failed to update consent" });
  }
});

module.exports = router;

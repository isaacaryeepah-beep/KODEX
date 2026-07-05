"use strict";

/**
 * arrivalIQ.js
 * Mounted at: /api/arrival-iq   (registered in server.js)
 *
 * Route summary
 * -------------
 * GET    /status           any employee: is ArrivalIQ enabled for my company?
 * GET    /settings         admin/manager: read full ArrivalIQ config
 * PATCH  /settings         admin: update ArrivalIQ config
 * GET    /consent          employee: read my own consent state
 * POST   /consent          employee: grant/revoke notification + location consent
 * POST   /location         employee: foreground-only location check-in (Phase 2)
 * GET    /prediction/today employee: today's computed departure recommendation
 *
 * Later phases add: geofence-arrival events, the late-arrival form + manager
 * review queue, and punctuality analytics.
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
const ArrivalPrediction = require("../models/ArrivalPrediction");
const AuditLog = require("../models/AuditLog");
const { AUDIT_ACTIONS } = AuditLog;
const { todayKey } = require("../services/arrivalIQScheduler");

const mw = [authenticate, requireMode("corporate"), requireActiveSubscription];
const adminOnly = requireRole("admin", "superadmin");
const canManage = requireRole("admin", "manager", "superadmin");

// ---------------------------------------------------------------------------
// GET /status — minimal, non-sensitive read for any employee (is the
// feature on at all, and mandatory, before they see the opt-in/consent screen)
// ---------------------------------------------------------------------------
router.get("/status", ...mw, async (req, res) => {
  try {
    const company = await Company.findById(req.user.company).select("arrivalIQ").lean();
    res.json({
      enabled:   company?.arrivalIQ?.enabled   || false,
      mandatory: company?.arrivalIQ?.mandatory || false,
    });
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
      mandatory:            a.mandatory     || false,
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
    const { enabled, mandatory, bufferMinutes, pushEnabled, officeLatitude, officeLongitude, geofenceRadiusMeters } = req.body;
    const update = {};
    if (enabled       !== undefined) update["arrivalIQ.enabled"]       = Boolean(enabled);
    if (mandatory     !== undefined) update["arrivalIQ.mandatory"]     = Boolean(mandatory);
    if (bufferMinutes !== undefined) update["arrivalIQ.bufferMinutes"] = Math.min(60, Math.max(5, Number(bufferMinutes) || 10));
    if (pushEnabled   !== undefined) update["arrivalIQ.pushEnabled"]   = Boolean(pushEnabled);
    // Office location/geofence radius are shared with strict-attendance
    // settings, so ArrivalIQ can set them here too (same underlying fields).
    if (officeLatitude       !== undefined) update["corporateSettings.officeLatitude"]       = officeLatitude  != null ? Number(officeLatitude)  : null;
    if (officeLongitude      !== undefined) update["corporateSettings.officeLongitude"]      = officeLongitude != null ? Number(officeLongitude) : null;
    if (geofenceRadiusMeters !== undefined) update["corporateSettings.geofenceRadiusMeters"] = Number(geofenceRadiusMeters) || 150;
    await Company.findByIdAndUpdate(req.user.company, { $set: update });
    AuditLog.record({
      company: req.user.company,
      actor: req.user,
      action: AUDIT_ACTIONS.SETTINGS_CHANGED,
      resource: "Company",
      resourceId: req.user.company,
      resourceLabel: "ArrivalIQ settings",
      changes: { after: update },
      req,
    });
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
// Logged to AuditLog either way — this is a privacy-relevant permission
// change, not just a UI preference.
// ---------------------------------------------------------------------------
router.post("/consent", ...mw, async (req, res) => {
  try {
    const { locationGranted, notificationGranted } = req.body;

    // A company that has made ArrivalIQ mandatory can't have employees
    // silently opt back out via a direct API call — the UI already hides
    // the revoke buttons in that case, but this is the actual enforcement.
    if (locationGranted === false || notificationGranted === false) {
      const company = await Company.findById(req.user.company).select("arrivalIQ.mandatory").lean();
      if (company?.arrivalIQ?.mandatory) {
        return res.status(403).json({ error: "ArrivalIQ is mandatory for your organization and cannot be disabled. Contact your admin." });
      }
    }

    const update = {};
    if (locationGranted     !== undefined) update["arrivalIQConsent.locationGranted"]     = Boolean(locationGranted);
    if (notificationGranted !== undefined) update["arrivalIQConsent.notificationGranted"] = Boolean(notificationGranted);
    if (Object.keys(update).length) update["arrivalIQConsent.grantedAt"] = new Date();
    await User.findByIdAndUpdate(req.user._id, { $set: update });

    if (locationGranted !== undefined) {
      AuditLog.record({
        company: req.user.company,
        actor: req.user,
        action: locationGranted ? AUDIT_ACTIONS.CONSENT_GRANTED : AUDIT_ACTIONS.CONSENT_REVOKED,
        resource: "User",
        resourceId: req.user._id,
        resourceLabel: "ArrivalIQ location consent",
        metadata: { feature: "arrivalIQ", permission: "location" },
        req,
      });
    }
    if (notificationGranted !== undefined) {
      AuditLog.record({
        company: req.user.company,
        actor: req.user,
        action: notificationGranted ? AUDIT_ACTIONS.CONSENT_GRANTED : AUDIT_ACTIONS.CONSENT_REVOKED,
        resource: "User",
        resourceId: req.user._id,
        resourceLabel: "ArrivalIQ notification consent",
        metadata: { feature: "arrivalIQ", permission: "notification" },
        req,
      });
    }

    res.json({ message: "Consent updated" });
  } catch (error) {
    console.error("ArrivalIQ update consent error:", error);
    res.status(500).json({ error: "Failed to update consent" });
  }
});

// ---------------------------------------------------------------------------
// POST /location — foreground-only location check-in (employee)
//
// Called by the client only while the app is actually open, within a
// pre-shift window (see app.js's boot-time ArrivalIQ check). Overwrites
// the single stored reading — never appended, no history table — and
// requires location consent to already be granted. This is the only
// write path for arrivalIQLocation; the sweep job (Phase 2) only reads it
// and ignores anything older than a few hours.
// ---------------------------------------------------------------------------
router.post("/location", ...mw, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "lat and lng (numbers) are required" });
    }
    const user = await User.findById(req.user._id).select("arrivalIQConsent.locationGranted");
    if (!user?.arrivalIQConsent?.locationGranted) {
      return res.status(403).json({ error: "Location consent has not been granted" });
    }
    // findByIdAndUpdate, not user.save() — the partial `.select()` above
    // means this document doesn't have `email` loaded, and .save() runs
    // full-document validation (including the required `email` field),
    // failing on a field we never touched. Matches the update pattern
    // already used elsewhere in this file (settings/consent routes).
    await User.findByIdAndUpdate(req.user._id, {
      $set: { arrivalIQLocation: { lat, lng, capturedAt: new Date() } },
    });
    res.json({ message: "Location updated" });
  } catch (error) {
    console.error("ArrivalIQ location check-in error:", error);
    res.status(500).json({ error: "Failed to record location" });
  }
});

// ---------------------------------------------------------------------------
// GET /prediction/today — today's computed departure recommendation, if any
// (employee). Written by the sweep job in arrivalIQScheduler.js.
// ---------------------------------------------------------------------------
router.get("/prediction/today", ...mw, async (req, res) => {
  try {
    const prediction = await ArrivalPrediction.findOne({
      user: req.user._id,
      date: todayKey(),
    }).lean();
    res.json({ prediction: prediction || null });
  } catch (error) {
    console.error("ArrivalIQ get prediction error:", error);
    res.status(500).json({ error: "Failed to fetch today's prediction" });
  }
});

module.exports = router;

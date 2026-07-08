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
 * GET    /live-consent     employee: read my own live-trip-tracking consent
 * POST   /live-consent     employee: grant/revoke live-trip-tracking consent
 * GET    /map-key          employee: TomTom key for the live-trip map
 * POST   /trip/start       employee: start a live trip to the office
 * POST   /trip/:id/ping    employee: live-trip position update
 * POST   /trip/:id/end     employee: end a live trip manually
 * GET    /trip/active      employee: my current active trip, if any
 * GET    /admin/active-trips admin/manager: status badges (name + ETA only,
 *                             no location) for employees currently on a live trip
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
const LiveTrackingSession = require("../models/LiveTrackingSession");
const AuditLog = require("../models/AuditLog");
const { AUDIT_ACTIONS } = AuditLog;
const { todayKey } = require("../services/arrivalIQScheduler");
const tomtomProvider = require("../services/traffic/providers/tomtomProvider");
const { haversineMeters } = require("../utils/attendanceAntiCheat");

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

// ---------------------------------------------------------------------------
// GET /live-consent — read my own live-trip-tracking consent (employee)
// ---------------------------------------------------------------------------
router.get("/live-consent", ...mw, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("arrivalIQLiveTrackingConsent").lean();
    const c = user?.arrivalIQLiveTrackingConsent || {};
    res.json({ granted: c.granted || false, grantedAt: c.grantedAt || null });
  } catch (error) {
    console.error("ArrivalIQ get live-consent error:", error);
    res.status(500).json({ error: "Failed to fetch live-tracking consent status" });
  }
});

// ---------------------------------------------------------------------------
// POST /live-consent — grant/revoke live-trip-tracking consent (employee)
// Deliberately never company-mandatory, unlike the regular location consent
// above — continuous tracking is a materially bigger privacy step than a
// once-around-shift-time check, so a company can't force it on.
// ---------------------------------------------------------------------------
router.post("/live-consent", ...mw, async (req, res) => {
  try {
    const { granted } = req.body;
    if (typeof granted !== "boolean") {
      return res.status(400).json({ error: "granted (boolean) is required" });
    }
    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        "arrivalIQLiveTrackingConsent.granted":   granted,
        "arrivalIQLiveTrackingConsent.grantedAt": new Date(),
      },
    });
    AuditLog.record({
      company: req.user.company,
      actor: req.user,
      action: granted ? AUDIT_ACTIONS.CONSENT_GRANTED : AUDIT_ACTIONS.CONSENT_REVOKED,
      resource: "User",
      resourceId: req.user._id,
      resourceLabel: "ArrivalIQ live-trip tracking consent",
      metadata: { feature: "arrivalIQ", permission: "liveTracking" },
      req,
    });
    res.json({ message: "Live-tracking consent updated" });
  } catch (error) {
    console.error("ArrivalIQ update live-consent error:", error);
    res.status(500).json({ error: "Failed to update live-tracking consent" });
  }
});

// ---------------------------------------------------------------------------
// GET /map-key — TomTom key for the live-trip map (any authenticated
// employee with the feature available). Live trips always use TomTom for
// the route/map regardless of which provider TRAFFIC_PROVIDER selects for
// the periodic ETA sweep (see tomtomProvider.js's getRoute comment).
// ---------------------------------------------------------------------------
router.get("/map-key", ...mw, (req, res) => {
  if (!tomtomProvider.isConfigured()) {
    return res.status(503).json({ error: "Live trip tracking is not configured (TOMTOM_API_KEY missing)" });
  }
  res.json({ provider: "tomtom", key: process.env.TOMTOM_API_KEY });
});

// ---------------------------------------------------------------------------
// POST /trip/start — start a live trip to the office (employee)
// ---------------------------------------------------------------------------
router.post("/trip/start", ...mw, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "lat and lng (numbers) are required" });
    }

    const user = await User.findById(req.user._id).select("arrivalIQLiveTrackingConsent.granted");
    if (!user?.arrivalIQLiveTrackingConsent?.granted) {
      return res.status(403).json({ error: "Live-trip tracking consent has not been granted" });
    }

    const company = await Company.findById(req.user.company)
      .select("corporateSettings.officeLatitude corporateSettings.officeLongitude")
      .lean();
    const officeLat = company?.corporateSettings?.officeLatitude;
    const officeLng = company?.corporateSettings?.officeLongitude;
    if (officeLat == null || officeLng == null) {
      return res.status(400).json({ error: "Your organization hasn't set an office location yet" });
    }

    // Only one active trip per employee at a time — an orphaned prior
    // session (tab closed without hitting End) shouldn't linger forever.
    await LiveTrackingSession.updateMany(
      { user: req.user._id, status: "active" },
      { $set: { status: "ended", endedAt: new Date(), endReason: "manual" } }
    );

    const route = await tomtomProvider.getRoute({
      origin: { lat, lng },
      destination: { lat: officeLat, lng: officeLng },
    });

    const session = await LiveTrackingSession.create({
      company: req.user.company,
      user: req.user._id,
      origin: { lat, lng },
      destination: { lat: officeLat, lng: officeLng },
      routeCoordinates: route.coordinates,
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      lastPosition: { lat, lng, capturedAt: new Date() },
    });

    res.json({
      tripId: session._id,
      destination: session.destination,
      routeCoordinates: session.routeCoordinates,
      distanceMeters: session.distanceMeters,
      durationSeconds: session.durationSeconds,
      startedAt: session.startedAt,
    });
  } catch (error) {
    console.error("ArrivalIQ trip start error:", error);
    res.status(500).json({ error: error.message || "Failed to start live trip" });
  }
});

// ---------------------------------------------------------------------------
// POST /trip/:id/ping — live-trip position update (employee)
// Throttled client-side (~every 15-30s) — the map's own live movement comes
// straight from the browser's navigator.geolocation.watchPosition, this
// just persists the latest fix server-side and detects arrival.
// ---------------------------------------------------------------------------
router.post("/trip/:id/ping", ...mw, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return res.status(400).json({ error: "lat and lng (numbers) are required" });
    }
    const session = await LiveTrackingSession.findOne({ _id: req.params.id, user: req.user._id });
    if (!session) return res.status(404).json({ error: "Trip not found" });
    if (session.status !== "active") return res.status(400).json({ error: "Trip has already ended" });

    session.lastPosition = { lat, lng, capturedAt: new Date() };

    const geofenceRadius = 150; // matches ArrivalIQ settings default (see GET /settings)
    const distanceToOffice = haversineMeters(lat, lng, session.destination.lat, session.destination.lng);
    let arrived = false;
    if (distanceToOffice <= geofenceRadius) {
      session.status    = "ended";
      session.endedAt   = new Date();
      session.endReason = "arrived";
      arrived = true;
    }
    await session.save();

    res.json({ arrived, distanceToOfficeMeters: Math.round(distanceToOffice) });
  } catch (error) {
    console.error("ArrivalIQ trip ping error:", error);
    res.status(500).json({ error: "Failed to update trip position" });
  }
});

// ---------------------------------------------------------------------------
// POST /trip/:id/end — end a live trip manually (employee)
// ---------------------------------------------------------------------------
router.post("/trip/:id/end", ...mw, async (req, res) => {
  try {
    const session = await LiveTrackingSession.findOne({ _id: req.params.id, user: req.user._id });
    if (!session) return res.status(404).json({ error: "Trip not found" });
    if (session.status !== "active") return res.status(400).json({ error: "Trip has already ended" });
    session.status    = "ended";
    session.endedAt   = new Date();
    session.endReason = "manual";
    await session.save();
    res.json({ message: "Trip ended" });
  } catch (error) {
    console.error("ArrivalIQ trip end error:", error);
    res.status(500).json({ error: "Failed to end trip" });
  }
});

// ---------------------------------------------------------------------------
// GET /trip/active — my current active trip, if any (employee) — lets the
// page resume a live trip after a reload instead of losing it.
// ---------------------------------------------------------------------------
router.get("/trip/active", ...mw, async (req, res) => {
  try {
    const session = await LiveTrackingSession.findOne({ user: req.user._id, status: "active" }).lean();
    res.json({ trip: session || null });
  } catch (error) {
    console.error("ArrivalIQ get active trip error:", error);
    res.status(500).json({ error: "Failed to fetch active trip" });
  }
});

// ---------------------------------------------------------------------------
// GET /admin/active-trips — status badges for currently-active live trips
// (admin/manager). Deliberately a status list, not a location feed: name,
// "on the way"/ETA only — no lat/lng, no route. Employees only ever
// consented to their own device showing their live position; showing that
// same position to a manager is a materially bigger privacy surface this
// feature was never scoped or worded for, so it stays out on purpose.
// ---------------------------------------------------------------------------
router.get("/admin/active-trips", ...mw, canManage, async (req, res) => {
  try {
    const sessions = await LiveTrackingSession.find({ company: req.user.company, status: "active" })
      .select("user startedAt durationSeconds")
      .populate("user", "name email")
      .lean();
    res.json({
      trips: sessions.map(s => ({
        userId: s.user?._id,
        name: s.user?.name || s.user?.email || "Unknown",
        startedAt: s.startedAt,
        etaAt: new Date(new Date(s.startedAt).getTime() + (s.durationSeconds || 0) * 1000),
      })),
    });
  } catch (error) {
    console.error("ArrivalIQ get active trips error:", error);
    res.status(500).json({ error: "Failed to fetch active trips" });
  }
});

module.exports = router;

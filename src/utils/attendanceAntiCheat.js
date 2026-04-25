"use strict";

/**
 * attendanceAntiCheat.js
 *
 * Strict anti-cheat helpers for corporate clock-in / clock-out.
 *
 * Trust score model (0-100, default 100):
 *   - mock_gps          → -20
 *   - vpn / proxy       → -15
 *   - impossible_move   → -25
 *   - failed_attempt    → -5
 *   - low_accuracy_gps  → -5
 *   - outside_window    → -5
 *   - clean event       → +1 (capped at 100)
 *
 * Lockouts:
 *   - 3 failed attempts within 10 minutes → 15-minute lockout
 *   - trust < 20 → hard-locked, manager must approve to reset
 *   - trust < 50 → soft-flag, every event requires manager review
 *
 * Time rules:
 *   - Min 5 minutes between clock-in and clock-out
 *   - Max 16 hours of "open" clock-in (auto-flagged)
 *   - Clock-in / clock-out time windows enforced if configured at company level
 */

const MAX_HUMAN_SPEED_KMH         = 200;   // realistic ground/air travel ceiling
const MAX_GPS_ACCURACY_METERS     = 100;   // reject readings worse than this
const MIN_GPS_ACCURACY_METERS     = 1;     // anything tighter than this is likely faked
const MIN_CLOCK_OUT_INTERVAL_MS   = 5 * 60 * 1000;        //  5 minutes
const MAX_CLOCK_OPEN_DURATION_MS  = 16 * 60 * 60 * 1000;  // 16 hours
const FAILED_ATTEMPT_WINDOW_MS    = 10 * 60 * 1000;       // 10 minutes
const FAILED_ATTEMPT_THRESHOLD    = 3;
const LOCKOUT_DURATION_MS         = 15 * 60 * 1000;       // 15 minutes
const HARD_LOCK_TRUST             = 20;
const REVIEW_TRUST                = 50;

const PENALTIES = Object.freeze({
  mock_gps:          -20,
  vpn:               -15,
  impossible_move:   -25,
  failed_attempt:     -5,
  low_accuracy_gps:   -5,
  outside_window:     -5,
});

// Parse "HH:MM" → minutes-since-midnight. Returns null if invalid.
function parseHhmm(hhmm) {
  if (typeof hhmm !== "string") return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mn = +m[2];
  if (h < 0 || h > 23 || mn < 0 || mn > 59) return null;
  return h * 60 + mn;
}

/**
 * Check if `now` falls inside a [start, end] window. End may wrap past midnight
 * (e.g. clockOutStart=22:00, clockOutEnd=02:00).
 * Returns null if window is not configured (start or end missing).
 */
function isWithinWindow(now, startStr, endStr) {
  const start = parseHhmm(startStr);
  const end   = parseHhmm(endStr);
  if (start == null || end == null) return null;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end;   // wraps past midnight
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function extractClientIp(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const raw = fwd || req.headers["x-real-ip"] || req.ip || "";
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function isLocalIp(ip) {
  return ip === "127.0.0.1" || ip === "::1" || ip === "" || ip == null || ip.startsWith("192.168.") || ip.startsWith("10.");
}

function detectProxy(req) {
  if (req.headers["via"] || req.headers["proxy-connection"]) return true;
  // Multiple hops in x-forwarded-for beyond what the server's own proxy adds
  const fwd = (req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean);
  return fwd.length > 1;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) return null;
  const R = 6371000;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Detect mock-location indicators based on accuracy.
 *   - accuracy === 0 or undeclared on a real device is unusual
 *   - accuracy < 1 is suspicious
 *   - accuracy > MAX_GPS_ACCURACY_METERS is rejected separately (low_accuracy_gps)
 */
function detectMockLocation({ latitude, longitude, accuracy }) {
  if (latitude == null || longitude == null) return false;
  if (accuracy == null) return true;            // no accuracy field → suspicious
  if (accuracy < MIN_GPS_ACCURACY_METERS) return true;  // too perfect
  // exact integer lat/lng to several decimals is a giveaway in some emulators
  const fracLat = Math.abs(latitude  - Math.trunc(latitude));
  const fracLng = Math.abs(longitude - Math.trunc(longitude));
  if (fracLat === 0 && fracLng === 0) return true;
  return false;
}

/**
 * Check movement plausibility against the user's last known location.
 * Returns { possible, speedKmh, distanceMeters }.
 */
function checkMovement(lastEvent, current) {
  if (!lastEvent || !lastEvent.at || lastEvent.latitude == null || current.latitude == null) {
    return { possible: true, speedKmh: null, distanceMeters: null };
  }
  const distanceMeters = haversineMeters(lastEvent.latitude, lastEvent.longitude, current.latitude, current.longitude);
  if (distanceMeters == null) return { possible: true, speedKmh: null, distanceMeters: null };
  const elapsedSec = Math.max(1, (Date.now() - new Date(lastEvent.at).getTime()) / 1000);
  const speedKmh   = (distanceMeters / 1000) / (elapsedSec / 3600);
  return {
    possible: speedKmh <= MAX_HUMAN_SPEED_KMH,
    speedKmh: Math.round(speedKmh * 10) / 10,
    distanceMeters: Math.round(distanceMeters),
  };
}

/**
 * Validate a clock event with all anti-cheat rules. Pure function — does NOT mutate the user.
 *
 * `eventType` is "clock_in" or "clock_out" — used to enforce time windows.
 *
 * Returns:
 *   {
 *     ok, blocked, reason, message, flags, trustDelta, verified,
 *     mockLocationFlag, impossibleMovement, movementSpeedKmh,
 *     distanceFromOfficeMeters, clientIp
 *   }
 */
function evaluateAttempt({ req, user, body, settings, lastEvent, eventType = "clock_in" }) {
  const flags = [];
  let blocked = false;
  let reason  = null;
  let message = null;

  const clientIp  = extractClientIp(req);
  const ipIsLocal = isLocalIp(clientIp);
  const { latitude, longitude, accuracy } = body || {};

  // Lockout check (hard fail)
  if (user.attendanceLockoutUntil && new Date(user.attendanceLockoutUntil) > new Date()) {
    return {
      ok: false, blocked: true, reason: "locked_out",
      message: `Locked out until ${new Date(user.attendanceLockoutUntil).toLocaleTimeString()} due to repeated failures.`,
      flags: ["locked_out"], trustDelta: 0, verified: false,
    };
  }

  // Hard trust-score lockout
  if ((user.attendanceTrustScore ?? 100) < HARD_LOCK_TRUST) {
    return {
      ok: false, blocked: true, reason: "trust_too_low",
      message: `Your trust score is too low (${user.attendanceTrustScore}). Contact your manager.`,
      flags: ["trust_too_low"], trustDelta: 0, verified: false,
    };
  }

  // 1. Time window (only if configured for the relevant event)
  const now = new Date();
  const startKey = eventType === "clock_out" ? "clockOutStart" : "clockInStart";
  const endKey   = eventType === "clock_out" ? "clockOutEnd"   : "clockInEnd";
  const within   = isWithinWindow(now, settings?.[startKey], settings?.[endKey]);
  if (within === false) {
    flags.push("outside_window");
    blocked = true; reason = "outside_window";
    message = `${eventType === "clock_out" ? "Clock-out" : "Clock-in"} is only allowed between ${settings[startKey]} and ${settings[endKey]}.`;
  }

  // 2. VPN / proxy
  if (!blocked && !ipIsLocal && detectProxy(req)) {
    flags.push("vpn");
    blocked = true; reason = "vpn_detected";
    message = "VPN or proxy detected. Disable it and try again.";
  }

  // 3. Strict WiFi (only if configured)
  const allowed = settings?.allowedWifiIPs || [];
  if (!blocked && settings?.strictAttendance && allowed.length > 0 && !ipIsLocal && !allowed.includes(clientIp)) {
    flags.push("wifi_mismatch");
    blocked = true; reason = "wifi_mismatch";
    message = "You must be on company WiFi to clock in.";
  }

  // 4. GPS required (always-on, strict)
  if (!blocked) {
    if (latitude == null || longitude == null) {
      flags.push("location_missing");
      blocked = true; reason = "location_missing";
      message = "GPS location is required. Enable location and try again.";
    } else if (accuracy == null || accuracy > MAX_GPS_ACCURACY_METERS) {
      flags.push("low_accuracy_gps");
      blocked = true; reason = "low_accuracy_gps";
      message = `GPS accuracy is too poor (${accuracy ?? "unknown"}m). Move to an open area.`;
    } else if (detectMockLocation({ latitude, longitude, accuracy })) {
      flags.push("mock_gps");
      blocked = true; reason = "mock_location";
      message = "Mock or fake GPS detected.";
    }
  }

  // 5. Geofence (only if configured)
  if (!blocked && settings?.officeLatitude != null && settings?.officeLongitude != null) {
    const dist = haversineMeters(settings.officeLatitude, settings.officeLongitude, latitude, longitude);
    const radius = settings.geofenceRadiusMeters || 150;
    if (dist != null && dist > radius) {
      flags.push("outside_geofence");
      blocked = true; reason = "outside_geofence";
      message = `You are ${Math.round(dist)}m away from the office (limit: ${radius}m).`;
    }
  }

  // 6. Impossible movement (against this user's last clock event)
  const movement = checkMovement(lastEvent, { latitude, longitude });
  if (!blocked && !movement.possible) {
    flags.push("impossible_move");
    blocked = true; reason = "impossible_movement";
    message = `Impossible movement detected (${movement.speedKmh} km/h since last event).`;
  }

  // ── Compute trust delta ────────────────────────────────────────────────────
  let trustDelta = 0;
  for (const f of flags) {
    if (PENALTIES[f] != null) trustDelta += PENALTIES[f];
  }
  if (!blocked && flags.length === 0) trustDelta = +1;

  return {
    ok: !blocked,
    blocked,
    reason,
    message,
    flags,
    trustDelta,
    verified: !blocked,
    mockLocationFlag:   flags.includes("mock_gps"),
    impossibleMovement: flags.includes("impossible_move"),
    movementSpeedKmh:   movement.speedKmh,
    distanceFromOfficeMeters: settings?.officeLatitude != null
      ? haversineMeters(settings.officeLatitude, settings.officeLongitude, latitude, longitude)
      : null,
    clientIp,
  };
}

/**
 * Apply trust-score change + lockout decisions to user. Mutates the user document.
 * Caller must save() afterwards.
 */
async function applyTrustOutcome(user, evalResult, currentLocation) {
  const before = user.attendanceTrustScore ?? 100;
  let after = before + (evalResult.trustDelta || 0);
  after = Math.max(0, Math.min(100, after));
  user.attendanceTrustScore = after;

  // Failed attempt tracking + lockout
  if (evalResult.blocked) {
    const cutoff = new Date(Date.now() - FAILED_ATTEMPT_WINDOW_MS);
    user.attendanceFailedAttempts = (user.attendanceFailedAttempts || []).filter(a => a.at >= cutoff);
    user.attendanceFailedAttempts.push({
      at:     new Date(),
      reason: evalResult.reason || "unknown",
      ip:     evalResult.clientIp || null,
    });
    if (user.attendanceFailedAttempts.length >= FAILED_ATTEMPT_THRESHOLD) {
      user.attendanceLockoutUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
      user.attendanceFailedAttempts = [];  // reset after lockout
    }
  } else {
    // Clean event — clear failure history, register/refresh device, save last location
    user.attendanceFailedAttempts = [];
    user.attendanceLockoutUntil = null;

    if (currentLocation && currentLocation.latitude != null) {
      user.lastClockEvent = {
        latitude:  currentLocation.latitude,
        longitude: currentLocation.longitude,
        at:        new Date(),
      };
    }
  }
  return { before, after };
}

module.exports = {
  evaluateAttempt,
  applyTrustOutcome,
  extractClientIp,
  haversineMeters,
  parseHhmm,
  isWithinWindow,
  PENALTIES,
  MAX_HUMAN_SPEED_KMH,
  MAX_GPS_ACCURACY_METERS,
  MIN_CLOCK_OUT_INTERVAL_MS,
  MAX_CLOCK_OPEN_DURATION_MS,
  HARD_LOCK_TRUST,
  REVIEW_TRUST,
};

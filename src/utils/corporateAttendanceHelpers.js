"use strict";

/**
 * Shared date/shift math for corporate clock-in/out, used by both the web
 * route (routes/corporateAttendance.js) and the USSD controller
 * (controllers/ussdController.js) so the two channels can never drift on
 * what "late" or "within the clock window" means.
 */

/**
 * Normalize a date to midnight UTC (start of day).
 */
function toDay(raw) {
  const d = raw instanceof Date ? new Date(raw) : new Date(raw || Date.now());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Compute hours worked between two Date objects.
 */
function hoursWorked(clockInTime, clockOutTime) {
  if (!clockInTime || !clockOutTime) return null;
  const ms = new Date(clockOutTime) - new Date(clockInTime);
  return Math.max(0, Math.round((ms / 3_600_000) * 100) / 100); // 2 decimal places
}

/**
 * Check `at` falls inside an "HH:MM"–"HH:MM" window. End may wrap past
 * midnight (e.g. 22:00–02:00 for night shifts). Returns true (unrestricted)
 * if either bound is unset or malformed.
 *
 * Only consulted when corporateSettings.enforceClockWindows is true — the
 * windows are an OPTIONAL hard block, off by default, because a fixed
 * window inherently also blocks overtime clock-outs. Off, out-of-hours
 * events are simply labeled (late/overtime/early badges + optional note).
 */
function withinClockWindow(at, startHHMM, endHHMM) {
  const parse = (s) => {
    const m = typeof s === "string" && s.match(/^(\d{1,2}):(\d{2})$/);
    if (!m || +m[1] > 23 || +m[2] > 59) return null;
    return +m[1] * 60 + +m[2];
  };
  const start = parse(startHHMM), end = parse(endHHMM);
  if (start == null || end == null) return true;
  const cur = at.getHours() * 60 + at.getMinutes();
  if (start <= end) return cur >= start && cur <= end;
  return cur >= start || cur <= end; // wraps past midnight
}

module.exports = { toDay, hoursWorked, withinClockWindow };

"use strict";

/**
 * USSD clock-in/out for corporate employees on feature phones (no app, no
 * internet, no GPS). Built against the Arkesel USSD contract — the same
 * request/response shape used by most African USSD aggregators (Africa's
 * Talking, etc.):
 *
 *   Request (POST, JSON):  { sessionId, serviceCode, phoneNumber, text, type }
 *     - phoneNumber comes from the telecom network's own signaling (like
 *       Caller ID) — it isn't attacker-editable the way a web form field
 *       would be, so it's a meaningfully strong identity signal on its own.
 *     - text accumulates every input this session, joined with "*"
 *       (e.g. "1*1234" = picked menu option 1, then typed "1234"). Empty on
 *       the first request. This lets the whole handler be stateless: every
 *       request re-derives where the caller is in the menu from `text`
 *       alone, no server-side session storage needed.
 *
 *   Response (plain text): "CON <text>" to show another screen and wait for
 *     more input, or "END <text>" to end the session.
 *
 * No GPS/WiFi verification is possible over USSD, so this does NOT go
 * through evaluateAttempt()/applyTrustOutcome() (attendanceAntiCheat.js) —
 * that pipeline hard-blocks on missing GPS by design for the web/app flow.
 * Identity here is phone number (network-verified) + a 4-digit PIN
 * (attendancePin, set via POST /api/auth/attendance-pin) as the second
 * factor. If a company has corporateSettings.strictAttendance on, USSD
 * clock-in is refused outright rather than silently bypassing a control
 * the admin explicitly turned on.
 */

const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Company = require("../models/Company");
const CorporateAttendance = require("../models/CorporateAttendance");
const ShiftAssignment = require("../models/ShiftAssignment");
const LeaveBalance = require("../models/LeaveBalance");
const { normalisePhone } = require("../services/smsService");
const { toDay, hoursWorked, withinClockWindow } = require("../utils/corporateAttendanceHelpers");
const { MIN_CLOCK_OUT_INTERVAL_MS } = require("../utils/attendanceAntiCheat");
const { invalidateCache } = require("../services/cacheService");

const MAX_PIN_ATTEMPTS = 2; // within one USSD session

function parseTrail(text) {
  return String(text || "").split("*").filter((p) => p !== "");
}

function fmtTime(d) {
  return new Date(d).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const WELCOME_MENU =
  "CON Welcome to Dikly\n1. Clock In\n2. Clock Out\n3. Leave Balance\n4. Today's Status";

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------
exports.handleUssdCallback = async (req, res) => {
  res.type("text/plain");
  try {
    const { phoneNumber, text, type } = req.body || {};
    if (!phoneNumber) return res.send("END Invalid request.");

    const normPhone = normalisePhone(phoneNumber);

    // Phone numbers are only guaranteed unique within a company (see
    // registerEmployee), so the same SIM could in theory be registered at
    // more than one corporate employer. USSD has no clean way to let the
    // caller disambiguate mid-menu, so this picks the first active
    // corporate match. A real SIM shared across employers is rare enough
    // that this is an accepted, explicit limitation, not a silent bug.
    const employee = await User.findOne({ phone: normPhone, role: "employee", isActive: true })
      .populate("company", "mode corporateSettings");

    if (!employee || employee.company?.mode !== "corporate") {
      return res.send("END This phone number is not registered with Dikly. Contact your employer.");
    }
    if (employee.isLocked) {
      return res.send("END Your account is locked. Contact your admin.");
    }

    const parts = parseTrail(text);

    if (parts.length === 0) {
      return res.send(WELCOME_MENU);
    }

    const choice = parts[0];

    if (choice === "3") return await handleLeaveBalance(employee, res);
    if (choice === "4") return await handleTodayStatus(employee, res);
    if (choice === "1" || choice === "2") {
      return await handleClockAction(employee, choice === "1" ? "in" : "out", parts.slice(1), res);
    }

    return res.send("END Invalid option.");
  } catch (e) {
    console.error("[USSD] callback error:", e);
    return res.send("END Something went wrong. Please try again later.");
  }
};

// ---------------------------------------------------------------------------
// Clock in / out — PIN-gated
// ---------------------------------------------------------------------------
async function handleClockAction(employee, action, pinAttempts, res) {
  const user = await User.findById(employee._id).select("+attendancePin");
  if (!user.attendancePin) {
    return res.send(
      "END Set a 4-digit attendance PIN in the Dikly app first (Profile > Attendance PIN), then try again."
    );
  }

  if (pinAttempts.length === 0) {
    return res.send(`CON Enter your 4-digit PIN to clock ${action}:`);
  }

  const latestPin = pinAttempts[pinAttempts.length - 1];
  const validFormat = /^\d{4}$/.test(latestPin);
  const match = validFormat && (await bcrypt.compare(latestPin, user.attendancePin));

  if (!match) {
    if (pinAttempts.length >= MAX_PIN_ATTEMPTS) {
      return res.send(`END Incorrect PIN. Clock-${action} cancelled.`);
    }
    return res.send(`CON Incorrect PIN. Enter your 4-digit PIN to clock ${action}:`);
  }

  return action === "in" ? await performClockIn(user, res) : await performClockOut(user, res);
}

// ---------------------------------------------------------------------------
// Clock-in — mirrors POST /api/corporate-attendance/clock-in's business
// rules (double clock-in guard, stale-open-shift guard, clock-window,
// shift-based lateness), minus everything that depends on GPS.
// ---------------------------------------------------------------------------
async function performClockIn(user, res) {
  const now = new Date();
  const today = toDay(now);

  const company = await Company.findById(user.company).select("corporateSettings").lean();
  const settings = company?.corporateSettings || {};

  if (settings.strictAttendance) {
    return res.send(
      "END Strict attendance (GPS/WiFi) is required at your company. Please clock in from the Dikly app or web instead."
    );
  }

  const existingToday = await CorporateAttendance.findOne({
    company: user.company, employee: user._id, date: today,
  });
  if (existingToday?.clockIn?.time && !existingToday?.clockOut?.time) {
    return res.send("END Already clocked in. Clock out first.");
  }

  const staleOpen = await CorporateAttendance.findOne({
    company: user.company, employee: user._id, date: { $lt: today },
    "clockIn.time": { $ne: null }, "clockOut.time": null,
  }).sort({ date: -1 }).select("date").lean();
  if (staleOpen) {
    return res.send(
      "END You have an unclosed clock-in from a previous day. Contact your admin before clocking in again."
    );
  }

  if (settings.enforceClockWindows && !withinClockWindow(now, settings.clockInStart, settings.clockInEnd)) {
    return res.send(`END Clock-in is only allowed between ${settings.clockInStart} and ${settings.clockInEnd}.`);
  }

  const assignment = await ShiftAssignment.findOne({
    company: user.company, employee: user._id, isActive: true,
  }).populate("shift");
  const shift = assignment?.shift || null;

  let lateMinutes = 0, isLate = false;
  if (shift) {
    const [sh, sm] = shift.startTime.split(":").map(Number);
    const shiftStart = new Date(now);
    shiftStart.setHours(sh, sm, 0, 0);
    const gracePeriod = (shift.gracePeriodMinutes || 15) * 60_000;
    const diff = now - shiftStart;
    if (diff > gracePeriod) { isLate = true; lateMinutes = Math.floor(diff / 60_000); }
  }

  await CorporateAttendance.findOneAndUpdate(
    { company: user.company, employee: user._id, date: today },
    {
      $setOnInsert: { company: user.company, employee: user._id, date: today, shift: shift ? shift._id : null },
      $set: {
        "clockIn.time":        now,
        "clockIn.method":      "ussd",
        "clockIn.isLate":      isLate,
        "clockIn.lateMinutes": lateMinutes,
        "clockIn.verified":    true,
        lateMinutes,
        status: isLate ? "late" : "present",
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  );

  invalidateCache(`dash:employee:${user.company}:${user._id}`);

  return res.send(
    isLate
      ? `END Clocked in (${lateMinutes}m late) at ${fmtTime(now)}.`
      : `END Clocked in successfully at ${fmtTime(now)}.`
  );
}

// ---------------------------------------------------------------------------
// Clock-out — mirrors POST /api/corporate-attendance/clock-out's business
// rules (min-interval guard, clock-window, worked/overtime/early-leave),
// minus everything that depends on GPS.
// ---------------------------------------------------------------------------
async function performClockOut(user, res) {
  const now = new Date();
  const today = toDay(now);

  const existing = await CorporateAttendance.findOne({
    company: user.company, employee: user._id, date: today,
  }).populate("shift");

  if (!existing || !existing.clockIn?.time) {
    return res.send("END No clock-in record found for today.");
  }
  if (existing.clockOut?.time) {
    return res.send("END Already clocked out today.");
  }

  const elapsedMs = now - new Date(existing.clockIn.time);
  if (elapsedMs < MIN_CLOCK_OUT_INTERVAL_MS) {
    const remaining = Math.ceil((MIN_CLOCK_OUT_INTERVAL_MS - elapsedMs) / 1000);
    return res.send(`END Too soon to clock out. Wait ${remaining}s.`);
  }

  const company = await Company.findById(user.company).select("corporateSettings").lean();
  const settings = company?.corporateSettings || {};
  if (settings.enforceClockWindows && !withinClockWindow(now, settings.clockOutStart, settings.clockOutEnd)) {
    return res.send(`END Clock-out is only allowed between ${settings.clockOutStart} and ${settings.clockOutEnd}.`);
  }

  const worked = hoursWorked(existing.clockIn.time, now);
  const shift = existing.shift;

  let earlyLeaveMinutes = 0;
  if (shift) {
    const [eh, em] = shift.endTime.split(":").map(Number);
    const shiftEnd = new Date(now);
    shiftEnd.setHours(eh, em, 0, 0);
    const diff = shiftEnd - now;
    if (diff > 0) earlyLeaveMinutes = Math.floor(diff / 60_000);
  }

  let overtimeHours = 0;
  if (shift && worked != null) {
    const [sh, sm] = shift.startTime.split(":").map(Number);
    const [eh, em] = shift.endTime.split(":").map(Number);
    const scheduledHours = (eh * 60 + em - sh * 60 - sm) / 60;
    if (worked > scheduledHours) overtimeHours = Math.round((worked - scheduledHours) * 100) / 100;
  }

  let finalStatus = existing.status;
  if (worked != null && worked < 4 && finalStatus !== "on_leave") finalStatus = "half_day";

  await CorporateAttendance.findByIdAndUpdate(existing._id, {
    $set: {
      "clockOut.time":              now,
      "clockOut.method":            "ussd",
      "clockOut.earlyLeaveMinutes": earlyLeaveMinutes,
      "clockOut.verified":          true,
      hoursWorked: worked,
      overtimeHours,
      earlyLeaveMinutes,
      status: finalStatus,
    },
  });

  invalidateCache(`dash:employee:${user.company}:${user._id}`);

  return res.send(
    overtimeHours > 0
      ? `END Clocked out. Worked ${worked}h (+${overtimeHours}h overtime).`
      : `END Clocked out. Worked ${worked}h today.`
  );
}

// ---------------------------------------------------------------------------
// Read-only checks — no PIN required
// ---------------------------------------------------------------------------
async function handleLeaveBalance(employee, res) {
  const year = new Date().getFullYear();
  const balances = await LeaveBalance.find({ company: employee.company, employee: employee._id, year })
    .populate("policy", "name")
    .limit(3)
    .lean();

  if (!balances.length) {
    return res.send("END No leave balance on file yet. Contact your admin.");
  }

  const lines = balances.map((b) => {
    const remaining = b.entitlement + b.carryover + b.adjustments - b.used - b.pending;
    return `${b.policy?.name || "Leave"}: ${remaining}d left`;
  });
  return res.send("END " + lines.join("\n"));
}

async function handleTodayStatus(employee, res) {
  const today = toDay(new Date());
  const record = await CorporateAttendance.findOne({
    company: employee.company, employee: employee._id, date: today,
  }).lean();

  if (!record?.clockIn?.time) {
    return res.send("END Not clocked in today.");
  }
  if (!record.clockOut?.time) {
    return res.send(`END Clocked in at ${fmtTime(record.clockIn.time)}. Not yet clocked out.`);
  }
  return res.send(
    `END In: ${fmtTime(record.clockIn.time)}  Out: ${fmtTime(record.clockOut.time)}  Worked: ${record.hoursWorked || 0}h`
  );
}

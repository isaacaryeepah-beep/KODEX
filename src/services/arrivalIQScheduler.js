"use strict";

/**
 * arrivalIQScheduler.js
 *
 * Runs every 5 minutes. For each corporate company with ArrivalIQ enabled,
 * finds employees who have granted both location + notification consent
 * and have a shift starting within the next ~2 hours today, computes
 * today's ArrivalPrediction from their last (foreground-captured, non-
 * stale) location via trafficService, and fires the personalized "time to
 * leave" push the moment each employee's own recommended departure time
 * arrives. If no fresh location exists yet (the employee hasn't opened the
 * app today), a one-time "open Dikly" nudge push is sent instead the first
 * time their shift enters the lookahead window — otherwise an employee who
 * never opens the app before their shift would get no reminder at all. A
 * second pass sends a one-time late-risk follow-up to anyone who was
 * warned, is now past their shift start, and still hasn't clocked in
 * (reusing the existing CorporateAttendance record — no new tracking).
 *
 * Time comparisons use the server's own local clock, the same convention
 * already used by computeStatus() in routes/corporateAttendance.js (no
 * per-company timezone conversion) — correct as long as the server's
 * local time matches the company's, which every existing corporate-
 * attendance time comparison in this codebase already assumes.
 */

const cron = require("node-cron");
const Company = require("../models/Company");
const User = require("../models/User");
const ShiftAssignment = require("../models/ShiftAssignment");
const CorporateAttendance = require("../models/CorporateAttendance");
const ArrivalPrediction = require("../models/ArrivalPrediction");
const trafficService = require("./traffic/trafficService");
const pushService = require("./push/pushService");

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LOCATION_STALE_MS = 6 * 60 * 60 * 1000;   // ignore location readings older than this
const LOOKAHEAD_MS = 2 * 60 * 60 * 1000;        // only plan for shifts starting within 2h
const LATE_RISK_WINDOW_MS = 45 * 60 * 1000;     // late-risk check stays actionable this long past shift start

function todayKey(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function attendanceDayUTC(d = new Date()) {
  const day = new Date(d);
  day.setUTCHours(0, 0, 0, 0);
  return day;
}

function shiftStartToday(startTimeHHMM, base = new Date()) {
  const [h, m] = startTimeHHMM.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function formatClock(date) {
  if (!date) return "";
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

async function sweep() {
  let companies;
  try {
    companies = await Company.find({ mode: "corporate", "arrivalIQ.enabled": true })
      .select("arrivalIQ corporateSettings.officeLatitude corporateSettings.officeLongitude")
      .lean();
  } catch (err) {
    console.error("[ArrivalIQ] Sweep query failed:", err.message);
    return;
  }
  if (!companies.length) return;

  for (const company of companies) {
    await sweepCompany(company).catch((err) => {
      console.error(`[ArrivalIQ] Sweep failed for company ${company._id}:`, err.message);
    });
  }
}

async function sweepCompany(company) {
  const office = {
    lat: company.corporateSettings?.officeLatitude,
    lng: company.corporateSettings?.officeLongitude,
  };
  if (!office.lat || !office.lng) return; // nothing to compute travel time to yet

  const now = new Date();
  const dayName = DAY_NAMES[now.getDay()];
  const dateKey = todayKey(now);
  const bufferMs = (company.arrivalIQ?.bufferMinutes ?? 10) * 60 * 1000;

  const employees = await User.find({
    company: company._id,
    role: { $in: ["employee", "manager"] },
    isActive: true,
    "arrivalIQConsent.locationGranted": true,
    "arrivalIQConsent.notificationGranted": true,
  }).select("name arrivalIQLocation").lean();
  if (!employees.length) return;

  const employeeIds = employees.map((e) => e._id);
  const assignments = await ShiftAssignment.find({ employee: { $in: employeeIds }, isActive: true })
    .populate("shift")
    .lean();
  const shiftByEmployee = new Map();
  for (const a of assignments) {
    if (a.shift && a.shift.isActive !== false && (a.shift.days || []).includes(dayName)) {
      shiftByEmployee.set(a.employee.toString(), a.shift);
    }
  }

  for (const employee of employees) {
    const shift = shiftByEmployee.get(employee._id.toString());
    if (!shift) continue;

    const shiftStart = shiftStartToday(shift.startTime, now);
    const msUntilShift = shiftStart - now;
    // Outside the planning window — too far in the future, or long past.
    if (msUntilShift > LOOKAHEAD_MS || msUntilShift < -LATE_RISK_WINDOW_MS) continue;

    let prediction = await ArrivalPrediction.findOne({ company: company._id, user: employee._id, date: dateKey });
    if (!prediction) {
      prediction = new ArrivalPrediction({
        company: company._id,
        user: employee._id,
        date: dateKey,
        shift: shift._id,
        shiftStartTime: shift.startTime,
      });
    }
    if (prediction.departureNotifiedAt) continue; // already handled today

    const loc = employee.arrivalIQLocation;
    const locationFresh = !!(loc?.capturedAt && (now - new Date(loc.capturedAt)) < LOCATION_STALE_MS);

    if (locationFresh) {
      try {
        const est = await trafficService.getTravelTime({
          origin: { lat: loc.lat, lng: loc.lng },
          destination: office,
          departureTime: now,
        });
        prediction.travelMinutes = est.durationMinutes;
        prediction.travelMinutesInTraffic = est.durationInTrafficMinutes;
        prediction.distanceMeters = est.distanceMeters;
        prediction.trafficLevel = est.trafficLevel;
        prediction.recommendedDepartureAt = new Date(shiftStart.getTime() - est.durationInTrafficMinutes * 60000 - bufferMs);
        prediction.estimatedArrivalAt = new Date(prediction.recommendedDepartureAt.getTime() + est.durationInTrafficMinutes * 60000);
        prediction.skipReason = null;
      } catch (err) {
        prediction.skipReason = "traffic_lookup_failed";
        console.error(`[ArrivalIQ] Travel time failed for user ${employee._id}:`, err.message);
      }
    } else {
      prediction.skipReason = "no_recent_location";
      // Without a fresh location there's nothing to compute a departure
      // time from, so the employee would otherwise get no reminder at all
      // today. Nudge them once to open the app — the resulting foreground
      // check-in (app.js's _aiqMaybeCheckIn) feeds the next sweep, up to
      // ~2h of lead time before this shift.
      if (!prediction.checkInPromptedAt) {
        prediction.checkInPromptedAt = now;
        await pushService.sendToUser(employee._id, {
          title: "🚗 ArrivalIQ",
          body: `Open Dikly now so we can plan your commute for your ${shift.startTime} shift.`,
          url: "/?view=arrival-iq",
          tag: "arrivaliq-checkin",
        });
      }
    }

    // Fire the personalized "time to leave" push once we've reached it.
    if (prediction.recommendedDepartureAt && now >= prediction.recommendedDepartureAt) {
      prediction.status = "on_time";
      prediction.departureNotifiedAt = now;
      await pushService.sendToUser(employee._id, {
        // No hardcoded platform name — pushService brands the notification
        // with the employing company's name/logo when no icon is given, and
        // the title keeps just the feature name.
        title: "🚗 ArrivalIQ",
        body: `Time to leave for your ${shift.startTime} shift — ~${prediction.travelMinutesInTraffic} min drive (${prediction.trafficLevel} traffic). Estimated arrival ${formatClock(prediction.estimatedArrivalAt)}.`,
        url: "/?view=arrival-iq",
        tag: "arrivaliq-departure",
      });
    }

    await prediction.save();
  }

  await sweepLateRisk(company, dateKey, now);
}

async function sweepLateRisk(company, dateKey, now) {
  const predictions = await ArrivalPrediction.find({
    company: company._id,
    date: dateKey,
    departureNotifiedAt: { $ne: null },
    lateRiskNotifiedAt: null,
  }).lean();
  if (!predictions.length) return;

  for (const p of predictions) {
    const shiftStart = shiftStartToday(p.shiftStartTime, now);
    if (now < shiftStart || now - shiftStart > LATE_RISK_WINDOW_MS) continue;

    const clockedIn = await CorporateAttendance.exists({
      employee: p.user,
      company: company._id,
      date: attendanceDayUTC(now),
      "clockIn.time": { $ne: null },
    });
    if (clockedIn) continue;

    await pushService.sendToUser(p.user, {
      title: "🚗 ArrivalIQ",
      body: `You may arrive late for your ${p.shiftStartTime} shift.`,
      url: "/?view=arrival-iq",
      tag: "arrivaliq-late-risk",
    });
    await ArrivalPrediction.updateOne(
      { _id: p._id },
      { $set: { lateRiskNotifiedAt: now, status: "likely_late" } }
    );
  }
}

function start() {
  cron.schedule("*/5 * * * *", sweep);
  console.log("[ArrivalIQ] Sweep job scheduled (every 5 min)");
}

module.exports = { start, sweep, todayKey };

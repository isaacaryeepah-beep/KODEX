"use strict";

/**
 * timetableReminder.js
 *
 * Runs every 5 minutes via node-cron. Each run targets classes starting
 * 28–32 minutes from now (inclusive, whole minutes). Five minute-values
 * per run × a run every 5 minutes tiles the hour exactly, so EVERY start
 * minute gets covered by exactly one run — a class at 9:15 fires at 8:45,
 * one at 9:00 fires at 8:30, with no duplicates between runs.
 *
 * (The previous 30-minute cadence with the same window only ever covered
 * classes starting at :28–:32 / :58–:02 — anything else never got a
 * reminder.)
 */

const cron      = require("node-cron");
const Timetable = require("../models/Timetable");
const Course    = require("../models/Course");
const notif     = require("./notificationService");

const CRON_EXPR = "*/5 * * * *";
const LEAD_LO_MIN = 28;
const LEAD_HI_MIN = 32; // inclusive — (32 - 28 + 1) minute values = the 5-min cadence

function _pad(n) { return String(n).padStart(2, "0"); }

/**
 * Mongo filter for slots whose startTime falls in [now+28m, now+32m].
 * When the window crosses midnight it splits into a late-today range and
 * an early-tomorrow range (with tomorrow's dayOfWeek) — a plain
 * $gte/$lte with loStr > hiStr would match nothing and 00:0x classes
 * would silently never get a reminder.
 */
function buildSlotFilter(now) {
  const lo    = new Date(now.getTime() + LEAD_LO_MIN * 60 * 1000);
  const hi    = new Date(now.getTime() + LEAD_HI_MIN * 60 * 1000);
  const loStr = `${_pad(lo.getHours())}:${_pad(lo.getMinutes())}`;
  const hiStr = `${_pad(hi.getHours())}:${_pad(hi.getMinutes())}`;
  // The window's day comes from lo/hi themselves, not from `now` — a run
  // at 23:35 has its whole window on the NEXT day, and a run at 23:30
  // straddles both. String comparison alone can't tell 23:35's case apart
  // from a normal window, so compare calendar days.
  const loDay = lo.getDay();
  const hiDay = hi.getDay();

  if (loDay !== hiDay) {
    return {
      isActive: true,
      $or: [
        { dayOfWeek: loDay, startTime: { $gte: loStr, $lte: "23:59" } },
        { dayOfWeek: hiDay, startTime: { $gte: "00:00", $lte: hiStr } },
      ],
    };
  }
  return { isActive: true, dayOfWeek: loDay, startTime: { $gte: loStr, $lte: hiStr } };
}

async function sendClassReminders() {
  try {
    const slots = await Timetable.find(buildSlotFilter(new Date())).lean();
    if (!slots.length) return;

    for (const slot of slots) {
      const course = await Course.findById(slot.course)
        .select("enrolledStudents")
        .lean();

      const studentIds = (course?.enrolledStudents || []).map(id => id.toString());
      await notif.notifyClassStartingSoon(slot, studentIds);

      console.log(
        `[TimetableReminder] "${slot.title || 'Class'}" at ${slot.startTime} — ` +
        `notified ${studentIds.length} student(s) + lecturer`
      );
    }
  } catch (err) {
    console.error("[TimetableReminder] Error:", err.message);
  }
}

function startTimetableReminder() {
  cron.schedule(CRON_EXPR, sendClassReminders, { timezone: "UTC" });
  console.log("[TimetableReminder] Class reminder cron scheduled (every 5 min)");
}

module.exports = { startTimetableReminder, sendClassReminders, buildSlotFilter, CRON_EXPR, LEAD_LO_MIN, LEAD_HI_MIN };

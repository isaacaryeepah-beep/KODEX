"use strict";

/**
 * timetableReminder.js
 *
 * Runs every 30 minutes via node-cron.
 * Finds timetable slots whose startTime falls in the 28–32 minute window
 * from now on the current day of week, then notifies enrolled students
 * and the lecturer.
 *
 * The ±2 min window around the 30-min mark means each slot triggers at
 * most once per occurrence regardless of scheduling jitter.
 */

const cron      = require("node-cron");
const Timetable = require("../models/Timetable");
const Course    = require("../models/Course");
const notif     = require("./notificationService");

function _pad(n) { return String(n).padStart(2, "0"); }

async function sendClassReminders() {
  try {
    const now     = new Date();
    const day     = now.getDay(); // 0 = Sunday … 6 = Saturday

    // Target window: classes starting 28–32 minutes from now
    const loMin   = new Date(now.getTime() + 28 * 60 * 1000);
    const hiMin   = new Date(now.getTime() + 32 * 60 * 1000);
    const loStr   = `${_pad(loMin.getHours())}:${_pad(loMin.getMinutes())}`;
    const hiStr   = `${_pad(hiMin.getHours())}:${_pad(hiMin.getMinutes())}`;

    const slots = await Timetable.find({
      isActive:  true,
      dayOfWeek: day,
      startTime: { $gte: loStr, $lte: hiStr },
    }).lean();

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
  // Run at minute 0 and 30 of every hour
  cron.schedule("0,30 * * * *", sendClassReminders, { timezone: "UTC" });
  console.log("[TimetableReminder] Class reminder cron scheduled (every 30 min)");
}

module.exports = { startTimetableReminder, sendClassReminders };

"use strict";

/**
 * quizReminder.js
 *
 * Runs every 5 minutes via node-cron, alongside timetableReminder.
 * Each run targets a [now+28m, now+33m) window — exactly the 5-minute
 * cadence, so consecutive runs tile time continuously: every quiz edge
 * is caught by exactly one run, whatever minute it falls on. (The
 * previous 30-minute cadence with a 4-minute window missed any quiz
 * opening/closing outside :28–:32 / :58–:02.) Two independent sweeps:
 *
 *   - Opening soon: quizzes whose startTime falls in the window —
 *     notifies every enrolled student in the quiz's course.
 *   - Closing soon: quizzes whose endTime falls in the window AND
 *     have already opened — notifies enrolled students who have not yet
 *     attempted it (mirrors assignmentReminder's "skip submitted" logic).
 */

const cron    = require("node-cron");
const Quiz    = require("../models/Quiz");
const Course  = require("../models/Course");
const Attempt = require("../models/Attempt");
const notif   = require("./notificationService");

const CRON_EXPR = "*/5 * * * *";

// Half-open [lo, hi) spanning exactly the cron cadence — runs tile time
// continuously with no gap and no overlap.
function windowNow() {
  const now = new Date();
  return {
    now,
    lo: new Date(now.getTime() + 28 * 60 * 1000),
    hi: new Date(now.getTime() + 33 * 60 * 1000),
  };
}

async function sendOpeningReminders() {
  const { lo, hi } = windowNow();
  const quizzes = await Quiz.find({
    isActive:  true,
    startTime: { $gte: lo, $lt: hi },
  }).lean();

  for (const quiz of quizzes) {
    const course = await Course.findById(quiz.course).select("enrolledStudents").lean();
    const studentIds = (course?.enrolledStudents || []).map(id => id.toString());
    if (!studentIds.length) continue;
    await notif.notifyQuizOpeningSoon(quiz, studentIds);
    console.log(`[QuizReminder] "${quiz.title}" opens at ${quiz.startTime.toISOString()} — notified ${studentIds.length} student(s)`);
  }
}

async function sendClosingReminders() {
  const { now, lo, hi } = windowNow();
  const quizzes = await Quiz.find({
    isActive: true,
    endTime:  { $gte: lo, $lt: hi },
    startTime: { $lte: now },
  }).lean();

  for (const quiz of quizzes) {
    const course = await Course.findById(quiz.course).select("enrolledStudents").lean();
    const enrolledIds = (course?.enrolledStudents || []).map(id => id.toString());
    if (!enrolledIds.length) continue;

    const attempted = await Attempt.find({
      quiz:    quiz._id,
      student: { $in: enrolledIds },
    }).select("student").lean();
    const attemptedIds = new Set(attempted.map(a => a.student.toString()));
    const pending = enrolledIds.filter(id => !attemptedIds.has(id));
    if (!pending.length) continue;

    await notif.notifyQuizClosingSoon(quiz, pending);
    console.log(`[QuizReminder] "${quiz.title}" closes at ${quiz.endTime.toISOString()} — notified ${pending.length} pending student(s)`);
  }
}

async function sendQuizReminders() {
  try {
    await sendOpeningReminders();
    await sendClosingReminders();
  } catch (err) {
    console.error("[QuizReminder] Error:", err.message);
  }
}

function startQuizReminder() {
  // Same cadence as timetableReminder.
  cron.schedule(CRON_EXPR, sendQuizReminders, { timezone: "UTC" });
  console.log("[QuizReminder] Quiz opening/closing reminder cron scheduled (every 5 min)");
}

module.exports = { startQuizReminder, sendQuizReminders, windowNow, CRON_EXPR };

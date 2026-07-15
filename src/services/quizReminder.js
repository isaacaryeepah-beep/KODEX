"use strict";

/**
 * quizReminder.js
 *
 * Runs every 30 minutes via node-cron, alongside timetableReminder.
 * Two independent sweeps, each using the same ±2 min window trick as
 * timetableReminder so a quiz triggers at most once per edge regardless
 * of scheduling jitter:
 *
 *   - Opening soon: quizzes whose startTime falls 28-32 min from now —
 *     notifies every enrolled student in the quiz's course.
 *   - Closing soon: quizzes whose endTime falls 28-32 min from now AND
 *     have already opened — notifies enrolled students who have not yet
 *     attempted it (mirrors assignmentReminder's "skip submitted" logic).
 */

const cron    = require("node-cron");
const Quiz    = require("../models/Quiz");
const Course  = require("../models/Course");
const Attempt = require("../models/Attempt");
const notif   = require("./notificationService");

function windowNow() {
  const now = new Date();
  return {
    now,
    lo: new Date(now.getTime() + 28 * 60 * 1000),
    hi: new Date(now.getTime() + 32 * 60 * 1000),
  };
}

async function sendOpeningReminders() {
  const { lo, hi } = windowNow();
  const quizzes = await Quiz.find({
    isActive:  true,
    startTime: { $gte: lo, $lte: hi },
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
    endTime:  { $gte: lo, $lte: hi },
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
  // Run at minute 0 and 30 of every hour — same cadence as timetableReminder.
  cron.schedule("0,30 * * * *", sendQuizReminders, { timezone: "UTC" });
  console.log("[QuizReminder] Quiz opening/closing reminder cron scheduled (every 30 min)");
}

module.exports = { startQuizReminder, sendQuizReminders };

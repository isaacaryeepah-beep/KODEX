"use strict";

/**
 * snapQuizWatchdog
 *
 * Background process that runs on a 60-second tick and:
 *  1. Auto-opens published quizzes whose startTime has arrived.
 *  2. Auto-closes open quizzes whose endTime has passed (when lockAfterEndTime is true).
 *  3. Auto-submits attempts where expiresAt has passed.
 *  4. Auto-submits attempts where lastHeartbeatAt exceeds heartbeatTimeoutSeconds.
 */

const SnapQuiz        = require("../models/SnapQuiz");
const SnapQuizAttempt = require("../models/SnapQuizAttempt");
const { SNAP_QUIZ_STATUSES } = require("../models/SnapQuiz");
const { autoGradeAttempt } = require("./quizGradingService");
const { broadcastQuizEvent } = require("./snapQuizBroadcast");

const TICK_MS     = 30 * 1000; // run every 30 s for tighter scheduling accuracy
const BATCH_LIMIT = 50;

let _running = false;
let _timer   = null;

async function _tick() {
  if (_running) return;
  _running = true;
  try {
    const now = new Date();

    // ── 1. Auto-open: published quizzes whose startTime is due ────────────────
    const toOpen = await SnapQuiz.find({
      status:    SNAP_QUIZ_STATUSES.PUBLISHED,
      startTime: { $lte: now },
    }).select("_id company").limit(BATCH_LIMIT).lean();

    if (toOpen.length) {
      const ids = toOpen.map(q => q._id);
      await SnapQuiz.updateMany(
        { _id: { $in: ids } },
        { $set: { status: SNAP_QUIZ_STATUSES.OPEN, openedAt: now } }
      );
      for (const q of toOpen) {
        broadcastQuizEvent(String(q._id), "quiz_opened", { openedAt: now.toISOString() });
      }
      console.log(`[snapQuizWatchdog] Auto-opened ${toOpen.length} quiz(zes)`);
    }

    // ── 2. Auto-close: open quizzes past endTime with lockAfterEndTime ────────
    const toClose = await SnapQuiz.find({
      status:           SNAP_QUIZ_STATUSES.OPEN,
      lockAfterEndTime: true,
      endTime:          { $lte: now },
    }).select("_id company passMark autoReleaseResults").limit(BATCH_LIMIT).lean();

    if (toClose.length) {
      for (const q of toClose) {
        try {
          await _autoCloseQuiz(q, now);
        } catch (err) {
          console.error(`[snapQuizWatchdog] Failed to auto-close quiz ${q._id}:`, err.message);
        }
      }
      console.log(`[snapQuizWatchdog] Auto-closed ${toClose.length} quiz(zes)`);
    }

    // ── 3. Expired by hard deadline (expiresAt) ────────────────────────────────
    const expired = await SnapQuizAttempt.find({
      status:    "active",
      company:   { $exists: true, $ne: null },
      expiresAt: { $lte: now },
    }).limit(BATCH_LIMIT).lean();

    // ── 4. Heartbeat timeout ───────────────────────────────────────────────────
    const activeAttempts = await SnapQuizAttempt.find({
      status:          "active",
      company:         { $exists: true, $ne: null },
      expiresAt:       { $gt: now },
      lastHeartbeatAt: { $ne: null },
    }).limit(BATCH_LIMIT).lean();

    const quizIds = [...new Set(activeAttempts.map(a => String(a.quiz)))];
    const quizMap = {};
    if (quizIds.length) {
      const quizzes = await SnapQuiz.find(
        { _id: { $in: quizIds } },
        { heartbeatTimeoutSeconds: 1 }
      ).lean();
      quizzes.forEach(q => { quizMap[String(q._id)] = q; });
    }

    const heartbeatTimedOut = activeAttempts.filter(a => {
      const quiz = quizMap[String(a.quiz)];
      if (!quiz || !quiz.heartbeatTimeoutSeconds) return false;
      return (now - new Date(a.lastHeartbeatAt)) / 1000 > quiz.heartbeatTimeoutSeconds;
    });

    const toSubmit = [
      ...expired.map(a => ({ attempt: a, reason: "time_expired" })),
      ...heartbeatTimedOut.map(a => ({ attempt: a, reason: "heartbeat_timeout" })),
    ];

    for (const { attempt, reason } of toSubmit) {
      try {
        await _autoSubmitAttempt(attempt, now, reason);
      } catch (err) {
        console.error(`[snapQuizWatchdog] Failed to auto-submit attempt ${attempt._id}:`, err.message);
      }
    }

    if (toSubmit.length) {
      console.log(`[snapQuizWatchdog] Auto-submitted ${toSubmit.length} attempt(s)`);
    }
  } catch (err) {
    console.error("[snapQuizWatchdog] tick error:", err.message);
  } finally {
    _running = false;
  }
}

async function _autoSubmitAttempt(attempt, now, reason) {
  await SnapQuizAttempt.findByIdAndUpdate(attempt._id, {
    status:      "auto_submitted",
    submittedAt: now,
    timeSpentSeconds: attempt.startedAt
      ? Math.round((now - new Date(attempt.startedAt)) / 1000)
      : null,
  });

  const { rawScore, maxScore, hasManual } = await autoGradeAttempt(
    attempt._id,
    attempt.company
  );

  await SnapQuizAttempt.findByIdAndUpdate(attempt._id, {
    rawScore,
    maxScore,
    percentageScore: maxScore > 0 ? Math.round((rawScore / maxScore) * 100) : 0,
    gradingStatus:   hasManual ? "partially_graded" : "auto_graded",
    gradedAt:        new Date(),
    autoScore:       true,
  });

  broadcastQuizEvent(String(attempt.quiz), "attempt_auto_submitted", {
    attemptId:   String(attempt._id),
    reason,
    submittedAt: now.toISOString(),
  });
}

async function _autoCloseQuiz(quiz, now) {
  // Force-submit all still-active attempts for this quiz.
  const active = await SnapQuizAttempt.find({
    quiz:   quiz._id,
    status: "active",
  }).select("_id company quiz startedAt").lean();

  if (active.length) {
    await SnapQuizAttempt.updateMany(
      { _id: { $in: active.map(a => a._id) } },
      { $set: { status: "auto_submitted", submittedAt: now } }
    );
    await Promise.all(active.map(a => _autoSubmitAttempt(a, now, "quiz_closed")));
  }

  await SnapQuiz.findByIdAndUpdate(quiz._id, {
    $set: { status: SNAP_QUIZ_STATUSES.CLOSED, closedAt: now },
  });

  broadcastQuizEvent(String(quiz._id), "quiz_closed", {
    closedAt:            now.toISOString(),
    autoSubmittedCount:  active.length,
  });
}

function start() {
  if (_timer) return;
  _timer = setInterval(_tick, TICK_MS);
  // Run immediately on start to catch anything that passed during downtime.
  _tick();
  console.log("[snapQuizWatchdog] started — tick every 30s");
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop };

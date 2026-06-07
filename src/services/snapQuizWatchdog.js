"use strict";

/**
 * snapQuizWatchdog
 *
 * Background process that runs on a 60-second tick and:
 *  1. Auto-submits attempts where expiresAt has passed.
 *  2. Auto-submits attempts where lastHeartbeatAt exceeds heartbeatTimeoutSeconds.
 *
 * Both actions mirror the submit path in snapQuizStudentController so the
 * grading pipeline is identical whether the student clicks "Submit" or the
 * watchdog fires.
 */

const SnapQuiz        = require("../models/SnapQuiz");
const SnapQuizAttempt = require("../models/SnapQuizAttempt");
const { autoGradeAttempt } = require("./quizGradingService");
const { broadcastQuizEvent } = require("./snapQuizBroadcast");

const TICK_MS       = 60 * 1000; // run every 60 s
const BATCH_LIMIT   = 50;        // max attempts processed per tick

let _running = false;
let _timer   = null;

async function _tick() {
  if (_running) return;
  _running = true;
  try {
    const now = new Date();

    // ── 1. Expired by hard deadline (expiresAt) ────────────────────────────
    // company is required on all attempts — this ensures cross-tenant safety
    // when grading (autoGradeAttempt scopes to attempt.company).
    const expired = await SnapQuizAttempt.find({
      status:    "active",
      company:   { $exists: true, $ne: null },
      expiresAt: { $lte: now },
    }).limit(BATCH_LIMIT).lean();

    // ── 2. Heartbeat timeout ───────────────────────────────────────────────
    // We only check heartbeat timeout for quizzes that have it enabled.
    // Load relevant quizzes once to avoid N+1 queries.
    const activeAttempts = await SnapQuizAttempt.find({
      status:          "active",
      company:         { $exists: true, $ne: null },
      expiresAt:       { $gt: now }, // not already expired by deadline
      lastHeartbeatAt: { $ne: null },
    }).limit(BATCH_LIMIT).lean();

    const quizIds = [...new Set(activeAttempts.map(a => String(a.quiz)))];
    const quizMap = {};
    if (quizIds.length) {
      const quizzes = await SnapQuiz.find(
        { _id: { $in: quizIds } },
        { heartbeatTimeoutSeconds: 1, heartbeatIntervalSeconds: 1 }
      ).lean();
      quizzes.forEach(q => { quizMap[String(q._id)] = q; });
    }

    const heartbeatTimedOut = activeAttempts.filter(a => {
      const quiz = quizMap[String(a.quiz)];
      if (!quiz || !quiz.heartbeatTimeoutSeconds) return false;
      const elapsed = (now - new Date(a.lastHeartbeatAt)) / 1000;
      return elapsed > quiz.heartbeatTimeoutSeconds;
    });

    const toSubmit = [
      ...expired.map(a => ({ attempt: a, reason: "time_expired" })),
      ...heartbeatTimedOut.map(a => ({ attempt: a, reason: "heartbeat_timeout" })),
    ];

    for (const { attempt, reason } of toSubmit) {
      try {
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
          gradingStatus: hasManual ? "partially_graded" : "auto_graded",
          gradedAt: new Date(),
          autoScore: true,
        });

        broadcastQuizEvent(String(attempt.quiz), "attempt_auto_submitted", {
          attemptId: String(attempt._id),
          reason,
          submittedAt: now.toISOString(),
        });
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

function start() {
  if (_timer) return;
  _timer = setInterval(_tick, TICK_MS);
  // Run immediately on start to catch anything that expired during downtime
  _tick();
  console.log("[snapQuizWatchdog] started — tick every 60s");
}

function stop() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}

module.exports = { start, stop };

"use strict";

/**
 * snapQuizStudentController
 *
 * Handles all student-facing SnapQuiz operations:
 *   - Quiz discovery (published quizzes for enrolled courses)
 *   - Start attempt (with session-lock token issuance)
 *   - Heartbeat ping (keeps session alive; server enforces timeout)
 *   - Save responses (auto-save; validates session token)
 *   - Submit attempt (triggers auto-grading)
 *   - Violation reporting (client-side detection → server enforcement)
 *   - Proctoring snapshot upload
 *   - View result (after release)
 *   - Review attempt (after result release and if quiz allows it)
 *
 * Anti-cheat enforcement flow:
 *   Client detects event → POST /violations → server logs ViolationLog,
 *   increments attempt.violationCount, checks threshold → if threshold
 *   reached, terminates session and returns { terminated: true }.
 */

const mongoose = require("mongoose");
const SnapQuiz               = require("../models/SnapQuiz");
const SnapQuizQuestion       = require("../models/SnapQuizQuestion");
const SnapQuizAttempt        = require("../models/SnapQuizAttempt");
const SnapQuizResponse       = require("../models/SnapQuizResponse");
const SnapQuizViolationLog   = require("../models/SnapQuizViolationLog");
const SnapQuizProctoringEvent = require("../models/SnapQuizProctoringEvent");
const SnapQuizResult         = require("../models/SnapQuizResult");
const { ATTEMPT_STATUSES, GRADING_STATUSES } = require("../models/SnapQuizAttempt");
const { QUESTION_TYPES, MANUAL_GRADE_TYPES } = require("../models/SnapQuizQuestion");
const { VIOLATION_TYPES, VIOLATION_SEVERITIES, ACTIONS_TAKEN } = require("../models/SnapQuizViolationLog");

// ─── Quiz discovery ───────────────────────────────────────────────────────────

/**
 * GET /student/snap-quizzes/courses/:courseId/quizzes
 */
exports.listQuizzes = async (req, res) => {
  try {
    const quizzes = await SnapQuiz.find({
      company:     req.companyId,
      course:      req.params.courseId,
      isPublished: true,
      isActive:    true,
    })
      .select("-attachments")
      .sort({ startTime: -1 })
      .lean();

    // Attach attempt count for this student.
    const quizIds = quizzes.map(q => q._id);
    const counts  = await SnapQuizAttempt.aggregate([
      {
        $match: {
          quiz:    { $in: quizIds },
          student: new mongoose.Types.ObjectId(req.user._id),
          company: new mongoose.Types.ObjectId(req.companyId),
        },
      },
      { $group: { _id: "$quiz", count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach(c => { countMap[c._id.toString()] = c.count; });

    return res.json({
      quizzes: quizzes.map(q => ({
        ...q,
        myAttemptCount: countMap[q._id.toString()] || 0,
      })),
    });
  } catch (err) {
    console.error("[snapQuiz student listQuizzes]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /student/snap-quizzes/quizzes/:quizId
 */
exports.getQuiz = async (req, res) => {
  try {
    const quiz = await SnapQuiz.findOne({
      _id: req.params.quizId, company: req.companyId,
      isPublished: true, isActive: true,
    })
      .select("-attachments")
      .lean();

    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    return res.json({ quiz });
  } catch (err) {
    console.error("[snapQuiz student getQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Attempt lifecycle ────────────────────────────────────────────────────────

/**
 * POST /student/snap-quizzes/quizzes/:quizId/attempts/start
 * Starts a new attempt. Returns sessionToken — client must send this on
 * every subsequent request as X-Session-Token header.
 * Body: { termsAcknowledged: true }
 */
exports.startAttempt = async (req, res) => {
  try {
    const quiz = await SnapQuiz.findOne({
      _id: req.params.quizId, company: req.companyId,
      isPublished: true, isActive: true,
    }).lean();

    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    // Check window.
    const now = new Date();
    if (now < quiz.startTime) {
      return res.status(403).json({ error: "Quiz has not started yet" });
    }
    if (quiz.lockAfterEndTime) {
      const hardDeadline = new Date(quiz.endTime.getTime() + (quiz.gracePeriodSeconds || 0) * 1000);
      if (now > hardDeadline) {
        return res.status(403).json({ error: "Quiz window has closed" });
      }
    }

    // Reject if there is already an active attempt (session conflict).
    const activeAttempt = await SnapQuizAttempt.findOne({
      quiz: quiz._id, student: req.user._id, company: req.companyId,
      status: ATTEMPT_STATUSES.ACTIVE,
    });
    if (activeAttempt) {
      return res.status(409).json({
        error:    "You already have an active session for this quiz",
        attemptId: activeAttempt._id,
        sessionToken: activeAttempt.sessionToken,
      });
    }

    // Check attempt limit.
    const pastCount = await SnapQuizAttempt.countDocuments({
      quiz:    quiz._id,
      student: req.user._id,
      company: req.companyId,
      status:  { $in: [ATTEMPT_STATUSES.SUBMITTED, ATTEMPT_STATUSES.AUTO_SUBMITTED, ATTEMPT_STATUSES.TERMINATED] },
    });
    if (pastCount >= quiz.allowedAttempts) {
      return res.status(403).json({
        error: `You have used all ${quiz.allowedAttempts} allowed attempt(s)`,
      });
    }

    // Terms acknowledgement required.
    if (!req.body.termsAcknowledged) {
      return res.status(400).json({ error: "You must acknowledge the exam rules to start" });
    }

    // Attempt number.
    const lastAttempt = await SnapQuizAttempt.findOne({
      quiz: quiz._id, student: req.user._id, company: req.companyId,
    }).sort({ attemptNumber: -1 }).select("attemptNumber").lean();
    const attemptNumber = lastAttempt ? lastAttempt.attemptNumber + 1 : 1;

    // Build question order.
    const allQuestions = await SnapQuizQuestion.find({ quiz: quiz._id, isActive: true })
      .sort({ orderIndex: 1 }).lean();

    let questionOrder = allQuestions.map(q => q._id);
    if (quiz.randomizeQuestions) questionOrder = _shuffleArray([...questionOrder]);

    let optionOrders = null;
    if (quiz.randomizeOptions) {
      optionOrders = {};
      allQuestions.forEach(q => {
        if (q.options?.length > 1) {
          optionOrders[q._id.toString()] = _shuffleIndices(q.options.length);
        }
      });
    }

    // Server deadline.
    const expiresAt = new Date(now.getTime() + quiz.timeLimitMinutes * 60 * 1000);

    const attempt = await SnapQuizAttempt.create({
      quiz:            quiz._id,
      student:         req.user._id,
      company:         req.companyId,
      attemptNumber,
      questionOrder,
      optionOrders,
      expiresAt,
      lastHeartbeatAt: now,
      termsAcknowledged:   true,
      termsAcknowledgedAt: now,
      device: {
        ipAddress: req.ip || null,
        userAgent: req.headers["user-agent"] || null,
        deviceId:  req.headers["x-device-id"] || null,
        platform:  _detectPlatform(req.headers["user-agent"]),
      },
    });

    const questions = await _buildQuestionsForAttempt(attempt, quiz);

    return res.status(201).json({
      attempt: {
        _id:          attempt._id,
        attemptNumber: attempt.attemptNumber,
        expiresAt:    attempt.expiresAt,
        sessionToken: attempt.sessionToken,
        status:       attempt.status,
      },
      quiz: {
        timeLimitMinutes:              quiz.timeLimitMinutes,
        heartbeatIntervalSeconds:      quiz.heartbeatIntervalSeconds,
        maxViolationsBeforeTermination: quiz.maxViolationsBeforeTermination,
        preventCopyPaste:              quiz.preventCopyPaste,
        preventRightClick:             quiz.preventRightClick,
        requireFullscreen:             quiz.requireFullscreen,
        showViolationWarnings:         quiz.showViolationWarnings,
        proctoringEnabled:             quiz.proctoringEnabled,
        snapshotIntervalSeconds:       quiz.snapshotIntervalSeconds,
      },
      questions,
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Duplicate attempt — please refresh" });
    }
    console.error("[snapQuiz student startAttempt]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /student/snap-quizzes/quizzes/:quizId/attempts/:attemptId/heartbeat
 * Client sends this every heartbeatIntervalSeconds to prove connectivity.
 * Returns { expiresAt, remainingSeconds, violationCount, terminated }.
 */
exports.heartbeat = async (req, res) => {
  try {
    const attempt = await _loadLockedAttempt(req);
    if (!attempt) {
      return res.status(404).json({ error: "Active session not found" });
    }

    // Check server-side expiry.
    const now = new Date();
    if (now > attempt.expiresAt) {
      await _autoSubmit(attempt);
      return res.json({ expired: true, terminated: false });
    }

    attempt.lastHeartbeatAt = now;
    await attempt.save();

    return res.json({
      expiresAt:       attempt.expiresAt,
      remainingSeconds: Math.max(0, Math.round((attempt.expiresAt - now) / 1000)),
      violationCount:  attempt.violationCount,
      terminated:      false,
      expired:         false,
    });
  } catch (err) {
    console.error("[snapQuiz student heartbeat]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PUT /student/snap-quizzes/quizzes/:quizId/attempts/:attemptId/responses
 * Idempotent upsert of responses. Validates session token and expiry.
 */
exports.saveResponses = async (req, res) => {
  try {
    const attempt = await _loadLockedAttempt(req);
    if (!attempt) {
      return res.status(404).json({ error: "Active session not found" });
    }

    // Enforce server-side expiry.
    if (new Date() > attempt.expiresAt) {
      await _autoSubmit(attempt);
      return res.status(410).json({ error: "Session has expired and been auto-submitted" });
    }

    const { responses } = req.body;
    if (!Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ error: "responses array is required" });
    }

    const now = new Date();
    const ops = responses.map(r => ({
      updateOne: {
        filter: { attempt: attempt._id, question: r.questionId, company: req.companyId },
        update: {
          $set: {
            ..._extractAnswerFields(r),
            lastUpdatedAt:    now,
            isFlagged:        r.isFlagged ?? false,
            isSkipped:        r.isSkipped ?? false,
            timeSpentSeconds: r.timeSpentSeconds ?? null,
          },
          $setOnInsert: {
            quiz:            attempt.quiz,
            student:         req.user._id,
            company:         req.companyId,
            questionType:    r.questionType,
            maxMarks:        r.maxMarks || 1,
            firstAnsweredAt: now,
          },
        },
        upsert: true,
      },
    }));
    await SnapQuizResponse.bulkWrite(ops);

    return res.json({ message: "Responses saved" });
  } catch (err) {
    console.error("[snapQuiz student saveResponses]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /student/snap-quizzes/quizzes/:quizId/attempts/:attemptId/submit
 * Student voluntarily submits the attempt.
 */
exports.submitAttempt = async (req, res) => {
  try {
    const attempt = await _loadLockedAttempt(req);
    if (!attempt) {
      return res.status(404).json({ error: "Active session not found" });
    }

    const now       = new Date();
    const timeSpent = Math.round((now - attempt.startedAt) / 1000);

    attempt.status           = ATTEMPT_STATUSES.SUBMITTED;
    attempt.submittedAt      = now;
    attempt.timeSpentSeconds = timeSpent;
    await attempt.save();

    const quiz = await SnapQuiz.findById(attempt.quiz)
      .select("passMark autoReleaseResults").lean();

    const { rawScore, maxScore, hasManual } = await _autoGradeAttempt(attempt._id, req.companyId);
    const pct      = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
    const isPassed = quiz?.passMark != null ? rawScore >= quiz.passMark : null;

    attempt.rawScore        = rawScore;
    attempt.maxScore        = maxScore;
    attempt.percentageScore = Math.round(pct * 100) / 100;
    attempt.isPassed        = isPassed;
    attempt.gradingStatus   = hasManual
      ? GRADING_STATUSES.PARTIALLY_GRADED
      : GRADING_STATUSES.AUTO_GRADED;
    if (!hasManual) attempt.gradedAt = now;
    await attempt.save();

    await _upsertResult(attempt, quiz);

    return res.json({
      message: "Attempt submitted",
      attempt: {
        _id:             attempt._id,
        status:          attempt.status,
        gradingStatus:   attempt.gradingStatus,
        rawScore:        attempt.rawScore,
        maxScore:        attempt.maxScore,
        percentageScore: attempt.percentageScore,
        isPassed:        attempt.isPassed,
      },
    });
  } catch (err) {
    console.error("[snapQuiz student submitAttempt]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Violation reporting ──────────────────────────────────────────────────────

/**
 * POST /student/snap-quizzes/quizzes/:quizId/attempts/:attemptId/violations
 * Report a client-detected violation event.
 * Returns { warned, terminated, violationCount, remainingBefore Termination }.
 */
exports.reportViolation = async (req, res) => {
  try {
    const attempt = await _loadLockedAttempt(req);
    if (!attempt) {
      // Already submitted/terminated — silently accept.
      return res.json({ acknowledged: true, terminated: false });
    }

    const quiz = await SnapQuiz.findById(attempt.quiz)
      .select("maxViolationsBeforeTermination terminateOnTabSwitch terminateOnFocusLost terminateOnFullscreenExit showViolationWarnings")
      .lean();

    const { violationType, occurredAt, detail, snapshotUrl } = req.body;

    // Determine severity and whether this type is enforced.
    const isCriticalType = _isCriticalViolation(violationType, quiz);
    const severity = isCriticalType
      ? VIOLATION_SEVERITIES.CRITICAL
      : VIOLATION_SEVERITIES.INFO;

    // Increment counter for critical violations.
    let newCount = attempt.violationCount;
    if (isCriticalType) {
      newCount = attempt.violationCount + 1;
      await SnapQuizAttempt.updateOne(
        { _id: attempt._id },
        {
          $inc: _violationFieldInc(violationType),
          $set: { violationCount: newCount },
        }
      );
    }

    // Check termination threshold.
    const maxViolations = quiz?.maxViolationsBeforeTermination || 0;
    const causedTermination = maxViolations > 0 && newCount >= maxViolations && isCriticalType;
    const actionTaken = causedTermination
      ? ACTIONS_TAKEN.TERMINATED
      : isCriticalType
        ? (quiz?.showViolationWarnings ? ACTIONS_TAKEN.WARNED : ACTIONS_TAKEN.COUNTED)
        : ACTIONS_TAKEN.LOGGED;

    // Log the violation.
    await SnapQuizViolationLog.create({
      attempt:              attempt._id,
      quiz:                 attempt.quiz,
      student:              attempt.student,
      company:              attempt.company,
      violationType:        violationType || "other",
      severity,
      violationNumber:      isCriticalType ? newCount : null,
      detail:               detail || null,
      occurredAt:           occurredAt ? new Date(occurredAt) : new Date(),
      actionTaken,
      violationCountAtEvent: newCount,
      causedTermination,
      snapshotUrl:          snapshotUrl || null,
    });

    if (causedTermination) {
      await _terminateSession(attempt, `Exceeded violation limit (${newCount}/${maxViolations})`);
    }

    return res.json({
      acknowledged:               true,
      warned:                     actionTaken === ACTIONS_TAKEN.WARNED,
      terminated:                 causedTermination,
      violationCount:             newCount,
      remainingBeforeTermination: maxViolations > 0
        ? Math.max(0, maxViolations - newCount)
        : null,
    });
  } catch (err) {
    console.error("[snapQuiz student reportViolation]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Proctoring snapshot upload ───────────────────────────────────────────────

/**
 * POST /student/snap-quizzes/quizzes/:quizId/attempts/:attemptId/snapshots
 * Record a proctoring snapshot metadata entry.
 * Body: { imageUrl, thumbnailUrl, eventType, relatedViolationId }
 */
exports.recordSnapshot = async (req, res) => {
  try {
    const attempt = await _loadLockedAttempt(req);
    if (!attempt) return res.sendStatus(204);

    const quiz = await SnapQuiz.findById(attempt.quiz).select("proctoringEnabled").lean();
    if (!quiz?.proctoringEnabled) return res.sendStatus(204);

    await SnapQuizProctoringEvent.create({
      attempt:             attempt._id,
      quiz:                attempt.quiz,
      student:             attempt.student,
      company:             attempt.company,
      eventType:           req.body.eventType || "scheduled_snapshot",
      capturedAt:          new Date(),
      imageUrl:            req.body.imageUrl    || null,
      thumbnailUrl:        req.body.thumbnailUrl || null,
      relatedViolationId:  req.body.relatedViolationId || null,
    });

    return res.sendStatus(204);
  } catch (err) {
    console.error("[snapQuiz student recordSnapshot]", err);
    return res.sendStatus(204);
  }
};

// ─── Results & review ─────────────────────────────────────────────────────────

exports.getResult = async (req, res) => {
  try {
    const result = await SnapQuizResult.findOne({
      quiz:    req.params.quizId,
      student: req.user._id,
      company: req.companyId,
    }).lean();

    if (!result) return res.status(404).json({ error: "No result found for this quiz" });
    if (!result.isReleased) {
      return res.status(403).json({ error: "Results have not been released yet" });
    }

    return res.json({ result });
  } catch (err) {
    console.error("[snapQuiz student getResult]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.reviewAttempt = async (req, res) => {
  try {
    const quiz = await SnapQuiz.findOne({ _id: req.params.quizId, company: req.companyId }).lean();
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const attempt = await SnapQuizAttempt.findOne({
      _id: req.params.attemptId, quiz: quiz._id, student: req.user._id, company: req.companyId,
    }).lean();
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (!attempt.isResultReleased) {
      return res.status(403).json({ error: "Results have not been released for this attempt" });
    }

    const now = new Date();
    const afterClose = quiz.endTime && now > quiz.endTime;
    const canShowAnswers = quiz.showAnswersAfterSubmission ||
                           (quiz.showAnswersAfterClose && afterClose);

    const responses = await SnapQuizResponse.find({ attempt: attempt._id })
      .populate({
        path:   "question",
        select: canShowAnswers
          ? "questionText questionType marks correctOptionIndex correctOptionIndices correctBoolean correctAnswerText numericAnswer explanation"
          : "questionText questionType marks",
      })
      .lean();

    return res.json({ attempt, responses, canShowAnswers });
  } catch (err) {
    console.error("[snapQuiz student reviewAttempt]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Load an ACTIVE attempt, validate session token, and check company scope.
 * Returns null if not found, already submitted, or token mismatch.
 */
async function _loadLockedAttempt(req) {
  const attempt = await SnapQuizAttempt.findOne({
    _id:     req.params.attemptId,
    quiz:    req.params.quizId,
    student: req.user._id,
    company: req.companyId,
    status:  ATTEMPT_STATUSES.ACTIVE,
  });
  if (!attempt) return null;

  // Session-lock check.
  const token = req.headers["x-session-token"];
  if (token && attempt.sessionToken && token !== attempt.sessionToken) {
    // Session conflict — log and terminate.
    await _terminateSession(attempt, "Session conflict: duplicate tab or device detected");
    return null;
  }

  return attempt;
}

async function _autoSubmit(attempt) {
  attempt.status           = ATTEMPT_STATUSES.AUTO_SUBMITTED;
  attempt.submittedAt      = new Date();
  attempt.timeSpentSeconds = Math.round((new Date() - attempt.startedAt) / 1000);
  await attempt.save();

  const quiz = await SnapQuiz.findById(attempt.quiz).select("passMark autoReleaseResults").lean();
  const { rawScore, maxScore, hasManual } = await _autoGradeAttempt(attempt._id, attempt.company);
  const pct = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
  const isPassed = quiz?.passMark != null ? rawScore >= quiz.passMark : null;

  attempt.rawScore        = rawScore;
  attempt.maxScore        = maxScore;
  attempt.percentageScore = Math.round(pct * 100) / 100;
  attempt.isPassed        = isPassed;
  attempt.gradingStatus   = hasManual ? GRADING_STATUSES.PARTIALLY_GRADED : GRADING_STATUSES.AUTO_GRADED;
  if (!hasManual) attempt.gradedAt = new Date();
  await attempt.save();

  await _upsertResult(attempt, quiz);
}

async function _terminateSession(attempt, reason) {
  attempt.status            = ATTEMPT_STATUSES.TERMINATED;
  attempt.isTerminated      = true;
  attempt.terminationReason = reason;
  attempt.terminatedAt      = new Date();
  attempt.submittedAt       = new Date();
  attempt.timeSpentSeconds  = Math.round((new Date() - attempt.startedAt) / 1000);
  await attempt.save();

  const quiz = await SnapQuiz.findById(attempt.quiz).select("passMark autoReleaseResults").lean();
  const { rawScore, maxScore, hasManual } = await _autoGradeAttempt(attempt._id, attempt.company);
  const pct = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
  const isPassed = quiz?.passMark != null ? rawScore >= quiz.passMark : null;

  attempt.rawScore        = rawScore;
  attempt.maxScore        = maxScore;
  attempt.percentageScore = Math.round(pct * 100) / 100;
  attempt.isPassed        = isPassed;
  attempt.gradingStatus   = hasManual ? GRADING_STATUSES.PARTIALLY_GRADED : GRADING_STATUSES.AUTO_GRADED;
  if (!hasManual) attempt.gradedAt = new Date();
  await attempt.save();

  await _upsertResult(attempt, quiz, true);
}

async function _autoGradeAttempt(attemptId, companyId) {
  const responses   = await SnapQuizResponse.find({ attempt: attemptId }).lean();
  const questionIds = responses.map(r => r.question);
  const questions   = await SnapQuizQuestion.find({ _id: { $in: questionIds } }).lean();
  const qMap        = {};
  questions.forEach(q => { qMap[q._id.toString()] = q; });

  let rawScore = 0, maxScore = 0, hasManual = false;
  const ops = [];

  for (const response of responses) {
    const q = qMap[response.question.toString()];
    if (!q) continue;
    maxScore += q.marks || 1;

    if (MANUAL_GRADE_TYPES.has(q.questionType)) {
      hasManual = true;
      ops.push({ updateOne: { filter: { _id: response._id }, update: { $set: { gradingStatus: "pending_manual" } } } });
      continue;
    }

    const { isCorrect, earnedMarks } = _scoreResponse(response, q);
    rawScore += earnedMarks;
    ops.push({
      updateOne: {
        filter: { _id: response._id },
        update: { $set: { isCorrect, earnedMarks, isAutoGraded: true, gradingStatus: "auto_graded" } },
      },
    });
  }

  if (ops.length) await SnapQuizResponse.bulkWrite(ops);
  return { rawScore, maxScore, hasManual };
}

function _scoreResponse(response, question) {
  const marks = question.marks || 1;
  let isCorrect = false;

  switch (question.questionType) {
    case QUESTION_TYPES.MCQ:
      isCorrect = response.selectedOptionIndex === question.correctOptionIndex;
      break;
    case QUESTION_TYPES.MCQ_MULTI: {
      const c = new Set((question.correctOptionIndices || []).map(String));
      const s = new Set((response.selectedOptionIndices || []).map(String));
      isCorrect = c.size === s.size && [...c].every(v => s.has(v));
      break;
    }
    case QUESTION_TYPES.TRUE_FALSE:
      isCorrect = response.selectedBoolean === question.correctBoolean;
      break;
    case QUESTION_TYPES.SHORT_ANSWER:
    case QUESTION_TYPES.FILL_BLANK: {
      const a = (response.textAnswer || "").trim().toLowerCase();
      const c = (question.correctAnswerText || "").trim().toLowerCase();
      isCorrect = a === c || (question.acceptedAnswers || []).map(x => x.trim().toLowerCase()).includes(a);
      break;
    }
    case QUESTION_TYPES.NUMERIC: {
      const expected = question.numericAnswer?.value;
      const tol      = question.numericAnswer?.tolerance || 0;
      if (expected != null && response.numericAnswer != null) {
        isCorrect = Math.abs(response.numericAnswer - expected) <= tol;
      }
      break;
    }
    default: isCorrect = false;
  }
  return { isCorrect, earnedMarks: isCorrect ? marks : 0 };
}

async function _upsertResult(attempt, quiz, wasTerminated = false) {
  const now = new Date();
  const violations = await SnapQuizViolationLog.countDocuments({ attempt: attempt._id });
  const integrityFlag = wasTerminated || violations > 0;

  await SnapQuizResult.findOneAndUpdate(
    { quiz: attempt.quiz, student: attempt.student, company: attempt.company },
    {
      $set: {
        countedAttemptId: attempt._id,
        rawScore:         attempt.rawScore,
        maxScore:         attempt.maxScore,
        percentageScore:  attempt.percentageScore,
        isPassed:         attempt.isPassed,
        gradingStatus:    attempt.gradingStatus,
        computedAt:       now,
        integrityFlag,
        integrityFlagReason: integrityFlag
          ? (wasTerminated ? attempt.terminationReason : "Violations recorded")
          : null,
        totalViolations: violations,
        isReleased:      quiz?.autoReleaseResults && attempt.gradingStatus === "auto_graded",
        releasedAt:      quiz?.autoReleaseResults && attempt.gradingStatus === "auto_graded" ? now : null,
      },
      $inc:  { totalAttempts: 1, completedAttempts: 1 },
      $push: {
        breakdown: {
          attemptId:       attempt._id,
          attemptNumber:   attempt.attemptNumber,
          status:          attempt.status,
          rawScore:        attempt.rawScore,
          maxScore:        attempt.maxScore,
          percentageScore: attempt.percentageScore,
          isPassed:        attempt.isPassed,
          gradingStatus:   attempt.gradingStatus,
          submittedAt:     attempt.submittedAt,
          timeSpentSeconds: attempt.timeSpentSeconds,
          isTerminated:    attempt.isTerminated || false,
          violationCount:  attempt.violationCount,
        },
      },
    },
    { upsert: true, new: true }
  );
}

async function _buildQuestionsForAttempt(attempt, quiz) {
  const qMap = {};
  const raw  = await SnapQuizQuestion.find({ _id: { $in: attempt.questionOrder }, isActive: true })
    .select("-correctOptionIndex -correctOptionIndices -correctBoolean -correctAnswerText -acceptedAnswers -numericAnswer -modelAnswer -mathsDrawing.markingGuide -mathsDrawing.partialCreditGuidance")
    .lean();
  raw.forEach(q => { qMap[q._id.toString()] = q; });

  return attempt.questionOrder.map(qId => {
    const q = qMap[qId.toString()];
    if (!q) return null;
    if (quiz.randomizeOptions && attempt.optionOrders?.[qId.toString()] && q.options?.length) {
      const idx  = attempt.optionOrders[qId.toString()];
      q.options  = idx.map(i => q.options[i]);
      if (q.optionMedia?.length) q.optionMedia = idx.map(i => q.optionMedia[i] || null);
    }
    return q;
  }).filter(Boolean);
}

function _isCriticalViolation(type, quiz) {
  if (!quiz) return true;
  if (type === "tab_switch"      && quiz.terminateOnTabSwitch)      return true;
  if (type === "focus_lost"      && quiz.terminateOnFocusLost)      return true;
  if (type === "fullscreen_exit" && quiz.terminateOnFullscreenExit) return true;
  if (type === "session_conflict") return true;
  if (type === "copy_paste"      && quiz.preventCopyPaste)          return true;
  // Default: treat all known types as critical unless specifically configured
  return [
    "tab_switch","session_conflict","devtools_open","multiple_windows",
  ].includes(type);
}

function _violationFieldInc(type) {
  if (type === "tab_switch")      return { tabSwitchCount: 1 };
  if (type === "focus_lost")      return { focusLostCount: 1 };
  if (type === "fullscreen_exit") return { fullscreenExitCount: 1 };
  return {};
}

function _extractAnswerFields(r) {
  const f = {};
  if (r.selectedOptionIndex  !== undefined) f.selectedOptionIndex  = r.selectedOptionIndex;
  if (r.selectedOptionIndices !== undefined) f.selectedOptionIndices = r.selectedOptionIndices;
  if (r.selectedBoolean      !== undefined) f.selectedBoolean      = r.selectedBoolean;
  if (r.textAnswer           !== undefined) f.textAnswer           = r.textAnswer;
  if (r.numericAnswer        !== undefined) f.numericAnswer        = r.numericAnswer;
  if (r.equationAnswer       !== undefined) f.equationAnswer       = r.equationAnswer;
  if (r.mathsWorkingsText    !== undefined) f.mathsWorkingsText    = r.mathsWorkingsText;
  if (r.drawingData          !== undefined) f.drawingData          = r.drawingData;
  return f;
}

function _shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function _shuffleIndices(n) {
  return _shuffleArray(Array.from({ length: n }, (_, i) => i));
}

function _detectPlatform(ua) {
  if (!ua) return "unknown";
  ua = ua.toLowerCase();
  if (/mobile|android|iphone|ipod/.test(ua)) return "mobile";
  if (/tablet|ipad/.test(ua))                return "tablet";
  if (/windows|macintosh|linux/.test(ua))    return "desktop";
  return "unknown";
}

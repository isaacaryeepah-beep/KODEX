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
const Course                 = require("../models/Course");
const SnapQuiz               = require("../models/SnapQuiz");
const SnapQuizQuestion       = require("../models/SnapQuizQuestion");
const SnapQuizAttempt        = require("../models/SnapQuizAttempt");
const SnapQuizResponse       = require("../models/SnapQuizResponse");
const SnapQuizViolationLog   = require("../models/SnapQuizViolationLog");
const SnapQuizProctoringEvent = require("../models/SnapQuizProctoringEvent");
const SnapQuizResult         = require("../models/SnapQuizResult");
const Meeting                = require("../models/Meeting");
const { ATTEMPT_STATUSES, GRADING_STATUSES } = require("../models/SnapQuizAttempt");
const { QUESTION_TYPES, MANUAL_GRADE_TYPES } = require("../models/SnapQuizQuestion");
const { VIOLATION_TYPES, VIOLATION_SEVERITIES, ACTIONS_TAKEN } = require("../models/SnapQuizViolationLog");
const { autoGradeAttempt } = require("../services/quizGradingService");
const { analyzeSnapshot, generateQuizReport } = require("../services/aiProctoringService");

// ─── Quiz discovery ───────────────────────────────────────────────────────────

/**
 * GET /student/snap-quizzes/courses/:courseId/quizzes
 */
exports.listQuizzes = async (req, res) => {
  try {
    const Course = require("../models/Course");
    const enrolled = await Course.findOne({
      _id: req.params.courseId,
      companyId: req.companyId,
      enrolledStudents: req.user._id,
    }).select("_id").lean();
    if (!enrolled) return res.status(403).json({ error: "You are not enrolled in this course" });

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
    const quizIds   = quizzes.map(q => q._id);
    const studentId = new mongoose.Types.ObjectId(req.user._id);
    const companyId = new mongoose.Types.ObjectId(req.companyId);

    const [allCounts, submittedCounts, qCounts] = await Promise.all([
      SnapQuizAttempt.aggregate([
        { $match: { quiz: { $in: quizIds }, student: studentId, company: companyId } },
        { $group: { _id: "$quiz", count: { $sum: 1 } } },
      ]),
      SnapQuizAttempt.aggregate([
        { $match: {
          quiz:    { $in: quizIds },
          student: studentId,
          company: companyId,
          status:  { $in: [ATTEMPT_STATUSES.SUBMITTED, ATTEMPT_STATUSES.AUTO_SUBMITTED, ATTEMPT_STATUSES.TERMINATED] },
        }},
        { $group: { _id: "$quiz", count: { $sum: 1 } } },
      ]),
      SnapQuizQuestion.aggregate([
        { $match: { quiz: { $in: quizIds }, isActive: { $ne: false } } },
        { $group: { _id: "$quiz", count: { $sum: 1 } } },
      ]),
    ]);

    const attemptMap   = {};
    const submittedMap = {};
    const qCountMap    = {};
    allCounts.forEach(c       => { attemptMap[c._id.toString()]   = c.count; });
    submittedCounts.forEach(c => { submittedMap[c._id.toString()] = c.count; });
    qCounts.forEach(c         => { qCountMap[c._id.toString()]    = c.count; });

    return res.json({
      quizzes: quizzes.map(q => {
        const id          = q._id.toString();
        const isSubmitted = (submittedMap[id] || 0) > 0;
        const canAttempt  = q.status === "open" && !isSubmitted;
        return {
          ...q,
          questionCount:  qCountMap[id] || 0,
          myAttemptCount: attemptMap[id] || 0,
          isSubmitted,
          canAttempt,
        };
      }),
    });
  } catch (err) {
    console.error("[snapQuiz student listQuizzes]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /student/snap-quizzes/quizzes
 * List all published snap quizzes for courses the student is enrolled in.
 */
exports.listAllQuizzes = async (req, res) => {
  try {
    // Only show quizzes for courses this student is actually enrolled in.
    const Course = require("../models/Course");
    const enrolledCourses = await Course.find({
      companyId: req.companyId,
      enrolledStudents: req.user._id,
      isActive: true,
    }).select("_id").lean();
    const enrolledIds = enrolledCourses.map(c => c._id);

    const showAll = req.query.showAll === "true";
    const filter = {
      company:     req.companyId,
      isPublished: true,
      isActive:    true,
      course:      { $in: enrolledIds },
    };
    if (!showAll) {
      const now = new Date();
      filter.startTime = { $lte: now };
      filter.endTime   = { $gte: now };
    }

    const quizzes = await SnapQuiz.find(filter)
      .select("-attachments")
      .sort({ startTime: -1 })
      .lean();

    const quizIds = quizzes.map(q => q._id);
    const studentId = new mongoose.Types.ObjectId(req.user._id);
    const companyId = new mongoose.Types.ObjectId(req.companyId);

    // Attempt counts (any status)
    const [allCounts, submittedCounts, qCounts] = await Promise.all([
      SnapQuizAttempt.aggregate([
        { $match: { quiz: { $in: quizIds }, student: studentId, company: companyId } },
        { $group: { _id: "$quiz", count: { $sum: 1 } } },
      ]),
      SnapQuizAttempt.aggregate([
        { $match: {
          quiz:    { $in: quizIds },
          student: studentId,
          company: companyId,
          status:  { $in: [ATTEMPT_STATUSES.SUBMITTED, ATTEMPT_STATUSES.AUTO_SUBMITTED, ATTEMPT_STATUSES.TERMINATED] },
        }},
        { $group: { _id: "$quiz", count: { $sum: 1 } } },
      ]),
      SnapQuizQuestion.aggregate([
        { $match: { quiz: { $in: quizIds }, isActive: { $ne: false } } },
        { $group: { _id: "$quiz", count: { $sum: 1 } } },
      ]),
    ]);

    const attemptMap   = {};
    const submittedMap = {};
    const qCountMap    = {};
    allCounts.forEach(c      => { attemptMap[c._id.toString()]   = c.count; });
    submittedCounts.forEach(c => { submittedMap[c._id.toString()] = c.count; });
    qCounts.forEach(c         => { qCountMap[c._id.toString()]    = c.count; });

    return res.json({
      quizzes: quizzes.map(q => {
        const id          = q._id.toString();
        const isSubmitted = (submittedMap[id] || 0) > 0;
        const canAttempt  = q.status === "open" && !isSubmitted;
        return {
          ...q,
          questionCount:  qCountMap[id] || 0,
          myAttemptCount: attemptMap[id] || 0,
          isSubmitted,
          canAttempt,
        };
      }),
    });
  } catch (err) {
    console.error("[snapQuiz student listAllQuizzes]", err);
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

    // Verify the student is enrolled in the course this quiz belongs to.
    if (quiz.course) {
      const enrolled = await Course.findOne({
        _id: quiz.course, companyId: req.companyId, enrolledStudents: req.user._id,
      }).select("_id").lean();
      if (!enrolled) return res.status(403).json({ error: "You are not enrolled in this course" });
    }

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

    // Verify the student is enrolled in the course this quiz belongs to.
    if (quiz.course) {
      const enrolled = await Course.findOne({
        _id: quiz.course, companyId: req.companyId, enrolledStudents: req.user._id,
      }).select("_id").lean();
      if (!enrolled) return res.status(403).json({ error: "You are not enrolled in this course" });
    }

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

    // Live meeting gate (Phase 3): if quiz is tied to a meeting, it must be live.
    if (quiz.requireLiveMeeting && quiz.linkedMeeting) {
      const meeting = await Meeting.findById(quiz.linkedMeeting).select("status title").lean();
      if (!meeting) {
        return res.status(403).json({ error: "Linked meeting not found. Cannot start quiz." });
      }
      if (meeting.status !== 'live') {
        const stateMsg = meeting.status === 'scheduled'
          ? 'The associated meeting has not started yet. Wait for your lecturer to start the session.'
          : meeting.status === 'ended'
          ? 'The associated meeting has ended. This quiz is now closed.'
          : 'The associated meeting is not currently live.';
        return res.status(403).json({
          error: stateMsg,
          meetingStatus: meeting.status,
          requiresLiveMeeting: true,
        });
      }
    }

    // Reject if there is already an active attempt (session conflict).
    const activeAttempt = await SnapQuizAttempt.findOne({
      quiz: quiz._id, student: req.user._id, company: req.companyId,
      status: ATTEMPT_STATUSES.ACTIVE,
    });
    if (activeAttempt) {
      // Do NOT echo the sessionToken — the client must use the one it received
      // when the attempt was originally started.
      return res.status(409).json({
        error:    "You already have an active session for this quiz",
        attemptId: activeAttempt._id,
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
        timeLimitMinutes:               quiz.timeLimitMinutes,
        heartbeatIntervalSeconds:       quiz.heartbeatIntervalSeconds,
        heartbeatTimeoutSeconds:        quiz.heartbeatTimeoutSeconds,
        maxViolationsBeforeTermination: quiz.maxViolationsBeforeTermination,
        terminateOnTabSwitch:           quiz.terminateOnTabSwitch,
        terminateOnFocusLost:           quiz.terminateOnFocusLost,
        terminateOnFullscreenExit:      quiz.terminateOnFullscreenExit,
        preventCopyPaste:               quiz.preventCopyPaste,
        preventRightClick:              quiz.preventRightClick,
        preventPrintScreen:             quiz.preventPrintScreen,
        requireFullscreen:              quiz.requireFullscreen,
        showViolationWarnings:          quiz.showViolationWarnings,
        proctoringEnabled:              quiz.proctoringEnabled,
        snapshotIntervalSeconds:        quiz.snapshotIntervalSeconds,
        noiseDetectionThreshold:        quiz.noiseDetectionThreshold,
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
      // Return a graceful terminated response rather than 404 so the client
      // handles it via the success path (not the error catch block).
      return res.json({ terminated: true, reason: "session_conflict" });
    }

    // Check server-side expiry.
    const now = new Date();
    if (now > attempt.expiresAt) {
      await _autoSubmit(attempt);
      return res.json({ expired: true, terminated: false });
    }

    // Live meeting gate: if quiz requires a live meeting, verify it's still live.
    const quiz = await SnapQuiz.findById(attempt.quiz).select("requireLiveMeeting linkedMeeting").lean();
    if (quiz?.requireLiveMeeting && quiz?.linkedMeeting) {
      const meeting = await Meeting.findById(quiz.linkedMeeting).select("status").lean();
      if (!meeting || meeting.status !== 'live') {
        await _terminateSession(attempt, "Associated meeting ended — session auto-closed");
        return res.json({
          expired: false, terminated: true,
          meetingEnded: true,
          reason: "The associated meeting has ended. Your quiz has been auto-submitted.",
        });
      }
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

    // Fetch authoritative marks and questionType from the DB — never trust the client.
    const questionIds = [...new Set(responses.map(r => r.questionId).filter(Boolean))];
    const questions   = await SnapQuizQuestion.find(
      { _id: { $in: questionIds }, quiz: attempt.quiz, isActive: true },
      { marks: 1, questionType: 1 }
    ).lean();
    const qMap = Object.fromEntries(questions.map(q => [q._id.toString(), q]));

    const now = new Date();
    const ops = responses.map(r => {
      const q = qMap[r.questionId?.toString()];
      return {
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
              questionType:    q?.questionType ?? r.questionType,
              maxMarks:        q?.marks        ?? 1,  // server-side authoritative value
              firstAnsweredAt: now,
            },
          },
          upsert: true,
        },
      };
    });
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

    const now = new Date();

    // Enforce server-side expiry — if the timer has already expired, treat as
    // auto-submit so the student cannot gain extra time by delaying this call.
    if (attempt.expiresAt && now > attempt.expiresAt) {
      await _autoSubmit(attempt);
      return res.status(410).json({ error: "Session has expired and been auto-submitted" });
    }

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

    const result = await _upsertResult(attempt, quiz);

    return res.json({
      message:        "Attempt submitted",
      score:          attempt.rawScore,
      maxScore:       attempt.maxScore,
      percentage:     Math.round(attempt.percentageScore ?? 0),
      isPassed:       attempt.isPassed,
      integrityScore: result?.aiReport?.integrityScore ?? null,
      aiReport:       result?.aiReport ?? null,
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
      .select("maxViolationsBeforeTermination terminateOnTabSwitch terminateOnFocusLost terminateOnFullscreenExit showViolationWarnings preventCopyPaste preventRightClick preventPrintScreen")
      .lean();

    const { violationType, occurredAt, detail, snapshotUrl } = req.body;

    // Determine severity and whether this type is enforced.
    const isCriticalType = _isCriticalViolation(violationType);
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

    // Check termination threshold — use quiz config, fall back to 4.
    const maxViolations = quiz?.maxViolationsBeforeTermination || 4;
    const causedTermination = newCount >= maxViolations && isCriticalType;
    const actionTaken = causedTermination
      ? ACTIONS_TAKEN.TERMINATED
      : ACTIONS_TAKEN.WARNED;

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
      critical:                   isCriticalType,
      violationCount:             newCount,
      remainingBeforeTermination: Math.max(0, maxViolations - newCount),
    });
  } catch (err) {
    console.error("[snapQuiz student reportViolation]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Proctoring snapshot upload ───────────────────────────────────────────────

/**
 * POST /student/snap-quizzes/quizzes/:quizId/attempts/:attemptId/snapshots
 * Record a proctoring snapshot + process face verification enforcement.
 *
 * Body: {
 *   imageUrl, thumbnailUrl, eventType, relatedViolationId,
 *   faceDetected, faceCount, faceScore, similarityToStart
 * }
 *
 * Face enforcement policy:
 *   - No face detected → faceFailCount++
 *   - faceFailCount 1-2 → warn (status: "warn")
 *   - faceFailCount 3-4 → severe warn ("warn_severe")
 *   - faceFailCount >= 5 → auto-submit + flag account
 */
exports.recordSnapshot = async (req, res) => {
  try {
    const attempt = await _loadLockedAttempt(req);
    if (!attempt) return res.sendStatus(204);

    const quiz = await SnapQuiz.findById(attempt.quiz)
      .select("proctoringEnabled aiProctoringEnabled").lean();
    if (!quiz?.proctoringEnabled) return res.sendStatus(204);

    const {
      imageUrl, thumbnailUrl, eventType, relatedViolationId,
      faceDetected, faceCount, faceScore, similarityToStart,
    } = req.body;

    // Run Claude Haiku AI analysis when enabled and image data is present
    const aiFlags = [];
    let aiAnalysisDone = false;

    if (quiz.aiProctoringEnabled && imageUrl && imageUrl.startsWith('data:image')) {
      const base64 = imageUrl.split(',')[1];
      const analysis = await analyzeSnapshot(base64).catch(() => null);
      if (analysis) {
        aiAnalysisDone = true;
        if (!analysis.facePresent) {
          aiFlags.push({ flagType: "face_not_visible", confidence: 0.95, detail: "AI: no face detected" });
        }
        if (analysis.faceCount > 1) {
          aiFlags.push({ flagType: "multiple_faces", confidence: 0.95, detail: `AI: ${analysis.faceCount} faces detected` });
        }
        if (analysis.phoneVisible) {
          aiFlags.push({ flagType: "phone_detected", confidence: 0.9, detail: "AI: phone visible" });
        }
        if (analysis.suspiciousActivity) {
          aiFlags.push({ flagType: "suspicious_activity", confidence: 0.85, detail: analysis.notes || "AI: suspicious activity" });
        }
      }
    }

    // Fall back to client-reported face data if AI was not run
    if (!aiAnalysisDone) {
      if (faceDetected === false || faceDetected === 0) {
        aiFlags.push({ flagType: "face_not_visible", confidence: 1.0, detail: "No face detected" });
      }
      if (faceCount > 1) {
        aiFlags.push({ flagType: "multiple_faces", confidence: 1.0, detail: `${faceCount} faces detected` });
      }
      if (similarityToStart != null && similarityToStart < 0.5) {
        aiFlags.push({ flagType: "low_confidence", confidence: 1 - similarityToStart, detail: "Face similarity below threshold" });
      }
    }

    const aiRiskScore = aiFlags.length > 0 ? Math.min(1, aiFlags.length * 0.35) : 0;

    await SnapQuizProctoringEvent.create({
      attempt:              attempt._id,
      quiz:                 attempt.quiz,
      student:              attempt.student,
      company:              attempt.company,
      eventType:            eventType || "scheduled_snapshot",
      capturedAt:           new Date(),
      imageUrl:             imageUrl    || null,
      thumbnailUrl:         thumbnailUrl || null,
      relatedViolationId:   relatedViolationId || null,
      aiAnalysisCompleted:  aiAnalysisDone,
      aiAnalysisCompletedAt: aiAnalysisDone ? new Date() : null,
      aiFlags,
      aiRiskScore,
      reviewStatus:         aiFlags.length > 0 ? "flagged" : "pending",
    });

    // Face enforcement: only apply on periodic / violation snapshots when AI proctoring enabled
    if (quiz.aiProctoringEnabled && aiFlags.some(f => f.flagType === "face_not_visible" || f.flagType === "multiple_faces")) {
      attempt.faceFailCount = (attempt.faceFailCount || 0) + 1;

      if (attempt.faceFailCount >= 5) {
        // Auto-submit and flag
        await attempt.save();
        await _autoSubmit(attempt);
        return res.json({
          action: "auto_submitted",
          reason: "Face verification failed 5 or more times. Quiz auto-submitted.",
          faceFailCount: attempt.faceFailCount,
        });
      } else if (attempt.faceFailCount >= 3) {
        attempt.faceWarnCount = (attempt.faceWarnCount || 0) + 1;
        await attempt.save();
        return res.json({
          action: "warn_severe",
          warning: `Face not detected (${attempt.faceFailCount}/5). Quiz will be auto-submitted if this continues.`,
          faceFailCount: attempt.faceFailCount,
        });
      } else {
        attempt.faceWarnCount = (attempt.faceWarnCount || 0) + 1;
        await attempt.save();
        return res.json({
          action: "warn",
          warning: "Face not clearly visible. Please ensure your face is visible to the camera.",
          faceFailCount: attempt.faceFailCount,
        });
      }
    }

    // Save updated attempt if faceFailCount changed
    if (attempt.isModified()) await attempt.save();

    return res.json({ action: "ok", faceFailCount: attempt.faceFailCount || 0 });
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

  // Session-lock check — token is REQUIRED when the attempt has one.
  // Omitting the header is treated the same as sending the wrong token.
  const token = req.headers["x-session-token"];
  if (attempt.sessionToken) {
    if (!token || token !== attempt.sessionToken) {
      await _terminateSession(attempt, "Session conflict: duplicate tab or device detected");
      return null;
    }
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

// Grading delegated to shared service — see src/services/quizGradingService.js
const _autoGradeAttempt = autoGradeAttempt;

async function _upsertResult(attempt, quiz, wasTerminated = false) {
  const now = new Date();
  const violations = await SnapQuizViolationLog.countDocuments({ attempt: attempt._id });
  const integrityFlag = wasTerminated || violations > 0;

  // For proctored quizzes generate an AI integrity report (fire-and-forget safe)
  let aiReport = undefined;
  const quizDoc = quiz?.quizLevel
    ? quiz
    : await SnapQuiz.findById(attempt.quiz).select("quizLevel aiProctoringEnabled").lean();

  if (quizDoc?.quizLevel === "proctored" || quizDoc?.aiProctoringEnabled) {
    aiReport = await generateQuizReport(attempt._id).catch(() => null);
  }

  const setFields = {
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
  };
  if (aiReport) setFields.aiReport = aiReport;

  return SnapQuizResult.findOneAndUpdate(
    { quiz: attempt.quiz, student: attempt.student, company: attempt.company },
    {
      $set:  setFields,
      $inc:  { totalAttempts: 1, completedAttempts: 1 },
      $push: {
        breakdown: {
          attemptId:        attempt._id,
          attemptNumber:    attempt.attemptNumber,
          status:           attempt.status,
          rawScore:         attempt.rawScore,
          maxScore:         attempt.maxScore,
          percentageScore:  attempt.percentageScore,
          isPassed:         attempt.isPassed,
          gradingStatus:    attempt.gradingStatus,
          submittedAt:      attempt.submittedAt,
          timeSpentSeconds: attempt.timeSpentSeconds,
          isTerminated:     attempt.isTerminated || false,
          violationCount:   attempt.violationCount,
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
  // Quiz-configured violations — only critical when the quiz setting is enabled
  if (type === "tab_switch"      && quiz.terminateOnTabSwitch)      return true;
  if (type === "focus_lost"      && quiz.terminateOnFocusLost)      return true;
  if (type === "fullscreen_exit" && quiz.terminateOnFullscreenExit) return true;
  if (type === "copy_paste"      && quiz.preventCopyPaste)          return true;
  if (type === "right_click"     && quiz.preventRightClick)         return true;
  if (type === "print_screen"    && quiz.preventPrintScreen)        return true;
  // Always-critical: security and proctoring events (not configurable)
  return [
    "session_conflict", "devtools_open", "multiple_windows",
    "phone_detected", "head_turn", "multiple_faces",
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

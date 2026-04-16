"use strict";

/**
 * normalQuizStudentController
 *
 * Handles all student-facing NormalQuiz operations:
 *   - Quiz discovery (published quizzes for enrolled courses)
 *   - Starting / resuming an attempt
 *   - Saving answers (auto-save)
 *   - Submitting an attempt
 *   - Viewing results (after release)
 *   - Passive anti-cheat event logging
 *
 * All handlers assume the middleware chain has already run:
 *   authenticate → requireCompanyScope → requireAcademicRole("student")
 *   → requireStudentCourseEnrollment (where course-scoped)
 *
 * req attachments used:
 *   req.user        — authenticated student
 *   req.companyId   — tenant scope
 *   req.course      — loaded Course (from enrollment middleware)
 *   req.enrollment  — StudentCourseEnrollment document
 */

const mongoose = require("mongoose");
const NormalQuiz         = require("../models/NormalQuiz");
const NormalQuizQuestion = require("../models/NormalQuizQuestion");
const NormalQuizAttempt  = require("../models/NormalQuizAttempt");
const NormalQuizResponse = require("../models/NormalQuizResponse");
const NormalQuizResult   = require("../models/NormalQuizResult");
const { ATTEMPT_STATUSES, GRADING_STATUSES } = require("../models/NormalQuizAttempt");
const { QUESTION_TYPES, MANUAL_GRADE_TYPES } = require("../models/NormalQuizQuestion");

// ─── Quiz discovery ───────────────────────────────────────────────────────────

/**
 * GET /student/courses/:courseId/quizzes
 * List published, active quizzes for a course the student is enrolled in.
 */
exports.listQuizzes = async (req, res) => {
  try {
    const quizzes = await NormalQuiz.find({
      company:     req.companyId,
      course:      req.params.courseId,
      isPublished: true,
      isActive:    true,
    })
      .select("-attachments")
      .sort({ createdAt: -1 })
      .lean();

    // Attach per-quiz attempt count for the student.
    const quizIds = quizzes.map(q => q._id);
    const counts = await NormalQuizAttempt.aggregate([
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

    const result = quizzes.map(q => ({
      ...q,
      myAttemptCount: countMap[q._id.toString()] || 0,
    }));

    return res.json({ quizzes: result });
  } catch (err) {
    console.error("[student listQuizzes]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /student/quizzes/:quizId
 * Get quiz metadata (no correct answers exposed).
 */
exports.getQuiz = async (req, res) => {
  try {
    const quiz = await NormalQuiz.findOne({
      _id:         req.params.quizId,
      company:     req.companyId,
      isPublished: true,
      isActive:    true,
    })
      .select("-attachments")
      .lean();

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    return res.json({ quiz });
  } catch (err) {
    console.error("[student getQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Attempt lifecycle ────────────────────────────────────────────────────────

/**
 * POST /student/quizzes/:quizId/attempts/start
 * Start a new attempt or resume an in-progress one.
 * Returns { attempt, questions } — questions stripped of correct answers.
 */
exports.startAttempt = async (req, res) => {
  try {
    const quiz = await NormalQuiz.findOne({
      _id:         req.params.quizId,
      company:     req.companyId,
      isPublished: true,
      isActive:    true,
    }).lean();

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }
    if (!quiz.isOpen && !(quiz.startTime == null && quiz.endTime == null)) {
      // isOpen is a virtual — recalculate since we used .lean()
      const now = new Date();
      const after  = quiz.startTime && now < quiz.startTime;
      const before = quiz.endTime && now > new Date(quiz.endTime.getTime() + (quiz.gracePeriodSeconds || 0) * 1000);
      if (after || before) {
        return res.status(403).json({ error: "This quiz is not currently open" });
      }
    }

    // Check if a live attempt exists.
    let attempt = await NormalQuizAttempt.findOne({
      quiz:    quiz._id,
      student: req.user._id,
      company: req.companyId,
      status:  ATTEMPT_STATUSES.IN_PROGRESS,
    });

    if (attempt) {
      // Resume existing attempt.
      const questions = await _buildQuestionsForAttempt(attempt, quiz);
      return res.json({ attempt, questions, resumed: true });
    }

    // Check attempt limit.
    if (quiz.allowedAttempts > 0) {
      const pastCount = await NormalQuizAttempt.countDocuments({
        quiz:    quiz._id,
        student: req.user._id,
        company: req.companyId,
        status:  { $in: [ATTEMPT_STATUSES.SUBMITTED, ATTEMPT_STATUSES.AUTO_SUBMITTED] },
      });
      if (pastCount >= quiz.allowedAttempts) {
        return res.status(403).json({
          error: `You have used all ${quiz.allowedAttempts} allowed attempt(s)`,
        });
      }
    }

    // Determine attempt number.
    const lastAttempt = await NormalQuizAttempt.findOne({
      quiz:    quiz._id,
      student: req.user._id,
      company: req.companyId,
    }).sort({ attemptNumber: -1 }).select("attemptNumber").lean();
    const attemptNumber = lastAttempt ? lastAttempt.attemptNumber + 1 : 1;

    // Build question order (shuffle if randomizeQuestions).
    const allQuestions = await NormalQuizQuestion.find({ quiz: quiz._id, isActive: true })
      .sort({ orderIndex: 1 })
      .lean();

    let questionOrder = allQuestions.map(q => q._id);
    if (quiz.randomizeQuestions) {
      questionOrder = _shuffleArray([...questionOrder]);
    }

    // Build per-question option shuffle map if randomizeOptions.
    let optionOrders = null;
    if (quiz.randomizeOptions) {
      optionOrders = {};
      allQuestions.forEach(q => {
        if (q.options && q.options.length > 1) {
          optionOrders[q._id.toString()] = _shuffleIndices(q.options.length);
        }
      });
    }

    // Server-side expiry deadline.
    const expiresAt = quiz.timeLimitMinutes
      ? new Date(Date.now() + quiz.timeLimitMinutes * 60 * 1000)
      : null;

    // Capture device info (passive).
    const device = quiz.logIpAddress
      ? {
          ipAddress: req.ip || req.connection?.remoteAddress || null,
          userAgent: req.headers["user-agent"] || null,
          deviceId:  req.headers["x-device-id"] || null,
          platform:  _detectPlatform(req.headers["user-agent"]),
        }
      : {};

    attempt = await NormalQuizAttempt.create({
      quiz:          quiz._id,
      student:       req.user._id,
      company:       req.companyId,
      attemptNumber,
      questionOrder,
      optionOrders,
      expiresAt,
      device,
    });

    const questions = await _buildQuestionsForAttempt(attempt, quiz);
    return res.status(201).json({ attempt, questions, resumed: false });
  } catch (err) {
    if (err.code === 11000) {
      // Race condition: duplicate attempt — return existing in-progress attempt.
      const attempt = await NormalQuizAttempt.findOne({
        quiz:    req.params.quizId,
        student: req.user._id,
        company: req.companyId,
        status:  ATTEMPT_STATUSES.IN_PROGRESS,
      });
      if (attempt) return res.json({ attempt, questions: [], resumed: true });
    }
    console.error("[student startAttempt]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PUT /student/quizzes/:quizId/attempts/:attemptId/responses
 * Save (upsert) one or more question responses during the attempt.
 * Body: { responses: [{ questionId, ...answerFields, isFlagged, timeSpentSeconds }] }
 * Idempotent — can be called on every auto-save tick.
 */
exports.saveResponses = async (req, res) => {
  try {
    const attempt = await _loadActiveAttempt(req);
    if (!attempt) {
      return res.status(404).json({ error: "Active attempt not found or already submitted" });
    }

    const { responses } = req.body;
    if (!Array.isArray(responses) || responses.length === 0) {
      return res.status(400).json({ error: "responses array is required" });
    }

    const now = new Date();
    const bulkOps = responses.map(r => {
      const answerFields = _extractAnswerFields(r);
      return {
        updateOne: {
          filter: {
            attempt:  attempt._id,
            question: r.questionId,
            company:  req.companyId,
          },
          update: {
            $set: {
              ...answerFields,
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
      };
    });

    await NormalQuizResponse.bulkWrite(bulkOps);

    return res.json({ message: "Responses saved" });
  } catch (err) {
    console.error("[student saveResponses]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /student/quizzes/:quizId/attempts/:attemptId/submit
 * Submit the attempt. Triggers auto-grading for auto-gradable questions.
 */
exports.submitAttempt = async (req, res) => {
  try {
    const attempt = await _loadActiveAttempt(req);
    if (!attempt) {
      return res.status(404).json({ error: "Active attempt not found or already submitted" });
    }

    const now        = new Date();
    const startedAt  = attempt.startedAt || now;
    const timeSpent  = Math.round((now.getTime() - startedAt.getTime()) / 1000);

    attempt.status           = ATTEMPT_STATUSES.SUBMITTED;
    attempt.submittedAt      = now;
    attempt.timeSpentSeconds = timeSpent;
    await attempt.save();

    // Auto-grade all auto-gradable questions.
    const { rawScore, maxScore, hasManual } = await _autoGradeAttempt(attempt._id, req.companyId);

    // Update attempt scores.
    const quiz = await NormalQuiz.findById(attempt.quiz).select("passMark autoReleaseResults").lean();
    const pct  = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
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

    // Upsert the NormalQuizResult document.
    await _upsertResult(attempt, quiz);

    return res.json({
      message:        "Attempt submitted",
      attempt: {
        _id:             attempt._id,
        status:          attempt.status,
        rawScore:        attempt.rawScore,
        maxScore:        attempt.maxScore,
        percentageScore: attempt.percentageScore,
        isPassed:        attempt.isPassed,
        gradingStatus:   attempt.gradingStatus,
      },
    });
  } catch (err) {
    console.error("[student submitAttempt]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Results ──────────────────────────────────────────────────────────────────

/**
 * GET /student/quizzes/:quizId/result
 * Get the student's official result for a quiz (only if released).
 */
exports.getResult = async (req, res) => {
  try {
    const result = await NormalQuizResult.findOne({
      quiz:    req.params.quizId,
      student: req.user._id,
      company: req.companyId,
    }).lean();

    if (!result) {
      return res.status(404).json({ error: "No result found for this quiz" });
    }

    if (!result.isReleased) {
      return res.status(403).json({ error: "Results have not been released yet" });
    }

    return res.json({ result });
  } catch (err) {
    console.error("[student getResult]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /student/quizzes/:quizId/attempts/:attemptId/review
 * Review an attempt's responses (only if result released and quiz allows it).
 */
exports.reviewAttempt = async (req, res) => {
  try {
    const quiz = await NormalQuiz.findOne({
      _id:     req.params.quizId,
      company: req.companyId,
    }).lean();

    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const attempt = await NormalQuizAttempt.findOne({
      _id:     req.params.attemptId,
      quiz:    quiz._id,
      student: req.user._id,
      company: req.companyId,
    }).lean();

    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    if (!attempt.isResultReleased) {
      return res.status(403).json({ error: "Results have not been released for this attempt" });
    }

    const now         = new Date();
    const afterClose  = quiz.endTime && now > quiz.endTime;
    const canShowAnswers =
      (quiz.showAnswersAfterSubmission) ||
      (quiz.showAnswersAfterClose && afterClose);

    // Load responses with optional answer reveal.
    const responseSelect = canShowAnswers
      ? ""
      : "-graderAnnotation";

    const responses = await NormalQuizResponse.find({ attempt: attempt._id })
      .populate({
        path:   "question",
        select: canShowAnswers
          ? "questionText questionType marks correctOptionIndex correctOptionIndices correctBoolean correctAnswerText numericAnswer explanation"
          : "questionText questionType marks",
      })
      .select(responseSelect)
      .lean();

    return res.json({ attempt, responses, canShowAnswers });
  } catch (err) {
    console.error("[student reviewAttempt]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Anti-cheat event logging ─────────────────────────────────────────────────

/**
 * POST /student/quizzes/:quizId/attempts/:attemptId/events
 * Log passive anti-cheat events (tab switch, focus lost, etc.).
 * Fire-and-forget from the client; always returns 204.
 * Body: { events: [{ event, occurredAt, detail }] }
 */
exports.logEvents = async (req, res) => {
  try {
    const attempt = await _loadActiveAttempt(req);
    if (!attempt) {
      return res.sendStatus(204); // already submitted — silently ignore
    }

    const quiz = await NormalQuiz.findById(attempt.quiz)
      .select("logTabSwitches logFocusLost")
      .lean();

    const { events } = req.body;
    if (!Array.isArray(events) || events.length === 0) {
      return res.sendStatus(204);
    }

    let tabSwitchDelta  = 0;
    let focusLostDelta  = 0;
    const suspicious = [];

    events.forEach(evt => {
      if (evt.event === "tab_switch" && quiz?.logTabSwitches)  tabSwitchDelta++;
      if (evt.event === "focus_lost" && quiz?.logFocusLost)    focusLostDelta++;
      suspicious.push({
        event:      evt.event,
        occurredAt: evt.occurredAt ? new Date(evt.occurredAt) : new Date(),
        detail:     evt.detail || null,
      });
    });

    await NormalQuizAttempt.updateOne(
      { _id: attempt._id },
      {
        $inc:  { tabSwitchCount: tabSwitchDelta, focusLostCount: focusLostDelta },
        $push: { suspiciousEvents: { $each: suspicious } },
      }
    );

    return res.sendStatus(204);
  } catch (err) {
    console.error("[student logEvents]", err);
    return res.sendStatus(204); // never block the student for a logging failure
  }
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Load an in-progress attempt owned by the current student. */
async function _loadActiveAttempt(req) {
  return NormalQuizAttempt.findOne({
    _id:     req.params.attemptId,
    quiz:    req.params.quizId,
    student: req.user._id,
    company: req.companyId,
    status:  ATTEMPT_STATUSES.IN_PROGRESS,
  });
}

/**
 * Build the ordered question list for an attempt.
 * Strips correct-answer fields for in-progress attempts.
 */
async function _buildQuestionsForAttempt(attempt, quiz) {
  const questionMap = {};
  const rawQuestions = await NormalQuizQuestion.find({
    _id:     { $in: attempt.questionOrder },
    isActive: true,
  })
    .select("-correctOptionIndex -correctOptionIndices -correctBoolean -correctAnswerText -acceptedAnswers -numericAnswer -modelAnswer -mathsDrawing.markingGuide -mathsDrawing.partialCreditGuidance")
    .lean();

  rawQuestions.forEach(q => { questionMap[q._id.toString()] = q; });

  return attempt.questionOrder
    .map(qId => {
      const q = questionMap[qId.toString()];
      if (!q) return null;

      // Apply option shuffle if applicable.
      if (quiz.randomizeOptions && attempt.optionOrders?.[qId.toString()] && q.options?.length) {
        const shuffleIndices = attempt.optionOrders[qId.toString()];
        q.options = shuffleIndices.map(i => q.options[i]);
        if (q.optionMedia?.length) {
          q.optionMedia = shuffleIndices.map(i => q.optionMedia[i] || null);
        }
      }
      return q;
    })
    .filter(Boolean);
}

/**
 * Auto-grade all auto-gradable responses for an attempt.
 * Returns { rawScore, maxScore, hasManual }.
 */
async function _autoGradeAttempt(attemptId, companyId) {
  const responses = await NormalQuizResponse.find({ attempt: attemptId }).lean();
  const questionIds = responses.map(r => r.question);
  const questions   = await NormalQuizQuestion.find({ _id: { $in: questionIds } }).lean();
  const qMap        = {};
  questions.forEach(q => { qMap[q._id.toString()] = q; });

  let rawScore = 0;
  let maxScore = 0;
  let hasManual = false;

  const bulkOps = [];

  for (const response of responses) {
    const q = qMap[response.question.toString()];
    if (!q) continue;

    maxScore += q.marks || 1;

    if (MANUAL_GRADE_TYPES.has(q.questionType)) {
      hasManual = true;
      bulkOps.push({
        updateOne: {
          filter: { _id: response._id },
          update: { $set: { gradingStatus: "pending_manual", isAutoGraded: false } },
        },
      });
      continue;
    }

    // Auto-grade.
    const { isCorrect, earnedMarks } = _scoreResponse(response, q);
    rawScore += earnedMarks;

    bulkOps.push({
      updateOne: {
        filter: { _id: response._id },
        update: {
          $set: {
            isCorrect,
            earnedMarks,
            isAutoGraded:  true,
            gradingStatus: "auto_graded",
          },
        },
      },
    });
  }

  if (bulkOps.length > 0) {
    await NormalQuizResponse.bulkWrite(bulkOps);
  }

  return { rawScore, maxScore, hasManual };
}

/** Score a single auto-gradable response against the question. */
function _scoreResponse(response, question) {
  const marks = question.marks || 1;
  let isCorrect = false;

  switch (question.questionType) {
    case QUESTION_TYPES.MCQ:
      isCorrect = response.selectedOptionIndex === question.correctOptionIndex;
      break;

    case QUESTION_TYPES.MCQ_MULTI: {
      const correct = new Set((question.correctOptionIndices || []).map(String));
      const chosen  = new Set((response.selectedOptionIndices || []).map(String));
      isCorrect = correct.size === chosen.size &&
                  [...correct].every(v => chosen.has(v));
      break;
    }

    case QUESTION_TYPES.TRUE_FALSE:
      isCorrect = response.selectedBoolean === question.correctBoolean;
      break;

    case QUESTION_TYPES.SHORT_ANSWER:
    case QUESTION_TYPES.FILL_BLANK: {
      const studentAnswer = (response.textAnswer || "").trim().toLowerCase();
      const correct       = (question.correctAnswerText || "").trim().toLowerCase();
      const accepted      = (question.acceptedAnswers || []).map(a => a.trim().toLowerCase());
      isCorrect = studentAnswer === correct || accepted.includes(studentAnswer);
      break;
    }

    case QUESTION_TYPES.NUMERIC: {
      const expected   = question.numericAnswer?.value;
      const tolerance  = question.numericAnswer?.tolerance || 0;
      const studentNum = response.numericAnswer;
      if (expected != null && studentNum != null) {
        isCorrect = Math.abs(studentNum - expected) <= tolerance;
      }
      break;
    }

    default:
      isCorrect = false;
  }

  // Partial marks are not auto-computed — handled in manual grading.
  return { isCorrect, earnedMarks: isCorrect ? marks : 0 };
}

/** Upsert a NormalQuizResult document after submission. */
async function _upsertResult(attempt, quiz) {
  const now = new Date();
  await NormalQuizResult.findOneAndUpdate(
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
        isReleased:       quiz?.autoReleaseResults && attempt.gradingStatus === "auto_graded"
                            ? true
                            : false,
        releasedAt:       quiz?.autoReleaseResults && attempt.gradingStatus === "auto_graded"
                            ? now
                            : null,
      },
      $inc: {
        totalAttempts:     1,
        completedAttempts: 1,
      },
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
          timeSpentSeconds:attempt.timeSpentSeconds,
        },
      },
    },
    { upsert: true, new: true }
  );
}

/** Fisher-Yates shuffle returning a new array. */
function _shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Returns a shuffled array of indices [0, 1, ..., n-1]. */
function _shuffleIndices(n) {
  return _shuffleArray(Array.from({ length: n }, (_, i) => i));
}

/** Naive platform detection from User-Agent string. */
function _detectPlatform(ua) {
  if (!ua) return "unknown";
  ua = ua.toLowerCase();
  if (/mobile|android|iphone|ipod/.test(ua)) return "mobile";
  if (/tablet|ipad/.test(ua)) return "tablet";
  if (/windows|macintosh|linux/.test(ua)) return "desktop";
  return "unknown";
}

/** Extract answer fields from a raw response body entry. */
function _extractAnswerFields(r) {
  const fields = {};
  if (r.selectedOptionIndex  !== undefined) fields.selectedOptionIndex  = r.selectedOptionIndex;
  if (r.selectedOptionIndices !== undefined) fields.selectedOptionIndices = r.selectedOptionIndices;
  if (r.selectedBoolean      !== undefined) fields.selectedBoolean      = r.selectedBoolean;
  if (r.textAnswer           !== undefined) fields.textAnswer           = r.textAnswer;
  if (r.numericAnswer        !== undefined) fields.numericAnswer        = r.numericAnswer;
  if (r.equationAnswer       !== undefined) fields.equationAnswer       = r.equationAnswer;
  if (r.mathsWorkingsText    !== undefined) fields.mathsWorkingsText    = r.mathsWorkingsText;
  if (r.drawingData          !== undefined) fields.drawingData          = r.drawingData;
  return fields;
}

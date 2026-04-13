"use strict";

/**
 * snapQuizLecturerController
 *
 * Handles all lecturer-facing SnapQuiz operations:
 *   - Quiz CRUD (with structural edit guards)
 *   - Question CRUD
 *   - Attempt monitoring (live + post-session)
 *   - Manual grading
 *   - Result release
 *   - Violation log review
 *   - Proctoring event review (if enabled)
 *
 * All handlers assume:
 *   authenticate → requireCompanyScope → requireAcademicRole("lecturer"|"admin")
 *   → requireAssessmentOwnership(SnapQuiz)  [quiz-scoped routes]
 */

const mongoose = require("mongoose");
const SnapQuiz               = require("../models/SnapQuiz");
const SnapQuizQuestion       = require("../models/SnapQuizQuestion");
const SnapQuizAttempt        = require("../models/SnapQuizAttempt");
const SnapQuizResponse       = require("../models/SnapQuizResponse");
const SnapQuizViolationLog   = require("../models/SnapQuizViolationLog");
const SnapQuizProctoringEvent = require("../models/SnapQuizProctoringEvent");
const SnapQuizResult         = require("../models/SnapQuizResult");
const { SNAP_QUIZ_STATUSES } = require("../models/SnapQuiz");
const { GRADING_STATUSES }   = require("../models/SnapQuizAttempt");

// ─── Quiz CRUD ───────────────────────────────────────────────────────────────

/**
 * POST /lecturer/snap-quizzes
 */
exports.createQuiz = async (req, res) => {
  try {
    const {
      courseId, title, description, instructions, quizType,
      totalMarks, passMark, scorePolicy,
      timeLimitMinutes, startTime, endTime, gracePeriodSeconds, lockAfterEndTime,
      allowedAttempts,
      enforceSessionLock, heartbeatIntervalSeconds, heartbeatTimeoutSeconds,
      maxViolationsBeforeTermination,
      terminateOnTabSwitch, terminateOnFocusLost, terminateOnFullscreenExit,
      requireFullscreen, preventCopyPaste, preventRightClick, preventPrintScreen,
      showViolationWarnings,
      proctoringEnabled, snapshotIntervalSeconds, aiProctoringEnabled,
      showResultAfterSubmission, showAnswersAfterSubmission,
      showAnswersAfterClose, autoReleaseResults,
      randomizeQuestions, randomizeOptions,
    } = req.body;

    const quiz = await SnapQuiz.create({
      company:   req.companyId,
      course:    courseId,
      createdBy: req.user._id,
      title, description, instructions, quizType,
      totalMarks, passMark, scorePolicy,
      timeLimitMinutes, startTime, endTime, gracePeriodSeconds, lockAfterEndTime,
      allowedAttempts,
      enforceSessionLock, heartbeatIntervalSeconds, heartbeatTimeoutSeconds,
      maxViolationsBeforeTermination,
      terminateOnTabSwitch, terminateOnFocusLost, terminateOnFullscreenExit,
      requireFullscreen, preventCopyPaste, preventRightClick, preventPrintScreen,
      showViolationWarnings,
      proctoringEnabled, snapshotIntervalSeconds, aiProctoringEnabled,
      showResultAfterSubmission, showAnswersAfterSubmission,
      showAnswersAfterClose, autoReleaseResults,
      randomizeQuestions, randomizeOptions,
    });

    return res.status(201).json({ quiz });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    console.error("[snapQuiz createQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/snap-quizzes?courseId=&status=&page=&limit=
 */
exports.listQuizzes = async (req, res) => {
  try {
    const { courseId, status, page = 1, limit = 20 } = req.query;
    const filter = { company: req.companyId, createdBy: req.user._id };
    if (courseId) filter.course = courseId;
    if (status)   filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [quizzes, total] = await Promise.all([
      SnapQuiz.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      SnapQuiz.countDocuments(filter),
    ]);

    return res.json({ quizzes, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[snapQuiz listQuizzes]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/snap-quizzes/:quizId
 */
exports.getQuiz = async (req, res) => {
  try {
    return res.json({ quiz: req.assessment });
  } catch (err) {
    console.error("[snapQuiz getQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PUT /lecturer/snap-quizzes/:quizId
 * Block structural edits (timeLimitMinutes, startTime, endTime) after first attempt.
 */
exports.updateQuiz = async (req, res) => {
  try {
    const quiz = req.assessment;

    const attemptCount = await SnapQuizAttempt.countDocuments({ quiz: quiz._id });
    const STRUCTURAL = ["timeLimitMinutes", "startTime", "endTime", "allowedAttempts",
                        "maxViolationsBeforeTermination", "passMark", "scorePolicy"];
    if (attemptCount > 0 && STRUCTURAL.some(f => req.body[f] !== undefined)) {
      return res.status(409).json({
        error: "Cannot change structural fields after attempts have started",
      });
    }

    const updatable = [
      "title","description","instructions","quizType",
      "totalMarks","passMark","scorePolicy",
      "timeLimitMinutes","startTime","endTime","gracePeriodSeconds","lockAfterEndTime",
      "allowedAttempts",
      "enforceSessionLock","heartbeatIntervalSeconds","heartbeatTimeoutSeconds",
      "maxViolationsBeforeTermination",
      "terminateOnTabSwitch","terminateOnFocusLost","terminateOnFullscreenExit",
      "requireFullscreen","preventCopyPaste","preventRightClick","preventPrintScreen",
      "showViolationWarnings",
      "proctoringEnabled","snapshotIntervalSeconds","aiProctoringEnabled",
      "showResultAfterSubmission","showAnswersAfterSubmission",
      "showAnswersAfterClose","autoReleaseResults",
      "randomizeQuestions","randomizeOptions",
    ];
    updatable.forEach(f => { if (req.body[f] !== undefined) quiz[f] = req.body[f]; });
    quiz.updatedBy = req.user._id;
    await quiz.save();

    return res.json({ quiz });
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    console.error("[snapQuiz updateQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /lecturer/snap-quizzes/:quizId/publish
 */
exports.publishQuiz = async (req, res) => {
  try {
    const quiz = req.assessment;

    if (quiz.status !== SNAP_QUIZ_STATUSES.DRAFT) {
      return res.status(409).json({ error: "Only draft quizzes can be published" });
    }

    const questionCount = await SnapQuizQuestion.countDocuments({
      quiz: quiz._id, isActive: true,
    });
    if (questionCount === 0) {
      return res.status(422).json({ error: "Quiz must have at least one active question before publishing" });
    }

    quiz.status      = SNAP_QUIZ_STATUSES.PUBLISHED;
    quiz.isPublished = true;
    quiz.publishedAt = new Date();
    quiz.updatedBy   = req.user._id;
    await quiz.save();

    return res.json({ quiz });
  } catch (err) {
    console.error("[snapQuiz publishQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /lecturer/snap-quizzes/:quizId/open
 * Manually open the quiz (override startTime gate if needed).
 */
exports.openQuiz = async (req, res) => {
  try {
    const quiz = req.assessment;
    if (quiz.status !== SNAP_QUIZ_STATUSES.PUBLISHED) {
      return res.status(409).json({ error: "Only published quizzes can be opened" });
    }
    quiz.status   = SNAP_QUIZ_STATUSES.OPEN;
    quiz.openedAt = new Date();
    quiz.updatedBy = req.user._id;
    await quiz.save();
    return res.json({ quiz });
  } catch (err) {
    console.error("[snapQuiz openQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /lecturer/snap-quizzes/:quizId/close
 */
exports.closeQuiz = async (req, res) => {
  try {
    const quiz = req.assessment;
    if (![SNAP_QUIZ_STATUSES.PUBLISHED, SNAP_QUIZ_STATUSES.OPEN].includes(quiz.status)) {
      return res.status(409).json({ error: "Only published or open quizzes can be closed" });
    }

    // Force-submit all remaining active attempts.
    const activeAttempts = await SnapQuizAttempt.find({
      quiz:   quiz._id,
      status: "active",
    }).select("_id");

    if (activeAttempts.length > 0) {
      const ids = activeAttempts.map(a => a._id);
      await SnapQuizAttempt.updateMany(
        { _id: { $in: ids } },
        {
          $set: {
            status:      "auto_submitted",
            submittedAt: new Date(),
          },
        }
      );
    }

    quiz.status    = SNAP_QUIZ_STATUSES.CLOSED;
    quiz.closedAt  = new Date();
    quiz.updatedBy = req.user._id;
    await quiz.save();

    return res.json({ quiz, autoSubmittedCount: activeAttempts.length });
  } catch (err) {
    console.error("[snapQuiz closeQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /lecturer/snap-quizzes/:quizId
 */
exports.deleteQuiz = async (req, res) => {
  try {
    const quiz = req.assessment;
    const attemptCount = await SnapQuizAttempt.countDocuments({ quiz: quiz._id });

    if (attemptCount > 0) {
      quiz.status     = SNAP_QUIZ_STATUSES.ARCHIVED;
      quiz.isActive   = false;
      quiz.archivedAt = new Date();
      quiz.archivedBy = req.user._id;
      await quiz.save();
      return res.json({ message: "Quiz archived (attempts exist)" });
    }

    await SnapQuizQuestion.deleteMany({ quiz: quiz._id });
    await quiz.deleteOne();
    return res.json({ message: "Quiz deleted" });
  } catch (err) {
    console.error("[snapQuiz deleteQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Question CRUD ────────────────────────────────────────────────────────────

exports.createQuestion = async (req, res) => {
  try {
    const quiz = req.assessment;
    if ([SNAP_QUIZ_STATUSES.CLOSED, SNAP_QUIZ_STATUSES.ARCHIVED].includes(quiz.status)) {
      return res.status(409).json({ error: "Cannot add questions to a closed or archived quiz" });
    }

    const last = await SnapQuizQuestion.findOne({ quiz: quiz._id })
      .sort({ orderIndex: -1 }).select("orderIndex").lean();
    const orderIndex = req.body.orderIndex ?? (last ? last.orderIndex + 1 : 0);

    const question = await SnapQuizQuestion.create({
      quiz:      quiz._id,
      company:   req.companyId,
      createdBy: req.user._id,
      ...req.body,
      orderIndex,
    });

    await SnapQuiz.updateOne({ _id: quiz._id }, { $inc: { totalMarks: question.marks || 1 } });

    return res.status(201).json({ question });
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    console.error("[snapQuiz createQuestion]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.listQuestions = async (req, res) => {
  try {
    const questions = await SnapQuizQuestion.find({ quiz: req.assessment._id })
      .sort({ orderIndex: 1 }).lean();
    return res.json({ questions });
  } catch (err) {
    console.error("[snapQuiz listQuestions]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.updateQuestion = async (req, res) => {
  try {
    const question = await SnapQuizQuestion.findOne({
      _id: req.params.questionId, quiz: req.assessment._id, company: req.companyId,
    });
    if (!question) return res.status(404).json({ error: "Question not found" });

    const oldMarks = question.marks;
    const updatable = [
      "questionType","questionText","media","options","optionMedia",
      "correctOptionIndex","correctOptionIndices","correctBoolean",
      "correctAnswerText","acceptedAnswers","numericAnswer","modelAnswer",
      "marks","allowPartialMarks","mathsDrawing","explanation","orderIndex","isActive",
    ];
    updatable.forEach(f => { if (req.body[f] !== undefined) question[f] = req.body[f]; });
    await question.save();

    const diff = (question.marks || 1) - (oldMarks || 1);
    if (diff !== 0) {
      await SnapQuiz.updateOne({ _id: req.assessment._id }, { $inc: { totalMarks: diff } });
    }

    return res.json({ question });
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    console.error("[snapQuiz updateQuestion]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteQuestion = async (req, res) => {
  try {
    const question = await SnapQuizQuestion.findOne({
      _id: req.params.questionId, quiz: req.assessment._id, company: req.companyId,
    });
    if (!question) return res.status(404).json({ error: "Question not found" });
    question.isActive = false;
    await question.save();
    return res.json({ message: "Question deactivated" });
  } catch (err) {
    console.error("[snapQuiz deleteQuestion]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.reorderQuestions = async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: "order must be an array" });
    const ops = order.map(({ questionId, orderIndex }) => ({
      updateOne: {
        filter: { _id: questionId, quiz: req.assessment._id, company: req.companyId },
        update: { $set: { orderIndex } },
      },
    }));
    await SnapQuizQuestion.bulkWrite(ops);
    return res.json({ message: "Questions reordered" });
  } catch (err) {
    console.error("[snapQuiz reorderQuestions]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Attempt monitoring ───────────────────────────────────────────────────────

exports.listAttempts = async (req, res) => {
  try {
    const { status, gradingStatus, studentId, page = 1, limit = 30 } = req.query;
    const filter = { quiz: req.assessment._id, company: req.companyId };
    if (status)        filter.status = status;
    if (gradingStatus) filter.gradingStatus = gradingStatus;
    if (studentId)     filter.student = studentId;

    const skip = (Number(page) - 1) * Number(limit);
    const [attempts, total] = await Promise.all([
      SnapQuizAttempt.find(filter)
        .populate("student", "name email studentId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      SnapQuizAttempt.countDocuments(filter),
    ]);

    return res.json({ attempts, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[snapQuiz listAttempts]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAttemptDetail = async (req, res) => {
  try {
    const attempt = await SnapQuizAttempt.findOne({
      _id: req.params.attemptId, quiz: req.assessment._id, company: req.companyId,
    }).populate("student", "name email studentId").lean();

    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    const [responses, violations] = await Promise.all([
      SnapQuizResponse.find({ attempt: attempt._id })
        .populate("question", "questionText questionType marks correctOptionIndex correctOptionIndices correctBoolean correctAnswerText numericAnswer modelAnswer")
        .sort({ createdAt: 1 })
        .lean(),
      SnapQuizViolationLog.find({ attempt: attempt._id })
        .sort({ occurredAt: 1 })
        .lean(),
    ]);

    return res.json({ attempt, responses, violations });
  } catch (err) {
    console.error("[snapQuiz getAttemptDetail]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Violation log ────────────────────────────────────────────────────────────

exports.listViolations = async (req, res) => {
  try {
    const { violationType, page = 1, limit = 50 } = req.query;
    const filter = { quiz: req.assessment._id, company: req.companyId };
    if (violationType) filter.violationType = violationType;

    const skip = (Number(page) - 1) * Number(limit);
    const [violations, total] = await Promise.all([
      SnapQuizViolationLog.find(filter)
        .populate("student", "name email studentId")
        .sort({ occurredAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      SnapQuizViolationLog.countDocuments(filter),
    ]);

    return res.json({ violations, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[snapQuiz listViolations]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Proctoring review ────────────────────────────────────────────────────────

exports.listProctoringEvents = async (req, res) => {
  try {
    const { reviewStatus, page = 1, limit = 30 } = req.query;
    const filter = { quiz: req.assessment._id, company: req.companyId };
    if (reviewStatus) filter.reviewStatus = reviewStatus;

    const skip = (Number(page) - 1) * Number(limit);
    const [events, total] = await Promise.all([
      SnapQuizProctoringEvent.find(filter)
        .sort({ aiRiskScore: -1, capturedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      SnapQuizProctoringEvent.countDocuments(filter),
    ]);

    return res.json({ events, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[snapQuiz listProctoringEvents]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.reviewProctoringEvent = async (req, res) => {
  try {
    const { reviewStatus, reviewNote } = req.body;
    const event = await SnapQuizProctoringEvent.findOne({
      _id: req.params.eventId, quiz: req.assessment._id, company: req.companyId,
    });
    if (!event) return res.status(404).json({ error: "Proctoring event not found" });

    event.reviewStatus = reviewStatus;
    event.reviewNote   = reviewNote || null;
    event.reviewedBy   = req.user._id;
    event.reviewedAt   = new Date();
    await event.save();

    return res.json({ event });
  } catch (err) {
    console.error("[snapQuiz reviewProctoringEvent]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Manual grading ───────────────────────────────────────────────────────────

exports.gradeResponse = async (req, res) => {
  try {
    const { earnedMarks, comment } = req.body;
    if (earnedMarks === undefined || earnedMarks === null) {
      return res.status(400).json({ error: "earnedMarks is required" });
    }

    const response = await SnapQuizResponse.findOne({
      _id: req.params.responseId, attempt: req.params.attemptId, company: req.companyId,
    });
    if (!response) return res.status(404).json({ error: "Response not found" });
    if (earnedMarks < 0 || earnedMarks > response.maxMarks) {
      return res.status(400).json({ error: `earnedMarks must be 0–${response.maxMarks}` });
    }

    response.earnedMarks      = earnedMarks;
    response.isManuallyGraded = true;
    response.gradingStatus    = "manually_graded";
    response.graderAnnotation = {
      gradedBy: req.user._id, gradedAt: new Date(), comment: comment || null, earnedMarks,
    };
    await response.save();

    await _recomputeAttemptGradingStatus(req.params.attemptId, req.companyId);

    return res.json({ response });
  } catch (err) {
    console.error("[snapQuiz gradeResponse]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.gradeBulk = async (req, res) => {
  try {
    const { grades } = req.body;
    if (!Array.isArray(grades) || grades.length === 0) {
      return res.status(400).json({ error: "grades array is required" });
    }

    const now = new Date();
    const ops = grades.map(({ responseId, earnedMarks, comment }) => ({
      updateOne: {
        filter: { _id: responseId, attempt: req.params.attemptId, company: req.companyId },
        update: {
          $set: {
            earnedMarks, isManuallyGraded: true, gradingStatus: "manually_graded",
            graderAnnotation: { gradedBy: req.user._id, gradedAt: now, comment: comment || null, earnedMarks },
          },
        },
      },
    }));
    await SnapQuizResponse.bulkWrite(ops);

    await _recomputeAttemptGradingStatus(req.params.attemptId, req.companyId);

    return res.json({ message: "Bulk grading applied" });
  } catch (err) {
    console.error("[snapQuiz gradeBulk]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Result release ───────────────────────────────────────────────────────────

exports.listResults = async (req, res) => {
  try {
    const { page = 1, limit = 30, isReleased, integrityFlag } = req.query;
    const filter = { quiz: req.assessment._id, company: req.companyId };
    if (isReleased    !== undefined) filter.isReleased    = isReleased    === "true";
    if (integrityFlag !== undefined) filter.integrityFlag = integrityFlag === "true";

    const skip = (Number(page) - 1) * Number(limit);
    const [results, total] = await Promise.all([
      SnapQuizResult.find(filter)
        .populate("student", "name email studentId")
        .sort({ percentageScore: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      SnapQuizResult.countDocuments(filter),
    ]);

    return res.json({ results, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[snapQuiz listResults]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.releaseResults = async (req, res) => {
  try {
    const { studentIds } = req.body;
    const filter = { quiz: req.assessment._id, company: req.companyId };
    if (Array.isArray(studentIds) && studentIds.length > 0) {
      filter.student = { $in: studentIds };
    }

    const now = new Date();
    const updated = await SnapQuizResult.updateMany(filter, {
      $set: { isReleased: true, releasedAt: now, releasedBy: req.user._id },
    });

    await SnapQuizAttempt.updateMany(
      { quiz: req.assessment._id, company: req.companyId,
        ...(filter.student ? { student: filter.student } : {}) },
      { $set: { isResultReleased: true, resultReleasedAt: now, resultReleasedBy: req.user._id } }
    );

    return res.json({ message: `Results released for ${updated.modifiedCount} student(s)` });
  } catch (err) {
    console.error("[snapQuiz releaseResults]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _recomputeAttemptGradingStatus(attemptId, companyId) {
  const attempt = await SnapQuizAttempt.findOne({ _id: attemptId, company: companyId });
  if (!attempt) return;

  const [total, pending] = await Promise.all([
    SnapQuizResponse.countDocuments({ attempt: attemptId }),
    SnapQuizResponse.countDocuments({ attempt: attemptId, gradingStatus: "pending_manual" }),
  ]);

  if (pending === 0 && total > 0) {
    const responses = await SnapQuizResponse.find({ attempt: attemptId })
      .select("earnedMarks maxMarks").lean();
    const rawScore = responses.reduce((s, r) => s + (r.earnedMarks || 0), 0);
    const maxScore = responses.reduce((s, r) => s + (r.maxMarks   || 0), 0);
    const pct      = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
    const quiz     = await SnapQuiz.findById(attempt.quiz).select("passMark").lean();
    const isPassed = quiz?.passMark != null ? rawScore >= quiz.passMark : null;

    attempt.gradingStatus   = GRADING_STATUSES.FULLY_GRADED;
    attempt.rawScore        = rawScore;
    attempt.maxScore        = maxScore;
    attempt.percentageScore = Math.round(pct * 100) / 100;
    attempt.isPassed        = isPassed;
    attempt.gradedAt        = new Date();
    await attempt.save();
  } else if (pending < total) {
    attempt.gradingStatus = GRADING_STATUSES.PARTIALLY_GRADED;
    await attempt.save();
  }
}

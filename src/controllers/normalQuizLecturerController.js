"use strict";

/**
 * normalQuizLecturerController
 *
 * Handles all lecturer-facing NormalQuiz operations:
 *   - Quiz CRUD
 *   - Question CRUD
 *   - Attempt monitoring
 *   - Manual grading
 *   - Result release
 *   - Anti-cheat log review
 *
 * All handlers assume the middleware chain has already run:
 *   authenticate → requireCompanyScope → requireAcademicRole("lecturer"|"admin")
 *   → (where applicable) requireAssessmentOwnership(NormalQuiz)
 *
 * req attachments used by these handlers:
 *   req.user          — authenticated lecturer / admin
 *   req.companyId     — tenant scope
 *   req.assessment    — loaded NormalQuiz (from requireAssessmentOwnership)
 *   req.course        — loaded Course (from requireAssessmentOwnership or middleware)
 */

const mongoose = require("mongoose");
const NormalQuiz         = require("../models/NormalQuiz");
const NormalQuizQuestion = require("../models/NormalQuizQuestion");
const NormalQuizAttempt  = require("../models/NormalQuizAttempt");
const NormalQuizResponse = require("../models/NormalQuizResponse");
const NormalQuizResult   = require("../models/NormalQuizResult");
const { QUIZ_STATUSES }  = require("../models/NormalQuiz");
const { GRADING_STATUSES } = require("../models/NormalQuizAttempt");

// ─── Quiz CRUD ───────────────────────────────────────────────────────────────

/**
 * POST /lecturer/quizzes
 * Create a new NormalQuiz for a course.
 */
exports.createQuiz = async (req, res) => {
  try {
    const {
      courseId, title, description, instructions, quizType,
      totalMarks, passMark, scorePolicy, timeLimitMinutes,
      startTime, endTime, gracePeriodSeconds, allowedAttempts,
      showResultAfterSubmission, showAnswersAfterSubmission,
      showAnswersAfterClose, autoReleaseResults,
      randomizeQuestions, randomizeOptions,
      logTabSwitches, logFocusLost, logIpAddress, preventCopyPaste,
    } = req.body;

    const quiz = await NormalQuiz.create({
      company:   req.companyId,
      course:    courseId,
      createdBy: req.user._id,
      title, description, instructions, quizType,
      totalMarks, passMark, scorePolicy, timeLimitMinutes,
      startTime, endTime, gracePeriodSeconds, allowedAttempts,
      showResultAfterSubmission, showAnswersAfterSubmission,
      showAnswersAfterClose, autoReleaseResults,
      randomizeQuestions, randomizeOptions,
      logTabSwitches, logFocusLost, logIpAddress, preventCopyPaste,
    });

    return res.status(201).json({ quiz });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    console.error("[createQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/quizzes?courseId=&status=&page=&limit=
 * List quizzes the lecturer created for a course.
 */
exports.listQuizzes = async (req, res) => {
  try {
    const { courseId, status, page = 1, limit = 20 } = req.query;
    const filter = {
      company:   req.companyId,
      createdBy: req.user._id,
    };
    if (courseId) filter.course = courseId;
    if (status)   filter.status = status;

    const skip  = (Number(page) - 1) * Number(limit);
    const [quizzes, total] = await Promise.all([
      NormalQuiz.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NormalQuiz.countDocuments(filter),
    ]);

    return res.json({ quizzes, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[listQuizzes]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/quizzes/:quizId
 * Get a single quiz (must be owned by this lecturer).
 */
exports.getQuiz = async (req, res) => {
  try {
    // req.assessment populated by requireAssessmentOwnership
    return res.json({ quiz: req.assessment });
  } catch (err) {
    console.error("[getQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PUT /lecturer/quizzes/:quizId
 * Update quiz settings (cannot edit after first attempt exists).
 */
exports.updateQuiz = async (req, res) => {
  try {
    const quiz = req.assessment;

    // Block structural edits if attempts exist.
    const attemptCount = await NormalQuizAttempt.countDocuments({ quiz: quiz._id });
    const STRUCTURAL_FIELDS = ["totalMarks", "passMark", "timeLimitMinutes", "allowedAttempts", "scorePolicy"];
    const hasStructuralChange = STRUCTURAL_FIELDS.some(f => req.body[f] !== undefined);
    if (attemptCount > 0 && hasStructuralChange) {
      return res.status(409).json({
        error: "Cannot change scoring or timing fields after attempts have been started",
      });
    }

    const allowed = [
      "title","description","instructions","quizType",
      "totalMarks","passMark","scorePolicy","timeLimitMinutes",
      "startTime","endTime","gracePeriodSeconds","allowedAttempts",
      "showResultAfterSubmission","showAnswersAfterSubmission",
      "showAnswersAfterClose","autoReleaseResults",
      "randomizeQuestions","randomizeOptions",
      "logTabSwitches","logFocusLost","logIpAddress","preventCopyPaste",
    ];
    allowed.forEach(f => {
      if (req.body[f] !== undefined) quiz[f] = req.body[f];
    });
    quiz.updatedBy = req.user._id;
    await quiz.save();

    return res.json({ quiz });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    console.error("[updateQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /lecturer/quizzes/:quizId/publish
 * Publish a draft quiz (validates at least 1 active question exists).
 */
exports.publishQuiz = async (req, res) => {
  try {
    const quiz = req.assessment;

    if (quiz.status !== QUIZ_STATUSES.DRAFT) {
      return res.status(409).json({ error: "Only draft quizzes can be published" });
    }

    const questionCount = await NormalQuizQuestion.countDocuments({
      quiz: quiz._id,
      isActive: true,
    });
    if (questionCount === 0) {
      return res.status(422).json({ error: "Quiz must have at least one active question before publishing" });
    }

    quiz.status      = QUIZ_STATUSES.PUBLISHED;
    quiz.isPublished = true;
    quiz.publishedAt = new Date();
    quiz.updatedBy   = req.user._id;
    await quiz.save();

    return res.json({ quiz });
  } catch (err) {
    console.error("[publishQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /lecturer/quizzes/:quizId/close
 * Close a published quiz (no new attempts).
 */
exports.closeQuiz = async (req, res) => {
  try {
    const quiz = req.assessment;

    if (quiz.status !== QUIZ_STATUSES.PUBLISHED) {
      return res.status(409).json({ error: "Only published quizzes can be closed" });
    }

    quiz.status    = QUIZ_STATUSES.CLOSED;
    quiz.closedAt  = new Date();
    quiz.updatedBy = req.user._id;
    await quiz.save();

    return res.json({ quiz });
  } catch (err) {
    console.error("[closeQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /lecturer/quizzes/:quizId
 * Soft-delete (archive) a quiz. Hard-delete only if no attempts.
 */
exports.deleteQuiz = async (req, res) => {
  try {
    const quiz = req.assessment;
    const attemptCount = await NormalQuizAttempt.countDocuments({ quiz: quiz._id });

    if (attemptCount > 0) {
      // Soft-delete: archive instead of removing.
      quiz.status     = QUIZ_STATUSES.ARCHIVED;
      quiz.isActive   = false;
      quiz.archivedAt = new Date();
      quiz.archivedBy = req.user._id;
      await quiz.save();
      return res.json({ message: "Quiz archived (attempts exist)" });
    }

    // Hard-delete: remove quiz + questions (no attempts to orphan).
    await NormalQuizQuestion.deleteMany({ quiz: quiz._id });
    await quiz.deleteOne();
    return res.json({ message: "Quiz deleted" });
  } catch (err) {
    console.error("[deleteQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Question CRUD ────────────────────────────────────────────────────────────

/**
 * POST /lecturer/quizzes/:quizId/questions
 * Add a question to a quiz (quiz must be in DRAFT or PUBLISHED status).
 */
exports.createQuestion = async (req, res) => {
  try {
    const quiz = req.assessment;

    if (quiz.status === QUIZ_STATUSES.CLOSED || quiz.status === QUIZ_STATUSES.ARCHIVED) {
      return res.status(409).json({ error: "Cannot add questions to a closed or archived quiz" });
    }

    const {
      questionType, questionText, media, options, optionMedia,
      correctOptionIndex, correctOptionIndices, correctBoolean,
      correctAnswerText, acceptedAnswers, numericAnswer, modelAnswer,
      marks, allowPartialMarks, mathsDrawing, explanation, orderIndex,
    } = req.body;

    // Auto-compute orderIndex if not supplied.
    let order = orderIndex;
    if (order === undefined || order === null) {
      const last = await NormalQuizQuestion.findOne({ quiz: quiz._id })
        .sort({ orderIndex: -1 })
        .select("orderIndex")
        .lean();
      order = last ? last.orderIndex + 1 : 0;
    }

    const question = await NormalQuizQuestion.create({
      quiz:      quiz._id,
      company:   req.companyId,
      createdBy: req.user._id,
      questionType, questionText, media, options, optionMedia,
      correctOptionIndex, correctOptionIndices, correctBoolean,
      correctAnswerText, acceptedAnswers, numericAnswer, modelAnswer,
      marks, allowPartialMarks, mathsDrawing, explanation,
      orderIndex: order,
    });

    // Update quiz totalMarks.
    await NormalQuiz.updateOne(
      { _id: quiz._id },
      { $inc: { totalMarks: question.marks || 1 } }
    );

    return res.status(201).json({ question });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    console.error("[createQuestion]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/quizzes/:quizId/questions
 * List all questions for a quiz (includes inactive).
 */
exports.listQuestions = async (req, res) => {
  try {
    const quiz = req.assessment;
    const questions = await NormalQuizQuestion.find({ quiz: quiz._id })
      .sort({ orderIndex: 1 })
      .lean();
    return res.json({ questions });
  } catch (err) {
    console.error("[listQuestions]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PUT /lecturer/quizzes/:quizId/questions/:questionId
 * Update a question.
 */
exports.updateQuestion = async (req, res) => {
  try {
    const question = await NormalQuizQuestion.findOne({
      _id:     req.params.questionId,
      quiz:    req.assessment._id,
      company: req.companyId,
    });
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    const oldMarks = question.marks;
    const updatable = [
      "questionType","questionText","media","options","optionMedia",
      "correctOptionIndex","correctOptionIndices","correctBoolean",
      "correctAnswerText","acceptedAnswers","numericAnswer","modelAnswer",
      "marks","allowPartialMarks","mathsDrawing","explanation","orderIndex","isActive",
    ];
    updatable.forEach(f => {
      if (req.body[f] !== undefined) question[f] = req.body[f];
    });
    await question.save();

    // Adjust totalMarks if marks changed.
    const marksDiff = (question.marks || 1) - (oldMarks || 1);
    if (marksDiff !== 0) {
      await NormalQuiz.updateOne(
        { _id: req.assessment._id },
        { $inc: { totalMarks: marksDiff } }
      );
    }

    return res.json({ question });
  } catch (err) {
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    console.error("[updateQuestion]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /lecturer/quizzes/:quizId/questions/:questionId
 * Soft-delete (isActive = false) a question.
 */
exports.deleteQuestion = async (req, res) => {
  try {
    const question = await NormalQuizQuestion.findOne({
      _id:     req.params.questionId,
      quiz:    req.assessment._id,
      company: req.companyId,
    });
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    question.isActive = false;
    await question.save();

    return res.json({ message: "Question deactivated" });
  } catch (err) {
    console.error("[deleteQuestion]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /lecturer/quizzes/:quizId/questions/reorder
 * Bulk reorder questions. Body: { order: [{ questionId, orderIndex }] }
 */
exports.reorderQuestions = async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) {
      return res.status(400).json({ error: "order must be an array" });
    }

    const bulkOps = order.map(({ questionId, orderIndex }) => ({
      updateOne: {
        filter: { _id: questionId, quiz: req.assessment._id, company: req.companyId },
        update: { $set: { orderIndex } },
      },
    }));
    await NormalQuizQuestion.bulkWrite(bulkOps);

    return res.json({ message: "Questions reordered" });
  } catch (err) {
    console.error("[reorderQuestions]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Attempt monitoring ───────────────────────────────────────────────────────

/**
 * GET /lecturer/quizzes/:quizId/attempts
 * List all attempts for a quiz (grading panel).
 * Query: status, gradingStatus, studentId, page, limit
 */
exports.listAttempts = async (req, res) => {
  try {
    const { status, gradingStatus, studentId, page = 1, limit = 30 } = req.query;
    const filter = { quiz: req.assessment._id, company: req.companyId };
    if (status)        filter.status = status;
    if (gradingStatus) filter.gradingStatus = gradingStatus;
    if (studentId)     filter.student = studentId;

    const skip = (Number(page) - 1) * Number(limit);
    const [attempts, total] = await Promise.all([
      NormalQuizAttempt.find(filter)
        .populate("student", "name email studentId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NormalQuizAttempt.countDocuments(filter),
    ]);

    return res.json({ attempts, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[listAttempts]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/quizzes/:quizId/attempts/:attemptId
 * Get full attempt detail including all responses.
 */
exports.getAttemptDetail = async (req, res) => {
  try {
    const attempt = await NormalQuizAttempt.findOne({
      _id:     req.params.attemptId,
      quiz:    req.assessment._id,
      company: req.companyId,
    }).populate("student", "name email studentId").lean();

    if (!attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    const responses = await NormalQuizResponse.find({ attempt: attempt._id })
      .populate("question", "questionText questionType marks correctOptionIndex correctOptionIndices correctBoolean correctAnswerText numericAnswer modelAnswer")
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ attempt, responses });
  } catch (err) {
    console.error("[getAttemptDetail]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Manual grading ───────────────────────────────────────────────────────────

/**
 * PATCH /lecturer/quizzes/:quizId/attempts/:attemptId/responses/:responseId/grade
 * Manually grade a single response.
 * Body: { earnedMarks, comment }
 */
exports.gradeResponse = async (req, res) => {
  try {
    const { earnedMarks, comment } = req.body;

    if (earnedMarks === undefined || earnedMarks === null) {
      return res.status(400).json({ error: "earnedMarks is required" });
    }

    const response = await NormalQuizResponse.findOne({
      _id:     req.params.responseId,
      attempt: req.params.attemptId,
      company: req.companyId,
    });
    if (!response) {
      return res.status(404).json({ error: "Response not found" });
    }

    if (earnedMarks < 0 || earnedMarks > response.maxMarks) {
      return res.status(400).json({
        error: `earnedMarks must be between 0 and ${response.maxMarks}`,
      });
    }

    response.earnedMarks      = earnedMarks;
    response.isManuallyGraded = true;
    response.gradingStatus    = "manually_graded";
    response.graderAnnotation = {
      gradedBy:    req.user._id,
      gradedAt:    new Date(),
      comment:     comment || null,
      earnedMarks,
    };
    await response.save();

    // Check if all responses in the attempt are now graded → update attempt gradingStatus.
    await _recomputeAttemptGradingStatus(req.params.attemptId, req.companyId);

    return res.json({ response });
  } catch (err) {
    console.error("[gradeResponse]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /lecturer/quizzes/:quizId/attempts/:attemptId/grade
 * Grade all pending responses in bulk.
 * Body: { grades: [{ responseId, earnedMarks, comment }] }
 */
exports.gradeBulk = async (req, res) => {
  try {
    const { grades } = req.body;
    if (!Array.isArray(grades) || grades.length === 0) {
      return res.status(400).json({ error: "grades array is required" });
    }

    const now = new Date();
    const bulkOps = grades.map(({ responseId, earnedMarks, comment }) => ({
      updateOne: {
        filter: { _id: responseId, attempt: req.params.attemptId, company: req.companyId },
        update: {
          $set: {
            earnedMarks,
            isManuallyGraded: true,
            gradingStatus: "manually_graded",
            graderAnnotation: {
              gradedBy: req.user._id,
              gradedAt: now,
              comment: comment || null,
              earnedMarks,
            },
          },
        },
      },
    }));
    await NormalQuizResponse.bulkWrite(bulkOps);

    await _recomputeAttemptGradingStatus(req.params.attemptId, req.companyId);

    return res.json({ message: "Bulk grading applied" });
  } catch (err) {
    console.error("[gradeBulk]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Result release ───────────────────────────────────────────────────────────

/**
 * POST /lecturer/quizzes/:quizId/results/release
 * Release results to all students (or specific ones).
 * Body: { studentIds?: [] } — empty/omit to release all.
 */
exports.releaseResults = async (req, res) => {
  try {
    const { studentIds } = req.body;
    const filter = { quiz: req.assessment._id, company: req.companyId };
    if (Array.isArray(studentIds) && studentIds.length > 0) {
      filter.student = { $in: studentIds };
    }

    const now = new Date();
    const updated = await NormalQuizResult.updateMany(filter, {
      $set: { isReleased: true, releasedAt: now, releasedBy: req.user._id },
    });

    // Also mark individual attempt result releases.
    await NormalQuizAttempt.updateMany(
      { quiz: req.assessment._id, company: req.companyId,
        ...(filter.student ? { student: filter.student } : {}) },
      { $set: { isResultReleased: true, resultReleasedAt: now, resultReleasedBy: req.user._id } }
    );

    return res.json({ message: `Results released for ${updated.modifiedCount} student(s)` });
  } catch (err) {
    console.error("[releaseResults]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/quizzes/:quizId/results
 * List all student results for a quiz.
 */
exports.listResults = async (req, res) => {
  try {
    const { page = 1, limit = 30, isReleased } = req.query;
    const filter = { quiz: req.assessment._id, company: req.companyId };
    if (isReleased !== undefined) filter.isReleased = isReleased === "true";

    const skip = (Number(page) - 1) * Number(limit);
    const [results, total] = await Promise.all([
      NormalQuizResult.find(filter)
        .populate("student", "name email studentId")
        .sort({ percentageScore: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      NormalQuizResult.countDocuments(filter),
    ]);

    return res.json({ results, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[listResults]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Anti-cheat log review ────────────────────────────────────────────────────

/**
 * GET /lecturer/quizzes/:quizId/attempts/:attemptId/suspicious-events
 * Review passive anti-cheat log for an attempt.
 */
exports.getSuspiciousEvents = async (req, res) => {
  try {
    const attempt = await NormalQuizAttempt.findOne({
      _id:     req.params.attemptId,
      quiz:    req.assessment._id,
      company: req.companyId,
    })
      .select("student tabSwitchCount focusLostCount suspiciousEvents device")
      .populate("student", "name email studentId")
      .lean();

    if (!attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    return res.json({ attempt });
  } catch (err) {
    console.error("[getSuspiciousEvents]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * After grading a response, check if the entire attempt is fully graded.
 * Updates NormalQuizAttempt.gradingStatus and recomputes the result.
 */
async function _recomputeAttemptGradingStatus(attemptId, companyId) {
  const attempt = await NormalQuizAttempt.findOne({ _id: attemptId, company: companyId });
  if (!attempt) return;

  const [totalResponses, pendingCount] = await Promise.all([
    NormalQuizResponse.countDocuments({ attempt: attemptId }),
    NormalQuizResponse.countDocuments({ attempt: attemptId, gradingStatus: "pending_manual" }),
  ]);

  if (pendingCount === 0 && totalResponses > 0) {
    // All manually-graded; sum up marks.
    const responses = await NormalQuizResponse.find({ attempt: attemptId }).select("earnedMarks maxMarks").lean();
    const rawScore  = responses.reduce((sum, r) => sum + (r.earnedMarks || 0), 0);
    const maxScore  = responses.reduce((sum, r) => sum + (r.maxMarks   || 0), 0);
    const pct       = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;

    const quiz = await NormalQuiz.findById(attempt.quiz).select("passMark").lean();
    const isPassed = quiz?.passMark != null ? rawScore >= quiz.passMark : null;

    attempt.gradingStatus   = GRADING_STATUSES.FULLY_GRADED;
    attempt.rawScore        = rawScore;
    attempt.maxScore        = maxScore;
    attempt.percentageScore = Math.round(pct * 100) / 100;
    attempt.isPassed        = isPassed;
    attempt.gradedAt        = new Date();
    attempt.gradedBy        = null; // set by the individual grade call
    await attempt.save();
  } else if (pendingCount < totalResponses) {
    attempt.gradingStatus = GRADING_STATUSES.PARTIALLY_GRADED;
    await attempt.save();
  }
}

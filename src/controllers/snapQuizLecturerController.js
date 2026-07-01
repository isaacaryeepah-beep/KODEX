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
const { SNAP_QUIZ_STATUSES, SECURITY_PRESETS } = require("../models/SnapQuiz");
const { ATTEMPT_STATUSES, GRADING_STATUSES } = require("../models/SnapQuizAttempt");
const { autoGradeAttempt } = require("../services/quizGradingService");
const { handleControllerError } = require("../utils/controllerHelpers");

// ─── Quiz CRUD ───────────────────────────────────────────────────────────────

/**
 * POST /lecturer/snap-quizzes
 */
exports.createQuiz = async (req, res) => {
  try {
    const {
      courseId, title, description, instructions, quizType, quizLevel,
      securityLevel,
      totalMarks, passMark, scorePolicy,
      timeLimitMinutes, startTime, endTime, gracePeriodSeconds, lockAfterEndTime,
      allowedAttempts,
      enforceSessionLock, heartbeatIntervalSeconds, heartbeatTimeoutSeconds,
      maxViolationsBeforeTermination,
      terminateOnTabSwitch, terminateOnFocusLost, terminateOnFullscreenExit,
      requireFullscreen, preventCopyPaste, preventRightClick, preventPrintScreen,
      showViolationWarnings,
      proctoringEnabled, snapshotIntervalSeconds, aiProctoringEnabled,
      monitoringMode, maxConcurrentMonitors, noiseDetectionThreshold,
      mobileMonitoring, screenshotDetection, liveAlerts,
      showResultAfterSubmission, showAnswersAfterSubmission,
      showAnswersAfterClose, autoReleaseResults,
      randomizeQuestions, randomizeOptions,
    } = req.body;

    // Apply security preset if one was selected, then allow field-level overrides.
    const preset = SECURITY_PRESETS[securityLevel] || SECURITY_PRESETS.medium;

    // quizLevel: "high" security forces proctored mode
    const resolvedLevel = securityLevel === "high" ? "proctored"
      : quizLevel === "proctored" ? "proctored" : "snap";

    const quiz = await SnapQuiz.create({
      company:   req.companyId,
      course:    courseId,
      createdBy: req.user._id,
      title, description, instructions, quizType,
      quizLevel:     resolvedLevel,
      securityLevel: securityLevel || "medium",
      totalMarks, passMark, scorePolicy,
      timeLimitMinutes, startTime, endTime, gracePeriodSeconds, lockAfterEndTime,
      allowedAttempts,
      // Anti-cheat — preset values used unless caller explicitly provided one
      enforceSessionLock:            enforceSessionLock            ?? preset.enforceSessionLock,
      heartbeatIntervalSeconds:      heartbeatIntervalSeconds      ?? preset.heartbeatIntervalSeconds,
      heartbeatTimeoutSeconds:       heartbeatTimeoutSeconds       ?? preset.heartbeatTimeoutSeconds,
      maxViolationsBeforeTermination: maxViolationsBeforeTermination ?? preset.maxViolationsBeforeTermination,
      terminateOnTabSwitch:          terminateOnTabSwitch          ?? preset.terminateOnTabSwitch,
      terminateOnFocusLost:          terminateOnFocusLost          ?? preset.terminateOnFocusLost,
      terminateOnFullscreenExit:     terminateOnFullscreenExit     ?? preset.terminateOnFullscreenExit,
      requireFullscreen:             requireFullscreen             ?? preset.requireFullscreen,
      preventCopyPaste:              preventCopyPaste              ?? preset.preventCopyPaste,
      preventRightClick:             preventRightClick             ?? preset.preventRightClick,
      preventPrintScreen:            preventPrintScreen            ?? preset.preventPrintScreen,
      showViolationWarnings:         showViolationWarnings         ?? true,
      // Proctoring — preset unless overridden
      proctoringEnabled:         proctoringEnabled         ?? preset.proctoringEnabled,
      snapshotIntervalSeconds:   snapshotIntervalSeconds   ?? preset.snapshotIntervalSeconds,
      aiProctoringEnabled:       aiProctoringEnabled       ?? preset.aiProctoringEnabled,
      monitoringMode:            monitoringMode            ?? preset.monitoringMode,
      humanMonitors:  [],
      maxConcurrentMonitors, noiseDetectionThreshold,
      // Mobile / advanced monitoring
      mobileMonitoring:    mobileMonitoring    ?? true,
      screenshotDetection: screenshotDetection ?? (securityLevel === "high"),
      liveAlerts:          liveAlerts          ?? true,
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

    // Backfill join codes for any published/open quiz that was created before
    // the auto-generate pre-save hook existed.
    const needCode = quizzes.filter(q =>
      ['published', 'open'].includes(q.status) && !q.joinCode
    );
    if (needCode.length > 0) {
      await Promise.all(needCode.map(async q => {
        const code = await SnapQuiz.generateJoinCode();
        await SnapQuiz.findByIdAndUpdate(q._id, { joinCode: code });
        q.joinCode = code;
      }));
    }

    return res.json({ quizzes, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[snapQuiz listQuizzes]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/snap-quizzes/department-overview
 * HOD / admin: all quizzes across the company (not scoped to createdBy).
 * Used by the quiz monitoring dashboard to show quizzes from all lecturers.
 */
exports.listAllCompanyQuizzes = async (req, res) => {
  try {
    const { status, page = 1, limit = 100 } = req.query;
    const filter = { company: req.companyId };
    if (status) filter.status = status;

    // HOD: restrict to courses belonging to their own department only.
    if (req.user.role === "hod" && req.user.department) {
      const Course = require("../models/Course");
      const deptCourseIds = await Course.find(
        { company: req.companyId, department: req.user.department },
        { _id: 1 }
      ).lean().then(docs => docs.map(d => d._id));
      filter.course = { $in: deptCourseIds };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [quizzes, total] = await Promise.all([
      SnapQuiz.find(filter)
        .populate("createdBy", "name")
        .sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).lean(),
      SnapQuiz.countDocuments(filter),
    ]);

    return res.json({ quizzes, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[snapQuiz listAllCompanyQuizzes]", err);
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

    const attemptCount = await SnapQuizAttempt.countDocuments({ quiz: quiz._id, company: req.companyId });
    const STRUCTURAL = ["timeLimitMinutes", "startTime", "endTime", "allowedAttempts",
                        "maxViolationsBeforeTermination", "passMark", "scorePolicy"];
    if (attemptCount > 0 && STRUCTURAL.some(f => req.body[f] !== undefined)) {
      return res.status(409).json({
        error: "Cannot change structural fields after attempts have started",
      });
    }

    const updatable = [
      "title","description","instructions","quizType","quizLevel",
      "totalMarks","passMark","scorePolicy",
      "timeLimitMinutes","startTime","endTime","gracePeriodSeconds","lockAfterEndTime",
      "allowedAttempts",
      "enforceSessionLock","heartbeatIntervalSeconds","heartbeatTimeoutSeconds",
      "maxViolationsBeforeTermination",
      "terminateOnTabSwitch","terminateOnFocusLost","terminateOnFullscreenExit",
      "requireFullscreen","preventCopyPaste","preventRightClick","preventPrintScreen",
      "showViolationWarnings",
      "proctoringEnabled","snapshotIntervalSeconds","aiProctoringEnabled",
      "monitoringMode","maxConcurrentMonitors","noiseDetectionThreshold",
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
    if (!quiz.joinCode) {
      quiz.joinCode = await SnapQuiz.generateJoinCode();
    }
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
    if (!quiz.joinCode) {
      quiz.joinCode = await SnapQuiz.generateJoinCode();
    }
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

    // Force-submit all remaining active attempts and auto-grade each one.
    const activeAttempts = await SnapQuizAttempt.find({
      quiz:   quiz._id,
      status: "active",
    }).select("_id company quiz startedAt student");

    const now = new Date();
    if (activeAttempts.length > 0) {
      // Auto-grade each attempt. Use atomic findOneAndUpdate({ status: "active" })
      // so that if the watchdog runs concurrently it won't double-grade.
      const { passMark, autoReleaseResults } = quiz;
      await Promise.all(activeAttempts.map(async (a) => {
        try {
          // Atomic claim: only grade if still active
          const claimed = await SnapQuizAttempt.findOneAndUpdate(
            { _id: a._id, status: "active" },
            { $set: { status: "auto_submitted", submittedAt: now,
                       timeSpentSeconds: Math.round((now - a.startedAt) / 1000) } },
            { new: false }
          );
          if (!claimed) return; // Already handled by watchdog

          const { rawScore, maxScore, hasManual } = await _autoGradeAttemptLecturer(a._id, a.company);
          const pct      = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;
          const isPassed = passMark != null ? rawScore >= passMark : null;
          await SnapQuizAttempt.updateOne({ _id: a._id }, {
            $set: {
              rawScore,
              maxScore,
              percentageScore: Math.round(pct * 100) / 100,
              isPassed,
              gradingStatus: hasManual ? "partially_graded" : "auto_graded",
              ...(hasManual ? {} : { gradedAt: now }),
            },
          });
          // Upsert result document so the grade book has an entry.
          await SnapQuizResult.findOneAndUpdate(
            { quiz: a.quiz, student: a.student, company: a.company },
            {
              $set: {
                countedAttemptId: a._id,
                rawScore,
                maxScore,
                percentageScore: Math.round(pct * 100) / 100,
                isPassed,
                gradingStatus:   hasManual ? "partially_graded" : "auto_graded",
                isReleased:      autoReleaseResults || false,
                releasedAt:      autoReleaseResults ? now : null,
              },
            },
            { upsert: true }
          );
        } catch (gradeErr) {
          console.error("[snapQuiz closeQuiz] grading error for attempt", a._id, gradeErr);
        }
      }));
    }

    quiz.status    = SNAP_QUIZ_STATUSES.CLOSED;
    quiz.closedAt  = now;
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
    const attemptCount = await SnapQuizAttempt.countDocuments({ quiz: quiz._id, company: req.companyId });

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
    const lastOrderIndex = last?.orderIndex;
    const orderIndex = req.body.orderIndex ?? (Number.isFinite(lastOrderIndex) ? lastOrderIndex + 1 : 0);

    const ALLOWED_CREATE_FIELDS = [
      "questionType","questionText","media","options","optionMedia",
      "correctOptionIndex","correctOptionIndices","correctBoolean",
      "correctAnswerText","acceptedAnswers","numericAnswer","modelAnswer",
      "marks","allowPartialMarks","mathsDrawing","explanation","isActive",
    ];
    const safeBody = {};
    ALLOWED_CREATE_FIELDS.forEach(f => { if (req.body[f] !== undefined) safeBody[f] = req.body[f]; });

    const question = await SnapQuizQuestion.create({
      ...safeBody,
      quiz:      quiz._id,
      company:   req.companyId,
      createdBy: req.user._id,
      orderIndex,
    });

    await SnapQuiz.updateOne({ _id: quiz._id }, { $inc: { totalMarks: question.marks || 1 } });

    return res.status(201).json({ question });
  } catch (err) {
    handleControllerError(res, err, "[snapQuiz createQuestion]", { defaultMessage: "Failed to add question" });
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

    // Attach each attempt's most recent camera capture so the monitoring
    // dashboard's Camera Grid can show a live thumbnail instead of a blank
    // placeholder — the list query above has no snapshot data of its own.
    if (attempts.length) {
      const latestSnaps = await SnapQuizProctoringEvent.aggregate([
        {
          $match: {
            attempt: { $in: attempts.map(a => a._id) },
            $or: [{ imageUrl: { $ne: null } }, { thumbnailUrl: { $ne: null } }],
          },
        },
        { $sort: { capturedAt: -1 } },
        {
          $group: {
            _id: "$attempt",
            imageUrl:     { $first: "$imageUrl" },
            thumbnailUrl: { $first: "$thumbnailUrl" },
            capturedAt:   { $first: "$capturedAt" },
          },
        },
      ]);
      const snapByAttempt = new Map(latestSnaps.map(s => [String(s._id), s]));
      attempts.forEach(a => {
        const snap = snapByAttempt.get(String(a._id));
        a.latestSnapshotUrl = snap ? (snap.thumbnailUrl || snap.imageUrl) : null;
        a.latestSnapshotAt  = snap ? snap.capturedAt : null;
      });
    }

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

    const [responses, violations, proctoringEvents] = await Promise.all([
      SnapQuizResponse.find({ attempt: attempt._id })
        .populate("question", "questionText questionType marks correctOptionIndex correctOptionIndices correctBoolean correctAnswerText numericAnswer modelAnswer")
        .sort({ createdAt: 1 })
        .lean(),
      SnapQuizViolationLog.find({ attempt: attempt._id })
        .sort({ occurredAt: 1 })
        .lean(),
      SnapQuizProctoringEvent.find({ attempt: attempt._id })
        .sort({ capturedAt: -1 })
        .limit(20)
        .lean(),
    ]);

    return res.json({ attempt, responses, violations, proctoringEvents });
  } catch (err) {
    console.error("[snapQuiz getAttemptDetail]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Force submit (lecturer/proctor action) ────────────────────────────────────
exports.forceSubmitAttempt = async (req, res) => {
  try {
    const attempt = await SnapQuizAttempt.findOne({
      _id: req.params.attemptId, quiz: req.assessment._id, company: req.companyId,
    });
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });
    if (attempt.status !== "active") {
      return res.status(400).json({ error: "Attempt is not active" });
    }

    const reason = req.body.reason || `Force-submitted by ${req.user.name || req.user.email}`;
    attempt.status            = "terminated";
    attempt.isTerminated      = true;
    attempt.terminationReason = reason;
    attempt.terminatedAt      = new Date();
    attempt.submittedAt       = new Date();
    attempt.timeSpentSeconds  = Math.round((new Date() - attempt.startedAt) / 1000);
    await attempt.save();

    // Auto-grade the attempt
    const { rawScore, maxScore, hasManual } = await _autoGradeAttemptLecturer(attempt._id, attempt.company);
    const quiz = await SnapQuiz.findById(attempt.quiz).select("passMark autoReleaseResults").lean();
    const pct = maxScore > 0 ? (rawScore / maxScore) * 100 : 0;

    attempt.rawScore        = rawScore;
    attempt.maxScore        = maxScore;
    attempt.percentageScore = Math.round(pct * 100) / 100;
    attempt.isPassed        = quiz?.passMark != null ? rawScore >= quiz.passMark : null;
    attempt.gradingStatus   = hasManual ? GRADING_STATUSES.PARTIALLY_GRADED : GRADING_STATUSES.AUTO_GRADED;
    if (!hasManual) attempt.gradedAt = new Date();
    await attempt.save();

    return res.json({ success: true, message: "Attempt force-submitted and auto-graded" });
  } catch (err) {
    console.error("[snapQuiz forceSubmitAttempt]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Grading delegated to shared service — see src/services/quizGradingService.js
const _autoGradeAttemptLecturer = autoGradeAttempt;

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
    const ceiling = Math.max(response.maxMarks ?? 0, 0);
    if (earnedMarks < 0 || earnedMarks > ceiling) {
      return res.status(400).json({ error: `earnedMarks must be 0–${ceiling}` });
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

    // Validate earnedMarks ceiling for each response — same guard as gradeResponse.
    const responseIds = grades.map(g => g.responseId).filter(Boolean);
    const existing    = await SnapQuizResponse.find(
      { _id: { $in: responseIds }, attempt: req.params.attemptId, company: req.companyId },
      { maxMarks: 1 }
    ).lean();
    const maxMap = Object.fromEntries(existing.map(r => [r._id.toString(), r.maxMarks ?? 1]));

    for (const { responseId, earnedMarks } of grades) {
      if (typeof earnedMarks !== "number") {
        return res.status(400).json({ error: "earnedMarks must be a number" });
      }
      const cap = maxMap[responseId?.toString()];
      if (cap !== undefined && (earnedMarks < 0 || earnedMarks > cap)) {
        return res.status(400).json({ error: `earnedMarks for response ${responseId} must be 0–${cap}` });
      }
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

// ─── Quiz Dashboard Stats ─────────────────────────────────────────────────────

/**
 * GET /lecturer/snap-quizzes/:quizId/stats
 * Returns aggregate monitoring stats for the quiz dashboard.
 */
exports.getQuizStats = async (req, res) => {
  try {
    const quiz = req.assessment;

    const [
      totalAttempts,
      activeAttempts,
      submittedAttempts,
      terminatedAttempts,
      totalViolations,
      flaggedSnapshots,
      results,
    ] = await Promise.all([
      SnapQuizAttempt.countDocuments({ quiz: quiz._id }),
      SnapQuizAttempt.countDocuments({ quiz: quiz._id, status: "active" }),
      SnapQuizAttempt.countDocuments({ quiz: quiz._id, status: { $in: ["submitted", "auto_submitted"] } }),
      SnapQuizAttempt.countDocuments({ quiz: quiz._id, isTerminated: true }),
      SnapQuizViolationLog.countDocuments({ quiz: quiz._id }),
      SnapQuizProctoringEvent.countDocuments({ quiz: quiz._id, reviewStatus: "flagged" }),
      SnapQuizResult.find({ quiz: quiz._id }).select("percentageScore isPassed integrityFlag aiReport totalViolations").lean(),
    ]);

    const passCount  = results.filter(r => r.isPassed === true).length;
    const flagCount  = results.filter(r => r.integrityFlag).length;
    const avgScore   = results.length > 0
      ? Math.round(results.reduce((s, r) => s + (r.percentageScore || 0), 0) / results.length * 10) / 10
      : null;
    const avgIntegrity = results.filter(r => r.aiReport?.integrityScore != null).length > 0
      ? Math.round(
          results
            .filter(r => r.aiReport?.integrityScore != null)
            .reduce((s, r) => s + r.aiReport.integrityScore, 0) /
          results.filter(r => r.aiReport?.integrityScore != null).length
        )
      : null;

    return res.json({
      quizId:             quiz._id,
      quizLevel:          quiz.quizLevel || "snap",
      monitoringMode:     quiz.monitoringMode,
      totalAttempts,
      activeAttempts,
      submittedAttempts,
      terminatedAttempts,
      totalViolations,
      flaggedSnapshots,
      totalStudents:      results.length,
      passCount,
      failCount:          results.filter(r => r.isPassed === false).length,
      integrityFlagCount: flagCount,
      averageScore:       avgScore,
      averageIntegrityScore: avgIntegrity,
    });
  } catch (err) {
    console.error("[snapQuiz getQuizStats]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /:quizId/live-monitor
 * Returns per-student attempt status for the real-time monitoring dashboard.
 * Designed to be polled on first load; live updates arrive via WebSocket.
 */
exports.getLiveMonitor = async (req, res) => {
  try {
    const quiz = req.assessment;

    const [attempts, recentViolations] = await Promise.all([
      SnapQuizAttempt.find({ quiz: quiz._id })
        .select("student status startedAt submittedAt expiresAt lastHeartbeatAt violationCount isTerminated terminationReason device percentageScore gradingStatus")
        .populate("student", "name studentLevel studentGroup")
        .sort({ startedAt: -1 })
        .lean(),
      SnapQuizViolationLog.find({ quiz: quiz._id })
        .select("attempt student violationType severity occurredAt causedTermination")
        .sort({ occurredAt: -1 })
        .limit(50)
        .lean(),
    ]);

    const now = Date.now();
    const rows = attempts.map(a => {
      const lastSeen = a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt) : new Date(a.startedAt);
      const secondsSinceSeen = Math.round((now - lastSeen) / 1000);
      const timeRemaining = a.expiresAt ? Math.max(0, Math.round((new Date(a.expiresAt) - now) / 1000)) : null;
      return {
        attemptId:        String(a._id),
        student: {
          _id:   String(a.student?._id || a.student),
          name:  a.student?.name || "Unknown",
          level: a.student?.studentLevel || "",
          group: a.student?.studentGroup || "",
        },
        status:          a.status,
        violationCount:  a.violationCount || 0,
        isTerminated:    a.isTerminated || false,
        terminationReason: a.terminationReason || null,
        platform:        a.device?.platform || "unknown",
        secondsSinceSeen,
        online:          a.status === "active" && secondsSinceSeen < (quiz.heartbeatTimeoutSeconds || 90),
        timeRemaining,
        percentageScore: a.percentageScore ?? null,
        gradingStatus:   a.gradingStatus || null,
        startedAt:       a.startedAt,
        submittedAt:     a.submittedAt || null,
      };
    });

    return res.json({
      quiz: {
        _id:             quiz._id,
        title:           quiz.title,
        status:          quiz.status,
        securityLevel:   quiz.securityLevel || "medium",
        monitoringMode:  quiz.monitoringMode,
        proctoringEnabled: quiz.proctoringEnabled,
        aiProctoringEnabled: quiz.aiProctoringEnabled,
        mobileMonitoring: quiz.mobileMonitoring,
        liveAlerts:      quiz.liveAlerts,
        timeLimitMinutes: quiz.timeLimitMinutes,
        maxViolationsBeforeTermination: quiz.maxViolationsBeforeTermination,
      },
      students: rows,
      recentViolations: recentViolations.map(v => ({
        attemptId:    String(v.attempt),
        studentId:    String(v.student),
        violationType: v.violationType,
        severity:     v.severity,
        occurredAt:   v.occurredAt,
        causedTermination: v.causedTermination,
      })),
      summary: {
        total:       rows.length,
        active:      rows.filter(r => r.status === "active").length,
        submitted:   rows.filter(r => ["submitted", "auto_submitted"].includes(r.status)).length,
        terminated:  rows.filter(r => r.isTerminated).length,
        online:      rows.filter(r => r.online).length,
      },
    });
  } catch (err) {
    console.error("[snapQuiz getLiveMonitor]", err);
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

// ─── Reset student attempts ───────────────────────────────────────────────────

/**
 * DELETE /lecturer/snap-quizzes/:quizId/students/:studentId/attempts
 *
 * Deletes ALL attempts (and their responses, violations, proctoring events,
 * and result record) for a specific student on this quiz, giving them a
 * clean slate. Intended for cases where a student's attempt was orphaned
 * by a network error before they could actually answer questions.
 */
exports.resetStudentAttempts = async (req, res) => {
  try {
    const { quizId, studentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({ error: "Invalid studentId" });
    }

    const attempts = await SnapQuizAttempt.find({
      quiz:    quizId,
      student: studentId,
      company: req.companyId,
    }).select("_id").lean().maxTimeMS(5000);

    const attemptIds = attempts.map(a => a._id);

    if (attemptIds.length === 0) {
      return res.json({ message: "No attempts found for this student", deletedAttempts: 0 });
    }

    await Promise.all([
      SnapQuizAttempt.deleteMany({ _id: { $in: attemptIds } }).maxTimeMS(10000),
      SnapQuizResponse.deleteMany({ attempt: { $in: attemptIds } }).maxTimeMS(10000),
      SnapQuizViolationLog.deleteMany({ attempt: { $in: attemptIds } }).maxTimeMS(10000),
      SnapQuizProctoringEvent.deleteMany({ attempt: { $in: attemptIds } }).maxTimeMS(10000),
      SnapQuizResult.deleteMany({ quiz: quizId, student: studentId, company: req.companyId }).maxTimeMS(5000),
    ]);

    return res.json({
      message: `Reset ${attemptIds.length} attempt(s) — student can now start fresh`,
      deletedAttempts: attemptIds.length,
    });
  } catch (err) {
    console.error("[snapQuiz lecturer resetStudentAttempts]", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
};

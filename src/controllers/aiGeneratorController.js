"use strict";

/**
 * aiGeneratorController
 *
 * Full AI question generation + draft review workflow.
 *
 * Middleware chain:
 *   authenticate → requireCompanyScope → requireAcademicRole("lecturer"|"admin")
 *   → requireAssessmentOwnership(AIQuestionDraft, { skipCourseCheck: true })
 *     [draft-scoped routes only]
 *
 * Generation flow:
 *   POST /generate  →  AIQuestionDraft (status: pending_review)
 *   PATCH /drafts/:draftId/questions/:index  →  edit a draft question
 *   POST /drafts/:draftId/questions/:index/approve  →  mark approved
 *   POST /drafts/:draftId/questions/:index/reject   →  mark rejected
 *   POST /drafts/:draftId/approve-all              →  approve all pending
 *   POST /drafts/:draftId/apply                    →  write NormalQuizQuestion
 *                                                     or SnapQuizQuestion records
 *   DELETE /drafts/:draftId                        →  discard
 */

const multer     = require("multer");
const pdfParse   = require("pdf-parse");
const AIQuestionDraft  = require("../models/AIQuestionDraft");
const NormalQuizQuestion = require("../models/NormalQuizQuestion");
const SnapQuizQuestion   = require("../models/SnapQuizQuestion");
const NormalQuiz         = require("../models/NormalQuiz");
const SnapQuiz           = require("../models/SnapQuiz");
const { generateQuestions, hashSource, SUPPORTED_TYPES } = require("../services/aiGeneratorService");
const {
  DRAFT_STATUSES,
  QUESTION_DRAFT_STATUSES,
  TARGET_QUIZ_TYPES,
} = require("../models/AIQuestionDraft");

// ── PDF upload (memory-only, never written to disk) ───────────────────────────

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (file.mimetype === "application/pdf") return cb(null, true);
    cb(new Error("Only PDF files are accepted"), false);
  },
}).single("pdf");

// ─── Generation ───────────────────────────────────────────────────────────────

/**
 * POST /lecturer/ai-generator/generate
 *
 * Multipart or JSON body:
 *   pdf           — PDF file (optional)
 *   notes         — Pasted text or topic description (optional)
 *   count         — Number of questions (default 5, max 30)
 *   types         — Comma-separated question types (default "mcq")
 *   difficulty    — easy|medium|hard|mixed (default "mixed")
 *   subject       — Subject label (optional)
 *   language      — ISO code, default "en"
 *   targetQuizType — normal_quiz|snap_quiz|standalone (default "standalone")
 *   targetQuizId  — ObjectId of quiz to apply to later (optional)
 */
exports.generate = (req, res) => {
  pdfUpload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });

    try {
      // ── Extract source text ──────────────────────────────────────────────
      let sourceText  = "";
      let sourceType  = "topic";
      let sourceLabel = "";

      if (req.file) {
        const parsed = await pdfParse(req.file.buffer);
        sourceText  = parsed.text || "";
        sourceType  = "pdf";
        sourceLabel = req.file.originalname || "uploaded.pdf";
        if (!sourceText.trim()) {
          return res.status(400).json({
            error: "Could not extract text from this PDF. Try a text-based PDF or paste your notes.",
          });
        }
      } else if (req.body?.notes) {
        sourceText  = req.body.notes;
        sourceType  = "text";
        sourceLabel = sourceText.slice(0, 80);
      } else {
        return res.status(400).json({ error: "Provide a PDF file or paste text in the 'notes' field." });
      }

      // ── Parse params ─────────────────────────────────────────────────────
      const count      = Math.min(30, Math.max(1, parseInt(req.body?.count)  || 5));
      const typesRaw   = req.body?.types || "mcq";
      const types      = typesRaw.split(",").map(t => t.trim()).filter(t => SUPPORTED_TYPES.includes(t));
      const difficulty = ["easy","medium","hard","mixed"].includes(req.body?.difficulty)
        ? req.body.difficulty : "mixed";
      const subject      = req.body?.subject     || null;
      const language     = req.body?.language    || "en";
      const targetQuizType = Object.values(TARGET_QUIZ_TYPES).includes(req.body?.targetQuizType)
        ? req.body.targetQuizType
        : TARGET_QUIZ_TYPES.STANDALONE;
      const targetQuizId = req.body?.targetQuizId || null;

      if (types.length === 0) types.push("mcq");

      // ── Call AI ───────────────────────────────────────────────────────────
      const { questions, aiMetadata } = await generateQuestions({
        sourceText, count, types, difficulty, subject, language,
      });

      // ── Save draft ────────────────────────────────────────────────────────
      const draft = await AIQuestionDraft.create({
        company:   req.companyId,
        createdBy: req.user._id,
        sourceType,
        sourceLabel,
        sourceHash: hashSource(sourceText),
        generationParams: { count, types, difficulty, subject, language },
        targetQuizType,
        targetQuizId: targetQuizId || null,
        questions,
        aiMetadata,
      });

      return res.status(201).json({
        draft,
        message: `${questions.length} question(s) generated. Review and approve before applying to a quiz.`,
      });
    } catch (err) {
      if (err.message?.includes("ANTHROPIC_API_KEY")) {
        return res.status(503).json({ error: "AI service is not configured on this server" });
      }
      console.error("[aiGenerator generate]", err);
      return res.status(500).json({ error: err.message || "AI generation failed" });
    }
  });
};

// ─── Draft management ─────────────────────────────────────────────────────────

/**
 * GET /lecturer/ai-generator/drafts?status=&page=&limit=
 */
exports.listDrafts = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = { company: req.companyId, createdBy: req.user._id };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [drafts, total] = await Promise.all([
      AIQuestionDraft.find(filter)
        .select("-questions.correctAnswers -questions.modelAnswer") // lean view
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AIQuestionDraft.countDocuments(filter),
    ]);

    return res.json({ drafts, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[aiGenerator listDrafts]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/ai-generator/drafts/:draftId
 */
exports.getDraft = async (req, res) => {
  try {
    return res.json({ draft: req.assessment });
  } catch (err) {
    console.error("[aiGenerator getDraft]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Per-question review ──────────────────────────────────────────────────────

/**
 * PATCH /lecturer/ai-generator/drafts/:draftId/questions/:index
 * Edit a draft question. Automatically sets draftStatus to "edited".
 */
exports.editQuestion = async (req, res) => {
  try {
    const draft = req.assessment;
    const idx   = parseInt(req.params.index);
    if (isNaN(idx) || idx < 0 || idx >= draft.questions.length) {
      return res.status(400).json({ error: "Invalid question index" });
    }

    const q = draft.questions[idx];
    const editableFields = [
      "questionType","questionText","options",
      "correctOptionIndex","correctOptionIndices","correctBoolean",
      "correctAnswerText","acceptedAnswers","numericAnswer","modelAnswer",
      "explanation","marks","allowPartialMarks",
    ];
    editableFields.forEach(f => { if (req.body[f] !== undefined) q[f] = req.body[f]; });
    q.draftStatus = QUESTION_DRAFT_STATUSES.EDITED;

    draft.markModified("questions");
    await draft.save();

    return res.json({ question: q, index: idx });
  } catch (err) {
    console.error("[aiGenerator editQuestion]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /lecturer/ai-generator/drafts/:draftId/questions/:index/approve
 */
exports.approveQuestion = async (req, res) => {
  try {
    const draft = req.assessment;
    const idx   = parseInt(req.params.index);
    if (isNaN(idx) || idx < 0 || idx >= draft.questions.length) {
      return res.status(400).json({ error: "Invalid question index" });
    }

    const q = draft.questions[idx];
    if (q.draftStatus === QUESTION_DRAFT_STATUSES.REJECTED) {
      // Allow un-rejecting by approving.
    }
    q.draftStatus = QUESTION_DRAFT_STATUSES.APPROVED;
    q.approvedAt  = new Date();
    q.reviewNote  = req.body.reviewNote || null;

    draft.markModified("questions");
    _refreshDraftStatus(draft);
    await draft.save();

    return res.json({ question: q, index: idx, draftStatus: draft.status });
  } catch (err) {
    console.error("[aiGenerator approveQuestion]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /lecturer/ai-generator/drafts/:draftId/questions/:index/reject
 */
exports.rejectQuestion = async (req, res) => {
  try {
    const draft = req.assessment;
    const idx   = parseInt(req.params.index);
    if (isNaN(idx) || idx < 0 || idx >= draft.questions.length) {
      return res.status(400).json({ error: "Invalid question index" });
    }

    const q      = draft.questions[idx];
    q.draftStatus = QUESTION_DRAFT_STATUSES.REJECTED;
    q.rejectedAt  = new Date();
    q.reviewNote  = req.body.reviewNote || null;

    draft.markModified("questions");
    _refreshDraftStatus(draft);
    await draft.save();

    return res.json({ question: q, index: idx, draftStatus: draft.status });
  } catch (err) {
    console.error("[aiGenerator rejectQuestion]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /lecturer/ai-generator/drafts/:draftId/approve-all
 * Approve all currently pending questions in one shot.
 */
exports.approveAll = async (req, res) => {
  try {
    const draft = req.assessment;
    const now   = new Date();
    let count   = 0;

    draft.questions.forEach(q => {
      if (q.draftStatus === QUESTION_DRAFT_STATUSES.PENDING) {
        q.draftStatus = QUESTION_DRAFT_STATUSES.APPROVED;
        q.approvedAt  = now;
        count++;
      }
    });

    draft.markModified("questions");
    _refreshDraftStatus(draft);
    await draft.save();

    return res.json({ message: `${count} question(s) approved`, draftStatus: draft.status });
  } catch (err) {
    console.error("[aiGenerator approveAll]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Apply to quiz ────────────────────────────────────────────────────────────

/**
 * POST /lecturer/ai-generator/drafts/:draftId/apply
 * Converts approved/edited draft questions into real NormalQuizQuestion or
 * SnapQuizQuestion documents.
 *
 * Body: { quizId, quizType: "normal_quiz"|"snap_quiz" }  (optional — overrides draft targets)
 */
exports.applyToQuiz = async (req, res) => {
  try {
    const draft = req.assessment;

    if (draft.status === DRAFT_STATUSES.FULLY_PROCESSED) {
      return res.status(409).json({ error: "Draft has already been fully applied to a quiz" });
    }
    if (draft.status === DRAFT_STATUSES.DISCARDED) {
      return res.status(409).json({ error: "Draft has been discarded" });
    }

    // Resolve target quiz.
    const quizId   = req.body.quizId   || draft.targetQuizId?.toString();
    const quizType = req.body.quizType || draft.targetQuizType;

    if (!quizId || quizType === TARGET_QUIZ_TYPES.STANDALONE) {
      return res.status(400).json({ error: "Provide quizId and quizType to apply questions to a quiz" });
    }

    // Verify the quiz exists and belongs to this lecturer.
    let quiz, QuestionModel;
    if (quizType === TARGET_QUIZ_TYPES.NORMAL_QUIZ) {
      quiz          = await NormalQuiz.findOne({ _id: quizId, company: req.companyId, createdBy: req.user._id });
      QuestionModel = NormalQuizQuestion;
    } else if (quizType === TARGET_QUIZ_TYPES.SNAP_QUIZ) {
      quiz          = await SnapQuiz.findOne({ _id: quizId, company: req.companyId, createdBy: req.user._id });
      QuestionModel = SnapQuizQuestion;
    } else {
      return res.status(400).json({ error: "quizType must be 'normal_quiz' or 'snap_quiz'" });
    }

    if (!quiz) return res.status(404).json({ error: "Quiz not found or you do not own it" });

    // Get approved/edited questions.
    const toApply = draft.questions.filter(
      q => q.draftStatus === QUESTION_DRAFT_STATUSES.APPROVED ||
           q.draftStatus === QUESTION_DRAFT_STATUSES.EDITED
    );
    if (toApply.length === 0) {
      return res.status(422).json({ error: "No approved questions to apply. Approve at least one question first." });
    }

    // Determine next orderIndex.
    const lastQ = await QuestionModel.findOne({ quiz: quiz._id })
      .sort({ orderIndex: -1 }).select("orderIndex").lean();
    let nextIndex = lastQ ? lastQ.orderIndex + 1 : 0;

    const questionDocs = toApply.map(q => ({
      quiz:      quiz._id,
      company:   req.companyId,
      createdBy: req.user._id,
      orderIndex: nextIndex++,
      questionType:         q.questionType,
      questionText:         q.questionText,
      options:              q.options        || [],
      correctOptionIndex:   q.correctOptionIndex  ?? null,
      correctOptionIndices: q.correctOptionIndices || [],
      correctBoolean:       q.correctBoolean   ?? null,
      correctAnswerText:    q.correctAnswerText || null,
      acceptedAnswers:      q.acceptedAnswers   || [],
      numericAnswer:        q.numericAnswer     || {},
      modelAnswer:          q.modelAnswer       || "",
      explanation:          q.explanation       || "",
      marks:                q.marks             || 1,
      allowPartialMarks:    q.allowPartialMarks || false,
      requiresManualGrading: q.requiresManualGrading || false,
    }));

    const created = await QuestionModel.insertMany(questionDocs);

    // Update quiz totalMarks.
    const totalAdded = created.reduce((s, q) => s + (q.marks || 1), 0);
    await (quizType === TARGET_QUIZ_TYPES.NORMAL_QUIZ ? NormalQuiz : SnapQuiz).updateOne(
      { _id: quiz._id },
      { $inc: { totalMarks: totalAdded } }
    );

    // Mark draft as fully processed.
    draft.appliedToQuizId = quiz._id;
    draft.appliedAt       = new Date();
    draft.appliedCount    = created.length;
    draft.status          = DRAFT_STATUSES.FULLY_PROCESSED;
    await draft.save();

    return res.json({
      message:       `${created.length} question(s) added to the quiz`,
      appliedCount:  created.length,
      totalMarksAdded: totalAdded,
      questions:     created,
    });
  } catch (err) {
    console.error("[aiGenerator applyToQuiz]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Discard draft ────────────────────────────────────────────────────────────

/**
 * DELETE /lecturer/ai-generator/drafts/:draftId
 */
exports.discardDraft = async (req, res) => {
  try {
    const draft = req.assessment;
    draft.status = DRAFT_STATUSES.DISCARDED;
    await draft.save();
    return res.json({ message: "Draft discarded" });
  } catch (err) {
    console.error("[aiGenerator discardDraft]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Recompute draft.status from per-question draftStatus values.
 */
function _refreshDraftStatus(draft) {
  const statuses = draft.questions.map(q => q.draftStatus);
  const total    = statuses.length;
  const pending  = statuses.filter(s => s === QUESTION_DRAFT_STATUSES.PENDING).length;

  if (pending === total) {
    draft.status = DRAFT_STATUSES.PENDING_REVIEW;
  } else if (pending === 0) {
    draft.status = DRAFT_STATUSES.FULLY_PROCESSED;
  } else {
    draft.status = DRAFT_STATUSES.PARTIALLY_PROCESSED;
  }
}

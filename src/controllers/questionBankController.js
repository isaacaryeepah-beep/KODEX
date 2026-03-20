/**
 * questionBankController.js
 * CRUD for the question bank + import-to-quiz action.
 */
const mongoose  = require("mongoose");
const QuestionBank = require("../models/QuestionBank");
const Question  = require("../models/Question");
const Quiz      = require("../models/Quiz");

// ── Helper: build a bank question doc from request body ──────────────────
function buildBankDoc(body, userId, companyId) {
  const { questionText, questionType, options, correctAnswer, correctAnswers,
          correctAnswerText, acceptedAnswers, modelAnswer, marks, topic } = body;
  const type = ["single","multiple","fill","explain"].includes(questionType) ? questionType : "single";
  return {
    company:   companyId,
    createdBy: userId,
    questionText: questionText.trim(),
    questionType: type,
    options: (type === "fill" || type === "explain") ? [] : (options || []).map(o => String(o).trim()),
    correctAnswer: (type === "fill" || type === "explain") ? null : (correctAnswer ?? null),
    correctAnswers: type === "multiple" ? (correctAnswers || []).map(Number) : [],
    correctAnswerText: type === "fill" ? (correctAnswerText || "").trim() : null,
    acceptedAnswers: type === "fill" && Array.isArray(acceptedAnswers)
      ? acceptedAnswers.map(a => a.trim()).filter(Boolean) : [],
    modelAnswer: type === "explain" ? (modelAnswer || "").trim() : "",
    marks: Number(marks) || 1,
    topic: (topic || "").trim(),
  };
}

// GET /api/lecturer/question-bank
exports.list = async (req, res) => {
  try {
    const { topic, search, page = 1, limit = 50 } = req.query;
    const filter = { company: req.user.company, createdBy: req.user._id };
    if (topic) filter.topic = topic;
    if (search) filter.questionText = { $regex: search, $options: "i" };

    const [questions, total, topics] = await Promise.all([
      QuestionBank.find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit)),
      QuestionBank.countDocuments(filter),
      QuestionBank.distinct("topic", { company: req.user.company, createdBy: req.user._id }),
    ]);

    res.json({ questions, total, topics: topics.filter(Boolean).sort() });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch question bank" });
  }
};

// POST /api/lecturer/question-bank
exports.create = async (req, res) => {
  try {
    if (!req.body.questionText?.trim()) {
      return res.status(400).json({ error: "questionText is required" });
    }
    const doc = buildBankDoc(req.body, req.user._id, req.user.company);
    const q = await QuestionBank.create(doc);
    res.status(201).json({ question: q });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to create question" });
  }
};

// PUT /api/lecturer/question-bank/:id
exports.update = async (req, res) => {
  try {
    const q = await QuestionBank.findOne({
      _id: req.params.id, company: req.user.company, createdBy: req.user._id,
    });
    if (!q) return res.status(404).json({ error: "Question not found" });

    const fields = ["questionText","questionType","options","correctAnswer","correctAnswers",
                    "correctAnswerText","acceptedAnswers","modelAnswer","marks","topic"];
    fields.forEach(f => { if (req.body[f] !== undefined) q[f] = req.body[f]; });
    await q.save();
    res.json({ question: q });
  } catch (err) {
    res.status(500).json({ error: "Failed to update question" });
  }
};

// DELETE /api/lecturer/question-bank/:id
exports.remove = async (req, res) => {
  try {
    const q = await QuestionBank.findOneAndDelete({
      _id: req.params.id, company: req.user.company, createdBy: req.user._id,
    });
    if (!q) return res.status(404).json({ error: "Question not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete question" });
  }
};

// POST /api/lecturer/question-bank/save-from-quiz
// Save one or more existing quiz questions into the bank
exports.saveFromQuiz = async (req, res) => {
  try {
    const { questionIds, topic } = req.body;
    if (!Array.isArray(questionIds) || !questionIds.length) {
      return res.status(400).json({ error: "questionIds array required" });
    }

    const questions = await Question.find({
      _id: { $in: questionIds },
    }).populate("quiz", "company createdBy");

    // Only allow questions from this lecturer's quizzes
    const allowed = questions.filter(q =>
      q.quiz?.company?.toString() === req.user.company.toString() &&
      q.quiz?.createdBy?.toString() === req.user._id.toString()
    );

    if (!allowed.length) return res.status(403).json({ error: "No accessible questions found" });

    const docs = allowed.map(q => ({
      company: req.user.company,
      createdBy: req.user._id,
      questionText: q.questionText,
      questionType: q.questionType,
      options: q.options,
      correctAnswer: q.correctAnswer,
      correctAnswers: q.correctAnswers,
      correctAnswerText: q.correctAnswerText,
      acceptedAnswers: q.acceptedAnswers,
      marks: q.marks,
      topic: (topic || "").trim(),
    }));

    const saved = await QuestionBank.insertMany(docs);
    res.json({ message: `${saved.length} question(s) saved to bank`, questions: saved });
  } catch (err) {
    res.status(500).json({ error: "Failed to save to bank" });
  }
};

// POST /api/lecturer/question-bank/import-to-quiz
// Copy bank questions into a specific quiz
exports.importToQuiz = async (req, res) => {
  try {
    const { bankQuestionIds, quizId } = req.body;
    if (!quizId || !mongoose.Types.ObjectId.isValid(quizId)) {
      return res.status(400).json({ error: "Valid quizId required" });
    }
    if (!Array.isArray(bankQuestionIds) || !bankQuestionIds.length) {
      return res.status(400).json({ error: "bankQuestionIds array required" });
    }

    const quiz = await Quiz.findOne({
      _id: quizId, company: req.user.company, createdBy: req.user._id,
    });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const bankQs = await QuestionBank.find({
      _id: { $in: bankQuestionIds },
      company: req.user.company,
      createdBy: req.user._id,
    });

    if (!bankQs.length) return res.status(404).json({ error: "No bank questions found" });

    const newQuestions = await Question.insertMany(
      bankQs.map(bq => ({
        quiz: quizId,
        questionText: bq.questionText,
        questionType: bq.questionType,
        options: bq.options,
        correctAnswer: bq.correctAnswer,
        correctAnswers: bq.correctAnswers,
        correctAnswerText: bq.correctAnswerText,
        acceptedAnswers: bq.acceptedAnswers,
        modelAnswer: bq.modelAnswer || "",
        marks: bq.marks,
      }))
    );

    // Increment useCount on bank questions
    await QuestionBank.updateMany(
      { _id: { $in: bankQuestionIds } },
      { $inc: { useCount: 1 } }
    );

    // Update quiz totalMarks
    const allQs = await Question.find({ quiz: quizId });
    quiz.totalMarks = allQs.reduce((s, q) => s + q.marks, 0);
    await quiz.save();

    res.json({
      message: `${newQuestions.length} question(s) imported`,
      questions: newQuestions,
      totalMarks: quiz.totalMarks,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Failed to import questions" });
  }
};

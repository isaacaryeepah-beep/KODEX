const mongoose = require("mongoose");
const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const Attempt = require("../models/Attempt");
const Answer = require("../models/Answer");
const Course = require("../models/Course");

exports.createQuiz = async (req, res) => {
  try {
    const { title, description, courseId, timeLimit, startTime, endTime, questions, maxAttempts, scorePolicy } = req.body;

    if (!title || !courseId || !startTime || !endTime) {
      return res.status(400).json({ error: "Title, courseId, startTime, and endTime are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: "Invalid course ID" });
    }

    const course = await Course.findOne({
      _id: courseId,
      company: req.user.company,
      lecturer: req.user._id,
    });

    if (!course) {
      return res.status(404).json({ error: "Course not found or does not belong to you" });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    if (end <= start) {
      return res.status(400).json({ error: "End time must be after start time" });
    }

    const quiz = await Quiz.create({
      title,
      description: description || "",
      course: courseId,
      company: req.user.company,
      createdBy: req.user._id,
      timeLimit: timeLimit || 30,
      startTime: start,
      endTime: end,
      source: req.body.source === 'assignment' ? 'assignment' : 'proctored',
      maxAttempts: maxAttempts !== undefined ? Number(maxAttempts) : 1,
      scorePolicy: ["best","last"].includes(scorePolicy) ? scorePolicy : "best",
    });

    if (questions && Array.isArray(questions) && questions.length > 0) {
      const questionDocs = questions.map((q) => ({
        quiz: quiz._id,
        questionText: q.questionText,
        questionType: q.questionType || "single",
        options: (q.questionType === "fill" || q.questionType === "explain") ? [] : (q.options || []),
        correctAnswer: (q.questionType === "fill" || q.questionType === "explain") ? null : (q.correctAnswer ?? null),
        correctAnswers: (q.questionType === "fill" || q.questionType === "explain") ? [] : (q.correctAnswers || []),
        correctAnswerText: q.questionType === "fill" ? (q.correctAnswerText || "") : null,
        acceptedAnswers: q.questionType === "fill" ? (q.acceptedAnswers || []) : [],
        modelAnswer: q.questionType === "explain" ? (q.modelAnswer || "") : "",
        marks: q.marks || 1,
      }));
      const createdQuestions = await Question.insertMany(questionDocs);
      const totalMarks = createdQuestions.reduce((sum, q) => sum + q.marks, 0);
      quiz.totalMarks = totalMarks;
      await quiz.save();
    }

    const populated = await Quiz.findById(quiz._id)
      .populate("course", "title code")
      .populate("createdBy", "name email");

    const qQuestions = await Question.find({ quiz: quiz._id }).sort({ createdAt: 1 });

    res.status(201).json({ quiz: { ...populated.toObject(), questions: qQuestions } });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    console.error("Create quiz error:", error);
    res.status(500).json({ error: "Failed to create quiz" });
  }
};

exports.listQuizzes = async (req, res) => {
  try {
    const { courseId } = req.query;

    // HOD sees all quizzes in their department; lecturer sees only their own
    let filter;
    if (req.user.role === 'hod') {
      filter = { company: req.user.company };
      if (req.user.department) {
        // Find lecturers in this department then filter by them
        const User = require('../models/User');
        const deptLecturers = await User.find({
          company: req.user.company,
          role: 'lecturer',
          department: req.user.department,
        }).select('_id').lean();
        const ids = deptLecturers.map(l => l._id);
        filter.createdBy = { $in: ids };
      }
    } else {
      filter = { company: req.user.company, createdBy: req.user._id };
    }

    // Filter by source if provided (proctored = main portal, assignment = assignments page)
    // Legacy quizzes have no source field — treat them as proctored
    if (req.query.source === 'assignment') {
      filter.source = 'assignment';
    } else if (req.query.source === 'proctored') {
      filter.$or = [{ source: 'proctored' }, { source: { $exists: false } }, { source: null }];
    }

    if (courseId) {
      if (!mongoose.Types.ObjectId.isValid(courseId)) {
        return res.status(400).json({ error: "Invalid course ID" });
      }
      filter.course = courseId;
    }

    const quizzes = await Quiz.find(filter)
      .populate("course", "title code")
      .sort({ createdAt: -1 });

    const quizIds = quizzes.map((q) => q._id);
    const questionCounts = await Question.aggregate([
      { $match: { quiz: { $in: quizIds } } },
      { $group: { _id: "$quiz", count: { $sum: 1 } } },
    ]);
    const attemptCounts = await Attempt.aggregate([
      { $match: { quiz: { $in: quizIds }, isSubmitted: true } },
      { $group: { _id: "$quiz", count: { $sum: 1 } } },
    ]);

    // Aggregate stats per quiz for the performance page
    const statsAgg = await Attempt.aggregate([
      { $match: { quiz: { $in: quizIds }, isSubmitted: true } },
      { $group: {
        _id: "$quiz",
        totalAttempts: { $sum: 1 },
        avgScore:      { $avg: "$score" },
        highestScore:  { $max: "$score" },
        lowestScore:   { $min: "$score" },
        avgMaxScore:   { $avg: "$maxScore" },
      }},
    ]);

    const qCountMap = {};
    questionCounts.forEach((q) => (qCountMap[q._id.toString()] = q.count));
    const aCountMap = {};
    attemptCounts.forEach((a) => (aCountMap[a._id.toString()] = a.count));
    const statsMap = {};
    statsAgg.forEach((s) => (statsMap[s._id.toString()] = s));

    const result = quizzes.map((q) => {
      const sid = q._id.toString();
      const s = statsMap[sid];
      const totalAttempts = s?.totalAttempts || 0;
      const avgMaxScore = s?.avgMaxScore || 0;
      const avgScore = s?.avgScore || 0;
      const avgPct = avgMaxScore > 0 ? Math.round((avgScore / avgMaxScore) * 100) : 0;
      return {
        ...q.toObject(),
        questionCount: qCountMap[sid] || 0,
        attemptCount:  aCountMap[sid] || 0,
        stats: {
          totalAttempts,
          averageScore:  avgPct,
          highestScore:  s?.highestScore != null && avgMaxScore > 0
            ? Math.round((s.highestScore / avgMaxScore) * 100)
            : null,
          lowestScore:   s?.lowestScore != null && avgMaxScore > 0
            ? Math.round((s.lowestScore / avgMaxScore) * 100)
            : null,
          passRate: 0, // calculated below
        },
      };
    });

    // Calculate pass rates using score/maxScore ratio
    const passAgg = await Attempt.aggregate([
      { $match: { quiz: { $in: quizIds }, isSubmitted: true, maxScore: { $gt: 0 } } },
      { $group: {
        _id: "$quiz",
        total: { $sum: 1 },
        passed: { $sum: { $cond: [
          { $gte: [{ $divide: ["$score", "$maxScore"] }, 0.5] },
          1, 0
        ]}},
      }},
    ]);
    const passMap = {};
    passAgg.forEach(p => (passMap[p._id.toString()] = p.total > 0 ? Math.round((p.passed / p.total) * 100) : 0));
    result.forEach(q => { if (q.stats) q.stats.passRate = passMap[q._id.toString()] || 0; });

    res.json({ quizzes: result });
  } catch (error) {
    console.error("List lecturer quizzes error:", error);
    res.status(500).json({ error: "Failed to fetch quizzes" });
  }
};

exports.getQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, createdBy: req.user._id })
      .populate("course", "title code")
      .populate("createdBy", "name email");

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const questions = await Question.find({ quiz: id }).sort({ createdAt: 1 });

    const attempts = await Attempt.find({ quiz: id, isSubmitted: true })
      .populate("student", "name email IndexNumber")
      .sort({ submittedAt: -1 });

    res.json({ quiz: { ...quiz.toObject(), questions }, attempts });
  } catch (error) {
    console.error("Get quiz error:", error);
    res.status(500).json({ error: "Failed to fetch quiz" });
  }
};

exports.updateQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, createdBy: req.user._id });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const attemptCount = await Attempt.countDocuments({ quiz: id, isSubmitted: true });
    if (attemptCount > 0) {
      return res.status(400).json({ error: "Cannot edit a quiz that already has submissions" });
    }

    const { title, description, timeLimit, startTime, endTime, maxAttempts, scorePolicy } = req.body;
    if (title) quiz.title = title;
    if (description !== undefined) quiz.description = description;
    if (timeLimit) quiz.timeLimit = timeLimit;
    if (startTime) quiz.startTime = new Date(startTime);
    if (endTime) quiz.endTime = new Date(endTime);
    if (maxAttempts !== undefined) quiz.maxAttempts = Number(maxAttempts);
    if (scorePolicy && ["best","last"].includes(scorePolicy)) quiz.scorePolicy = scorePolicy;

    await quiz.save();

    const populated = await Quiz.findById(quiz._id)
      .populate("course", "title code")
      .populate("createdBy", "name email");

    res.json({ quiz: populated });
  } catch (error) {
    console.error("Update quiz error:", error);
    res.status(500).json({ error: "Failed to update quiz" });
  }
};

exports.deleteQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, createdBy: req.user._id });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const attempts = await Attempt.find({ quiz: id });
    const attemptIds = attempts.map((a) => a._id);
    await Answer.deleteMany({ attempt: { $in: attemptIds } });
    await Attempt.deleteMany({ quiz: id });
    await Question.deleteMany({ quiz: id });
    // Clean up proctored quiz sessions
    const QuizSession = require("../models/QuizSession");
    await QuizSession.deleteMany({ quiz: id });
    await Quiz.deleteOne({ _id: id });

    res.json({ message: "Quiz deleted successfully" });
  } catch (error) {
    console.error("Delete quiz error:", error);
    res.status(500).json({ error: "Failed to delete quiz" });
  }
};

exports.addQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { questionText, options, correctAnswer, correctAnswers, questionType, marks, correctAnswerText, acceptedAnswers } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, createdBy: req.user._id });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const isFill     = questionType === "fill";
    const isExplain  = questionType === "explain";
    const isMultiple = !isFill && !isExplain && (questionType === "multiple" || (Array.isArray(correctAnswers) && correctAnswers.length > 1));

    if (!questionText) {
      return res.status(400).json({ error: "questionText is required" });
    }
    if (!isFill && !isExplain) {
      if (!options || !Array.isArray(options) || options.length < 2) {
        return res.status(400).json({ error: "At least 2 options are required for MCQ questions" });
      }
    }

    if (isFill) {
      if (!correctAnswerText || !correctAnswerText.trim()) {
        return res.status(400).json({ error: "correctAnswerText is required for fill-in questions" });
      }
    } else if (isMultiple) {
      if (!Array.isArray(correctAnswers) || correctAnswers.length === 0) {
        return res.status(400).json({ error: "At least one correct answer is required" });
      }
    } else {
      if (correctAnswer === undefined || correctAnswer === null) {
        return res.status(400).json({ error: "correctAnswer is required for single-answer questions" });
      }
      if (correctAnswer < 0 || correctAnswer >= options.length) {
        return res.status(400).json({ error: "correctAnswer must be a valid option index" });
      }
    }

    const { modelAnswer } = req.body;
    const question = await Question.create({
      quiz: id,
      questionText,
      options: (isFill || isExplain) ? [] : options,
      questionType: isFill ? "fill" : (isExplain ? "explain" : (isMultiple ? "multiple" : "single")),
      correctAnswer: (isFill || isExplain) ? null : (isMultiple ? (correctAnswers[0] ?? 0) : correctAnswer),
      correctAnswers: (isFill || isExplain) ? [] : (isMultiple ? correctAnswers : [correctAnswer]),
      correctAnswerText: isFill ? correctAnswerText.trim() : null,
      acceptedAnswers: isFill && Array.isArray(acceptedAnswers)
        ? acceptedAnswers.map(a => a.trim()).filter(Boolean)
        : [],
      modelAnswer: isExplain ? (modelAnswer || "").trim() : "",
      marks: marks || 1,
    });

    const allQuestions = await Question.find({ quiz: id });
    quiz.totalMarks = allQuestions.reduce((sum, q) => sum + q.marks, 0);
    await quiz.save();

    res.status(201).json({ question, totalMarks: quiz.totalMarks });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    console.error("Add question error:", error);
    res.status(500).json({ error: "Failed to add question" });
  }
};

exports.updateQuestion = async (req, res) => {
  try {
    const { id, questionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, createdBy: req.user._id });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const question = await Question.findOne({ _id: questionId, quiz: id });
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    const { questionText, options, correctAnswer, correctAnswers, questionType, marks, correctAnswerText, acceptedAnswers } = req.body;
    if (questionText) question.questionText = questionText;
    if (questionType) question.questionType = questionType;
    if (question.questionType === "fill") {
      question.options = [];
      if (correctAnswerText !== undefined) question.correctAnswerText = correctAnswerText ? correctAnswerText.trim() : null;
      if (Array.isArray(acceptedAnswers)) question.acceptedAnswers = acceptedAnswers.map(a => a.trim()).filter(Boolean);
    } else {
      if (options) question.options = options;
      if (correctAnswer !== undefined) question.correctAnswer = correctAnswer;
      if (Array.isArray(correctAnswers)) question.correctAnswers = correctAnswers;
    }
    if (marks !== undefined) question.marks = marks;

    await question.save();

    const allQuestions = await Question.find({ quiz: id });
    quiz.totalMarks = allQuestions.reduce((sum, q) => sum + q.marks, 0);
    await quiz.save();

    res.json({ question, totalMarks: quiz.totalMarks });
  } catch (error) {
    console.error("Update question error:", error);
    res.status(500).json({ error: "Failed to update question" });
  }
};

exports.deleteQuestion = async (req, res) => {
  try {
    const { id, questionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(questionId)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, createdBy: req.user._id });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const question = await Question.findOneAndDelete({ _id: questionId, quiz: id });
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    await Answer.deleteMany({ question: questionId });

    const allQuestions = await Question.find({ quiz: id });
    quiz.totalMarks = allQuestions.reduce((sum, q) => sum + q.marks, 0);
    await quiz.save();

    res.json({ message: "Question deleted", totalMarks: quiz.totalMarks });
  } catch (error) {
    console.error("Delete question error:", error);
    res.status(500).json({ error: "Failed to delete question" });
  }
};

exports.getQuizResults = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, createdBy: req.user._id })
      .populate("course", "title code enrolledStudents");

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const questions = await Question.find({ quiz: id }).sort({ createdAt: 1 });

    const attempts = await Attempt.find({ quiz: id, isSubmitted: true })
      .populate("student", "name email IndexNumber")
      .sort({ score: -1 });

    const totalStudents = quiz.course?.enrolledStudents?.length || 0;
    const submitted = attempts.length;
    const avgScore = submitted > 0 ? attempts.reduce((sum, a) => sum + a.score, 0) / submitted : 0;
    const highestScore = submitted > 0 ? Math.max(...attempts.map((a) => a.score)) : 0;
    const lowestScore = submitted > 0 ? Math.min(...attempts.map((a) => a.score)) : 0;
    const passCount = attempts.filter((a) => a.maxScore > 0 && (a.score / a.maxScore) >= 0.5).length;

    const attemptsWithPercentage = attempts.map((a) => {
      const obj = a.toObject();
      obj.percentage = obj.maxScore > 0 ? Math.round((obj.score / obj.maxScore) * 100) : 0;
      return obj;
    });

    // Per-question difficulty: how many got each question right
    const attemptIds = attempts.map((a) => a._id);
    const allAnswers = await Answer.find({ attempt: { $in: attemptIds } })
      .populate("question", "questionText marks questionType");

    const questionStats = {};
    for (const ans of allAnswers) {
      if (!ans.question) continue;
      const qid = ans.question._id.toString();
      if (!questionStats[qid]) {
        questionStats[qid] = {
          questionText: ans.question.questionText,
          marks: ans.question.marks,
          questionType: ans.question.questionType,
          correct: 0,
          total: 0,
        };
      }
      questionStats[qid].total++;
      if (ans.isCorrect) questionStats[qid].correct++;
    }

    const questionDifficulty = questions.map((q) => {
      const qs = questionStats[q._id.toString()] || { correct: 0, total: 0 };
      return {
        _id: q._id,
        questionText: q.questionText,
        marks: q.marks,
        questionType: q.questionType,
        correct: qs.correct,
        total: qs.total,
        successRate: qs.total > 0 ? Math.round((qs.correct / qs.total) * 100) : null,
      };
    });

    res.json({
      quiz: quiz.toObject(),
      questions,
      attempts: attemptsWithPercentage,
      questionDifficulty,
      stats: {
        totalStudents,
        submitted,
        notSubmitted: totalStudents - submitted,
        averageScore: Math.round(avgScore * 100) / 100,
        highestScore,
        lowestScore,
        passRate: submitted > 0 ? Math.round((passCount / submitted) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("Get quiz results error:", error);
    res.status(500).json({ error: "Failed to fetch results" });
  }
};

exports.getStudentAnswers = async (req, res) => {
  try {
    const { id, attemptId } = req.params;

    // Verify quiz belongs to this lecturer
    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, createdBy: req.user._id });
    if (!quiz) return res.status(404).json({ error: "Quiz not found" });

    const attempt = await Attempt.findOne({ _id: attemptId, quiz: id, isSubmitted: true })
      .populate("student", "name email IndexNumber");
    if (!attempt) return res.status(404).json({ error: "Attempt not found" });

    const answers = await Answer.find({ attempt: attemptId })
      .populate("question", "questionText options marks questionType correctAnswer correctAnswers correctAnswerText acceptedAnswers")
      .sort({ createdAt: 1 });

    res.json({
      attempt: {
        ...attempt.toObject(),
        percentage: attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 100) : 0,
      },
      answers,
    });
  } catch (error) {
    console.error("Get student answers error:", error);
    res.status(500).json({ error: "Failed to fetch student answers" });
  }
};

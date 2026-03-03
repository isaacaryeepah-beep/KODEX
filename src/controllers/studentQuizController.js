const mongoose = require("mongoose");
const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const Attempt = require("../models/Attempt");
const Answer = require("../models/Answer");
const Course = require("../models/Course");

exports.listQuizzes = async (req, res) => {
  try {
    const { courseId } = req.query;

    const enrolledCourses = await Course.find({
      company: req.user.company,
      enrolledStudents: req.user._id,
      isActive: true,
    }).select("_id");

    const enrolledIds = enrolledCourses.map((c) => c._id);

    if (enrolledIds.length === 0) {
      return res.json({ quizzes: [] });
    }

    const now = new Date();
    const filter = {
      company: req.user.company,
      course: { $in: enrolledIds },
      isActive: true,
      startTime: { $lte: now },
      endTime: { $gte: now },
    };

    if (courseId) {
      if (!enrolledIds.some((id) => id.toString() === courseId)) {
        return res.json({ quizzes: [] });
      }
      filter.course = courseId;
    }

    if (req.query.showAll === "true") {
      delete filter.startTime;
      delete filter.endTime;
    }

    const quizzes = await Quiz.find(filter)
      .populate("course", "title code")
      .populate("createdBy", "name")
      .sort({ startTime: -1 });

    const quizIds = quizzes.map((q) => q._id);

    const [questionCounts, myAttempts] = await Promise.all([
      Question.aggregate([
        { $match: { quiz: { $in: quizIds } } },
        { $group: { _id: "$quiz", count: { $sum: 1 } } },
      ]),
      Attempt.find({ quiz: { $in: quizIds }, student: req.user._id }),
    ]);

    const qCountMap = {};
    questionCounts.forEach((q) => (qCountMap[q._id.toString()] = q.count));
    const attemptMap = {};
    myAttempts.forEach((a) => (attemptMap[a.quiz.toString()] = a));

    const result = quizzes.map((q) => {
      const obj = q.toObject();
      obj.questionCount = qCountMap[q._id.toString()] || 0;
      const attempt = attemptMap[q._id.toString()];
      obj.hasAttempted = !!attempt;
      obj.isSubmitted = attempt?.isSubmitted || false;
      obj.myScore = attempt?.score || null;
      obj.myMaxScore = attempt?.maxScore || null;

      const isOpen = now >= q.startTime && now <= q.endTime;
      obj.status = now < q.startTime ? "upcoming" : now > q.endTime ? "closed" : "open";
      obj.canAttempt = isOpen && !obj.isSubmitted;
      return obj;
    });

    res.json({ quizzes: result });
  } catch (error) {
    console.error("Student list quizzes error:", error);
    res.status(500).json({ error: "Failed to fetch quizzes" });
  }
};

exports.getQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, isActive: true })
      .populate("course", "title code enrolledStudents")
      .populate("createdBy", "name");

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const isEnrolled = quiz.course?.enrolledStudents?.some(
      (sid) => sid.toString() === req.user._id.toString()
    );
    if (!isEnrolled) {
      return res.status(403).json({ error: "You are not enrolled in this course" });
    }

    const questions = await Question.find({ quiz: id })
      .select("-correctAnswer")
      .sort({ createdAt: 1 });

    const attempt = await Attempt.findOne({ quiz: id, student: req.user._id });

    const quizObj = quiz.toObject();
    delete quizObj.course.enrolledStudents;

    res.json({
      quiz: quizObj,
      questions,
      attempt: attempt || null,
    });
  } catch (error) {
    console.error("Student get quiz error:", error);
    res.status(500).json({ error: "Failed to fetch quiz" });
  }
};

exports.startAttempt = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, isActive: true })
      .populate("course", "enrolledStudents");

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const isEnrolled = quiz.course?.enrolledStudents?.some(
      (sid) => sid.toString() === req.user._id.toString()
    );
    if (!isEnrolled) {
      return res.status(403).json({ error: "You are not enrolled in this course" });
    }

    const now = new Date();
    if (now < quiz.startTime) {
      return res.status(400).json({ error: "Quiz has not started yet" });
    }
    if (now > quiz.endTime) {
      return res.status(400).json({ error: "Quiz has ended" });
    }

    let attempt = await Attempt.findOne({ quiz: id, student: req.user._id });
    if (attempt && attempt.isSubmitted) {
      return res.status(409).json({ error: "You have already submitted this quiz" });
    }

    if (!attempt) {
      attempt = await Attempt.create({
        quiz: id,
        student: req.user._id,
        company: req.user.company,
        startedAt: now,
        maxScore: quiz.totalMarks,
      });
    }

    let questions = await Question.find({ quiz: id })
      .select("-correctAnswer")
      .sort({ createdAt: 1 });

    questions = questions
      .map((q) => ({ ...q.toObject(), _sort: Math.random() }))
      .sort((a, b) => a._sort - b._sort)
      .map(({ _sort, ...q }) => q);

    res.json({ attempt, questions, timeLimit: quiz.timeLimit });
  } catch (error) {
    if (error.code === 11000) {
      const existing = await Attempt.findOne({ quiz: req.params.id, student: req.user._id });
      if (existing && existing.isSubmitted) {
        return res.status(409).json({ error: "You have already submitted this quiz" });
      }
      let questions = await Question.find({ quiz: req.params.id })
        .select("-correctAnswer")
        .sort({ createdAt: 1 });
      questions = questions
        .map((q) => ({ ...q.toObject(), _sort: Math.random() }))
        .sort((a, b) => a._sort - b._sort)
        .map(({ _sort, ...q }) => q);
      return res.json({ attempt: existing, questions, timeLimit: null });
    }
    console.error("Start attempt error:", error);
    res.status(500).json({ error: "Failed to start quiz" });
  }
};

exports.submitAttempt = async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, isActive: true })
      .populate("course", "enrolledStudents");
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const isEnrolled = quiz.course?.enrolledStudents?.some(
      (sid) => sid.toString() === req.user._id.toString()
    );
    if (!isEnrolled) {
      return res.status(403).json({ error: "You are not enrolled in this course" });
    }

    const now = new Date();
    if (now > quiz.endTime) {
      return res.status(400).json({ error: "Quiz has ended" });
    }

    const attempt = await Attempt.findOne({ quiz: id, student: req.user._id });
    if (!attempt) {
      return res.status(400).json({ error: "You must start the quiz first" });
    }
    if (attempt.isSubmitted) {
      return res.status(409).json({ error: "Quiz already submitted" });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: "Answers must be an array" });
    }

    const questions = await Question.find({ quiz: id }).sort({ createdAt: 1 });
    const questionMap = {};
    questions.forEach((q) => (questionMap[q._id.toString()] = q));

    let totalScore = 0;
    const answerDocs = [];

    for (const ans of answers) {
      const question = questionMap[ans.questionId];
      if (!question) continue;

      const isCorrect = question.correctAnswer === ans.selectedAnswer;
      const points = isCorrect ? question.marks : 0;
      totalScore += points;

      answerDocs.push({
        attempt: attempt._id,
        question: ans.questionId,
        selectedAnswer: ans.selectedAnswer,
        isCorrect,
      });
    }

    if (answerDocs.length > 0) {
      await Answer.insertMany(answerDocs, { ordered: false }).catch(() => {});
    }

    attempt.score = totalScore;
    attempt.maxScore = quiz.totalMarks;
    attempt.submittedAt = new Date();
    attempt.isSubmitted = true;
    await attempt.save();

    res.json({
      attempt,
      score: totalScore,
      maxScore: quiz.totalMarks,
      percentage: quiz.totalMarks > 0 ? Math.round((totalScore / quiz.totalMarks) * 100) : 0,
    });
  } catch (error) {
    console.error("Submit attempt error:", error);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
};

exports.getMyResult = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const attempt = await Attempt.findOne({ quiz: id, student: req.user._id, isSubmitted: true })
      .populate("quiz", "title description timeLimit totalMarks startTime endTime");

    if (!attempt) {
      return res.status(404).json({ error: "No submission found for this quiz" });
    }

    const answers = await Answer.find({ attempt: attempt._id })
      .populate("question", "questionText options correctAnswer marks");

    res.json({ attempt, answers });
  } catch (error) {
    console.error("Get result error:", error);
    res.status(500).json({ error: "Failed to fetch result" });
  }
};

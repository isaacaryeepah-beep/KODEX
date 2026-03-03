const mongoose = require("mongoose");
const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const Attempt = require("../models/Attempt");
const Answer = require("../models/Answer");
const User = require("../models/User");

exports.listQuizzes = async (req, res) => {
  try {
    const { courseId, lecturerId } = req.query;
    const filter = { company: req.user.company };

    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      filter.course = courseId;
    }
    if (lecturerId && mongoose.Types.ObjectId.isValid(lecturerId)) {
      filter.createdBy = lecturerId;
    }

    const quizzes = await Quiz.find(filter)
      .populate("course", "title code")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 });

    const quizIds = quizzes.map((q) => q._id);

    const [questionCounts, attemptCounts] = await Promise.all([
      Question.aggregate([
        { $match: { quiz: { $in: quizIds } } },
        { $group: { _id: "$quiz", count: { $sum: 1 } } },
      ]),
      Attempt.aggregate([
        { $match: { quiz: { $in: quizIds }, isSubmitted: true } },
        { $group: { _id: "$quiz", count: { $sum: 1 }, avgScore: { $avg: "$score" } } },
      ]),
    ]);

    const qMap = {};
    questionCounts.forEach((q) => (qMap[q._id.toString()] = q.count));
    const aMap = {};
    attemptCounts.forEach((a) => (aMap[a._id.toString()] = { count: a.count, avgScore: a.avgScore }));

    const result = quizzes.map((q) => {
      const obj = q.toObject();
      obj.questionCount = qMap[q._id.toString()] || 0;
      const aData = aMap[q._id.toString()] || { count: 0, avgScore: 0 };
      obj.attemptCount = aData.count;
      obj.averageScore = Math.round((aData.avgScore || 0) * 100) / 100;
      return obj;
    });

    res.json({ quizzes: result });
  } catch (error) {
    console.error("Admin list quizzes error:", error);
    res.status(500).json({ error: "Failed to fetch quizzes" });
  }
};

exports.getQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company })
      .populate("course", "title code enrolledStudents")
      .populate("createdBy", "name email");

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const questions = await Question.find({ quiz: id }).sort({ createdAt: 1 });

    const attempts = await Attempt.find({ quiz: id, isSubmitted: true })
      .populate("student", "name email indexNumber")
      .sort({ score: -1 });

    const submitted = attempts.length;
    const totalStudents = quiz.course?.enrolledStudents?.length || 0;
    const avgScore = submitted > 0 ? attempts.reduce((sum, a) => sum + a.score, 0) / submitted : 0;
    const highestScore = submitted > 0 ? Math.max(...attempts.map((a) => a.score)) : 0;
    const lowestScore = submitted > 0 ? Math.min(...attempts.map((a) => a.score)) : 0;

    res.json({
      quiz: quiz.toObject(),
      questions,
      attempts,
      stats: {
        totalStudents,
        submitted,
        notSubmitted: Math.max(0, totalStudents - submitted),
        averageScore: Math.round(avgScore * 100) / 100,
        highestScore,
        lowestScore,
      },
    });
  } catch (error) {
    console.error("Admin get quiz error:", error);
    res.status(500).json({ error: "Failed to fetch quiz" });
  }
};

exports.getReports = async (req, res) => {
  try {
    const companyId = req.user.company;

    const quizzes = await Quiz.find({ company: companyId })
      .populate("course", "title code enrolledStudents")
      .populate("createdBy", "name email");

    const totalQuizzes = quizzes.length;
    const quizIds = quizzes.map((q) => q._id);

    const attempts = await Attempt.find({ quiz: { $in: quizIds }, isSubmitted: true });

    const totalAttempts = attempts.length;
    const avgScore = totalAttempts > 0
      ? Math.round((attempts.reduce((sum, a) => sum + (a.maxScore > 0 ? (a.score / a.maxScore) * 100 : 0), 0) / totalAttempts) * 100) / 100
      : 0;

    let totalEnrolled = 0;
    const lecturerMap = {};

    for (const quiz of quizzes) {
      const enrolled = quiz.course?.enrolledStudents?.length || 0;
      totalEnrolled += enrolled;

      const lecId = quiz.createdBy?._id?.toString() || "unknown";
      const lecName = quiz.createdBy?.name || "Unknown";
      if (!lecturerMap[lecId]) {
        lecturerMap[lecId] = { name: lecName, email: quiz.createdBy?.email || "", quizCount: 0 };
      }
      lecturerMap[lecId].quizCount += 1;
    }

    const participationRate = totalEnrolled > 0
      ? Math.round((totalAttempts / totalEnrolled) * 100)
      : 0;

    const quizzesPerLecturer = Object.values(lecturerMap).sort((a, b) => b.quizCount - a.quizCount);

    res.json({
      totalQuizzes,
      totalAttempts,
      participationRate,
      averageScore: avgScore,
      quizzesPerLecturer,
    });
  } catch (error) {
    console.error("Admin quiz reports error:", error);
    res.status(500).json({ error: "Failed to generate quiz reports" });
  }
};

exports.getAttemptDetail = async (req, res) => {
  try {
    const { id, attemptId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(attemptId)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const attempt = await Attempt.findOne({ _id: attemptId, quiz: id })
      .populate("student", "name email indexNumber");

    if (!attempt) {
      return res.status(404).json({ error: "Attempt not found" });
    }

    const answers = await Answer.find({ attempt: attemptId })
      .populate("question", "questionText options correctAnswer marks");

    res.json({ attempt, answers });
  } catch (error) {
    console.error("Admin get attempt error:", error);
    res.status(500).json({ error: "Failed to fetch attempt" });
  }
};

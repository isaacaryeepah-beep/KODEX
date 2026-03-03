const mongoose = require("mongoose");
const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const Attempt = require("../models/Attempt");
const Answer = require("../models/Answer");
const Course = require("../models/Course");

exports.createQuiz = async (req, res) => {
  try {
    const { title, description, courseId, timeLimit, startTime, endTime, questions } = req.body;

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
    });

    if (questions && Array.isArray(questions) && questions.length > 0) {
      const questionDocs = questions.map((q) => ({
        quiz: quiz._id,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
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
    const filter = { company: req.user.company, createdBy: req.user._id };

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

    const qCountMap = {};
    questionCounts.forEach((q) => (qCountMap[q._id.toString()] = q.count));
    const aCountMap = {};
    attemptCounts.forEach((a) => (aCountMap[a._id.toString()] = a.count));

    const result = quizzes.map((q) => ({
      ...q.toObject(),
      questionCount: qCountMap[q._id.toString()] || 0,
      attemptCount: aCountMap[q._id.toString()] || 0,
    }));

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
      .populate("student", "name email indexNumber")
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

    const { title, description, timeLimit, startTime, endTime } = req.body;
    if (title) quiz.title = title;
    if (description !== undefined) quiz.description = description;
    if (timeLimit) quiz.timeLimit = timeLimit;
    if (startTime) quiz.startTime = new Date(startTime);
    if (endTime) quiz.endTime = new Date(endTime);

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
    const { questionText, options, correctAnswer, marks } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, createdBy: req.user._id });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    if (!questionText || !options || correctAnswer === undefined) {
      return res.status(400).json({ error: "questionText, options, and correctAnswer are required" });
    }

    if (!Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ error: "At least 2 options are required" });
    }

    if (correctAnswer < 0 || correctAnswer >= options.length) {
      return res.status(400).json({ error: "correctAnswer must be a valid option index" });
    }

    const question = await Question.create({
      quiz: id,
      questionText,
      options,
      correctAnswer,
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

    const { questionText, options, correctAnswer, marks } = req.body;
    if (questionText) question.questionText = questionText;
    if (options) question.options = options;
    if (correctAnswer !== undefined) question.correctAnswer = correctAnswer;
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
      .populate("student", "name email indexNumber")
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

    res.json({
      quiz: quiz.toObject(),
      questions,
      attempts: attemptsWithPercentage,
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

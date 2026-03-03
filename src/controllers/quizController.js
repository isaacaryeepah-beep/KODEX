const mongoose = require("mongoose");
const Quiz = require("../models/Quiz");
const QuizSubmission = require("../models/QuizSubmission");
const Course = require("../models/Course");

exports.createQuiz = async (req, res) => {
  try {
    const { title, courseId, questions, duration, startTime, endTime } = req.body;

    if (!title || !courseId || !questions || !startTime || !endTime) {
      return res.status(400).json({ error: "Title, courseId, questions, startTime, and endTime are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ error: "Invalid course ID" });
    }

    const courseFilter = { _id: courseId, company: req.user.company };
    if (req.user.role === "lecturer") {
      courseFilter.lecturer = req.user._id;
    }

    const course = await Course.findOne(courseFilter);

    if (!course) {
      return res.status(404).json({ error: "Course not found or access denied" });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "At least one question is required" });
    }

    const quiz = await Quiz.create({
      title,
      course: courseId,
      company: req.user.company,
      createdBy: req.user._id,
      questions,
      duration: duration || 30,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
    });

    const populated = await quiz.populate([
      { path: "course", select: "title code" },
      { path: "createdBy", select: "name email" },
    ]);

    res.status(201).json({ quiz: populated });
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
    const filter = { ...req.companyFilter, isActive: true };

    if (req.user.role === "lecturer") {
      filter.createdBy = req.user._id;
      if (courseId) filter.course = courseId;
    } else if (req.user.role === "student") {
      const enrolledCourses = await Course.find({
        company: req.user.company,
        enrolledStudents: req.user._id,
        isActive: true,
      }).select("_id");
      const enrolledCourseIds = enrolledCourses.map((c) => c._id);
      filter.course = { $in: enrolledCourseIds };
      if (courseId) {
        if (!enrolledCourseIds.some((id) => id.toString() === courseId)) {
          return res.json({ quizzes: [] });
        }
        filter.course = courseId;
      }
    } else {
      if (courseId) filter.course = courseId;
    }

    const quizzes = await Quiz.find(filter)
      .populate("course", "title code")
      .populate("createdBy", "name email")
      .sort({ startTime: -1 });

    if (req.user.role === "student") {
      const sanitized = quizzes.map((q) => {
        const obj = q.toObject();
        obj.questions = obj.questions.map(({ correctAnswer, ...rest }) => rest);
        return obj;
      });
      return res.json({ quizzes: sanitized });
    }

    res.json({ quizzes });
  } catch (error) {
    console.error("List quizzes error:", error);
    res.status(500).json({ error: "Failed to fetch quizzes" });
  }
};

exports.getQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quizFilter = { _id: id, ...req.companyFilter };
    if (req.user.role === "lecturer") {
      quizFilter.createdBy = req.user._id;
    }

    const quiz = await Quiz.findOne(quizFilter)
      .populate("course", "title code")
      .populate("createdBy", "name email");

    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    if (req.user.role === "student") {
      const course = await Course.findOne({
        _id: quiz.course._id || quiz.course,
        enrolledStudents: req.user._id,
      });
      if (!course) {
        return res.status(403).json({ error: "You are not enrolled in this course" });
      }
    }

    const result = quiz.toObject();

    if (req.user.role === "student") {
      result.questions = result.questions.map(({ correctAnswer, ...rest }) => rest);
    }

    let submissions;
    if (req.user.role === "student") {
      submissions = await QuizSubmission.find({ quiz: id, student: req.user._id })
        .sort({ submittedAt: -1 });
    } else {
      submissions = await QuizSubmission.find({ quiz: id })
        .populate("student", "name indexNumber email")
        .sort({ submittedAt: -1 });
    }

    res.json({ quiz: result, submissions });
  } catch (error) {
    console.error("Get quiz error:", error);
    res.status(500).json({ error: "Failed to fetch quiz" });
  }
};

exports.submitQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid quiz ID" });
    }

    const quiz = await Quiz.findOne({ _id: id, company: req.user.company, isActive: true });
    if (!quiz) {
      return res.status(404).json({ error: "Quiz not found" });
    }

    const course = await Course.findOne({
      _id: quiz.course,
      enrolledStudents: req.user._id,
    });
    if (!course) {
      return res.status(403).json({ error: "You are not enrolled in this course" });
    }

    const now = new Date();
    if (now < quiz.startTime) {
      return res.status(400).json({ error: "Quiz has not started yet" });
    }
    if (now > quiz.endTime) {
      return res.status(400).json({ error: "Quiz has ended" });
    }

    const existing = await QuizSubmission.findOne({ quiz: id, student: req.user._id });
    if (existing) {
      return res.status(409).json({ error: "Quiz already submitted" });
    }

    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: "Answers must be an array" });
    }

    let totalScore = 0;
    let maxScore = 0;
    const gradedAnswers = answers.map((a) => {
      const question = quiz.questions[a.questionIndex];
      if (!question) return { ...a, isCorrect: false, points: 0 };

      maxScore += question.points;
      const isCorrect = question.correctAnswer === a.selectedAnswer;
      const points = isCorrect ? question.points : 0;
      totalScore += points;

      return {
        questionIndex: a.questionIndex,
        selectedAnswer: a.selectedAnswer,
        isCorrect,
        points,
      };
    });

    quiz.questions.forEach((q, i) => {
      if (!answers.find((a) => a.questionIndex === i)) {
        maxScore += q.points;
      }
    });

    const submission = await QuizSubmission.create({
      quiz: id,
      student: req.user._id,
      company: req.user.company,
      answers: gradedAnswers,
      totalScore,
      maxScore,
    });

    res.status(201).json({ submission });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Quiz already submitted" });
    }
    console.error("Submit quiz error:", error);
    res.status(500).json({ error: "Failed to submit quiz" });
  }
};

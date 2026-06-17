const mongoose = require("mongoose");
const Quiz = require("../models/Quiz");
const Question = require("../models/Question");
const QuizSubmission = require("../models/QuizSubmission");
const Course = require("../models/Course");
const { validateObjectId, handleControllerError } = require("../utils/controllerHelpers");
const { getEnrolledCourseIds, buildTargetAudienceFilter } = require("../utils/queryHelpers");

exports.createQuiz = async (req, res) => {
  try {
    const { title, courseId, questions, duration, startTime, endTime, targetAudience, targetGroup, targetLevel, targetStudyType, targetQualificationType } = req.body;

    if (!title || !courseId || !questions || !startTime || !endTime) {
      return res.status(400).json({ error: "Title, courseId, questions, startTime, and endTime are required" });
    }

    if (!validateObjectId(res, courseId, "course ID")) return;

    const courseFilter = { _id: courseId, companyId: req.user.company };
    if (req.user.role === "lecturer") {
      courseFilter.lecturerId = req.user._id;
    }

    const course = await Course.findOne(courseFilter);

    if (!course) {
      return res.status(404).json({ error: "Course not found or access denied" });
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "At least one question is required" });
    }

    const audience = targetAudience === 'group' ? 'group' : 'all';
    const quiz = await Quiz.create({
      title,
      course: courseId,
      company: req.user.company,
      createdBy: req.user._id,
      timeLimit: duration || 30,
      startTime: new Date(startTime),
      endTime: new Date(endTime),
      targetAudience: audience,
      targetGroup:             audience === 'group' ? (targetGroup || null) : null,
      targetLevel:             targetLevel || null,
      targetStudyType:         targetStudyType || null,
      targetQualificationType: targetQualificationType || null,
    });

    const populated = await quiz.populate([
      { path: "course", select: "title code" },
      { path: "createdBy", select: "name email" },
    ]);

    res.status(201).json({ quiz: populated });
  } catch (error) {
    handleControllerError(res, error, "Create quiz error:", { defaultMessage: "Failed to create quiz" });
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
      const enrolledCourseIds = await getEnrolledCourseIds(req.user.company, req.user._id);
      filter.course = { $in: enrolledCourseIds };
      if (courseId) {
        if (!enrolledCourseIds.some((id) => id.toString() === courseId)) {
          return res.json({ quizzes: [] });
        }
        filter.course = courseId;
      }
      // Only show quizzes this student's group is allowed to see
      filter.$or = buildTargetAudienceFilter(req.user);
    } else {
      if (courseId) filter.course = courseId;
    }

    const quizzes = await Quiz.find(filter)
      .populate("course", "title code")
      .populate("createdBy", "name email")
      .sort({ startTime: -1 });

    res.json({ quizzes });
  } catch (error) {
    handleControllerError(res, error, "List quizzes error:", { defaultMessage: "Failed to fetch quizzes" });
  }
};

exports.getQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(res, id, "quiz ID")) return;

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
      if (quiz.targetAudience === 'group' && quiz.targetGroup && quiz.targetGroup !== req.user.studentGroup) {
        return res.status(403).json({ error: "This quiz is not assigned to your group" });
      }
    }

    const result = quiz.toObject();

    let submissions;
    if (req.user.role === "student") {
      submissions = await QuizSubmission.find({ quiz: id, student: req.user._id })
        .sort({ submittedAt: -1 });
    } else {
      submissions = await QuizSubmission.find({ quiz: id })
        .populate("student", "name IndexNumber email")
        .sort({ submittedAt: -1 });
    }

    res.json({ quiz: result, submissions });
  } catch (error) {
    handleControllerError(res, error, "Get quiz error:", { defaultMessage: "Failed to fetch quiz" });
  }
};

exports.submitQuiz = async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;

    if (!validateObjectId(res, id, "quiz ID")) return;

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
    if (quiz.targetAudience === 'group' && quiz.targetGroup && quiz.targetGroup !== req.user.studentGroup) {
      return res.status(403).json({ error: "This quiz is not assigned to your group" });
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

    const questions = await Question.find({ quiz: id }).sort({ createdAt: 1 }).lean();
    if (questions.length === 0) {
      return res.status(400).json({ error: "This quiz has no questions" });
    }

    let totalScore = 0;
    let maxScore = 0;
    const gradedAnswers = answers.map((a) => {
      const question = questions[a.questionIndex];
      if (!question) return { ...a, isCorrect: false, points: 0 };

      maxScore += question.marks || 0;
      const isCorrect = question.correctAnswer === a.selectedAnswer;
      const points = isCorrect ? (question.marks || 0) : 0;
      totalScore += points;

      return {
        questionIndex: a.questionIndex,
        selectedAnswer: a.selectedAnswer,
        isCorrect,
        points,
      };
    });

    questions.forEach((q, i) => {
      if (!answers.find((a) => a.questionIndex === i)) {
        maxScore += q.marks || 0;
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
    handleControllerError(res, error, "Submit quiz error:", {
      defaultMessage: "Failed to submit quiz",
      duplicateMessage: "Quiz already submitted",
    });
  }
};

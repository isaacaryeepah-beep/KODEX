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
    const attemptsForQuiz = {};
    myAttempts.forEach((a) => {
      const qid = a.quiz.toString();
      if (!attemptsForQuiz[qid]) attemptsForQuiz[qid] = [];
      attemptsForQuiz[qid].push(a);
    });

    const mapped = quizzes.map((q) => {
      const obj = q.toObject();
      obj.questionCount = qCountMap[q._id.toString()] || 0;
      const attempts = attemptsForQuiz[q._id.toString()] || [];
      const submittedAttempts = attempts.filter(a => a.isSubmitted);
      const inProgress = attempts.find(a => !a.isSubmitted);
      const bestAttempt = submittedAttempts.reduce((best, a) => (!best || a.score > best.score) ? a : best, null);
      const lastAttempt = submittedAttempts[submittedAttempts.length - 1] || null;
      const countAttempt = q.scorePolicy === 'last' ? lastAttempt : bestAttempt;

      obj.hasAttempted = submittedAttempts.length > 0;
      obj.isSubmitted = submittedAttempts.length > 0;
      obj.attemptCount = submittedAttempts.length;
      obj.maxAttempts = q.maxAttempts || 1;
      obj.scorePolicy = q.scorePolicy || 'best';
      obj.myScore = countAttempt?.score ?? null;
      obj.myMaxScore = countAttempt?.maxScore ?? null;
      obj.inProgressAttempt = inProgress || null;

      const isOpen = now >= q.startTime && now <= q.endTime;
      obj.status = now < q.startTime ? "upcoming" : now > q.endTime ? "closed" : "open";
      const attemptsLeft = q.maxAttempts === 0 ? Infinity : (q.maxAttempts || 1) - submittedAttempts.length;
      obj.attemptsLeft = attemptsLeft === Infinity ? null : attemptsLeft;
      obj.canAttempt = isOpen && attemptsLeft > 0 && !inProgress;
      obj.canContinue = isOpen && !!inProgress;
      return obj;
    });

    // Deduplicate: same title + same startTime => keep the one with most questions
    const seen = new Map();
    mapped.forEach((q) => {
      const key = q.title + '_' + new Date(q.startTime).getTime();
      const existing = seen.get(key);
      if (!existing || q.questionCount > existing.questionCount) {
        seen.set(key, q);
      }
    });
    const result = Array.from(seen.values());

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
      .select("-correctAnswer -correctAnswerText -acceptedAnswers")
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

    // Count submitted attempts
    const submittedAttempts = await Attempt.find({ quiz: id, student: req.user._id, isSubmitted: true })
      .sort({ attemptNumber: 1 });
    const attemptCount = submittedAttempts.length;
    const maxAttempts = quiz.maxAttempts || 1;

    // Check if there's an in-progress attempt
    let attempt = await Attempt.findOne({ quiz: id, student: req.user._id, isSubmitted: false });

    if (!attempt) {
      // Enforce attempt limit (0 = unlimited)
      if (maxAttempts > 0 && attemptCount >= maxAttempts) {
        return res.status(409).json({
          error: maxAttempts === 1
            ? "You have already submitted this quiz"
            : `You have used all ${maxAttempts} attempts for this quiz`,
        });
      }

      attempt = await Attempt.create({
        quiz: id,
        student: req.user._id,
        company: req.user.company,
        startedAt: now,
        maxScore: quiz.totalMarks,
        attemptNumber: attemptCount + 1,
      });
    }

    let questions = await Question.find({ quiz: id })
      .select("-correctAnswer -correctAnswerText -acceptedAnswers")
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
    const attempt = await Attempt.findOne({ quiz: id, student: req.user._id });
    if (!attempt) {
      return res.status(400).json({ error: "You must start the quiz first" });
    }
    // Allow submission if within the student's personal time window (startedAt + timeLimit)
    // even if quiz.endTime has passed -- prevents timer expiry causing a rejection
    const personalDeadline = new Date(attempt.startedAt.getTime() + quiz.timeLimit * 60 * 1000 + 30000); // +30s grace
    if (now > quiz.endTime && now > personalDeadline) {
      return res.status(400).json({ error: "Quiz has ended" });
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

      let isCorrect = false;
      let pendingManualGrade = false;

      if (question.questionType === "fill") {
        // Case-insensitive, trimmed match against correctAnswerText + acceptedAnswers
        const typed = (ans.selectedAnswerText || "").trim().toLowerCase();
        const primary = (question.correctAnswerText || "").trim().toLowerCase();
        const accepted = (question.acceptedAnswers || []).map(a => a.trim().toLowerCase());
        isCorrect = typed.length > 0 && (typed === primary || accepted.includes(typed));
      } else if (question.questionType === "explain") {
        // Explain questions require manual grading by the lecturer -- never auto-mark
        isCorrect = false;
        pendingManualGrade = true;
      } else {
        isCorrect = question.correctAnswer === ans.selectedAnswer;
      }

      const points = isCorrect ? question.marks : 0;
      totalScore += points;

      answerDocs.push({
        attempt: attempt._id,
        question: ans.questionId,
        selectedAnswer: question.questionType === "fill" ? null : ans.selectedAnswer,
        selectedAnswerText: (question.questionType === "fill" || question.questionType === "explain")
          ? (ans.selectedAnswerText || null)
          : null,
        isCorrect,
        pendingManualGrade,
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

    // Update isBestScore flags for this student+quiz
    const allSubmitted = await Attempt.find({ quiz: id, student: req.user._id, isSubmitted: true }).sort({ score: -1 });
    const bestScore = allSubmitted[0]?.score ?? 0;
    await Promise.all(allSubmitted.map(async (a, i) => {
      const shouldBeBest = i === 0; // first after sort by score desc = best
      if (a.isBestScore !== shouldBeBest) { a.isBestScore = shouldBeBest; await a.save(); }
    }));

    const attemptsLeft = quiz.maxAttempts === 0 ? null : Math.max(0, (quiz.maxAttempts || 1) - allSubmitted.length);

    res.json({
      attempt,
      score: totalScore,
      maxScore: quiz.totalMarks,
      percentage: quiz.totalMarks > 0 ? Math.round((totalScore / quiz.totalMarks) * 100) : 0,
      attemptNumber: attempt.attemptNumber,
      attemptsLeft,
      maxAttempts: quiz.maxAttempts,
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
      .populate("question", "questionText options marks correctAnswerText acceptedAnswers questionType"); // correctAnswer index withheld; text answers shown post-submit

    res.json({ attempt, answers });
  } catch (error) {
    console.error("Get result error:", error);
    res.status(500).json({ error: "Failed to fetch result" });
  }
};

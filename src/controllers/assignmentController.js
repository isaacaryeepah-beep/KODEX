const mongoose = require("mongoose");
const path     = require("path");
const fs       = require("fs");
const Assignment         = require("../models/Assignment");
const AssignmentSubmission = require("../models/AssignmentSubmission");
const Course   = require("../models/Course");
const { uploadBrief, uploadSubmission, BRIEF_DIR, SUBMISSION_DIR } = require("../config/uploadConfig");

// ─── Grading helper ────────────────────────────────────────────────────────
function gradeAnswers(questions, answers) {
  let totalScore = 0;
  const gradedAnswers = [];

  questions.forEach((q, qIdx) => {
    const studentAns = (answers || []).find((a) => a.questionIndex === qIdx);
    const type = q.questionType || "single";

    let isCorrect    = false;
    let marksAwarded = 0;

    if (type === "explain") {
      // Explain questions need manual grading — award 0 for now, flag for review
      const textAnswer = studentAns?.textAnswer || "";
      gradedAnswers.push({ questionIndex: qIdx, selectedAnswers: [], textAnswer, isCorrect: false, marksAwarded: 0, needsManualGrading: true });
      return;
    }

    if (type === "fill") {
      const textAnswer = (studentAns?.textAnswer || "").trim().toLowerCase();
      const correct    = (q.correctAnswerText || "").trim().toLowerCase();
      isCorrect  = textAnswer === correct;
      marksAwarded = isCorrect ? q.marks : 0;
      totalScore += marksAwarded;
      gradedAnswers.push({ questionIndex: qIdx, selectedAnswers: [], textAnswer: studentAns?.textAnswer || "", isCorrect, marksAwarded });
      return;
    }

    // MCQ (single / multiple)
    const selected = studentAns?.selectedAnswers || [];
    const correct  = q.correctAnswers || [];

    if (correct.length === 0) {
      gradedAnswers.push({ questionIndex: qIdx, selectedAnswers: selected, isCorrect: false, marksAwarded: 0 });
      return;
    }

    if (q.allowPartialMarks) {
      const correctHits = selected.filter((s) => correct.includes(s)).length;
      const wrongPicks  = selected.filter((s) => !correct.includes(s)).length;
      const partial     = Math.max(0, correctHits - wrongPicks) / correct.length;
      marksAwarded      = Math.round(partial * q.marks * 100) / 100;
      isCorrect         = correctHits === correct.length && wrongPicks === 0;
    } else {
      const allHit  = correct.every((c) => selected.includes(c));
      const noExtra = selected.every((s) => correct.includes(s));
      isCorrect     = allHit && noExtra && selected.length === correct.length;
      marksAwarded  = isCorrect ? q.marks : 0;
    }

    totalScore += marksAwarded;
    gradedAnswers.push({ questionIndex: qIdx, selectedAnswers: selected, isCorrect, marksAwarded });
  });

  return { totalScore, gradedAnswers };
}

// Helper: safely delete a file from the filesystem
function safeDeleteFile(filePath) {
  if (!filePath) return;
  try { fs.unlinkSync(filePath); } catch (_) {}
}

// ══════════════════════════════════════════════════════════════════════════
//  LECTURER — Create assignment
// ══════════════════════════════════════════════════════════════════════════
exports.createAssignment = async (req, res) => {
  try {
    const { title, description, courseId, releaseDate, dueDate, allowFileSubmission, allowLateSubmission, latePenaltyPercent } = req.body;

    if (!title || !courseId || !releaseDate || !dueDate)
      return res.status(400).json({ error: "title, courseId, releaseDate and dueDate are required" });
    if (!mongoose.Types.ObjectId.isValid(courseId))
      return res.status(400).json({ error: "Invalid course ID" });

    const course = await Course.findOne({ _id: courseId, company: req.user.company });
    if (!course) return res.status(404).json({ error: "Course not found" });

    if (new Date(releaseDate) >= new Date(dueDate))
      return res.status(400).json({ error: "Release date must be before due date" });

    const assignment = await Assignment.create({
      title,
      description: description || "",
      course:      courseId,
      company:     req.user.company,
      createdBy:   req.user._id,
      releaseDate: new Date(releaseDate),
      dueDate:     new Date(dueDate),
      latePenaltyPercent: latePenaltyPercent ? Math.min(100, Math.max(0, Number(latePenaltyPercent))) : 0,
      allowFileSubmission: allowFileSubmission !== "false" && allowFileSubmission !== false,
      allowLateSubmission: allowLateSubmission === "true"  || allowLateSubmission === true,
    });

    res.status(201).json({ assignment });
  } catch (err) {
    console.error("createAssignment:", err);
    res.status(500).json({ error: "Failed to create assignment" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  LECTURER — Update assignment metadata
// ══════════════════════════════════════════════════════════════════════════
exports.updateAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ["title","description","releaseDate","dueDate","allowFileSubmission","allowLateSubmission","isActive"];
    const assignment = await Assignment.findOne({ _id: id, company: req.user.company, createdBy: req.user._id });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    fields.forEach((f) => { if (req.body[f] !== undefined) assignment[f] = req.body[f]; });
    if (new Date(assignment.releaseDate) >= new Date(assignment.dueDate))
      return res.status(400).json({ error: "Release date must be before due date" });

    await assignment.save();
    res.json({ assignment });
  } catch (err) {
    console.error("updateAssignment:", err);
    res.status(500).json({ error: "Failed to update assignment" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  LECTURER — Delete assignment
// ══════════════════════════════════════════════════════════════════════════
exports.deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await Assignment.findOneAndDelete({ _id: id, company: req.user.company, createdBy: req.user._id });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    // Clean up files
    safeDeleteFile(assignment.pdfBrief?.filePath);

    const submissions = await AssignmentSubmission.find({ assignment: id });
    submissions.forEach((s) => safeDeleteFile(s.submittedFile?.filePath));
    await AssignmentSubmission.deleteMany({ assignment: id });

    res.json({ message: "Assignment deleted" });
  } catch (err) {
    console.error("deleteAssignment:", err);
    res.status(500).json({ error: "Failed to delete assignment" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  LECTURER — List assignments
// ══════════════════════════════════════════════════════════════════════════
exports.listAssignments = async (req, res) => {
  try {
    const { courseId } = req.query;
    const filter = { company: req.user.company, createdBy: req.user._id, isActive: true };
    if (courseId && mongoose.Types.ObjectId.isValid(courseId)) filter.course = courseId;

    const assignments = await Assignment.find(filter)
      .select("-questions.correctAnswers -questions.explanation")
      .populate("course", "title code")
      .sort({ dueDate: 1 });

    // Attach submission counts
    const ids = assignments.map((a) => a._id);
    const counts = await AssignmentSubmission.aggregate([
      { $match: { assignment: { $in: ids } } },
      { $group: { _id: "$assignment",
          total:  { $sum: 1 },
          graded: { $sum: { $cond: [{ $eq: ["$status", "graded"] }, 1, 0] } } } }
    ]);
    const cm = {};
    counts.forEach((c) => { cm[c._id.toString()] = c; });

    const result = assignments.map((a) => ({
      ...a.toObject(),
      hasPdf:          !!a.pdfBrief?.filePath,
      questionCount:   a.questions.length,
      submissionCount: cm[a._id.toString()]?.total  || 0,
      gradedCount:     cm[a._id.toString()]?.graded || 0,
    }));

    res.json({ assignments: result });
  } catch (err) {
    console.error("listAssignments:", err);
    res.status(500).json({ error: "Failed to list assignments" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  LECTURER — Get single assignment + submissions
// ══════════════════════════════════════════════════════════════════════════
exports.getAssignment = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });

    const assignment = await Assignment.findOne({ _id: id, company: req.user.company })
      .populate("course", "title code")
      .populate("createdBy", "name");
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const submissions = await AssignmentSubmission.find({ assignment: id })
      .select("-submittedFile.filePath -answers.selectedAnswers")
      .populate("student", "name indexNumber email");

    res.json({ assignment, submissions });
  } catch (err) {
    console.error("getAssignment:", err);
    res.status(500).json({ error: "Failed to get assignment" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  LECTURER — Upload PDF brief (multipart form-data)
// ══════════════════════════════════════════════════════════════════════════
exports.uploadPdf = (req, res) => {
  uploadBrief(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const { id } = req.params;
      const assignment = await Assignment.findOne({ _id: id, company: req.user.company, createdBy: req.user._id });
      if (!assignment) {
        safeDeleteFile(req.file.path);
        return res.status(404).json({ error: "Assignment not found" });
      }

      // Delete old file if exists
      safeDeleteFile(assignment.pdfBrief?.filePath);

      assignment.pdfBrief = {
        filePath:     req.file.path,
        originalName: req.file.originalname,
        mimeType:     req.file.mimetype,
        sizeBytes:    req.file.size,
        uploadedAt:   new Date(),
      };
      await assignment.save();

      res.json({ message: "PDF uploaded", filename: req.file.originalname, sizeBytes: req.file.size });
    } catch (e) {
      safeDeleteFile(req.file.path);
      console.error("uploadPdf:", e);
      res.status(500).json({ error: "Failed to save PDF" });
    }
  });
};

// ══════════════════════════════════════════════════════════════════════════
//  SHARED — Download PDF brief (lecturer + student)
// ══════════════════════════════════════════════════════════════════════════
exports.downloadPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const assignment = await Assignment.findOne({ _id: id, company: req.user.company }).select("pdfBrief course");
    if (!assignment || !assignment.pdfBrief?.filePath)
      return res.status(404).json({ error: "No PDF found for this assignment" });

    // Students must be enrolled — checked in route middleware (studentGetAssignment verifies enrollment)
    if (!fs.existsSync(assignment.pdfBrief.filePath))
      return res.status(404).json({ error: "File not found on server" });

    res.setHeader("Content-Type", assignment.pdfBrief.mimeType || "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${assignment.pdfBrief.originalName || "brief.pdf"}"`);
    fs.createReadStream(assignment.pdfBrief.filePath).pipe(res);
  } catch (err) {
    console.error("downloadPdf:", err);
    res.status(500).json({ error: "Failed to download PDF" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  LECTURER — Add question
// ══════════════════════════════════════════════════════════════════════════
exports.addQuestion = async (req, res) => {
  try {
    const { id } = req.params;
    const { questionText, questionType, options, correctAnswers, correctAnswerText, modelAnswer, marks, allowPartialMarks, explanation } = req.body;
    const type = ["single","multiple","fill","explain"].includes(questionType) ? questionType : "single";

    if (!questionText) return res.status(400).json({ error: "questionText is required" });

    // Type-specific validation
    if (type === "fill") {
      if (!correctAnswerText?.trim()) return res.status(400).json({ error: "correctAnswerText is required for fill-in questions" });
    } else if (type === "explain") {
      // No required fields beyond questionText
    } else {
      if (!Array.isArray(options) || options.length < 2)
        return res.status(400).json({ error: "At least 2 options required" });
      if (!Array.isArray(correctAnswers) || correctAnswers.length < 1)
        return res.status(400).json({ error: "At least one correct answer index required" });
      if (correctAnswers.some((i) => i < 0 || i >= options.length))
        return res.status(400).json({ error: "correctAnswers must be valid option indices" });
    }

    const assignment = await Assignment.findOne({ _id: id, company: req.user.company, createdBy: req.user._id });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    assignment.questions.push({
      questionText,
      questionType: type,
      options: (type === "fill" || type === "explain") ? [] : options,
      correctAnswers: (type === "fill" || type === "explain") ? [] : correctAnswers,
      correctAnswerText: type === "fill" ? (correctAnswerText || "").trim() : null,
      modelAnswer: type === "explain" ? (modelAnswer || "").trim() : "",
      marks: marks || 1,
      allowPartialMarks: type === "single" || type === "multiple" ? !!allowPartialMarks : false,
      explanation: explanation || null,
    });
    await assignment.save();

    const newQ = assignment.questions[assignment.questions.length - 1];
    res.status(201).json({ question: newQ, totalMarks: assignment.totalMarks, questionCount: assignment.questions.length });
  } catch (err) {
    console.error("addQuestion:", err);
    res.status(500).json({ error: "Failed to add question" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  LECTURER — Update question
// ══════════════════════════════════════════════════════════════════════════
exports.updateQuestion = async (req, res) => {
  try {
    const { id, questionId } = req.params;
    const assignment = await Assignment.findOne({ _id: id, company: req.user.company, createdBy: req.user._id });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const q = assignment.questions.id(questionId);
    if (!q) return res.status(404).json({ error: "Question not found" });

    const { questionText, questionType, options, correctAnswers, correctAnswerText, modelAnswer, marks, allowPartialMarks, explanation } = req.body;
    const type = questionType ? (["single","multiple","fill","explain"].includes(questionType) ? questionType : q.questionType) : q.questionType;
    if (questionText !== undefined) q.questionText = questionText;
    if (questionType !== undefined) q.questionType = type;
    if (type === "fill") {
      q.options = []; q.correctAnswers = [];
      if (correctAnswerText !== undefined) q.correctAnswerText = correctAnswerText;
    } else if (type === "explain") {
      q.options = []; q.correctAnswers = [];
      if (modelAnswer !== undefined) q.modelAnswer = modelAnswer;
    } else {
      if (options !== undefined) {
        if (!Array.isArray(options) || options.length < 2) return res.status(400).json({ error: "At least 2 options required" });
        q.options = options;
      }
      if (correctAnswers !== undefined) {
        if (!Array.isArray(correctAnswers) || correctAnswers.length < 1) return res.status(400).json({ error: "At least one correct answer required" });
        q.correctAnswers = correctAnswers;
      }
    }
    if (marks             !== undefined) q.marks             = marks;
    if (allowPartialMarks !== undefined) q.allowPartialMarks = allowPartialMarks;
    if (explanation       !== undefined) q.explanation       = explanation;

    await assignment.save();
    res.json({ question: q, totalMarks: assignment.totalMarks });
  } catch (err) {
    console.error("updateQuestion:", err);
    res.status(500).json({ error: "Failed to update question" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  LECTURER — Delete question
// ══════════════════════════════════════════════════════════════════════════
exports.deleteQuestion = async (req, res) => {
  try {
    const { id, questionId } = req.params;
    const assignment = await Assignment.findOne({ _id: id, company: req.user.company, createdBy: req.user._id });
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    assignment.questions = assignment.questions.filter((q) => q._id.toString() !== questionId);
    await assignment.save();
    res.json({ message: "Question deleted", totalMarks: assignment.totalMarks, questionCount: assignment.questions.length });
  } catch (err) {
    console.error("deleteQuestion:", err);
    res.status(500).json({ error: "Failed to delete question" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  LECTURER — Grade submission
// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
//  LECTURER — Get single submission with questions + answers
// ══════════════════════════════════════════════════════════════════════════
exports.getSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(submissionId))
      return res.status(400).json({ error: "Invalid ID" });

    const sub = await AssignmentSubmission.findById(submissionId)
      .populate("student", "name indexNumber email")
      .populate("assignment", "company title questions totalMarks createdBy");

    if (!sub) return res.status(404).json({ error: "Submission not found" });
    if (sub.assignment.company.toString() !== req.user.company.toString())
      return res.status(403).json({ error: "Access denied" });

    res.json({ submission: sub });
  } catch (err) {
    console.error("getSubmission:", err);
    res.status(500).json({ error: "Failed to fetch submission" });
  }
};


exports.gradeSubmission = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { manualGrade, feedback } = req.body;
    if (!mongoose.Types.ObjectId.isValid(submissionId)) return res.status(400).json({ error: "Invalid ID" });

    const sub = await AssignmentSubmission.findById(submissionId).populate("assignment", "company totalMarks");
    if (!sub) return res.status(404).json({ error: "Submission not found" });
    if (sub.assignment.company.toString() !== req.user.company.toString()) return res.status(403).json({ error: "Access denied" });

    if (manualGrade !== undefined) {
      if (manualGrade < 0) return res.status(400).json({ error: "Grade cannot be negative" });
      sub.manualGrade = Number(manualGrade);
    }
    if (feedback !== undefined) sub.feedback = feedback;
    sub.status    = "graded";
    sub.gradedBy  = req.user._id;
    sub.gradedAt  = new Date();
    await sub.save();

    res.json({ submission: sub });
  } catch (err) {
    console.error("gradeSubmission:", err);
    res.status(500).json({ error: "Failed to grade submission" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  LECTURER — Download student submission file
// ══════════════════════════════════════════════════════════════════════════
exports.downloadSubmissionFile = async (req, res) => {
  try {
    const { submissionId } = req.params;
    const sub = await AssignmentSubmission.findById(submissionId).populate("assignment", "company");
    if (!sub || !sub.submittedFile?.filePath) return res.status(404).json({ error: "No file found" });
    if (sub.assignment.company.toString() !== req.user.company.toString()) return res.status(403).json({ error: "Access denied" });

    if (!fs.existsSync(sub.submittedFile.filePath))
      return res.status(404).json({ error: "File not found on server" });

    res.setHeader("Content-Type", sub.submittedFile.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${sub.submittedFile.originalName || "submission"}"`);
    fs.createReadStream(sub.submittedFile.filePath).pipe(res);
  } catch (err) {
    console.error("downloadSubmissionFile:", err);
    res.status(500).json({ error: "Failed to download file" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  STUDENT — List available assignments
// ══════════════════════════════════════════════════════════════════════════
exports.studentList = async (req, res) => {
  try {
    const now = new Date();
    const courses = await Course.find({ enrolledStudents: req.user._id, company: req.user.company }).select("_id");
    const courseIds = courses.map((c) => c._id);

    const assignments = await Assignment.find({
      course:      { $in: courseIds },
      company:     req.user.company,
      isActive:    true,
      releaseDate: { $lte: now },
    })
      .select("-questions.correctAnswers -questions.explanation -pdfBrief.filePath")
      .populate("course",     "title code")
      .populate("createdBy",  "name")
      .sort({ dueDate: 1 });

    const ids = assignments.map((a) => a._id);
    const mySubs = await AssignmentSubmission.find({ assignment: { $in: ids }, student: req.user._id })
      .select("assignment status submittedAt questionScore manualGrade isLate");
    const subMap = {};
    mySubs.forEach((s) => { subMap[s.assignment.toString()] = s; });

    const result = assignments.map((a) => {
      const sub = subMap[a._id.toString()];
      return {
        ...a.toObject(),
        hasPdf:        !!a.pdfBrief?.originalName,
        questionCount: a.questions.length,
        isOverdue:     now > a.dueDate && !sub,
        daysUntilDue:  Math.ceil((a.dueDate - now) / 86400000),
        mySubmission:  sub || null,
      };
    });

    res.json({ assignments: result });
  } catch (err) {
    console.error("studentList:", err);
    res.status(500).json({ error: "Failed to list assignments" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  STUDENT — Get single assignment detail (questions, no correct answers)
// ══════════════════════════════════════════════════════════════════════════
exports.studentGet = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });

    const now = new Date();
    const assignment = await Assignment.findOne({ _id: id, company: req.user.company, isActive: true, releaseDate: { $lte: now } })
      .select("-questions.correctAnswers -questions.explanation -pdfBrief.filePath")
      .populate("course",    "title code enrolledStudents")
      .populate("createdBy", "name");

    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const enrolled = assignment.course.enrolledStudents.some((s) => s.toString() === req.user._id.toString());
    if (!enrolled) return res.status(403).json({ error: "Not enrolled in this course" });

    const submission = await AssignmentSubmission.findOne({ assignment: id, student: req.user._id })
      .select("-submittedFile.filePath");

    res.json({
      assignment: { ...assignment.toObject(), hasPdf: !!assignment.pdfBrief?.originalName, pdfName: assignment.pdfBrief?.originalName || null },
      submission,
      isOverdue: now > assignment.dueDate,
    });
  } catch (err) {
    console.error("studentGet:", err);
    res.status(500).json({ error: "Failed to get assignment" });
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  STUDENT — Submit assignment (file + MCQ answers)
//  Uses multipart/form-data: file field + JSON answers field
// ══════════════════════════════════════════════════════════════════════════
exports.studentSubmit = (req, res) => {
  uploadSubmission(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });

    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid ID" });

      const now = new Date();
      const assignment = await Assignment.findOne({ _id: id, company: req.user.company, isActive: true })
        .populate("course", "enrolledStudents");

      if (!assignment) {
        safeDeleteFile(req.file?.path);
        return res.status(404).json({ error: "Assignment not found" });
      }
      if (now < assignment.releaseDate) {
        safeDeleteFile(req.file?.path);
        return res.status(400).json({ error: "Assignment has not been released yet" });
      }

      const enrolled = assignment.course.enrolledStudents.some((s) => s.toString() === req.user._id.toString());
      if (!enrolled) {
        safeDeleteFile(req.file?.path);
        return res.status(403).json({ error: "Not enrolled in this course" });
      }

      const isLate = now > assignment.dueDate;
      if (isLate && !assignment.allowLateSubmission) {
        safeDeleteFile(req.file?.path);
        return res.status(400).json({ error: "Submission deadline has passed" });
      }

      if (req.file && !assignment.allowFileSubmission) {
        safeDeleteFile(req.file.path);
        return res.status(400).json({ error: "File submission not allowed for this assignment" });
      }

      // Parse answers from form field or body
      let answers = [];
      const rawAnswers = req.body.answers;
      if (rawAnswers) {
        try { answers = typeof rawAnswers === "string" ? JSON.parse(rawAnswers) : rawAnswers; }
        catch (_) { answers = []; }
      }

      // Grade MCQ
      let questionScore = 0, gradedAnswers = [];
      if (assignment.questions.length > 0) {
        const result = gradeAnswers(assignment.questions, answers);
        questionScore  = result.totalScore;
        gradedAnswers  = result.gradedAnswers;
      }

      // Check for existing submission
      const existing = await AssignmentSubmission.findOne({ assignment: id, student: req.user._id });
      if (existing?.status === "graded") {
        safeDeleteFile(req.file?.path);
        return res.status(409).json({ error: "Already graded — cannot resubmit" });
      }

      // Delete old submission file if re-submitting
      if (existing?.submittedFile?.filePath && req.file) {
        safeDeleteFile(existing.submittedFile.filePath);
      }

      const payload = {
        assignment:           id,
        student:              req.user._id,
        course:               assignment.course._id,
        company:              req.user.company,
        answers:              gradedAnswers,
        questionScore,
        totalMarksAvailable:  assignment.totalMarks,
        status:               "submitted",
        submittedAt:          now,
        isLate,
      };

      if (req.file) {
        payload.submittedFile = {
          filePath:     req.file.path,
          originalName: req.file.originalname,
          mimeType:     req.file.mimetype,
          sizeBytes:    req.file.size,
        };
      } else if (existing?.submittedFile && !req.file) {
        // Keep old file if no new one uploaded
        payload.submittedFile = existing.submittedFile;
      }

      let submission;
      if (existing) {
        Object.assign(existing, payload);
        submission = await existing.save();
      } else {
        submission = await AssignmentSubmission.create(payload);
      }

      // Return results + explanations
      const questionResults = gradedAnswers.map((a) => ({
        questionIndex:  a.questionIndex,
        selectedAnswers: a.selectedAnswers,
        correctAnswers: assignment.questions[a.questionIndex]?.correctAnswers || [],
        isCorrect:      a.isCorrect,
        marksAwarded:   a.marksAwarded,
        maxMarks:       assignment.questions[a.questionIndex]?.marks || 1,
        explanation:    assignment.questions[a.questionIndex]?.explanation || null,
      }));

      res.json({
        success:             true,
        questionScore,
        totalMarksAvailable: assignment.totalMarks,
        percentage:          assignment.totalMarks > 0 ? Math.round((questionScore / assignment.totalMarks) * 100) : 0,
        isLate,
        fileReceived:        !!req.file,
        questionResults,
        submissionId:        submission._id,
      });
    } catch (e) {
      safeDeleteFile(req.file?.path);
      if (e.code === 11000) return res.status(409).json({ error: "Already submitted" });
      console.error("studentSubmit:", e);
      res.status(500).json({ error: "Failed to submit assignment" });
    }
  });
};

"use strict";

/**
 * assignmentLecturerController
 *
 * Full-featured lecturer assignment management — uses the extended
 * Assignment + AssignmentSubmission models from Phase 5.
 *
 * Middleware chain (enforced at route layer):
 *   authenticate → requireCompanyScope →
 *   requireAcademicRole("lecturer"|"admin"|"hod") →
 *   requireAssessmentOwnership(Assignment)  [quiz-scoped routes]
 */

const mongoose   = require("mongoose");
const Assignment            = require("../models/Assignment");
const AssignmentSubmission  = require("../models/AssignmentSubmission");

// ─── Assignment CRUD ──────────────────────────────────────────────────────────

/**
 * POST /lecturer/assignments
 */
exports.createAssignment = async (req, res) => {
  try {
    const {
      courseId, title, description, instructions,
      releaseDate, dueDate,
      submissionType, allowFileSubmission, allowedFileTypes, maxFileSizeMb, maxFiles,
      allowLateSubmission, latePenaltyPercent, latePenaltyPercentPerDay, maxLateDays,
      allowResubmission, maxSubmissions,
      totalMarks, passMark,
      showResultAfterGrading, autoReleaseResults,
      rubric,
    } = req.body;

    const assignment = await Assignment.create({
      company:   req.companyId,
      course:    courseId,
      createdBy: req.user._id,
      title, description, instructions,
      releaseDate, dueDate,
      submissionType, allowFileSubmission, allowedFileTypes, maxFileSizeMb, maxFiles,
      allowLateSubmission, latePenaltyPercent, latePenaltyPercentPerDay, maxLateDays,
      allowResubmission, maxSubmissions,
      totalMarks, passMark,
      showResultAfterGrading, autoReleaseResults,
      rubric,
    });

    return res.status(201).json({ assignment });
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    console.error("[assignmentLecturer createAssignment]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/assignments?courseId=&status=&page=&limit=
 */
exports.listAssignments = async (req, res) => {
  try {
    const { courseId, status, page = 1, limit = 20 } = req.query;
    const filter = { company: req.companyId, createdBy: req.user._id };
    if (courseId) filter.course = courseId;
    if (status)   filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [assignments, total] = await Promise.all([
      Assignment.find(filter).sort({ dueDate: -1 }).skip(skip).limit(Number(limit)).lean(),
      Assignment.countDocuments(filter),
    ]);

    return res.json({ assignments, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[assignmentLecturer listAssignments]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/assignments/:assignmentId
 */
exports.getAssignment = async (req, res) => {
  try {
    return res.json({ assignment: req.assessment });
  } catch (err) {
    console.error("[assignmentLecturer getAssignment]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PUT /lecturer/assignments/:assignmentId
 */
exports.updateAssignment = async (req, res) => {
  try {
    const assignment = req.assessment;

    // Block structural edits after submissions exist.
    const subCount = await AssignmentSubmission.countDocuments({ assignment: assignment._id });
    const STRUCTURAL = ["totalMarks", "dueDate", "maxSubmissions", "allowResubmission", "passMark"];
    if (subCount > 0 && STRUCTURAL.some(f => req.body[f] !== undefined)) {
      return res.status(409).json({
        error: "Cannot change structural fields after submissions have been received",
      });
    }

    const updatable = [
      "title","description","instructions",
      "releaseDate","dueDate",
      "submissionType","allowFileSubmission","allowedFileTypes","maxFileSizeMb","maxFiles",
      "allowLateSubmission","latePenaltyPercent","latePenaltyPercentPerDay","maxLateDays",
      "allowResubmission","maxSubmissions",
      "totalMarks","passMark","rubric",
      "showResultAfterGrading","autoReleaseResults",
    ];
    updatable.forEach(f => { if (req.body[f] !== undefined) assignment[f] = req.body[f]; });
    assignment.updatedBy = req.user._id;
    await assignment.save();

    return res.json({ assignment });
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    console.error("[assignmentLecturer updateAssignment]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /lecturer/assignments/:assignmentId/publish
 */
exports.publishAssignment = async (req, res) => {
  try {
    const assignment = req.assessment;
    if (assignment.status !== "draft") {
      return res.status(409).json({ error: "Only draft assignments can be published" });
    }

    assignment.status      = "published";
    assignment.isPublished = true;
    assignment.publishedAt = new Date();
    assignment.updatedBy   = req.user._id;
    await assignment.save();

    return res.json({ assignment });
  } catch (err) {
    console.error("[assignmentLecturer publishAssignment]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /lecturer/assignments/:assignmentId/close
 */
exports.closeAssignment = async (req, res) => {
  try {
    const assignment = req.assessment;
    if (assignment.status !== "published") {
      return res.status(409).json({ error: "Only published assignments can be closed" });
    }
    assignment.status    = "closed";
    assignment.closedAt  = new Date();
    assignment.updatedBy = req.user._id;
    await assignment.save();
    return res.json({ assignment });
  } catch (err) {
    console.error("[assignmentLecturer closeAssignment]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * DELETE /lecturer/assignments/:assignmentId
 */
exports.deleteAssignment = async (req, res) => {
  try {
    const assignment = req.assessment;
    const subCount = await AssignmentSubmission.countDocuments({ assignment: assignment._id });

    if (subCount > 0) {
      assignment.status     = "archived";
      assignment.isActive   = false;
      assignment.archivedAt = new Date();
      assignment.archivedBy = req.user._id;
      await assignment.save();
      return res.json({ message: "Assignment archived (submissions exist)" });
    }

    await assignment.deleteOne();
    return res.json({ message: "Assignment deleted" });
  } catch (err) {
    console.error("[assignmentLecturer deleteAssignment]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Submission management ────────────────────────────────────────────────────

/**
 * GET /lecturer/assignments/:assignmentId/submissions
 * Query: status, page, limit
 */
exports.listSubmissions = async (req, res) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const filter = { assignment: req.assessment._id, company: req.companyId };
    if (status) filter.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [submissions, total] = await Promise.all([
      AssignmentSubmission.find(filter)
        .populate("student", "name email studentId")
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      AssignmentSubmission.countDocuments(filter),
    ]);

    return res.json({ submissions, total, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error("[assignmentLecturer listSubmissions]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/assignments/:assignmentId/submissions/:submissionId
 */
exports.getSubmission = async (req, res) => {
  try {
    const submission = await AssignmentSubmission.findOne({
      _id:        req.params.submissionId,
      assignment: req.assessment._id,
      company:    req.companyId,
    }).populate("student", "name email studentId").lean();

    if (!submission) return res.status(404).json({ error: "Submission not found" });
    return res.json({ submission });
  } catch (err) {
    console.error("[assignmentLecturer getSubmission]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /lecturer/assignments/:assignmentId/submissions/:submissionId/grade
 * Body: { earnedMarks, feedback, rubricScores, overallFeedback }
 */
exports.gradeSubmission = async (req, res) => {
  try {
    const { earnedMarks, feedback, rubricScores, overallFeedback } = req.body;

    const submission = await AssignmentSubmission.findOne({
      _id:        req.params.submissionId,
      assignment: req.assessment._id,
      company:    req.companyId,
    });
    if (!submission) return res.status(404).json({ error: "Submission not found" });

    const assignment = req.assessment;
    const maxMarks   = assignment.totalMarks || 1;

    if (earnedMarks !== undefined) {
      if (earnedMarks < 0 || earnedMarks > maxMarks) {
        return res.status(400).json({ error: `earnedMarks must be 0–${maxMarks}` });
      }
      submission.earnedMarks  = earnedMarks;
      submission.manualGrade  = earnedMarks;  // keep legacy field in sync
      submission.maxMarks     = maxMarks;
      submission.percentageScore = Math.round((earnedMarks / maxMarks) * 10000) / 100;
      submission.isPassed     = assignment.passMark != null
        ? earnedMarks >= assignment.passMark
        : null;
    }

    if (feedback        !== undefined) { submission.feedback        = feedback;        }
    if (overallFeedback !== undefined) { submission.overallFeedback = overallFeedback; }
    if (rubricScores    !== undefined) { submission.rubricScores    = rubricScores;    }

    submission.status   = "graded";
    submission.gradedBy = req.user._id;
    submission.gradedAt = new Date();

    if (assignment.autoReleaseResults) {
      submission.isResultReleased  = true;
      submission.resultReleasedAt  = new Date();
      submission.resultReleasedBy  = req.user._id;
    }

    await submission.save();
    return res.json({ submission });
  } catch (err) {
    console.error("[assignmentLecturer gradeSubmission]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PATCH /lecturer/assignments/:assignmentId/submissions/:submissionId/return
 * Return a submission to the student (with feedback, for revision).
 */
exports.returnSubmission = async (req, res) => {
  try {
    const { feedback, overallFeedback } = req.body;
    const submission = await AssignmentSubmission.findOne({
      _id:        req.params.submissionId,
      assignment: req.assessment._id,
      company:    req.companyId,
    });
    if (!submission) return res.status(404).json({ error: "Submission not found" });

    submission.status          = "returned";
    submission.feedback        = feedback        || submission.feedback;
    submission.overallFeedback = overallFeedback || submission.overallFeedback;
    submission.gradedBy        = req.user._id;
    submission.gradedAt        = new Date();
    await submission.save();

    return res.json({ submission });
  } catch (err) {
    console.error("[assignmentLecturer returnSubmission]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /lecturer/assignments/:assignmentId/submissions/release
 * Release results to all (or specific) students.
 * Body: { studentIds?: [] }
 */
exports.releaseResults = async (req, res) => {
  try {
    const { studentIds } = req.body;
    const filter = { assignment: req.assessment._id, company: req.companyId };
    if (Array.isArray(studentIds) && studentIds.length > 0) {
      filter.student = { $in: studentIds };
    }

    const now     = new Date();
    const updated = await AssignmentSubmission.updateMany(filter, {
      $set: { isResultReleased: true, resultReleasedAt: now, resultReleasedBy: req.user._id },
    });

    return res.json({ message: `Results released for ${updated.modifiedCount} submission(s)` });
  } catch (err) {
    console.error("[assignmentLecturer releaseResults]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /lecturer/assignments/:assignmentId/stats
 * Summary stats: total submissions, graded, pending, average score.
 */
exports.getStats = async (req, res) => {
  try {
    const [total, graded, pending, late] = await Promise.all([
      AssignmentSubmission.countDocuments({ assignment: req.assessment._id }),
      AssignmentSubmission.countDocuments({ assignment: req.assessment._id, status: "graded" }),
      AssignmentSubmission.countDocuments({ assignment: req.assessment._id, status: { $in: ["submitted","late"] } }),
      AssignmentSubmission.countDocuments({ assignment: req.assessment._id, isLate: true }),
    ]);

    const avgAgg = await AssignmentSubmission.aggregate([
      { $match: { assignment: req.assessment._id, earnedMarks: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: "$earnedMarks" }, max: { $max: "$earnedMarks" }, min: { $min: "$earnedMarks" } } },
    ]);

    return res.json({
      total, graded, pending, late,
      averageScore:  avgAgg[0]?.avg  ?? null,
      highestScore:  avgAgg[0]?.max  ?? null,
      lowestScore:   avgAgg[0]?.min  ?? null,
    });
  } catch (err) {
    console.error("[assignmentLecturer getStats]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

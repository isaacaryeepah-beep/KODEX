"use strict";

/**
 * assignmentStudentController
 *
 * Student-facing assignment operations using the extended Phase 5 models.
 *
 * Middleware chain:
 *   authenticate → requireCompanyScope → requireAcademicRole("student") →
 *   requireStudentCourseEnrollment (course-scoped routes)
 */

const Assignment           = require("../models/Assignment");
const AssignmentSubmission = require("../models/AssignmentSubmission");

// ─── Assignment discovery ──────────────────────────────────────────────────────

/**
 * GET /student/assignments/courses/:courseId/assignments
 */
exports.listAssignments = async (req, res) => {
  try {
    const now = new Date();
    const assignments = await Assignment.find({
      company:     req.companyId,
      course:      req.params.courseId,
      isPublished: true,
      isActive:    true,
      releaseDate: { $lte: now },
    })
      .select("-pdfBrief.filePath -questions.correctAnswers -questions.correctAnswerText -questions.modelAnswer")
      .sort({ dueDate: 1 })
      .lean();

    // Attach per-assignment submission count.
    const aIds   = assignments.map(a => a._id);
    const mySubs = await AssignmentSubmission.find({
      assignment: { $in: aIds },
      student:    req.user._id,
      company:    req.companyId,
    }).select("assignment submissionNumber status earnedMarks isResultReleased").lean();

    const subMap = {};
    mySubs.forEach(s => {
      const key = s.assignment.toString();
      if (!subMap[key]) subMap[key] = [];
      subMap[key].push(s);
    });

    return res.json({
      assignments: assignments.map(a => ({
        ...a,
        mySubmissions: subMap[a._id.toString()] || [],
        isOverdue:     now > new Date(a.dueDate),
      })),
    });
  } catch (err) {
    console.error("[assignmentStudent listAssignments]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /student/assignments/:assignmentId
 */
exports.getAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id:         req.params.assignmentId,
      company:     req.companyId,
      isPublished: true,
      isActive:    true,
    })
      .select("-pdfBrief.filePath -questions.correctAnswers -questions.correctAnswerText -questions.modelAnswer")
      .lean();

    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    return res.json({ assignment });
  } catch (err) {
    console.error("[assignmentStudent getAssignment]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// ─── Submission lifecycle ─────────────────────────────────────────────────────

/**
 * POST /student/assignments/:assignmentId/submissions
 * Submit (or start a draft submission).
 * Body: { textContent, linkUrl, files[], answers[], isDraft }
 */
exports.submit = async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id:         req.params.assignmentId,
      company:     req.companyId,
      isPublished: true,
      isActive:    true,
    }).lean();

    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const now       = new Date();
    const isDraft   = req.body.isDraft === true;
    const isLate    = !isDraft && now > new Date(assignment.dueDate);
    const status    = isDraft ? "draft" : (isLate ? "late" : "submitted");

    // Check late submission policy.
    if (!isDraft && isLate && !assignment.allowLateSubmission) {
      return res.status(403).json({ error: "Late submissions are not allowed for this assignment" });
    }

    // Find the last submission number for this student+assignment.
    const lastSub = await AssignmentSubmission.findOne({
      assignment: assignment._id,
      student:    req.user._id,
      company:    req.companyId,
    })
      .sort({ submissionNumber: -1 })
      .select("submissionNumber status")
      .lean();

    let submissionNumber = 1;
    if (lastSub) {
      // If last submission was a draft, update it in-place (same number).
      if (lastSub.status === "draft") {
        submissionNumber = lastSub.submissionNumber;
      } else {
        // Resubmission.
        if (!assignment.allowResubmission) {
          return res.status(403).json({ error: "Resubmissions are not allowed for this assignment" });
        }
        if (assignment.maxSubmissions > 0 && lastSub.submissionNumber >= assignment.maxSubmissions) {
          return res.status(403).json({
            error: `You have used all ${assignment.maxSubmissions} allowed submission(s)`,
          });
        }
        submissionNumber = lastSub.submissionNumber + 1;
      }
    }

    const { textContent, linkUrl, files, answers } = req.body;

    const submissionData = {
      assignment:       assignment._id,
      student:          req.user._id,
      course:           assignment.course,
      company:          req.companyId,
      submissionNumber,
      textContent:      textContent || null,
      linkUrl:          linkUrl     || null,
      files:            files       || [],
      answers:          answers     || [],
      totalMarksAvailable: assignment.totalMarks || 0,
      status,
      isLate,
      submittedAt:      isDraft ? null : now,
      draftSavedAt:     isDraft ? now  : null,
      isCountedSubmission: true,
    };

    const submission = await AssignmentSubmission.findOneAndUpdate(
      {
        assignment:       assignment._id,
        student:          req.user._id,
        company:          req.companyId,
        submissionNumber,
      },
      { $set: submissionData },
      { upsert: true, new: true, runValidators: true }
    );

    // Mark previous resubmissions as not counted.
    if (submissionNumber > 1) {
      await AssignmentSubmission.updateMany(
        {
          assignment:       assignment._id,
          student:          req.user._id,
          company:          req.companyId,
          submissionNumber: { $lt: submissionNumber },
        },
        { $set: { isCountedSubmission: false } }
      );
    }

    return res.status(isDraft ? 200 : 201).json({
      submission,
      message: isDraft ? "Draft saved" : "Assignment submitted",
    });
  } catch (err) {
    if (err.name === "ValidationError") return res.status(400).json({ error: err.message });
    console.error("[assignmentStudent submit]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * PUT /student/assignments/:assignmentId/submissions/draft
 * Auto-save draft content. Creates or updates the active draft.
 */
exports.saveDraft = async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id:         req.params.assignmentId,
      company:     req.companyId,
      isPublished: true,
      isActive:    true,
    }).lean();
    if (!assignment) return res.status(404).json({ error: "Assignment not found" });

    const { textContent, linkUrl, files, answers } = req.body;
    const now = new Date();

    // Find existing draft.
    const existing = await AssignmentSubmission.findOne({
      assignment: assignment._id,
      student:    req.user._id,
      company:    req.companyId,
      status:     "draft",
    });

    if (existing) {
      if (textContent !== undefined) existing.textContent = textContent;
      if (linkUrl     !== undefined) existing.linkUrl     = linkUrl;
      if (files       !== undefined) existing.files       = files;
      if (answers     !== undefined) existing.answers     = answers;
      existing.draftSavedAt = now;
      await existing.save();
      return res.json({ submission: existing, message: "Draft saved" });
    }

    // No draft exists — create one.
    const lastSub = await AssignmentSubmission.findOne({
      assignment: assignment._id, student: req.user._id, company: req.companyId,
    }).sort({ submissionNumber: -1 }).select("submissionNumber").lean();

    const submissionNumber = lastSub ? lastSub.submissionNumber + 1 : 1;

    const draft = await AssignmentSubmission.create({
      assignment:       assignment._id,
      student:          req.user._id,
      course:           assignment.course,
      company:          req.companyId,
      submissionNumber,
      textContent:      textContent || null,
      linkUrl:          linkUrl     || null,
      files:            files       || [],
      answers:          answers     || [],
      totalMarksAvailable: assignment.totalMarks || 0,
      status:           "draft",
      draftSavedAt:     now,
    });

    return res.json({ submission: draft, message: "Draft saved" });
  } catch (err) {
    console.error("[assignmentStudent saveDraft]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /student/assignments/:assignmentId/submissions
 * List the student's own submissions for this assignment.
 */
exports.listMySubmissions = async (req, res) => {
  try {
    const submissions = await AssignmentSubmission.find({
      assignment: req.params.assignmentId,
      student:    req.user._id,
      company:    req.companyId,
    })
      .sort({ submissionNumber: -1 })
      .lean();

    return res.json({ submissions });
  } catch (err) {
    console.error("[assignmentStudent listMySubmissions]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /student/assignments/:assignmentId/submissions/:submissionId
 * View a specific submission (result only if released).
 */
exports.getSubmission = async (req, res) => {
  try {
    const submission = await AssignmentSubmission.findOne({
      _id:        req.params.submissionId,
      assignment: req.params.assignmentId,
      student:    req.user._id,
      company:    req.companyId,
    }).lean();

    if (!submission) return res.status(404).json({ error: "Submission not found" });

    // Hide grading fields until result is released.
    if (!submission.isResultReleased) {
      const { earnedMarks, percentageScore, isPassed, feedback, overallFeedback, rubricScores, gradedBy, gradedAt, ...safe } = submission;
      return res.json({ submission: safe, gradeReleased: false });
    }

    return res.json({ submission, gradeReleased: true });
  } catch (err) {
    console.error("[assignmentStudent getSubmission]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

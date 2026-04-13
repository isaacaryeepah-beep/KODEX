const mongoose = require("mongoose");

// ── Embedded MCQ answer (legacy + Phase 5) ────────────────────────────────────
const answerSchema = new mongoose.Schema({
  questionIndex:      { type: Number,   required: true },
  selectedAnswers:    { type: [Number], default: []    },  // MCQ indices chosen
  textAnswer:         { type: String,   default: null  },  // fill-in / explain response
  isCorrect:          { type: Boolean,  default: false },
  marksAwarded:       { type: Number,   default: 0     },
  needsManualGrading: { type: Boolean,  default: false },  // true for explain questions
});

// ── File attachment (Phase 5: multiple files) ─────────────────────────────────
const fileAttachmentSchema = new mongoose.Schema(
  {
    fileName:      { type: String, trim: true },
    originalName:  { type: String, trim: true },
    fileUrl:       { type: String, trim: true },
    mimeType:      { type: String, trim: true },
    fileSizeBytes: { type: Number, default: null },
    uploadedAt:    { type: Date,   default: Date.now },
  },
  { _id: false }
);

// ── Rubric score row (Phase 5) ────────────────────────────────────────────────
const rubricScoreSchema = new mongoose.Schema(
  {
    criterionId:  { type: mongoose.Schema.Types.ObjectId },
    criterion:    { type: String, trim: true },
    earnedMarks:  { type: Number, default: 0 },
    comment:      { type: String, trim: true, default: null },
  },
  { _id: false }
);

// ── Main submission schema ────────────────────────────────────────────────────
const assignmentSubmissionSchema = new mongoose.Schema(
  {
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    // ── Phase 5: submission number (supports resubmission) ────────────────
    // Legacy submissions default to 1 (backward compatible).
    submissionNumber: {
      type: Number,
      default: 1,
      min: 1,
    },

    // ── Legacy: single submitted file (filesystem path) ───────────────────
    // Kept for backward compatibility with existing assignmentController.
    submittedFile: {
      filePath:     { type: String, default: null },
      originalName: { type: String, default: null },
      mimeType:     { type: String, default: null },
      sizeBytes:    { type: Number, default: null },
    },

    // ── Phase 5: multiple cloud-uploaded files ────────────────────────────
    files: {
      type: [fileAttachmentSchema],
      default: [],
    },

    // ── Phase 5: text / link submission content ───────────────────────────
    textContent:   { type: String, trim: true, default: null },
    linkUrl:       { type: String, trim: true, default: null },
    draftSavedAt:  { type: Date,              default: null  },

    // ── MCQ answers ───────────────────────────────────────────────────────
    answers:             { type: [answerSchema], default: [] },
    questionScore:       { type: Number, default: 0 },
    totalMarksAvailable: { type: Number, default: 0 },

    // ── Lecturer grading ──────────────────────────────────────────────────
    manualGrade: { type: Number, default: null },
    feedback:    { type: String, default: null },
    gradedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    gradedAt:    { type: Date,   default: null },

    // ── Phase 5: extended grading ─────────────────────────────────────────
    earnedMarks:     { type: Number,  default: null },
    maxMarks:        { type: Number,  default: null },
    percentageScore: { type: Number,  default: null },
    isPassed:        { type: Boolean, default: null },
    rubricScores:    { type: [rubricScoreSchema], default: [] },
    overallFeedback: { type: String, trim: true, default: null },

    // ── Status ────────────────────────────────────────────────────────────
    // Extended from ["submitted","graded"] to include "draft","late","returned".
    status: {
      type: String,
      enum: ["draft", "submitted", "late", "graded", "returned"],
      default: "submitted",
    },
    submittedAt: { type: Date,    default: null  },
    isLate:      { type: Boolean, default: false },

    // ── Phase 5: which submission counts (for resubmission policy) ────────
    isCountedSubmission: { type: Boolean, default: true },

    // ── Phase 5: result release ───────────────────────────────────────────
    isResultReleased:  { type: Boolean,                                     default: false },
    resultReleasedAt:  { type: Date,                                        default: null  },
    resultReleasedBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null  },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
// Phase 5: unique on (assignment, student, submissionNumber) — supports resubmissions.
// Legacy unique(assignment, student) is superseded by this compound index.
assignmentSubmissionSchema.index(
  { assignment: 1, student: 1, submissionNumber: 1 },
  { unique: true, name: "unique_submission_per_attempt" }
);

assignmentSubmissionSchema.index({ assignment: 1, status: 1 });
assignmentSubmissionSchema.index({ company: 1, assignment: 1, status: 1 });

module.exports = mongoose.model("AssignmentSubmission", assignmentSubmissionSchema);

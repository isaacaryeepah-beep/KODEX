const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema({
  questionIndex:   { type: Number, required: true },
  selectedAnswers: { type: [Number], default: [] }, // indices the student chose
  isCorrect:       { type: Boolean, default: false },
  marksAwarded:    { type: Number,  default: 0 },
});

const assignmentSubmissionSchema = new mongoose.Schema(
  {
    assignment: { type: mongoose.Schema.Types.ObjectId, ref: "Assignment", required: true, index: true },
    student:    { type: mongoose.Schema.Types.ObjectId, ref: "User",       required: true, index: true },
    course:     { type: mongoose.Schema.Types.ObjectId, ref: "Course",     required: true },
    company:    { type: mongoose.Schema.Types.ObjectId, ref: "Company",    required: true, index: true },

    // ── Submitted file (filesystem) ──────────────────────────────────────
    submittedFile: {
      filePath:     { type: String, default: null },
      originalName: { type: String, default: null },
      mimeType:     { type: String, default: null },
      sizeBytes:    { type: Number, default: null },
    },

    // ── MCQ answers ──────────────────────────────────────────────────────
    answers:            { type: [answerSchema], default: [] },
    questionScore:      { type: Number, default: 0 },
    totalMarksAvailable:{ type: Number, default: 0 },

    // ── Lecturer grading ─────────────────────────────────────────────────
    manualGrade: { type: Number, default: null },
    feedback:    { type: String, default: null },
    gradedBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    gradedAt:    { type: Date,   default: null },

    // ── Status ───────────────────────────────────────────────────────────
    status:      { type: String, enum: ["submitted", "graded"], default: "submitted" },
    submittedAt: { type: Date,   default: null },
    isLate:      { type: Boolean, default: false },
  },
  { timestamps: true }
);

// One submission per student per assignment
assignmentSubmissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

module.exports = mongoose.model("AssignmentSubmission", assignmentSubmissionSchema);

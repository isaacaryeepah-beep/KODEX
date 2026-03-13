const mongoose = require("mongoose");

// ── Embedded question (MCQ, Fill-in, or Explain) ─────────────────────────
const assignmentQuestionSchema = new mongoose.Schema({
  questionText: {
    type: String,
    required: [true, "Question text is required"],
    trim: true,
  },
  questionType: {
    type: String,
    enum: ["single", "multiple", "fill", "explain"],
    default: "single",
  },
  options: {
    type: [String],
    default: [],
  },
  // Indices of ALL correct options — supports "select all that apply"
  correctAnswers: {
    type: [Number],
    default: [],
  },
  // Fill-in correct answer
  correctAnswerText: { type: String, default: null, trim: true },
  // Explain model answer (lecturer reference only)
  modelAnswer: { type: String, default: "", trim: true },
  marks: { type: Number, default: 1, min: 0 },
  // Award partial marks per correct option selected (deduct for wrong picks)
  allowPartialMarks: { type: Boolean, default: false },
  explanation: { type: String, default: null },
});

// ── Main Assignment schema ────────────────────────────────────────────────
const assignmentSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    course:  { type: mongoose.Schema.Types.ObjectId, ref: "Course",   required: true, index: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: "Company",  required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User",   required: true, index: true },

    // ── Scheduling ───────────────────────────────────────────────────────
    releaseDate: { type: Date, required: true },
    dueDate:     { type: Date, required: true },
    isActive:    { type: Boolean, default: true },

    // ── PDF brief (filesystem path) ──────────────────────────────────────
    pdfBrief: {
      filePath:    { type: String, default: null }, // relative to uploads dir
      originalName:{ type: String, default: null },
      mimeType:    { type: String, default: null },
      sizeBytes:   { type: Number, default: null },
      uploadedAt:  { type: Date,   default: null },
    },

    // ── Embedded MCQ questions ───────────────────────────────────────────
    questions: { type: [assignmentQuestionSchema], default: [] },

    // ── Totals (auto-calculated on save) ─────────────────────────────────
    totalMarks:   { type: Number, default: 0 },

    // ── Submission settings ──────────────────────────────────────────────
    allowFileSubmission:  { type: Boolean, default: true },
    allowLateSubmission:  { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Recalculate totalMarks whenever document is saved
assignmentSchema.pre("save", function (next) {
  this.totalMarks = this.questions.reduce((sum, q) => sum + (q.marks || 1), 0);
  next();
});

assignmentSchema.index({ company: 1, course: 1 });
assignmentSchema.index({ dueDate: 1 });

module.exports = mongoose.model("Assignment", assignmentSchema);

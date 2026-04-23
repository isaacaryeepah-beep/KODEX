const mongoose = require("mongoose");

// ── Embedded question (MCQ, Fill-in, or Explain) ─────────────────────────────
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

// ── Rubric criterion ──────────────────────────────────────────────────────────
const rubricCriterionSchema = new mongoose.Schema(
  {
    criterion:   { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    maxMarks:    { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

// ── Main Assignment schema ────────────────────────────────────────────────────
const assignmentSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    // ── Phase 5: extended identity ────────────────────────────────────────
    instructions: { type: String, default: "", trim: true },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    course:     { type: mongoose.Schema.Types.ObjectId, ref: "Course",  required: true, index: true },
    company:    { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User",    required: true, index: true },

    // ── Scheduling ────────────────────────────────────────────────────────
    releaseDate: { type: Date, required: true },
    dueDate:     { type: Date, required: true },
    isActive:    { type: Boolean, default: true },

    // ── PDF brief (filesystem path) ───────────────────────────────────────
    pdfBrief: {
      filePath:     { type: String, default: null },
      originalName: { type: String, default: null },
      mimeType:     { type: String, default: null },
      sizeBytes:    { type: Number, default: null },
      uploadedAt:   { type: Date,   default: null },
    },

    // ── Embedded MCQ questions ────────────────────────────────────────────
    questions: { type: [assignmentQuestionSchema], default: [] },

    // ── Totals (auto-calculated on save) ──────────────────────────────────
    totalMarks: { type: Number, default: 0 },

    // ── Submission settings ───────────────────────────────────────────────
    allowFileSubmission:  { type: Boolean, default: true },
    allowLateSubmission:  { type: Boolean, default: false },
    latePenaltyPercent:   { type: Number,  default: 0, min: 0, max: 100 },

    // ── Phase 5: extended submission settings ─────────────────────────────
    // submissionType: what the student submits (backward compat: "file_upload")
    submissionType: {
      type: String,
      enum: ["file_upload", "text", "link", "mixed", "questions_only"],
      default: "file_upload",
    },
    allowedFileTypes:  { type: String,  default: "" },       // MIME list, "" = any
    maxFileSizeMb:     { type: Number,  default: 10, min: 1 },
    maxFiles:          { type: Number,  default: 1,  min: 1 },
    // Resubmission
    allowResubmission: { type: Boolean, default: false },
    maxSubmissions:    { type: Number,  default: 1,  min: 1 },
    // Late penalty per day (overrides flat latePenaltyPercent if > 0)
    latePenaltyPercentPerDay: { type: Number, default: 0, min: 0, max: 100 },
    maxLateDays: { type: Number, default: 0 }, // 0 = unlimited
    // Scoring
    passMark: { type: Number, default: null },
    // Rubric (optional — structured grading criteria)
    rubric: { type: [rubricCriterionSchema], default: [] },
    // Result visibility
    showResultAfterGrading: { type: Boolean, default: false },
    autoReleaseResults:     { type: Boolean, default: false },

    // ── Phase 5: lifecycle / status ───────────────────────────────────────
    status: {
      type: String,
      enum: ["draft", "published", "closed", "archived"],
      default: "draft",
      index: true,
    },
    isPublished:  { type: Boolean, default: false },
    publishedAt:  { type: Date, default: null },
    closedAt:     { type: Date, default: null },
    archivedAt:   { type: Date, default: null },
    archivedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // ── Phase 5: lecturer attachments ─────────────────────────────────────
    attachments: {
      type: [{
        fileName:     { type: String },
        originalName: { type: String },
        fileUrl:      { type: String },
        mimeType:     { type: String },
        fileSize:     { type: Number },
        uploadedAt:   { type: Date, default: Date.now },
      }],
      default: [],
    },
  },
  { timestamps: true }
);

// ── Pre-save: recalculate totalMarks from embedded questions ──────────────────
assignmentSchema.pre("save", function (next) {
  if (this.questions && this.questions.length > 0) {
    this.totalMarks = this.questions.reduce((sum, q) => sum + (q.marks || 1), 0);
  }
  next();
});

// ── Indexes ───────────────────────────────────────────────────────────────────
assignmentSchema.index({ company: 1, course: 1 });
assignmentSchema.index({ company: 1, course: 1, createdBy: 1, status: 1 });
assignmentSchema.index({ company: 1, course: 1, isPublished: 1, isActive: 1 });
assignmentSchema.index({ dueDate: 1 });

module.exports = mongoose.model("Assignment", assignmentSchema);

const mongoose = require("mongoose");

const quizSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Quiz title is required"],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course/class is required"],
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Institution is required"],
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    timeLimit: {
      type: Number,
      default: 30,
      min: 1,
    },
    totalMarks: {
      type: Number,
      default: 0,
    },
    startTime: {
      type: Date,
      required: [true, "Start time is required"],
    },
    endTime: {
      type: Date,
      required: [true, "End time is required"],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // 0 = unlimited, 1 = one attempt (default), N = N attempts
    maxAttempts: {
      type: Number,
      default: 1,
      min: 0,
    },
    // Which score counts: "best" or "last"
    scorePolicy: {
      type: String,
      enum: ["best", "last"],
      default: "best",
    },
    source: {
      type: String,
      enum: ['proctored', 'assignment'],
      default: 'proctored',
      index: true,
    },

    // ── Group targeting ────────────────────────────────────────────────────
    // 'all'   → every enrolled student in this course sees the quiz
    // 'group' → only students whose studentGroup matches targetGroup
    targetAudience: {
      type: String,
      enum: ['all', 'group'],
      default: 'all',
      index: true,
    },
    targetGroup:             { type: String, default: null, trim: true },
    targetLevel:             { type: String, default: null, trim: true },
    targetStudyType:         { type: String, default: null, trim: true },
    targetQualificationType: { type: String, default: null, trim: true },
  },
  {
    timestamps: true,
  }
);

quizSchema.index({ company: 1, course: 1 });
quizSchema.index({ createdBy: 1 });
// The legacy quiz-list endpoint (quizController.js) filters {company, isActive}
// (plus an optional createdBy or course, not indexed here since that filter
// is conditional and equality on company+isActive already narrows sharply)
// and sorts by startTime desc -- neither field was in any index before.
quizSchema.index({ company: 1, isActive: 1, startTime: -1 });

module.exports = mongoose.model("Quiz", quizSchema);

const mongoose = require("mongoose");

const answerSchema = new mongoose.Schema(
  {
    attempt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attempt",
      required: [true, "Attempt is required"],
      index: true,
    },
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: [true, "Question is required"],
      index: true,
    },
    // For MCQ: the selected option index (number). For fill-in: -1 (unused)
    selectedAnswer: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    // For fill-in: what the student typed
    selectedAnswerText: {
      type: String,
      default: null,
      trim: true,
    },
    isCorrect: {
      type: Boolean,
      default: false,
    },
    // True for explain-type answers needing manual grading by lecturer
    pendingManualGrade: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

answerSchema.index({ attempt: 1, question: 1 }, { unique: true });

module.exports = mongoose.model("Answer", answerSchema);

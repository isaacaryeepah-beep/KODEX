const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: [true, "Quiz is required"],
      index: true,
    },
    questionText: {
      type: String,
      required: [true, "Question text is required"],
      trim: true,
    },
    questionType: {
      type: String,
      enum: ["single", "multiple", "fill"],
      default: "single",
    },
    options: {
      type: [String],
      default: [],
      validate: {
        validator: function(v) {
          // fill-in questions don't need options
          if (this.questionType === "fill") return true;
          return Array.isArray(v) && v.length >= 2;
        },
        message: "At least 2 options are required for MCQ questions",
      },
    },
    // Single correct answer index (single/multiple MCQ)
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed, // Number for MCQ, null for fill
      default: null,
    },
    // Multiple correct answer indices (multiple MCQ)
    correctAnswers: {
      type: [Number],
      default: [],
    },
    // Fill-in: primary correct answer string
    correctAnswerText: {
      type: String,
      default: null,
      trim: true,
    },
    // Fill-in: extra accepted answer strings (case-insensitive matched)
    acceptedAnswers: {
      type: [String],
      default: [],
    },
    marks: {
      type: Number,
      default: 1,
      min: 0,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Question", questionSchema);

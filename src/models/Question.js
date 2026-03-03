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
      enum: ["single", "multiple"],
      default: "single",
    },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 2,
        message: "At least 2 options are required",
      },
    },
    // Single correct answer (legacy + single type)
    correctAnswer: {
      type: Number,
      min: 0,
      default: null,
    },
    // Multiple correct answers (array of indices)
    correctAnswers: {
      type: [Number],
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

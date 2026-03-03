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
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 2,
        message: "At least 2 options are required",
      },
    },
    correctAnswer: {
      type: Number,
      required: [true, "Correct answer index is required"],
      min: 0,
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

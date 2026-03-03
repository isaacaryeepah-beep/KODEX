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
    selectedAnswer: {
      type: Number,
      required: [true, "Selected answer is required"],
      min: 0,
    },
    isCorrect: {
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

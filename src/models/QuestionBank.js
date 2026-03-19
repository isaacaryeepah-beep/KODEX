/**
 * QuestionBank.js
 * Standalone question store -- lecturer-scoped, reusable across quizzes.
 * Questions here are independent of any quiz until imported.
 */
const mongoose = require("mongoose");

const questionBankSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
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
    modelAnswer: {
      type: String,
      default: "",
      trim: true,
    },
    options: {
      type: [String],
      default: [],
    },
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    correctAnswers: {
      type: [Number],
      default: [],
    },
    correctAnswerText: {
      type: String,
      default: null,
      trim: true,
    },
    acceptedAnswers: {
      type: [String],
      default: [],
    },
    marks: {
      type: Number,
      default: 1,
      min: 0,
    },
    // Tag for organising -- e.g. "Biology", "Week 3", "Final Exam"
    topic: {
      type: String,
      trim: true,
      default: "",
    },
    // Track how many times this has been imported into quizzes
    useCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

questionBankSchema.index({ company: 1, createdBy: 1, topic: 1 });

module.exports = mongoose.model("QuestionBank", questionBankSchema);

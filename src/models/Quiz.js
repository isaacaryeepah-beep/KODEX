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
  },
  {
    timestamps: true,
  }
);

quizSchema.index({ company: 1, course: 1 });
quizSchema.index({ createdBy: 1 });

module.exports = mongoose.model("Quiz", quizSchema);

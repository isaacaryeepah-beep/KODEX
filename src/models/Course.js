const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Course title is required"],
      trim: true,
    },
    code: {
      type: String,
      required: [true, "Course code is required"],
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },
    lecturer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Lecturer is required"],
    },
    enrolledStudents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    level: {
      type: String,
      trim: true,
      default: null, // e.g. "100", "200", "300"
    },
    year: {
      type: String,
      trim: true,
      default: null, // e.g. "Year 1", "Year 2"
    },
    group: {
      type: String,
      trim: true,
      uppercase: true,
      default: null, // e.g. "A", "B"
    },
    sessionType: {
      type: String,
      enum: ["Regular", "Evening", "Weekend", null],
      default: null,
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

courseSchema.index({ company: 1, code: 1 }, { unique: true });

module.exports = mongoose.model("Course", courseSchema);

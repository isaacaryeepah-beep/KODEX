const mongoose = require("mongoose");

const studentRosterSchema = new mongoose.Schema(
  {
    studentId: {
      type: String,
      required: [true, "Student ID is required"],
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      trim: true,
      default: "",
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course is required"],
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Added by is required"],
    },
    registered: {
      type: Boolean,
      default: false,
    },
    registeredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

studentRosterSchema.index({ studentId: 1, company: 1 });
studentRosterSchema.index({ course: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("StudentRoster", studentRosterSchema);

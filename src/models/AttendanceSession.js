const mongoose = require("mongoose");

const attendanceSessionSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "stopped"],
      default: "active",
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    stoppedAt: {
      type: Date,
      default: null,
    },
    stoppedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    qrSeed: {
      type: String,
      default: null,
    },
    bleLocationId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

attendanceSessionSchema.index({ company: 1, status: 1 });
attendanceSessionSchema.index({ company: 1, startedAt: -1 });

module.exports = mongoose.model("AttendanceSession", attendanceSessionSchema);

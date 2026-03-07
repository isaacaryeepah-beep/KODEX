const mongoose = require("mongoose");

const shiftSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Shift name is required"],
      trim: true,
    },
    startTime: {
      type: String, // "HH:MM" 24h format e.g. "08:00"
      required: [true, "Start time is required"],
    },
    endTime: {
      type: String, // "HH:MM" 24h format e.g. "17:00"
      required: [true, "End time is required"],
    },
    gracePeriodMinutes: {
      type: Number,
      default: 15, // minutes late before marked "late"
    },
    days: {
      type: [String],
      enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      default: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    },
    department: {
      type: String,
      default: null, // null = all departments
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Shift", shiftSchema);

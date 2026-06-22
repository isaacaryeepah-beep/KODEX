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
      type: String,
      required: [true, "Start time is required"],
    },
    endTime: {
      type: String,
      required: [true, "End time is required"],
    },
    gracePeriodMinutes: {
      type: Number,
      default: 15,
    },
    days: {
      type: [String],
      enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      default: ["Mon", "Tue", "Wed", "Thu", "Fri"],
    },
    department: {
      type: String,
      default: null,
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

// Compound indexes for company-scoped queries
shiftSchema.index({ company: 1, createdAt: -1 }, { background: true });
shiftSchema.index({ company: 1, isActive: 1 }, { background: true });
shiftSchema.index({ createdBy: 1 }, { background: true });

module.exports = mongoose.model("Shift", shiftSchema);

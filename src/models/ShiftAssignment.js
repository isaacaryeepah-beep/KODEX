const mongoose = require("mongoose");

// Assigns a specific shift to a specific employee
const shiftAssignmentSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shift",
      required: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      default: null, // null = indefinite
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

shiftAssignmentSchema.index({ company: 1, employee: 1, isActive: 1 });

module.exports = mongoose.model("ShiftAssignment", shiftAssignmentSchema);

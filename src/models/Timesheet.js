const mongoose = require("mongoose");

const timesheetEntrySchema = new mongoose.Schema({
  date:       { type: Date, required: true },
  hoursWorked:{ type: Number, required: true, min: 0, max: 24 },
  notes:      { type: String, default: "" },
  approved:   { type: Boolean, default: null }, // null=pending
});

const timesheetSchema = new mongoose.Schema(
  {
    company:    { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    employee:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    period:     { type: String, required: true }, // e.g. "2026-03"
    entries:    [timesheetEntrySchema],
    status:     { type: String, enum: ["draft","submitted","approved","rejected"], default: "draft" },
    submittedAt:{ type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "" },
    totalHours: { type: Number, default: 0 },
  },
  { timestamps: true }
);

timesheetSchema.index({ employee: 1, period: 1 }, { unique: true });

module.exports = mongoose.model("Timesheet", timesheetSchema);

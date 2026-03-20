const mongoose = require("mongoose");

const reviewItemSchema = new mongoose.Schema({
  criterion:  { type: String, required: true },  // e.g. "Communication"
  score:      { type: Number, min: 1, max: 5 },
  comment:    { type: String, default: "" },
});

const reviewSchema = new mongoose.Schema(
  {
    company:    { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    employee:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reviewer:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    type: {
      type: String,
      enum: ["manager","peer","self"],
      default: "manager",
    },

    period:     { type: String, required: true },  // e.g. "Q1 2026"
    items:      [reviewItemSchema],
    overallScore: { type: Number, min: 1, max: 5, default: null },
    summary:    { type: String, default: "" },
    strengths:  { type: String, default: "" },
    improvements:{ type: String, default: "" },

    status: {
      type: String,
      enum: ["draft","submitted"],
      default: "draft",
    },

    submittedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Review", reviewSchema);

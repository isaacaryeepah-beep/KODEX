const mongoose = require("mongoose");

const goalSchema = new mongoose.Schema(
  {
    company:    { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    employee:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: "User" },

    title:      { type: String, required: true, trim: true },
    description:{ type: String, default: "" },
    category:   { type: String, enum: ["kpi","personal","team","learning"], default: "kpi" },

    targetValue:  { type: Number, default: null },   // e.g. 100 (sales calls)
    currentValue: { type: Number, default: 0 },
    unit:         { type: String, default: "" },     // e.g. "calls", "%", "deals"

    dueDate:    { type: Date, default: null },
    period:     { type: String, enum: ["monthly","quarterly","annual"], default: "quarterly" },

    status: {
      type: String,
      enum: ["active","completed","cancelled","overdue"],
      default: "active",
    },

    weight:     { type: Number, default: 1 },        // importance weight for scorecard
  },
  { timestamps: true }
);

module.exports = mongoose.model("Goal", goalSchema);

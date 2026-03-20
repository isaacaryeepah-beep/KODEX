const mongoose = require("mongoose");

const trainingProgressSchema = new mongoose.Schema(
  {
    company:  { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    module:   { type: mongoose.Schema.Types.ObjectId, ref: "TrainingModule", required: true },

    status: {
      type: String,
      enum: ["assigned", "in_progress", "completed", "failed", "overdue"],
      default: "assigned",
    },

    startedAt:   { type: Date, default: null },
    completedAt: { type: Date, default: null },
    dueDate:     { type: Date, default: null },

    // Quiz attempt
    answers:     [{ questionIndex: Number, selectedAnswer: Number }],
    score:       { type: Number, default: null },   // raw score
    maxScore:    { type: Number, default: null },
    percentage:  { type: Number, default: null },
    passed:      { type: Boolean, default: null },

    attempts:    { type: Number, default: 0 },       // how many times tried
  },
  { timestamps: true }
);

// One progress record per employee per module
trainingProgressSchema.index({ employee: 1, module: 1 }, { unique: true });

module.exports = mongoose.model("TrainingProgress", trainingProgressSchema);

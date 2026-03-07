const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options:      { type: [String], required: true },
  correctAnswer: { type: Number, required: true }, // 0-based index
  marks:        { type: Number, default: 1 },
});

const trainingModuleSchema = new mongoose.Schema(
  {
    company:     { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    title:       { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    type: {
      type: String,
      enum: ["onboarding", "mandatory", "certification", "policy"],
      default: "mandatory",
    },
    content:     { type: String, default: "" },   // Rich text / markdown body
    videoUrl:    { type: String, default: "" },   // Optional video link
    questions:   [questionSchema],                // Assessment questions
    passingScore: { type: Number, default: 70 },  // % required to pass
    dueInDays:   { type: Number, default: 7 },    // Days from assignment to complete
    isActive:    { type: Boolean, default: true },
    createdBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    // Which roles must complete this
    targetRoles: { type: [String], default: ["employee"] },
    departments: { type: [String], default: [] }, // empty = all departments
  },
  { timestamps: true }
);

module.exports = mongoose.model("TrainingModule", trainingModuleSchema);

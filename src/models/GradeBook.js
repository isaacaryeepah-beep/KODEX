/**
 * GradeBook.js
 * Stores per-course grade configuration and manual grade entries.
 *
 * One GradeBook document per course.
 * Manual grades are stored as sub-documents keyed by studentId.
 */
const mongoose = require("mongoose");

// A single manual grade entry (e.g. "Midterm Exam", "Lab Report 1")
const manualEntrySchema = new mongoose.Schema({
  label:     { type: String, required: true, trim: true, maxlength: 100 },
  maxScore:  { type: Number, required: true, min: 0 },
  scores: [
    {
      student:  { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      score:    { type: Number, required: true, min: 0 },
      note:     { type: String, default: "" },
      enteredBy:{ type: mongoose.Schema.Types.ObjectId, ref: "User" },
      enteredAt:{ type: Date, default: Date.now },
    }
  ],
}, { _id: true });

const gradeBookSchema = new mongoose.Schema(
  {
    course:   { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true, unique: true },
    company:  { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    createdBy:{ type: mongoose.Schema.Types.ObjectId, ref: "User" },

    // Component weights (active components determine the denominator — they
    // need not sum to 100; the controller normalises to whatever sum is used).
    weights: {
      // Legacy Quiz model (Phases 1–2)
      quizzes:      { type: Number, default: 50, min: 0, max: 100 },
      // Phase 3 NormalQuiz results
      normalQuizzes:{ type: Number, default: 0,  min: 0, max: 100 },
      // Phase 4 SnapQuiz results
      snapQuizzes:  { type: Number, default: 0,  min: 0, max: 100 },
      // Phase 5 Assignment submissions
      assignments:  { type: Number, default: 0,  min: 0, max: 100 },
      // Academic attendance sessions
      attendance:   { type: Number, default: 20, min: 0, max: 100 },
      // Lecturer-entered manual grades
      manual:       { type: Number, default: 30, min: 0, max: 100 },
    },

    // Manual grade columns (e.g. midterm, lab reports, project)
    manualEntries: [manualEntrySchema],
  },
  { timestamps: true }
);

gradeBookSchema.index({ company: 1, course: 1 });

module.exports = mongoose.model("GradeBook", gradeBookSchema);

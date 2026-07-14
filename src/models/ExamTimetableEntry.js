'use strict';

/**
 * ExamTimetableEntry
 *
 * One scheduled exam sitting on the departmental exams timetable — a
 * date-specific event, unlike Timetable (the weekly recurring class grid,
 * which has no dates and structurally can't hold exam sittings).
 *
 * Editing rules (enforced in routes/examTimetable.js):
 *   - HOD:        entries for courses in their own department
 *   - Class rep:  entries for their own class only — courses whose
 *                 level+group match the rep's studentLevel/studentGroup
 *                 (and department, when both sides have one set)
 *   - admin/superadmin: any entry in the company
 * Everyone else (students, lecturers) gets a read-only view scoped to
 * their department/class.
 *
 * department/level/group are snapshotted from the course at write time so
 * list queries filter cheaply without populating courses.
 *
 * Academic mode only.
 */

const mongoose = require('mongoose');

const examTimetableEntrySchema = new mongoose.Schema({
  company:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  course:   { type: mongoose.Schema.Types.ObjectId, ref: 'Course',  required: true },

  // Denormalized from the course at create/update time
  department: { type: String, trim: true, default: null },
  level:      { type: String, trim: true, default: null },
  group:      { type: String, trim: true, default: null },

  examDate:  { type: Date,   required: true },
  startTime: { type: String, required: true }, // "HH:MM", same convention as Timetable
  endTime:   { type: String, required: true },

  venue: { type: String, trim: true, default: null },
  notes: { type: String, trim: true, maxlength: 500, default: null },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  isActive: { type: Boolean, default: true },
}, { timestamps: true });

examTimetableEntrySchema.index({ company: 1, department: 1, examDate: 1 });
examTimetableEntrySchema.index({ company: 1, level: 1, group: 1, examDate: 1 });
examTimetableEntrySchema.index({ company: 1, course: 1 });

module.exports = mongoose.model('ExamTimetableEntry', examTimetableEntrySchema);

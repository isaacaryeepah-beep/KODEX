const mongoose = require('mongoose');

const timetableSchema = new mongoose.Schema({
  company:    { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  course:     { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  lecturer:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',   required: true, index: true },
  department: { type: String, trim: true, default: null },
  dayOfWeek:  { type: Number, required: true, min: 0, max: 6 },
  startTime:  { type: String, required: true },
  endTime:    { type: String, required: true },
  title:      { type: String, trim: true, default: null },
  room:       { type: String, trim: true, default: null },
  color:      { type: String, default: '#6366f1' },
  notes:      { type: String, trim: true, default: null },
  isActive:   { type: Boolean, default: true },
}, { timestamps: true });

timetableSchema.index({ company: 1, lecturer: 1 });
timetableSchema.index({ company: 1, course: 1 });

module.exports = mongoose.model('Timetable', timetableSchema);

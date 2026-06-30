'use strict';
const mongoose = require('mongoose');

const violationSchema = new mongoose.Schema({
  type:        { type: String, required: true },
  timestamp:   { type: Date, default: Date.now },
  severity:    { type: String, enum: ['info', 'low', 'medium', 'high'], default: 'info' },
  riskPoints:  { type: Number, default: 0 },
  message:     { type: String, default: '' },
  snapshotRef: { type: String, default: null },
}, { _id: false });

const examSessionSchema = new mongoose.Schema({
  meeting:  { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', default: null },
  quiz:     { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz',    default: null },
  student:  { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  company:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },

  status: {
    type: String,
    enum: ['active', 'completed', 'terminated', 'abandoned'],
    default: 'active',
  },

  riskScore:     { type: Number, default: 0, min: 0, max: 100 },
  snapshotCount: { type: Number, default: 0 },
  violations:    [violationSchema],

  report: {
    integrityScore: { type: Number, default: null },
    summary:        { type: String, default: null },
    violationCount: { type: Number, default: 0 },
    generatedAt:    { type: Date,   default: null },
  },

  startedAt: { type: Date, default: Date.now },
  endedAt:   { type: Date, default: null },
}, { timestamps: true });

examSessionSchema.index({ meeting: 1, student: 1 });
examSessionSchema.index({ company: 1, status: 1 });
examSessionSchema.index({ student: 1, createdAt: -1 });

module.exports = mongoose.model('ExamSession', examSessionSchema);

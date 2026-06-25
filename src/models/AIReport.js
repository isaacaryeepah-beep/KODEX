'use strict';
const mongoose = require('mongoose');

const REPORT_TYPES = [
  'at_risk_students',
  'class_health',
  'department_overview',
  'exam_readiness',
  'workforce_attendance',
  'leave_anomaly',
  'shift_compliance',
  'custom_query',
  'weekly_digest',
  'platform_health',
];

const aiReportSchema = new mongoose.Schema({
  company:     { type: mongoose.Schema.Types.ObjectId, ref: 'Company', index: true, default: null },
  type:        { type: String, enum: REPORT_TYPES, required: true, index: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  parameters:  { type: mongoose.Schema.Types.Mixed, default: {} },
  report:      { type: String, required: true },
  summary:     { type: String, default: '' },
}, { timestamps: true });

aiReportSchema.index({ company: 1, type: 1, createdAt: -1 });

module.exports = mongoose.model('AIReport', aiReportSchema);
module.exports.REPORT_TYPES = REPORT_TYPES;

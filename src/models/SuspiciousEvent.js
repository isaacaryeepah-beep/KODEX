const mongoose = require('mongoose');

const suspiciousEventSchema = new mongoose.Schema({
  sessionId:  { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', required: true },
  courseId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Course',            required: true },
  companyId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company',           required: true },
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',              default: null },
  deviceId:   { type: String, default: null },
  ipAddress:  { type: String, default: null },

  eventType: {
    type: String,
    required: true,
    enum: [
      'invalid_code',
      'expired_code',
      'non_enrolled_attempt',
      'cross_company_attempt',
      'repeated_device_attempt',
      'repeated_ip_attempt',
      'offline_device_attempt',
      'paused_session_attempt',
      'locked_session_attempt',
      'ended_session_attempt',
      'unverified_network_attempt',
      'already_marked_attempt',
      'wrong_session_attempt',
    ],
  },

  reason:      { type: String, required: true },
  actionTaken: { type: String, default: 'blocked' },
  resolved:    { type: Boolean, default: false },
  resolvedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  resolvedAt:  { type: Date, default: null },
  notes:       { type: String, default: null },

}, { timestamps: true });

suspiciousEventSchema.index({ sessionId: 1, createdAt: -1 });
suspiciousEventSchema.index({ companyId: 1, createdAt: -1 });
suspiciousEventSchema.index({ userId: 1 });

module.exports = mongoose.model('SuspiciousEvent', suspiciousEventSchema);

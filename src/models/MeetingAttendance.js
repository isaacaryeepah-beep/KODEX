const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  joinedAt: { type: Date, required: true },
  leftAt:   { type: Date, default: null },
  minutes:  { type: Number, default: 0 }
}, { _id: false });

const meetingAttendanceSchema = new mongoose.Schema({
  meeting:   { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true },
  company:   { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  user:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  role:      { type: String, required: true },

  // All join/leave sessions for accurate total calculation
  sessions:  [sessionSchema],

  // Summary
  joinCount:    { type: Number, default: 0 },
  totalMinutes: { type: Number, default: 0 },
  lastAction:   { type: String, enum: ['joined', 'left'], default: 'joined' },
  joinedAt:     { type: Date, default: null }, // first join
  leftAt:       { type: Date, default: null }, // last leave

  // Status
  attendanceStatus: {
    type: String,
    enum: ['present', 'partial', 'absent'],
    default: 'absent'
  },

  // Optional
  deviceInfo: { type: String, default: null },
  ipAddress:  { type: String, default: null },

}, { timestamps: true });

// One record per user per meeting
meetingAttendanceSchema.index({ meeting: 1, user: 1 }, { unique: true });
meetingAttendanceSchema.index({ company: 1, meeting: 1 });
meetingAttendanceSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('MeetingAttendance', meetingAttendanceSchema);

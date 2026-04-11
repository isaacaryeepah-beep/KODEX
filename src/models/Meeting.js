const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  // Core
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, default: '' },

  // Tenant + mode
  company:     { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  mode:        { type: String, enum: ['academic', 'corporate'], required: true },

  // Creator
  creatorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  creatorRole: { type: String, required: true },

  // Academic linking
  linkedCourseId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Course',     default: null },
  linkedDepartmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
  linkedSessionId:    { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', default: null },

  // Corporate linking
  linkedTeam: { type: String, default: null },

  // Participant control
  allowedUsers:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  allowedDepartments: [{ type: String }],
  allowedCourses:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  allowedTeams:       [{ type: String }],
  openToCompany:      { type: Boolean, default: false },

  // Timing
  scheduledStart: { type: Date, required: true },
  scheduledEnd:   { type: Date, required: true },
  actualStart:    { type: Date, default: null },
  actualEnd:      { type: Date, default: null },

  // Jitsi room
  // unique: true on the field already creates the index — no schema.index() needed
  roomName:     { type: String, unique: true, required: true },
  roomPassword: { type: String, default: null },

  // Status
  status:   { type: String, enum: ['scheduled', 'live', 'ended', 'cancelled'], default: 'scheduled' },
  isActive: { type: Boolean, default: true },

  // Settings
  settings: {
    enableChat:      { type: Boolean, default: true },
    enableRecording: { type: Boolean, default: false },
    enableLobby:     { type: Boolean, default: false },
    enablePassword:  { type: Boolean, default: false },
    muteOnJoin:      { type: Boolean, default: true },
    waitingRoom:     { type: Boolean, default: false },
  }

}, { timestamps: true });

// Compound indexes only — roomName unique index is already created by the field definition above
meetingSchema.index({ company: 1, status: 1 });
meetingSchema.index({ company: 1, creatorId: 1 });
meetingSchema.index({ company: 1, scheduledStart: -1 });

module.exports = mongoose.model('Meeting', meetingSchema);

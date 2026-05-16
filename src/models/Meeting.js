'use strict';
const mongoose = require('mongoose');

const MEETING_TYPES = [
  'meeting',          // generic meeting
  'lecture',          // live class
  'proctored_quiz',   // proctored exam with monitoring
  'snap_quiz',        // snap quiz with live invigilator
  'oral_exam',        // oral/viva examination
  'staff_conference', // staff/admin meeting
  'live_assessment',  // live graded activity
];

const meetingSchema = new mongoose.Schema({
  // Core
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, default: '' },
  meetingType: { type: String, enum: MEETING_TYPES, default: 'meeting' },

  // Tenant + mode
  company:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  mode:     { type: String, enum: ['academic', 'corporate'], required: true },

  // Creator
  creatorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  creatorRole: { type: String, required: true },

  // Invigilators/co-moderators (can monitor and control participants)
  invigilators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Academic linking
  linkedCourseId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Course',            default: null },
  linkedDepartmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department',        default: null },
  linkedSessionId:    { type: mongoose.Schema.Types.ObjectId, ref: 'AttendanceSession', default: null },
  linkedSnapQuizId:   { type: mongoose.Schema.Types.ObjectId, ref: 'SnapQuiz',          default: null },

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

  // Jitsi room (roomName unique index from field definition)
  roomName:     { type: String, unique: true, required: true },
  roomPassword: { type: String, default: null },

  // Room control
  isLocked: { type: Boolean, default: false }, // when true, no new joins allowed

  // Status
  status:   { type: String, enum: ['scheduled','live','ended','cancelled'], default: 'scheduled' },
  isActive: { type: Boolean, default: true },

  // Settings
  settings: {
    enableChat:          { type: Boolean, default: true },
    enableRecording:     { type: Boolean, default: false },
    enableLobby:         { type: Boolean, default: false },
    enablePassword:      { type: Boolean, default: false },
    muteOnJoin:          { type: Boolean, default: true },
    waitingRoom:         { type: Boolean, default: false },
    screenShareEnabled:  { type: Boolean, default: true },
    allowParticipantChat: { type: Boolean, default: true },
  },

}, { timestamps: true });

meetingSchema.index({ company: 1, status: 1 });
meetingSchema.index({ company: 1, creatorId: 1 });
meetingSchema.index({ company: 1, scheduledStart: -1 });
meetingSchema.index({ company: 1, meetingType: 1, status: 1 });
meetingSchema.index({ invigilators: 1 });

module.exports = mongoose.model('Meeting', meetingSchema);

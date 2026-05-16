'use strict';
const mongoose = require('mongoose');

const flagSchema = new mongoose.Schema({
  reason:    { type: String, required: true },
  flaggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  flaggedAt: { type: Date, default: Date.now },
}, { _id: false });

const warningSchema = new mongoose.Schema({
  message:  { type: String, required: true },
  sentBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sentAt:   { type: Date, default: Date.now },
  isRead:   { type: Boolean, default: false },
}, { _id: false });

const participantSchema = new mongoose.Schema({
  meeting: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true },
  company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  role:    { type: String, required: true },

  // Jitsi-internal participant ID (set by client after joining)
  jitsiParticipantId: { type: String, default: null },

  // Real-time AV status (updated every ~10s by client)
  cameraOff:         { type: Boolean, default: false },
  micMuted:          { type: Boolean, default: true },
  screenSharing:     { type: Boolean, default: false },
  connectionQuality: { type: String, enum: ['good','poor','critical','unknown'], default: 'unknown' },

  // Anti-cheat counters
  tabSwitchCount: { type: Number, default: 0 },
  reconnectCount: { type: Number, default: 0 },

  // Moderation
  isFlagged: { type: Boolean, default: false },
  flags:     [flagSchema],
  warnings:  [warningSchema],

  // Lifecycle
  status: {
    type: String,
    enum: ['waiting', 'connected', 'disconnected', 'kicked'],
    default: 'connected',
  },
  joinedAt:     { type: Date, default: Date.now },
  lastSeenAt:   { type: Date, default: Date.now },
  leftAt:       { type: Date, default: null },
  totalMinutes: { type: Number, default: 0 },

}, { timestamps: true });

participantSchema.index({ meeting: 1, user: 1 }, { unique: true });
participantSchema.index({ meeting: 1, status: 1 });
participantSchema.index({ company: 1, meeting: 1 });

module.exports = mongoose.model('MeetingParticipant', participantSchema);

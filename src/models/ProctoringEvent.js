'use strict';
const mongoose = require('mongoose');

const TYPES = [
  'tab_switch', 'fullscreen_exit', 'fullscreen_enter',
  'face_not_detected', 'multiple_faces', 'camera_off', 'camera_on',
  'mic_off', 'screen_share_started', 'network_drop', 'reconnect',
  'suspicious_activity', 'screenshot', 'session_start',
];

const schema = new mongoose.Schema({
  meeting:  { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting', required: true },
  company:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  user:     { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
  type:     { type: String, enum: TYPES, required: true },
  severity: { type: String, enum: ['info','low','medium','high','critical'], default: 'info' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  timestamp:{ type: Date, default: Date.now },
}, { timestamps: false });

// Auto-expire after 90 days
schema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
schema.index({ meeting: 1, user: 1, timestamp: -1 });
schema.index({ meeting: 1, type:  1 });
schema.index({ meeting: 1, timestamp: -1 });

module.exports = mongoose.model('ProctoringEvent', schema);

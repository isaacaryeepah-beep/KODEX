'use strict';
const mongoose = require('mongoose');

// Auto-created when a user with a creator role (admin/lecturer/manager/hod) registers.
// Stores their stable Jitsi display identity and pre-computed moderator flag.
const meetingIdentitySchema = new mongoose.Schema({
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  company:     { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  displayName: { type: String, required: true, trim: true },
  role:        { type: String, required: true },
  isModerator: { type: Boolean, default: false },
  // Jitsi user ID — stable across sessions, used as `sub` in JWT payload
  jitsiUserId: { type: String, required: true, unique: true },
  // Avatar initials for the monitor dashboard
  initials:    { type: String, default: '' },
}, { timestamps: true });

meetingIdentitySchema.index({ userId: 1 }, { unique: true });
meetingIdentitySchema.index({ company: 1 });

module.exports = mongoose.model('MeetingIdentity', meetingIdentitySchema);

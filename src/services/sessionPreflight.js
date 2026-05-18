'use strict';
const Meeting            = require('../models/Meeting');
const MeetingParticipant = require('../models/MeetingParticipant');
const { broadcastMonitor } = require('../controllers/meetingMonitorController');

/**
 * Run device validation and initialise monitoring before a student joins Jitsi.
 *
 * Called by: POST /api/meetings/:id/preflight
 *
 * Steps:
 *  1. Meeting must be live and the user is allowed to join.
 *  2. Create / upsert a MeetingParticipant record in status='waiting'.
 *  3. Anti-cheat is now active server-side (any proctoring event will be
 *     accepted from this participant from this point on).
 *  4. Broadcast the new participant to the monitor dashboard.
 *
 * Returns { success, participantId, monitoringActive }
 */
async function runPreflight(meetingId, user) {
  const meeting = await Meeting.findOne({
    _id:      meetingId,
    company:  user.company,
    isActive: true,
  }).lean();

  if (!meeting) throw Object.assign(new Error('Meeting not found'), { status: 404 });
  if (meeting.status !== 'live') {
    throw Object.assign(new Error('Meeting is not live yet'), { status: 403 });
  }

  const now = new Date();

  // Upsert participant record — status stays 'waiting' until first heartbeat
  let participant = await MeetingParticipant.findOne({
    meeting: meetingId,
    user:    user._id,
  });

  if (!participant) {
    participant = new MeetingParticipant({
      meeting:    meetingId,
      company:    user.company,
      user:       user._id,
      role:       user.role,
      status:     'waiting',
      joinedAt:   now,
      lastSeenAt: now,
    });
  } else if (participant.status === 'kicked') {
    // Kicked participants cannot re-enter
    throw Object.assign(new Error('You have been removed from this session'), { status: 403 });
  } else {
    // Reconnect path — update timing but don't reset flags/warnings
    participant.status     = 'waiting';
    participant.lastSeenAt = now;
  }

  participant.preflightAt     = now;
  participant.monitoringActive = true;
  await participant.save();

  // Notify the monitor dashboard of this participant's arrival
  broadcastMonitor(meetingId, 'participant_preflight', {
    userId:    user._id.toString(),
    name:      user.name || user.email,
    role:      user.role,
    status:    'waiting',
    joinedAt:  participant.joinedAt,
  });

  return {
    success:          true,
    participantId:    participant._id,
    monitoringActive: true,
  };
}

/**
 * Handle a participant reconnecting after a Jitsi disconnect.
 *
 * Called by: POST /api/meetings/:id/reconnect
 *
 * Increments the reconnect counter and re-activates monitoring so the
 * invigilator dashboard immediately reflects the return.
 */
async function handleReconnect(meetingId, user) {
  const meeting = await Meeting.findOne({
    _id:      meetingId,
    company:  user.company,
    isActive: true,
  }).lean();

  if (!meeting) throw Object.assign(new Error('Meeting not found'), { status: 404 });

  const participant = await MeetingParticipant.findOne({
    meeting: meetingId,
    user:    user._id,
  });

  if (!participant) {
    // No existing record — treat as a fresh preflight
    return runPreflight(meetingId, user);
  }

  if (participant.status === 'kicked') {
    throw Object.assign(new Error('You have been removed from this session'), { status: 403 });
  }

  participant.reconnectCount  = (participant.reconnectCount  || 0) + 1;
  participant.lastReconnectAt = new Date();
  participant.status          = 'connected';
  participant.lastSeenAt      = new Date();
  participant.monitoringActive = true;
  await participant.save();

  broadcastMonitor(meetingId, 'participant_reconnected', {
    userId:         user._id.toString(),
    reconnectCount: participant.reconnectCount,
    lastReconnectAt: participant.lastReconnectAt,
  });

  return {
    success:        true,
    reconnectCount: participant.reconnectCount,
    participantId:  participant._id,
  };
}

module.exports = { runPreflight, handleReconnect };

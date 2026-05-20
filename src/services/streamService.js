'use strict';
const { StreamClient } = require('@stream-io/node-sdk');

const STREAM_API_KEY    = process.env.STREAM_API_KEY;
const STREAM_API_SECRET = process.env.STREAM_API_SECRET;

const configured = !!(STREAM_API_KEY && STREAM_API_SECRET);
if (configured) {
  console.log('[Stream] ✓ Configured — GetStream video + chat enabled');
} else {
  console.warn('[Stream] WARNING: STREAM_API_KEY / STREAM_API_SECRET not set. GetStream disabled.');
}

function getClient() {
  if (!configured) throw new Error('GetStream is not configured. Set STREAM_API_KEY and STREAM_API_SECRET.');
  return new StreamClient(STREAM_API_KEY, STREAM_API_SECRET);
}

// Works for both video and chat (unified auth)
function generateStreamToken(userId) {
  const client = getClient();
  return client.generateUserToken({ user_id: String(userId), exp: Math.floor(Date.now() / 1000) + 7200 });
}

async function createStreamCall(callId, hostUserId = null) {
  const client = getClient();
  const call   = client.video.call('default', callId);
  const members = hostUserId ? [{ user_id: String(hostUserId), role: 'host' }] : [];
  await call.getOrCreate({
    data: {
      members,
      settings_override: {
        audio:         { default_device: 'speaker', noise_cancellation: { mode: 'disabled' } },
        video:         { enabled: true },
        screensharing: { enabled: true },
      },
    },
  });
  return call;
}

async function muteAllParticipants(callId) {
  const client = getClient();
  const call   = client.video.call('default', callId);
  await call.muteUsers({ mute_all_users: true, audio: true });
}

async function muteParticipant(callId, userId) {
  const client = getClient();
  const call   = client.video.call('default', callId);
  await call.muteUsers({ muted_user_ids: [String(userId)], audio: true });
}

async function removeParticipant(callId, userId) {
  const client = getClient();
  const call   = client.video.call('default', callId);
  await call.blockUser({ user_id: String(userId) });
}

function buildStreamRoomUrl(meeting, user, token, isMod) {
  const base = process.env.APP_BASE_URL || 'https://dikly.sbs';
  const qs   = new URLSearchParams({
    callId:    meeting.roomName,
    token,
    userId:    String(user._id),
    userName:  user.name || user.email || 'Participant',
    apiKey:    STREAM_API_KEY,
    isMod:     isMod ? '1' : '0',
    meetingId: String(meeting._id),
    title:     meeting.title,
  });
  return `${base}/stream-room.html?${qs.toString()}`;
}

module.exports = {
  configured,
  generateStreamToken,
  createStreamCall,
  muteAllParticipants,
  muteParticipant,
  removeParticipant,
  buildStreamRoomUrl,
  STREAM_API_KEY,
};

'use strict';
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');

const LIVEKIT_API_KEY    = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const LIVEKIT_URL        = process.env.LIVEKIT_URL; // wss://your-project.livekit.cloud

const configured = !!(LIVEKIT_API_KEY && LIVEKIT_API_SECRET && LIVEKIT_URL);
if (configured) {
  console.log('[LiveKit] ✓ Configured —', LIVEKIT_URL);
} else {
  console.warn('[LiveKit] WARNING: LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL not set. Video meetings disabled.');
}

function getRoomService() {
  if (!configured) throw new Error('LiveKit is not configured.');
  // LIVEKIT_URL is wss://... — RoomServiceClient needs https://
  const httpUrl = LIVEKIT_URL.replace(/^wss?:\/\//, 'https://');
  return new RoomServiceClient(httpUrl, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
}

async function generateLiveKitToken(userId, userName, roomName, isMod) {
  if (!configured) throw new Error('LiveKit is not configured.');
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: String(userId),
    name: userName || String(userId),
    ttl: '2h',
  });
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    roomAdmin: !!isMod,
  });
  return at.toJwt(); // Promise<string> in livekit-server-sdk v2
}

async function muteAllInRoom(roomName) {
  const svc = getRoomService();
  const participants = await svc.listParticipants(roomName);
  const jobs = [];
  for (const p of participants) {
    for (const track of (p.tracks || [])) {
      if (track.type === 0) { // 0 = AUDIO in protobuf enum
        jobs.push(svc.mutePublishedTrack(roomName, p.identity, track.sid, true).catch(() => {}));
      }
    }
  }
  await Promise.all(jobs);
}

async function muteParticipantInRoom(roomName, participantIdentity) {
  const svc = getRoomService();
  const p = await svc.getParticipant(roomName, participantIdentity);
  const jobs = [];
  for (const track of (p.tracks || [])) {
    if (track.type === 0) {
      jobs.push(svc.mutePublishedTrack(roomName, participantIdentity, track.sid, true).catch(() => {}));
    }
  }
  await Promise.all(jobs);
}

async function removeParticipantFromRoom(roomName, participantIdentity) {
  const svc = getRoomService();
  await svc.removeParticipant(roomName, participantIdentity);
}

function buildLiveKitRoomUrl(meeting, user, token, isMod) {
  const base = process.env.MEET_BASE_URL || process.env.APP_BASE_URL || 'https://dikly.sbs';
  const qs = new URLSearchParams({
    roomName:   meeting.roomName,
    token,
    userId:     String(user._id),
    userName:   user.name || user.email || 'Participant',
    isMod:      isMod ? '1' : '0',
    meetingId:  String(meeting._id),
    title:      meeting.title || 'Class',
    livekitUrl: LIVEKIT_URL || '',
  });
  return `${base}/stream-room.html?${qs.toString()}`;
}

module.exports = {
  configured,
  generateLiveKitToken,
  muteAllInRoom,
  muteParticipantInRoom,
  removeParticipantFromRoom,
  buildLiveKitRoomUrl,
};

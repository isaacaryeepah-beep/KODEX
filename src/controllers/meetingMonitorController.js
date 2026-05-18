'use strict';
const Meeting            = require('../models/Meeting');
const MeetingParticipant = require('../models/MeetingParticipant');

// ── SSE Registry: monitor dashboard connections ───────────────────────────────
// key: meetingId string → Set of Response objects
const monitorClients = new Map();

// ── SSE Registry: participant event subscriptions (warnings/kicks) ────────────
// key: `${meetingId}:${userId}` → Set of Response objects
const participantClients = new Map();

function sseWrite(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch(_) {}
}

// Broadcast to all monitor dashboards watching a meeting (SSE + WebSocket)
function broadcastMonitor(meetingId, event, data) {
  // SSE clients
  const clients = monitorClients.get(String(meetingId));
  if (clients) {
    for (const res of clients) sseWrite(res, event, data);
  }
  // WebSocket clients (lazy-require to avoid circular dependency at module load)
  try {
    const monitorWs = require('../services/monitorWs');
    monitorWs.broadcast(meetingId, event, data);
  } catch (_) {}
}

// Push an event to a specific participant's event stream
function broadcastParticipant(meetingId, userId, event, data) {
  const key = `${meetingId}:${userId}`;
  const clients = participantClients.get(key);
  if (!clients) return;
  for (const res of clients) sseWrite(res, event, data);
}

exports.broadcastMonitor      = broadcastMonitor;
exports.broadcastParticipant  = broadcastParticipant;

// ── Helpers ───────────────────────────────────────────────────────────────────
function isMeetingModerator(meeting, user) {
  const uid = user._id.toString();
  return (
    meeting.creatorId.toString() === uid ||
    ['admin', 'superadmin', 'hod'].includes(user.role) ||
    (meeting.invigilators || []).some(i => i.toString() === uid)
  );
}

async function buildSnapshot(meetingId) {
  const stale = new Date(Date.now() - 35000); // 35s without heartbeat → disconnected
  const rows  = await MeetingParticipant.find({
    meeting: meetingId,
    status: { $in: ['connected', 'waiting', 'disconnected'] },
  }).populate('user', 'name email role studentId').sort({ joinedAt: 1 }).lean();

  return rows.map(p => ({
    ...p,
    status: p.status === 'connected' && p.lastSeenAt < stale ? 'disconnected' : p.status,
  }));
}

// ── GET /api/meetings/:id/monitor ─────────────────────────────────────────────
exports.getMonitorData = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, company: req.user.company, isActive: true })
      .populate('creatorId',   'name email role')
      .populate('invigilators','name email role')
      .lean();
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!isMeetingModerator(meeting, req.user))
      return res.status(403).json({ error: 'Monitor access restricted to moderators and invigilators' });

    const participants = await buildSnapshot(req.params.id);
    const stats = {
      total:        participants.length,
      connected:    participants.filter(p => p.status === 'connected').length,
      disconnected: participants.filter(p => p.status === 'disconnected').length,
      waiting:      participants.filter(p => p.status === 'waiting').length,
      cameraOff:    participants.filter(p => p.cameraOff).length,
      micMuted:     participants.filter(p => p.micMuted).length,
      flagged:      participants.filter(p => p.isFlagged).length,
      screenSharing: participants.filter(p => p.screenSharing).length,
    };
    res.json({ success: true, data: { meeting, participants, stats } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/meetings/:id/monitor/stream  (SSE — moderator dashboard) ─────────
exports.monitorStream = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, company: req.user.company, isActive: true });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!isMeetingModerator(meeting, req.user))
      return res.status(403).json({ error: 'Monitor access restricted to moderators' });

    res.writeHead(200, {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache, no-transform',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const mid = String(req.params.id);
    if (!monitorClients.has(mid)) monitorClients.set(mid, new Set());
    monitorClients.get(mid).add(res);

    // Send initial snapshot
    const snapshot = await buildSnapshot(mid);
    sseWrite(res, 'snapshot', snapshot);

    const hb = setInterval(() => { try { res.write(`:ping\n\n`); } catch(_) {} }, 20000);

    req.on('close', () => {
      clearInterval(hb);
      monitorClients.get(mid)?.delete(res);
      if (monitorClients.get(mid)?.size === 0) monitorClients.delete(mid);
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/meetings/:id/participant-stream  (SSE — each participant) ────────
exports.participantStream = (req, res) => {
  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache, no-transform',
    'Connection':        'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const key = `${req.params.id}:${req.user._id}`;
  if (!participantClients.has(key)) participantClients.set(key, new Set());
  participantClients.get(key).add(res);

  const hb = setInterval(() => { try { res.write(`:ping\n\n`); } catch(_) {} }, 20000);
  req.on('close', () => {
    clearInterval(hb);
    participantClients.get(key)?.delete(res);
    if (participantClients.get(key)?.size === 0) participantClients.delete(key);
  });
};

// ── POST /api/meetings/:id/participants/status  (client heartbeat) ────────────
exports.updateParticipantStatus = async (req, res) => {
  try {
    const { cameraOff, micMuted, screenSharing, connectionQuality, jitsiParticipantId, tabSwitch } = req.body;
    const userId = req.user._id;
    const mid    = req.params.id;

    let p = await MeetingParticipant.findOne({ meeting: mid, user: userId });

    if (!p) {
      const meeting = await Meeting.findOne({ _id: mid, company: req.user.company, isActive: true });
      if (!meeting || meeting.status !== 'live') return res.status(403).json({ error: 'Meeting is not live' });
      p = new MeetingParticipant({
        meeting: mid, company: req.user.company,
        user: userId, role: req.user.role, joinedAt: new Date(),
      });
    }

    p.lastSeenAt = new Date();
    // Never un-kick a kicked participant via a status ping
    if (p.status !== 'kicked') p.status = 'connected';
    if (cameraOff         !== undefined) p.cameraOff         = cameraOff;
    if (micMuted          !== undefined) p.micMuted          = micMuted;
    if (screenSharing     !== undefined) p.screenSharing     = screenSharing;
    if (connectionQuality !== undefined) p.connectionQuality = connectionQuality;
    if (jitsiParticipantId)             p.jitsiParticipantId = jitsiParticipantId;
    if (tabSwitch)                      p.tabSwitchCount     += 1;
    await p.save();

    broadcastMonitor(mid, 'participant_status', {
      userId:            userId.toString(),
      cameraOff:         p.cameraOff,
      micMuted:          p.micMuted,
      screenSharing:     p.screenSharing,
      connectionQuality: p.connectionQuality,
      tabSwitchCount:    p.tabSwitchCount,
      lastSeenAt:        p.lastSeenAt,
      isFlagged:         p.isFlagged,
    });

    // Return unread warnings and kick signal back to participant
    const unread = (p.warnings || []).filter(w => !w.isRead).map(w => ({
      message: w.message, sentAt: w.sentAt,
    }));
    if (unread.length) {
      p.warnings.forEach(w => { w.isRead = true; });
      await p.save();
    }

    res.json({ success: true, isKicked: p.status === 'kicked', warnings: unread });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/meetings/:id/participants/:uid/flag ─────────────────────────────
exports.flagParticipant = async (req, res) => {
  try {
    const { reason = 'Suspicious activity' } = req.body;
    const p = await MeetingParticipant.findOne({ meeting: req.params.id, user: req.params.uid, company: req.user.company });
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    p.flags.push({ reason, flaggedBy: req.user._id });
    p.isFlagged = true;
    await p.save();
    broadcastMonitor(req.params.id, 'participant_flagged', { userId: req.params.uid, reason, isFlagged: true });
    res.json({ success: true, message: 'Participant flagged' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── POST /api/meetings/:id/participants/:uid/warn ─────────────────────────────
exports.sendWarning = async (req, res) => {
  try {
    const raw = req.body.message || 'Your behaviour has been noted by an invigilator. Please follow exam rules.';
    const message = String(raw).trim().slice(0, 500);
    if (!message) return res.status(400).json({ error: 'Warning message cannot be empty' });
    const p = await MeetingParticipant.findOne({ meeting: req.params.id, user: req.params.uid, company: req.user.company });
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    p.warnings.push({ message, sentBy: req.user._id, isRead: false });
    await p.save();
    broadcastMonitor(req.params.id, 'warning_sent', { userId: req.params.uid, message });
    broadcastParticipant(req.params.id, req.params.uid, 'warning', { message });
    res.json({ success: true, message: 'Warning sent' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── POST /api/meetings/:id/participants/:uid/kick ─────────────────────────────
exports.kickParticipant = async (req, res) => {
  try {
    const { reason = 'Removed by invigilator' } = req.body;
    const p = await MeetingParticipant.findOne({ meeting: req.params.id, user: req.params.uid, company: req.user.company });
    if (!p) return res.status(404).json({ error: 'Participant not found' });

    p.status = 'kicked';
    p.leftAt = new Date();
    if (p.joinedAt) p.totalMinutes = Math.round((p.leftAt - p.joinedAt) / 60000);
    await p.save();

    broadcastMonitor(req.params.id, 'participant_kicked', { userId: req.params.uid });
    broadcastParticipant(req.params.id, req.params.uid, 'kick', { reason });

    // Try Jicofo REST API if configured (best-effort)
    if (process.env.JITSI_JICOFO_URL && p.jitsiParticipantId) {
      try {
        const axios   = require('axios');
        const meeting = await Meeting.findById(req.params.id).select('roomName').lean();
        await axios.post(
          `${process.env.JITSI_JICOFO_URL}/conference/${meeting.roomName}/participants/${p.jitsiParticipantId}/kick`,
          {}, { headers: { Authorization: `Bearer ${process.env.JITSI_JICOFO_SECRET || ''}` }, timeout: 3000 }
        );
      } catch (_) { /* client-side kick via External API takes over */ }
    }

    res.json({ success: true, message: 'Participant removed from meeting' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── POST /api/meetings/:id/participants/:uid/unflag ────────────────────────────
exports.unflagParticipant = async (req, res) => {
  try {
    const p = await MeetingParticipant.findOne({ meeting: req.params.id, user: req.params.uid, company: req.user.company });
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    p.isFlagged = false;
    await p.save();
    broadcastMonitor(req.params.id, 'participant_flagged', { userId: req.params.uid, isFlagged: false });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ── POST /api/meetings/:id/invigilation-mode ──────────────────────────────────
exports.setInvigilationMode = async (req, res) => {
  try {
    const VALID_MODES = ['ai', 'human', 'hybrid'];
    const { mode } = req.body;
    if (!VALID_MODES.includes(mode)) {
      return res.status(400).json({ error: `mode must be one of: ${VALID_MODES.join(', ')}` });
    }
    const meeting = await Meeting.findOne({ _id: req.params.id, company: req.user.company, isActive: true });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!isMeetingModerator(meeting, req.user)) {
      return res.status(403).json({ error: 'Only moderators can change invigilation mode' });
    }
    meeting.invigilationMode = mode;
    await meeting.save();
    broadcastMonitor(req.params.id, 'invigilation_mode_changed', { mode });
    res.json({ success: true, mode });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

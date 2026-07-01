'use strict';
const WebSocket = require('ws');
const jwt       = require('jsonwebtoken');

// Lazy-required to avoid circular imports at module load time.
let User = null;
let SnapQuizAttempt = null;
function _models() {
  if (!User) User = require('../models/User');
  if (!SnapQuizAttempt) SnapQuizAttempt = require('../models/SnapQuizAttempt');
}

// Roles allowed to watch quiz rooms (live frames + monitoring events).
const QUIZ_VIEWER_ROLES = new Set(['lecturer', 'hod', 'admin', 'superadmin']);

// Live-frame constraints: students push one small JPEG every ~2s.
const FRAME_MIN_INTERVAL_MS = 700;
const FRAME_MAX_LENGTH      = 150_000; // ~110KB binary — far above the ~15KB typical

// ── Registry: meetingId → Set<WebSocket> ─────────────────────────────────────
const wsClients = new Map();

// ── Attach WS server to an existing HTTP server ───────────────────────────────
function attachMonitorWs(server) {
  const wss = new WebSocket.Server({ server, path: '/ws/monitor', maxPayload: 512 * 1024 });

  wss.on('connection', (ws, req) => {
    // ── Auth: validate JWT from query param ?token= ──────────────────────────
    let decoded;
    try {
      const url    = new URL(req.url, 'http://localhost');
      const token  = url.searchParams.get('token');
      if (!token) throw new Error('missing token');
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    ws.isAlive    = true;
    ws.meetingId  = null;
    ws._userId    = decoded._id || decoded.id || decoded.sub || null;

    // The JWT only carries the user id — resolve the role once per connection
    // so quiz rooms can be restricted to staff and frame publishing to students.
    _models();
    ws._rolePromise = User.findById(ws._userId).select('role').lean()
      .then(u => { ws._role = u?.role || null; return ws._role; })
      .catch(() => { ws._role = null; return null; });

    // ── Heartbeat pong ───────────────────────────────────────────────────────
    ws.on('pong', () => { ws.isAlive = true; });

    // ── Incoming messages ────────────────────────────────────────────────────
    ws.on('message', async (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch (_) { return; }

      try {
        if (msg.type === 'subscribe') {
          // Support both meeting rooms (meetingId) and quiz rooms (quizId)
          const roomId = msg.quizId
            ? `quiz::${msg.quizId}`
            : msg.meetingId
              ? String(msg.meetingId)
              : null;
          if (!roomId) return;

          // Quiz rooms carry live student camera frames — staff only.
          if (msg.quizId) {
            const role = ws._role ?? await ws._rolePromise;
            if (!QUIZ_VIEWER_ROLES.has(role)) {
              safeSend(ws, { event: 'error', message: 'Not authorised to monitor quizzes' });
              return;
            }
          }

          // Unsubscribe from previous room if any
          if (ws.meetingId && ws.meetingId !== roomId) {
            wsClients.get(ws.meetingId)?.delete(ws);
            if (wsClients.get(ws.meetingId)?.size === 0) wsClients.delete(ws.meetingId);
          }

          ws.meetingId = roomId;
          if (!wsClients.has(roomId)) wsClients.set(roomId, new Set());
          wsClients.get(roomId).add(ws);

          // Welcome acknowledgement
          safeSend(ws, { event: 'subscribed', roomId });
          return;
        }

        if (msg.type === 'publish_frame') {
          // Students stream their exam camera as small JPEG frames; the server
          // relays them to the quiz room, which only staff can subscribe to.
          const { quizId, attemptId, frame } = msg;
          if (!quizId || !attemptId) return;
          if (typeof frame !== 'string' ||
              frame.length > FRAME_MAX_LENGTH ||
              !frame.startsWith('data:image/')) return;

          const now = Date.now();
          if (now - (ws._lastFrameAt || 0) < FRAME_MIN_INTERVAL_MS) return;
          ws._lastFrameAt = now;

          const role = ws._role ?? await ws._rolePromise;
          if (role !== 'student') return;

          // Verify (once per connection) that this student owns the attempt,
          // so one student can't inject frames into another student's tile.
          if (ws._frameAttempt !== String(attemptId)) {
            const owns = await SnapQuizAttempt.exists({
              _id: attemptId, quiz: quizId, student: ws._userId, status: 'active',
            }).catch(() => null);
            if (!owns) return;
            ws._frameAttempt = String(attemptId);
          }

          broadcastMonitorWs(`quiz::${quizId}`, 'quiz:live_frame', {
            attemptId: String(attemptId),
            frame,
            ts: now,
          });
          return;
        }
      } catch (err) {
        console.error('[monitorWs] message error:', err.message);
      }
    });

    // ── Cleanup on disconnect ────────────────────────────────────────────────
    ws.on('close', () => { removeClient(ws); });
    ws.on('error', (err) => {
      console.error('[monitorWs] client error:', err.message);
      removeClient(ws);
    });
  });

  wss.on('error', (err) => {
    console.error('[monitorWs] server error:', err.message);
  });

  // ── Heartbeat interval: ping all clients every 30s ───────────────────────
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        removeClient(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => { clearInterval(heartbeat); });

  console.log('[monitorWs] WebSocket monitor service attached at /ws/monitor');
}

// ── Broadcast to all WS clients subscribed to a meeting ──────────────────────
function broadcastMonitorWs(meetingId, eventType, data) {
  const clients = wsClients.get(String(meetingId));
  if (!clients || clients.size === 0) return;
  const payload = JSON.stringify({ event: eventType, data, ts: Date.now() });
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(payload); } catch (err) {
        console.error('[monitorWs] send error:', err.message);
      }
    }
  }
}

// ── Internal: remove a client from the registry ──────────────────────────────
function removeClient(ws) {
  if (!ws.meetingId) return;
  const set = wsClients.get(ws.meetingId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) wsClients.delete(ws.meetingId);
}

// ── Internal: safe JSON send ──────────────────────────────────────────────────
function safeSend(ws, obj) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try { ws.send(JSON.stringify(obj)); } catch (err) {
    console.error('[monitorWs] safeSend error:', err.message);
  }
}

// Generic alias used by snapQuizBroadcast and other services
const broadcast = broadcastMonitorWs;

module.exports = { attachMonitorWs, broadcastMonitorWs, broadcast };

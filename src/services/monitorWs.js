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

// Watch-gated streaming: at 200 students per exam, streaming everyone to
// everyone is unusable (lecturer bandwidth) and wasteful (student data
// bundles). Students only stream while a dashboard explicitly watches them,
// and each quiz has a hard cap on concurrent live feeds.
const MAX_WATCH_PER_QUIZ = 15;

// ── Registries ────────────────────────────────────────────────────────────────
const wsClients      = new Map(); // roomId  → Set<WebSocket>            (viewers)
const quizPublishers = new Map(); // quizId  → Map<attemptId, WebSocket> (students)
const quizWatch      = new Map(); // quizId  → Set<attemptId>            (live now)

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
        switch (msg.type) {
          case 'subscribe':        return await handleSubscribe(ws, msg);
          case 'register_publisher': return await handleRegisterPublisher(ws, msg);
          case 'publish_frame':    return handlePublishFrame(ws, msg);
          case 'watch':            return await handleWatch(ws, msg);
        }
      } catch (err) {
        console.error('[monitorWs] message error:', err.message);
      }
    });

    // ── Cleanup on disconnect ────────────────────────────────────────────────
    ws.on('close', () => { removeClient(ws); removePublisher(ws); });
    ws.on('error', (err) => {
      console.error('[monitorWs] client error:', err.message);
      removeClient(ws);
      removePublisher(ws);
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
        removePublisher(ws);
        return ws.terminate();
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => { clearInterval(heartbeat); });

  console.log('[monitorWs] WebSocket monitor service attached at /ws/monitor');
}

// ── Message handlers ──────────────────────────────────────────────────────────

async function handleSubscribe(ws, msg) {
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
    const prevRoom = ws.meetingId;
    wsClients.get(prevRoom)?.delete(ws);
    if (wsClients.get(prevRoom)?.size === 0) {
      wsClients.delete(prevRoom);
      stopAllStreamsIfUnwatched(prevRoom);
    }
  }

  ws.meetingId = roomId;
  if (!wsClients.has(roomId)) wsClients.set(roomId, new Set());
  wsClients.get(roomId).add(ws);

  safeSend(ws, { event: 'subscribed', roomId });
}

// Student announces "I'm in this exam and can stream when asked".
async function handleRegisterPublisher(ws, msg) {
  const { quizId, attemptId } = msg;
  if (!quizId || !attemptId) return;

  const role = ws._role ?? await ws._rolePromise;
  if (role !== 'student') return;

  // Verify the student owns the active attempt so one student can't
  // impersonate another student's camera tile.
  const owns = await SnapQuizAttempt.exists({
    _id: attemptId, quiz: quizId, student: ws._userId, status: 'active',
  }).catch(() => null);
  if (!owns) return;

  removePublisher(ws); // in case of re-register on the same socket

  ws._publishQuiz    = String(quizId);
  ws._publishAttempt = String(attemptId);
  if (!quizPublishers.has(ws._publishQuiz)) quizPublishers.set(ws._publishQuiz, new Map());
  quizPublishers.get(ws._publishQuiz).set(ws._publishAttempt, ws);

  safeSend(ws, { event: 'publisher_registered' });

  // If a dashboard is already watching this student, start immediately.
  if (quizWatch.get(ws._publishQuiz)?.has(ws._publishAttempt)) {
    safeSend(ws, { event: 'stream_start' });
  }
}

function handlePublishFrame(ws, msg) {
  const { frame } = msg;
  // Must have registered first (which proved ownership of the attempt).
  const quizId    = ws._publishQuiz;
  const attemptId = ws._publishAttempt;
  if (!quizId || !attemptId) return;

  // Gate: only relay while a dashboard is actually watching this student.
  if (!quizWatch.get(quizId)?.has(attemptId)) return;

  if (typeof frame !== 'string' ||
      frame.length > FRAME_MAX_LENGTH ||
      !frame.startsWith('data:image/')) return;

  const now = Date.now();
  if (now - (ws._lastFrameAt || 0) < FRAME_MIN_INTERVAL_MS) return;
  ws._lastFrameAt = now;

  broadcastMonitorWs(`quiz::${quizId}`, 'quiz:live_frame', {
    attemptId,
    frame,
    ts: now,
  });
}

// Dashboard declares the set of students it wants live right now.
// Last-writer-wins when multiple dashboards watch the same quiz — rare, and
// the alternative (per-viewer union bookkeeping) isn't worth the complexity.
async function handleWatch(ws, msg) {
  const { quizId } = msg;
  if (!quizId) return;

  const role = ws._role ?? await ws._rolePromise;
  if (!QUIZ_VIEWER_ROLES.has(role)) return;

  const wanted = new Set(
    (Array.isArray(msg.attemptIds) ? msg.attemptIds : [])
      .slice(0, MAX_WATCH_PER_QUIZ)
      .map(String)
  );

  const key  = String(quizId);
  const prev = quizWatch.get(key) || new Set();
  quizWatch.set(key, wanted);

  const publishers = quizPublishers.get(key);
  if (!publishers) return;

  for (const attemptId of wanted) {
    if (!prev.has(attemptId)) {
      const pub = publishers.get(attemptId);
      if (pub) safeSend(pub, { event: 'stream_start' });
    }
  }
  for (const attemptId of prev) {
    if (!wanted.has(attemptId)) {
      const pub = publishers.get(attemptId);
      if (pub) safeSend(pub, { event: 'stream_stop' });
    }
  }
}

// When the last dashboard leaves a quiz room, tell every streaming student
// to stop — no viewer means no reason to spend their data.
function stopAllStreamsIfUnwatched(roomId) {
  if (!roomId.startsWith('quiz::')) return;
  const quizId = roomId.slice('quiz::'.length);
  const watched = quizWatch.get(quizId);
  if (!watched || watched.size === 0) { quizWatch.delete(quizId); return; }
  quizWatch.delete(quizId);
  const publishers = quizPublishers.get(quizId);
  if (!publishers) return;
  for (const attemptId of watched) {
    const pub = publishers.get(attemptId);
    if (pub) safeSend(pub, { event: 'stream_stop' });
  }
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

// ── Internal: remove a viewer from the registry ───────────────────────────────
function removeClient(ws) {
  if (!ws.meetingId) return;
  const set = wsClients.get(ws.meetingId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) {
    wsClients.delete(ws.meetingId);
    stopAllStreamsIfUnwatched(ws.meetingId);
  }
}

// ── Internal: remove a student publisher from the registry ────────────────────
function removePublisher(ws) {
  if (!ws._publishQuiz || !ws._publishAttempt) return;
  const map = quizPublishers.get(ws._publishQuiz);
  if (map && map.get(ws._publishAttempt) === ws) {
    map.delete(ws._publishAttempt);
    if (map.size === 0) quizPublishers.delete(ws._publishQuiz);
  }
  ws._publishQuiz = null;
  ws._publishAttempt = null;
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

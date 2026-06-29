'use strict';
const WebSocket = require('ws');
const jwt       = require('jsonwebtoken');

// ── Registry: meetingId → Set<WebSocket> ─────────────────────────────────────
const wsClients = new Map();

// ── Attach WS server to an existing HTTP server ───────────────────────────────
function attachMonitorWs(server) {
  const wss = new WebSocket.Server({ server, path: '/ws/monitor' });

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

    // ── Heartbeat pong ───────────────────────────────────────────────────────
    ws.on('pong', () => { ws.isAlive = true; });

    // ── Incoming messages ────────────────────────────────────────────────────
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw); } catch (_) { return; }

      if (msg.type === 'subscribe') {
        // Support both meeting rooms (meetingId) and quiz rooms (quizId)
        const roomId = msg.quizId
          ? `quiz::${msg.quizId}`
          : msg.meetingId
            ? String(msg.meetingId)
            : null;
        if (!roomId) return;

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

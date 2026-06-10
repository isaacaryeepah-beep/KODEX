'use strict';
const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');

// meetingId → Set<WebSocket>
const rooms = new Map();

function _getRoomClients(meetingId) {
  const key = String(meetingId);
  if (!rooms.has(key)) rooms.set(key, new Set());
  return rooms.get(key);
}

function _removeClient(ws) {
  for (const [key, clients] of rooms) {
    clients.delete(ws);
    if (clients.size === 0) rooms.delete(key);
  }
}

function _send(ws, type, payload) {
  if (ws.readyState !== ws.OPEN) return;
  try { ws.send(JSON.stringify({ type, payload })); } catch (_) {}
}

/**
 * Broadcast a monitoring event to every dashboard connected to meetingId.
 * Called from meetingMonitorController when participant state changes.
 */
function broadcast(meetingId, type, payload) {
  const clients = rooms.get(String(meetingId));
  if (!clients) return;
  const msg = JSON.stringify({ type, payload });
  for (const ws of clients) {
    if (ws.readyState === ws.OPEN) {
      try { ws.send(msg); } catch (_) {}
    }
  }
}

/**
 * Attach the WebSocket monitoring server to an existing HTTP server.
 * Clients connect to wss://monitor.dikly.live/ws/monitor?token=<JWT>
 *
 * After connection, client sends:
 *   { type: 'subscribe', meetingId: '<id>' }
 * and receives:
 *   { type: 'subscribed', payload: { meetingId } }
 *   { type: '<event>', payload: { ... } }   ← broadcasts from backend
 */
function attachToServer(httpServer) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws/monitor') return;

    const token = url.searchParams.get('token');
    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const User = require('../models/User');
    let dbUser;
    try {
      dbUser = await User.findById(decoded.id).select('role company isActive').lean();
    } catch {
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!dbUser || !dbUser.isActive) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    const MONITOR_ROLES = ['lecturer', 'manager', 'admin', 'superadmin', 'hod'];
    if (!MONITOR_ROLES.includes((dbUser.role || '').toLowerCase())) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, ws => {
      ws._user = { id: dbUser._id, role: dbUser.role, company: String(dbUser.company) };
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', ws => {
    // 30-second heartbeat: send ping, expect pong within 10s
    ws._alive = true;
    ws.on('pong', () => { ws._alive = true; });

    const hb = setInterval(() => {
      if (!ws._alive) { ws.terminate(); return; }
      ws._alive = false;
      try { ws.ping(); } catch (_) {}
    }, 30000);

    ws.on('message', raw => {
      let msg;
      try { msg = JSON.parse(raw); } catch { return; }

      if (msg.type === 'subscribe' && msg.meetingId) {
        // Remove from any previous room, then subscribe to new one
        _removeClient(ws);
        _getRoomClients(msg.meetingId).add(ws);
        ws._meetingId = String(msg.meetingId);
        _send(ws, 'subscribed', { meetingId: ws._meetingId });
      }

      // Quiz monitoring room — keyed as "quiz::<quizId>"
      if (msg.type === 'subscribe' && msg.quizId) {
        _removeClient(ws);
        const roomId = `quiz::${msg.quizId}`;
        _getRoomClients(roomId).add(ws);
        ws._quizId = String(msg.quizId);
        _send(ws, 'subscribed', { quizId: ws._quizId });
      }
    });

    ws.on('close', () => {
      clearInterval(hb);
      _removeClient(ws);
    });

    ws.on('error', () => {
      clearInterval(hb);
      _removeClient(ws);
    });
  });

  return wss;
}

module.exports = { attachToServer, broadcast };

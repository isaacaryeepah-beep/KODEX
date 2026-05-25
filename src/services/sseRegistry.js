"use strict";

/**
 * sseRegistry.js
 *
 * In-memory registry of open SSE connections keyed by userId (string).
 * The notification service calls push() after every Notification.create()
 * so the browser receives the event instantly without polling.
 *
 * Memory: each entry is a Set of Node http.ServerResponse objects.
 * Entries are removed automatically when the client disconnects.
 */

const clients = new Map(); // userId (string) → Set<res>

exports.add = (userId, res) => {
  const key = userId.toString();
  if (!clients.has(key)) clients.set(key, new Set());
  clients.get(key).add(res);
};

exports.remove = (userId, res) => {
  const key = userId.toString();
  const set  = clients.get(key);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) clients.delete(key);
};

/**
 * Push an event to every open connection for the given user.
 * `payload` is serialised to JSON and wrapped in SSE `data:` framing.
 */
exports.push = (userId, payload) => {
  const key = userId.toString();
  const set  = clients.get(key);
  if (!set || set.size === 0) return;
  const frame = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) {
    try { res.write(frame); } catch (_) { /* client already gone */ }
  }
};

exports.connectionCount = () => {
  let n = 0;
  for (const set of clients.values()) n += set.size;
  return n;
};

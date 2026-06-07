"use strict";

/**
 * snapQuizBroadcast
 *
 * Thin wrapper around the existing monitorWs broadcast function that
 * namespaces quiz events with a "quiz::" prefix so they don't collide
 * with meeting events in the same WebSocket server.
 *
 * Lecturers subscribe by sending:
 *   { type: "subscribe", quizId: "<id>" }
 * which maps to a room key of "quiz::<id>".
 *
 * Events emitted to the room:
 *   attempt_started          — student opened the quiz
 *   attempt_auto_submitted   — watchdog forced submission
 *   violation_logged         — anti-cheat event captured
 *   heartbeat_missed         — student went silent
 *   snapshot_analyzed        — AI proctoring result ready
 *   attempt_submitted        — student clicked Submit
 *   integrity_alert          — high-risk AI score detected
 */

const { broadcast } = require("./monitorWs");

/**
 * Broadcast a quiz monitoring event to all WebSocket clients watching quizId.
 *
 * @param {string} quizId
 * @param {string} eventType  — one of the event names listed above
 * @param {object} payload    — event-specific data
 */
function broadcastQuizEvent(quizId, eventType, payload) {
  const roomId = `quiz::${quizId}`;
  broadcast(roomId, `quiz:${eventType}`, { ...payload, quizId });
}

module.exports = { broadcastQuizEvent };

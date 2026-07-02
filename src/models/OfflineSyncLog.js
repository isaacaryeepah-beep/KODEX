"use strict";

/**
 * OfflineSyncLog
 *
 * Tracks each offline sync session for a SnapQuiz attempt.
 * Clients that lose connectivity buffer events, screen-recording chunks,
 * and beacon pings locally, then flush them to these endpoints once
 * connectivity is restored.  This document aggregates everything that
 * arrived for one attemptId so the lecturer review panel can reconstruct
 * a complete picture of the session even when it was taken offline.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const eventSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      maxlength: 128,
    },
    type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    severity: {
      type: String,
      // Covers both naming schemes in use: the offline monitor client sends
      // low/medium/high; older callers send info/warning/critical.
      enum: ["info", "warning", "critical", "low", "medium", "high"],
      default: "info",
    },
    timestamp: {
      type: Number, // epoch ms supplied by the client
      default: null,
    },
    isoTime: {
      type: String,
      default: null,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    integrityAt: {
      type: Number, // integrity score at the moment of the event
      default: null,
    },
  },
  { _id: false }
);

const chunkSchema = new mongoose.Schema(
  {
    chunkIndex: {
      type: Number,
      required: true,
    },
    uploadId: {
      type: String,
      required: true,
      maxlength: 128,
    },
    storedAt: {
      type: Date,
      default: Date.now,
    },
    filePath: {
      type: String,
      default: null,
    },
    durationMs: {
      type: Number,
      default: null,
    },
    mimeType: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const syncHistorySchema = new mongoose.Schema(
  {
    syncedAt: {
      type: Date,
      default: Date.now,
    },
    eventsCount: {
      type: Number,
      default: 0,
    },
    chunksCount: {
      type: Number,
      default: 0,
    },
    ip: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const beaconEventSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      default: null,
    },
    ts: {
      type: Number, // client-supplied epoch ms
      default: null,
    },
    ip: {
      type: String,
      default: null,
    },
    receivedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const offlineSyncLogSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────
    attemptId: {
      type: String,
      required: [true, "attemptId is required"],
      index: true,
    },
    quizId: {
      type: String,
      default: null,
    },

    // ── Buffered events ───────────────────────────────────────────────────
    events: {
      type: [eventSchema],
      default: [],
    },

    // ── Integrity ─────────────────────────────────────────────────────────
    integrityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },

    // ── Device fingerprint ────────────────────────────────────────────────
    // Stores ua, platform, screen, capacitor flags, etc.  Mixed so the
    // client can evolve the payload without a schema migration.
    deviceInfo: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ── Media chunks ──────────────────────────────────────────────────────
    chunks: {
      type: [chunkSchema],
      default: [],
    },

    // ── Sync audit trail ──────────────────────────────────────────────────
    syncHistory: {
      type: [syncHistorySchema],
      default: [],
    },

    // ── Beacon pings ──────────────────────────────────────────────────────
    beaconEvents: {
      type: [beaconEventSchema],
      default: [],
    },

    // ── Lifecycle ─────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ["pending", "partial", "complete"],
      default: "pending",
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ---------------------------------------------------------------------------
// Compound indexes
// ---------------------------------------------------------------------------

// Fast lookup by attempt + creation time (most common query pattern).
offlineSyncLogSchema.index({ attemptId: 1, createdAt: -1 });

// Support filtering logs by quiz across all attempts.
offlineSyncLogSchema.index({ quizId: 1, createdAt: -1 });

// Status-based queries (e.g. "find all partial syncs older than 1 h").
offlineSyncLogSchema.index({ status: 1, updatedAt: -1 });

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

const OfflineSyncLog = mongoose.model("OfflineSyncLog", offlineSyncLogSchema);

module.exports = OfflineSyncLog;

"use strict";

/**
 * offlineSyncController
 *
 * Handles all offline-sync endpoints for SnapQuiz attempts.
 *
 * Endpoints:
 *   POST /:attemptId/events   — flush buffered anti-cheat / proctoring events
 *   POST /:attemptId/chunk    — upload one screen-recording chunk (multipart)
 *   POST /:attemptId/beacon   — fire-and-forget unload beacon
 *   GET  /:attemptId/status   — current sync state (lecturer / student poll)
 */

const path = require("path");
const fs   = require("fs");

const OfflineSyncLog = require("../models/OfflineSyncLog");

// SnapQuizViolationLog is optional — only import if the model file exists.
let SnapQuizViolationLog = null;
try {
  SnapQuizViolationLog = require("../models/SnapQuizViolationLog");
} catch (_) {
  // model not available in this deployment — violation mirroring skipped
}

// ---------------------------------------------------------------------------
// Helper — derive client IP respecting reverse-proxy headers
// ---------------------------------------------------------------------------

function clientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || null;
}

// ---------------------------------------------------------------------------
// Helper — resolve MIME type to a safe file extension
// ---------------------------------------------------------------------------

function extFromMime(mime) {
  const map = {
    "video/webm": ".webm",
    "video/mp4":  ".mp4",
  };
  return map[mime] || ".bin";
}

// ---------------------------------------------------------------------------
// 1. syncEvents
//    POST /api/offline-sync/:attemptId/events
//    Auth required.
// ---------------------------------------------------------------------------

exports.syncEvents = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const {
      events      = [],
      integrityScore,
      deviceInfo,
      quizId,
    } = req.body;

    if (!Array.isArray(events)) {
      return res.status(400).json({ error: "events must be an array" });
    }

    if (!attemptId) {
      return res.status(400).json({ error: "attemptId is required" });
    }

    // Load existing document (if any) so we can dedup by event.id.
    let syncLog = await OfflineSyncLog.findOne({ attemptId });

    const existingIds = new Set(
      syncLog ? syncLog.events.map((e) => e.id) : []
    );

    const newEvents  = [];
    let   duplicates = 0;

    for (const ev of events) {
      if (!ev || !ev.id) continue; // malformed — skip silently
      if (existingIds.has(ev.id)) {
        duplicates++;
        continue;
      }
      existingIds.add(ev.id);
      newEvents.push({
        id:          ev.id,
        type:        ev.type        || "unknown",
        severity:    ev.severity    || "info",
        timestamp:   ev.timestamp   || null,
        isoTime:     ev.isoTime     || null,
        metadata:    ev.metadata    || null,
        integrityAt: ev.integrityAt || null,
      });
    }

    const ip         = clientIp(req);
    const syncedAt   = new Date();
    const totalEvents = (syncLog ? syncLog.events.length : 0) + newEvents.length;
    const totalChunks = syncLog ? syncLog.chunks.length : 0;

    // Determine updated status.
    const newStatus =
      totalEvents > 0 || totalChunks > 0 ? "partial" : "pending";

    const historyEntry = {
      syncedAt,
      eventsCount: newEvents.length,
      chunksCount: 0,
      ip,
    };

    if (syncLog) {
      // Update existing document.
      if (newEvents.length > 0) {
        syncLog.events.push(...newEvents);
      }
      if (integrityScore !== undefined && integrityScore !== null) {
        syncLog.integrityScore = integrityScore;
      }
      if (deviceInfo && typeof deviceInfo === "object") {
        syncLog.deviceInfo = deviceInfo;
      }
      if (quizId && !syncLog.quizId) {
        syncLog.quizId = quizId;
      }
      syncLog.syncHistory.push(historyEntry);
      syncLog.status = newStatus;
      await syncLog.save();
    } else {
      // Create new document.
      syncLog = await OfflineSyncLog.create({
        attemptId,
        quizId:        quizId || null,
        events:        newEvents,
        integrityScore: integrityScore !== undefined ? integrityScore : null,
        deviceInfo:    deviceInfo || null,
        chunks:        [],
        syncHistory:   [historyEntry],
        beaconEvents:  [],
        status:        newStatus,
      });
    }

    // Mirror critical/warning events into SnapQuizViolationLog when possible.
    // We wrap in try/catch so a schema mismatch never breaks the sync response.
    if (SnapQuizViolationLog && newEvents.length > 0 && req.user) {
      try {
        const mirrored = newEvents
          .filter((e) => e.severity === "critical" || e.severity === "warning")
          .map((e) => ({
            // SnapQuizViolationLog uses ObjectId refs, but offline events
            // may only carry string IDs — store what we have and let the
            // reviewer panel reconcile.
            attempt:      syncLog.quizId ? undefined : undefined, // resolved below
            quiz:         syncLog.quizId || undefined,
            student:      req.user._id,
            company:      req.user.company || undefined,
            violationType: e.type || "other",
            severity:     e.severity,
            detail: e.metadata
              ? JSON.stringify(e.metadata).slice(0, 500)
              : `offline event id=${e.id}`,
            occurredAt: e.timestamp ? new Date(e.timestamp) : new Date(),
            actionTaken: "logged",
          }));

        if (mirrored.length > 0 && mirrored[0].company) {
          await SnapQuizViolationLog.insertMany(mirrored, { ordered: false }).catch(() => {});
        }
      } catch (_) {
        // Violation mirroring is best-effort — never fail the sync.
      }
    }

    return res.status(200).json({
      ok:         true,
      received:   newEvents.length,
      duplicates,
    });
  } catch (err) {
    console.error("[offlineSync] syncEvents error:", err);
    return res.status(500).json({ error: "Failed to sync events" });
  }
};

// ---------------------------------------------------------------------------
// 2. syncChunk
//    POST /api/offline-sync/:attemptId/chunk
//    Auth required.  Multer middleware is applied in the router.
// ---------------------------------------------------------------------------

exports.syncChunk = async (req, res) => {
  try {
    const { attemptId } = req.params;
    const {
      chunkIndex,
      uploadId,
      startMs,
      durationMs,
      mimeType,
    } = req.body;

    if (!attemptId) {
      return res.status(400).json({ error: "attemptId is required" });
    }
    if (uploadId === undefined || uploadId === null || uploadId === "") {
      return res.status(400).json({ error: "uploadId is required" });
    }

    const parsedIndex    = parseInt(chunkIndex, 10);
    const parsedDuration = durationMs ? parseInt(durationMs, 10) : null;

    // Dedup: reject if we already stored a chunk with this uploadId.
    const existing = await OfflineSyncLog.findOne(
      { attemptId, "chunks.uploadId": uploadId },
      { _id: 1 }
    );

    if (existing) {
      // Remove the uploaded file from disk — it's a duplicate.
      if (req.file && req.file.path) {
        fs.unlink(req.file.path, () => {});
      }
      return res.status(200).json({ ok: true, duplicate: true });
    }

    const filePath = req.file ? req.file.path : null;
    const resolvedMime = mimeType || (req.file ? req.file.mimetype : null);

    const chunkRecord = {
      chunkIndex:  isNaN(parsedIndex) ? 0 : parsedIndex,
      uploadId,
      storedAt:    new Date(),
      filePath,
      durationMs:  parsedDuration,
      mimeType:    resolvedMime,
    };

    await OfflineSyncLog.findOneAndUpdate(
      { attemptId },
      {
        $push: { chunks: chunkRecord },
        $set:  { status: "partial" },
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({ ok: true, stored: true });
  } catch (err) {
    console.error("[offlineSync] syncChunk error:", err);
    // Clean up file if we errored after multer wrote it.
    if (req.file && req.file.path) {
      fs.unlink(req.file.path, () => {});
    }
    return res.status(500).json({ error: "Failed to store chunk" });
  }
};

// ---------------------------------------------------------------------------
// 3. handleBeacon
//    POST /api/offline-sync/:attemptId/beacon
//    No auth — navigator.sendBeacon() fires after the page is unloading.
//    Always returns 204 so the browser doesn't wait.
// ---------------------------------------------------------------------------

exports.handleBeacon = async (req, res) => {
  // Respond immediately — beacon is fire-and-forget.
  res.status(204).end();

  try {
    const { attemptId } = req.params;
    if (!attemptId) return;

    // sendBeacon sends Content-Type: text/plain, so the body arrives as a
    // raw string.  express.json() won't parse it — we must do it ourselves.
    let payload = {};
    if (req.body) {
      if (typeof req.body === "string") {
        try { payload = JSON.parse(req.body); } catch (_) {}
      } else if (typeof req.body === "object") {
        payload = req.body;
      }
    }

    const beaconEntry = {
      type:       payload.type       || null,
      ts:         payload.ts         || null,
      ip:         clientIp(req),
      receivedAt: new Date(),
    };

    await OfflineSyncLog.findOneAndUpdate(
      { attemptId },
      { $push: { beaconEvents: beaconEntry } },
      { upsert: true }
    );
  } catch (err) {
    // Never throw — response already sent.
    console.error("[offlineSync] handleBeacon error:", err);
  }
};

// ---------------------------------------------------------------------------
// 4. getSyncStatus
//    GET /api/offline-sync/:attemptId/status
//    Auth required.
// ---------------------------------------------------------------------------

exports.getSyncStatus = async (req, res) => {
  try {
    const { attemptId } = req.params;

    if (!attemptId) {
      return res.status(400).json({ error: "attemptId is required" });
    }

    const syncLog = await OfflineSyncLog.findOne({ attemptId })
      .select("attemptId status integrityScore events chunks syncHistory")
      .lean();

    if (!syncLog) {
      return res.status(404).json({ error: "No sync log found for this attemptId" });
    }

    return res.status(200).json({
      attemptId:      syncLog.attemptId,
      status:         syncLog.status,
      integrityScore: syncLog.integrityScore,
      eventsCount:    syncLog.events  ? syncLog.events.length  : 0,
      chunksCount:    syncLog.chunks  ? syncLog.chunks.length  : 0,
      syncHistory:    syncLog.syncHistory || [],
    });
  } catch (err) {
    console.error("[offlineSync] getSyncStatus error:", err);
    return res.status(500).json({ error: "Failed to retrieve sync status" });
  }
};

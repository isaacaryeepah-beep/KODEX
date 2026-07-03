"use strict";

/**
 * Offline-sync routes
 *
 * Mounted at /api/offline-sync  (add to server.js)
 *
 * POST /:attemptId/events   — flush buffered events        (auth required)
 * POST /:attemptId/chunk    — upload one recording chunk   (auth required)
 * POST /:attemptId/beacon   — unload beacon                (no auth)
 * GET  /:attemptId/status   — sync state                   (auth required)
 */

const express  = require("express");
const multer   = require("multer");

const authenticate          = require("../middleware/auth");
const { beaconLimiter }     = require("../middleware/rateLimiter");
const ctrl                  = require("../controllers/offlineSyncController");

const router = express.Router();

// ---------------------------------------------------------------------------
// Multer — memory storage for recording chunks. The controller decides
// where the buffer ends up via documentStorage.js (see offlineSyncController
// syncChunk), so this file no longer touches the filesystem directly.
// ---------------------------------------------------------------------------

const ALLOWED_VIDEO_MIMES = new Set(["video/webm", "video/mp4"]);

function videoFileFilter(req, file, cb) {
  if (ALLOWED_VIDEO_MIMES.has(file.mimetype)) {
    return cb(null, true);
  }
  cb(
    new multer.MulterError(
      "LIMIT_UNEXPECTED_FILE",
      "Only video/webm and video/mp4 chunks are accepted"
    ),
    false
  );
}

const uploadChunk = multer({
  storage:    multer.memoryStorage(),
  fileFilter: videoFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per chunk
    files:    1,
  },
});

// Multer error handler — converts MulterError to a JSON 400 response so the
// client gets a meaningful message instead of an HTML error page.
function handleMulterError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Chunk exceeds 10 MB limit" });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ error: err.message || "Upload failed" });
  }
  next();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// POST /:attemptId/events — authenticated, any role that can take a quiz
router.post(
  "/:attemptId/events",
  authenticate,
  ctrl.syncEvents
);

// POST /:attemptId/chunk — authenticated, multer single-file upload
router.post(
  "/:attemptId/chunk",
  authenticate,
  (req, res, next) => {
    // Run multer inline so the error handler in this router can catch it.
    uploadChunk.single("chunk")(req, res, (err) => {
      if (err) return handleMulterError(err, req, res, next);
      next();
    });
  },
  ctrl.syncChunk
);

// POST /:attemptId/beacon — no auth (sendBeacon fires during page unload)
// express.text() is registered only for this route because sendBeacon sends
// Content-Type: text/plain.  The global express.json() parser is bypassed.
router.post(
  "/:attemptId/beacon",
  beaconLimiter,
  express.text({ type: "*/*", limit: "64kb" }),
  ctrl.handleBeacon
);

// GET /:attemptId/status — authenticated, lecturers / admins / superadmins
// Students can also query their own status (no role restriction needed here —
// the controller only returns the document, not raw events/chunks).
router.get(
  "/:attemptId/status",
  authenticate,
  ctrl.getSyncStatus
);

// ---------------------------------------------------------------------------

module.exports = router;

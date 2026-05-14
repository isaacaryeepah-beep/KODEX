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
const path     = require("path");
const fs       = require("fs");
const multer   = require("multer");

const authenticate  = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const ctrl          = require("../controllers/offlineSyncController");

const router = express.Router();

// ---------------------------------------------------------------------------
// Multer — disk storage for recording chunks
// ---------------------------------------------------------------------------

const UPLOAD_ROOT       = path.join(__dirname, "../../uploads");
const RECORDINGS_ROOT   = path.join(UPLOAD_ROOT, "recordings");

// Ensure the base recordings directory exists at startup.
if (!fs.existsSync(RECORDINGS_ROOT)) {
  fs.mkdirSync(RECORDINGS_ROOT, { recursive: true });
}

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

const chunkStorage = multer.diskStorage({
  destination(req, file, cb) {
    // Per-attempt subdirectory keeps chunks grouped and avoids a flat
    // directory with potentially thousands of files.
    const attemptId = req.params.attemptId || "unknown";
    // Sanitise attemptId so it can safely be used as a directory name.
    const safeName  = attemptId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64);
    const dest      = path.join(RECORDINGS_ROOT, safeName);

    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    cb(null, dest);
  },

  filename(req, file, cb) {
    const chunkIndex = req.body.chunkIndex !== undefined
      ? parseInt(req.body.chunkIndex, 10)
      : 0;
    const ext = file.mimetype === "video/mp4" ? ".mp4" : ".webm";
    cb(null, `chunk_${chunkIndex}_${Date.now()}${ext}`);
  },
});

const uploadChunk = multer({
  storage:    chunkStorage,
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

const multer = require("multer");

// ── Allowed MIME types ────────────────────────────────────────────────────
const ALLOWED_MIMES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
];

function fileFilter(req, file, cb) {
  if (ALLOWED_MIMES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, Word, PowerPoint and image files are allowed"), false);
  }
}

// Memory storage — the controller decides where the buffer ends up via
// documentStorage.js (local disk today, swappable for R2/S3 later without
// touching this file or the controller's call sites).
const uploadBrief = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
}).single("pdf");

const uploadSubmission = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
}).single("file");

module.exports = { uploadBrief, uploadSubmission };

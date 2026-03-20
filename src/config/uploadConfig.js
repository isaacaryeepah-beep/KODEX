const multer = require("multer");
const path   = require("path");
const fs     = require("fs");
const { v4: uuidv4 } = require("uuid");

// ── Ensure upload directories exist ──────────────────────────────────────
const UPLOAD_ROOT   = path.join(__dirname, "../../uploads");
const BRIEF_DIR     = path.join(UPLOAD_ROOT, "assignment-briefs");
const SUBMISSION_DIR= path.join(UPLOAD_ROOT, "assignment-submissions");

[UPLOAD_ROOT, BRIEF_DIR, SUBMISSION_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Storage engine for PDF briefs ─────────────────────────────────────────
const briefStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BRIEF_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
    cb(null, `brief-${uuidv4()}${ext}`);
  },
});

// ── Storage engine for student submissions ────────────────────────────────
const submissionStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, SUBMISSION_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".pdf";
    cb(null, `sub-${uuidv4()}${ext}`);
  },
});

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

// ── Exported middleware ───────────────────────────────────────────────────
const uploadBrief = multer({
  storage: briefStorage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
}).single("pdf");

const uploadSubmission = multer({
  storage: submissionStorage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
}).single("file");

module.exports = { uploadBrief, uploadSubmission, BRIEF_DIR, SUBMISSION_DIR };

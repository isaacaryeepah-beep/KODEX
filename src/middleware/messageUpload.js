'use strict';

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const MAX_SIZE_MB = parseInt(process.env.MSG_FILE_MAX_MB || '10', 10);
const UPLOAD_DIR  = process.env.MSG_FILE_DIR || 'uploads/messages';

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = crypto.randomBytes(12).toString('hex');
    const ext    = path.extname(file.originalname).toLowerCase();
    cb(null, `msg_${unique}${ext}`);
  },
});

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXT  = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif'];

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME.includes(file.mimetype) || !ALLOWED_EXT.includes(ext)) {
    return cb(new Error('Only images (JPG, PNG, WebP, GIF) and PDF files are allowed.'), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

exports.uploadMessage = upload.single('attachment');

exports.handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `File must be under ${MAX_SIZE_MB}MB.` });
    }
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message });
  next();
};

exports.UPLOAD_DIR  = UPLOAD_DIR;
exports.MAX_SIZE_MB = MAX_SIZE_MB;

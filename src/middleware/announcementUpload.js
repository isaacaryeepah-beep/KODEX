const multer = require('multer');
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const MAX_SIZE_MB  = parseInt(process.env.ANNOUNCE_PDF_MAX_MB  || '10', 10);
const UPLOAD_DIR   = process.env.ANNOUNCE_PDF_DIR || 'uploads/announcements';

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const unique = crypto.randomBytes(12).toString('hex');
    const ext    = path.extname(file.originalname).toLowerCase();
    cb(null, `ann_${unique}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const allowed = ['application/pdf'];
  const allowedExt = ['.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (!allowed.includes(file.mimetype) || !allowedExt.includes(ext)) {
    return cb(new Error('Only PDF files are allowed.'), false);
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

// Single PDF field named "attachment"
exports.uploadAnnouncement = upload.single('attachment');

// Error handler to be used after multer middleware
exports.handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `PDF file must be under ${MAX_SIZE_MB}MB.`,
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

exports.UPLOAD_DIR = UPLOAD_DIR;

const multer = require('multer');
const path   = require('path');

// 5 MB max — base64 in MongoDB stays well under the 16 MB document limit
const MAX_SIZE_MB = parseInt(process.env.ANNOUNCE_FILE_MAX_MB || '5', 10);

const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXT  = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif'];

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIME.includes(file.mimetype) || !ALLOWED_EXT.includes(ext)) {
    return cb(new Error('Only PDF and image files (JPG, PNG, WebP, GIF) are allowed.'), false);
  }
  cb(null, true);
}

// Use memory storage — file bytes go into req.file.buffer, never touch disk
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

exports.uploadAnnouncement = upload.single('attachment');

exports.handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File must be under ${MAX_SIZE_MB}MB.`,
      });
    }
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
  next();
};

// Kept for backwards-compat imports; no longer used for storage
exports.UPLOAD_DIR = null;

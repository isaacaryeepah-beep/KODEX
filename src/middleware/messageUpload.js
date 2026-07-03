'use strict';

const multer = require('multer');
const path   = require('path');

const MAX_SIZE_MB = parseInt(process.env.MSG_FILE_MAX_MB || '10', 10);

const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_MIME = [
  'application/pdf',
  ...IMAGE_MIME,
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const ALLOWED_EXT  = ['.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.doc', '.docx'];

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeOk = ALLOWED_MIME.includes(file.mimetype);
  const extOk  = ALLOWED_EXT.includes(ext);
  if (!mimeOk || !extOk) {
    return cb(new Error('Allowed types: images (JPG, PNG, WebP, GIF), PDF, and Word documents (DOC, DOCX).'), false);
  }
  cb(null, true);
}

// Memory storage — images go to Cloudinary, docs go through documentStorage.
// Neither writes via multer directly, so no local disk path here at all.
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: MAX_SIZE_MB * 1024 * 1024 },
});

exports.uploadMessage = upload.single('attachment');
exports.isImageMime = (mimeType) => IMAGE_MIME.includes(mimeType);

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

exports.MAX_SIZE_MB = MAX_SIZE_MB;

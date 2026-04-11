const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');

const ctrl = require('../controllers/announcementController');
const {
  protect,
  companyIsolation,
  canCreate,
  validateMode,
  validateTarget
} = require('../middleware/announcementMiddleware');

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/announcements/'),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|jpeg|jpg|png|doc|docx/;
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.test(ext) ? cb(null, true) : cb(new Error('Invalid file type'));
  }
});

// ─── COMMON MIDDLEWARE ────────────────────────────────────────────────────────
// All announcement routes require auth + company isolation + mode detection
router.use(protect, companyIsolation, validateMode);

// ─── ROUTES ───────────────────────────────────────────────────────────────────

// Unread count  (before /:id to avoid param conflict)
router.get('/unread/count', ctrl.getUnreadCount);

// Archive
router.get('/archive', ctrl.getArchive);

// Dashboard widget
router.get('/dashboard', ctrl.getDashboard);

// List all announcements
router.get('/', ctrl.getAnnouncements);

// Create
router.post(
  '/create',
  canCreate,
  validateTarget,
  upload.single('attachment'),
  ctrl.createAnnouncement
);

// Single announcement
router.get('/:id', ctrl.getOne);

// Update
router.put('/:id', canCreate, ctrl.updateAnnouncement);

// Delete
router.delete('/:id', canCreate, ctrl.deleteAnnouncement);

// Pin / Unpin
router.patch('/:id/pin',   canCreate, ctrl.pinAnnouncement);
router.patch('/:id/unpin', canCreate, ctrl.unpinAnnouncement);

// Mark as read
router.patch('/:id/read', ctrl.markRead);

// Read stats (creator / admin)
router.get('/:id/read-stats', canCreate, ctrl.getReadStats);

module.exports = router;

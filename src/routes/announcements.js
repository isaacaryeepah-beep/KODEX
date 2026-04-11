const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');

const ctrl = require('../controllers/announcementController');

// Use your existing auth middleware — not the announcement one
const { authenticate }    = require('../middleware/auth');
const { companyIsolation } = require('../middleware/companyIsolation');
const { canCreate, validateMode, validateTarget } = require('../middleware/announcementMiddleware');

// ─── FILE UPLOAD ──────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/announcements/'),
  filename:    (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /pdf|jpeg|jpg|png|doc|docx/;
    const ext = path.extname(file.originalname).toLowerCase();
    allowed.test(ext) ? cb(null, true) : cb(new Error('Invalid file type'));
  }
});

// ─── COMMON MIDDLEWARE ────────────────────────────────────────────────────────
router.use(authenticate, companyIsolation, validateMode);

// ─── ROUTES ──────────────────────────────────────────────────────────────────
router.get('/unread/count',       ctrl.getUnreadCount);
router.get('/archive',            ctrl.getArchive);
router.get('/dashboard',          ctrl.getDashboard);
router.get('/',                   ctrl.getAnnouncements);

router.post('/create', canCreate, validateTarget, upload.single('attachment'), ctrl.createAnnouncement);

router.get('/:id',                ctrl.getOne);
router.put('/:id',   canCreate,   ctrl.updateAnnouncement);
router.delete('/:id', canCreate,  ctrl.deleteAnnouncement);
router.patch('/:id/pin',   canCreate, ctrl.pinAnnouncement);
router.patch('/:id/unpin', canCreate, ctrl.unpinAnnouncement);
router.patch('/:id/read',         ctrl.markRead);
router.get('/:id/read-stats', canCreate, ctrl.getReadStats);

module.exports = router;

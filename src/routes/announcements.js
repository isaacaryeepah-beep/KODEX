const express  = require('express');
const router   = express.Router();

const authenticate         = require('../middleware/auth');
const { companyIsolation } = require('../middleware/companyIsolation');
const { uploadAnnouncement, handleUploadError } = require('../middleware/announcementUpload');
const ctrl                 = require('../controllers/announcementController');

router.use(authenticate);
router.use(companyIsolation);

// ── Role guards ───────────────────────────────────────────────────────────────
const canCreate = (req, res, next) => {
  const allowed = ['lecturer', 'hod', 'admin', 'superadmin', 'manager'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'You are not allowed to post announcements.',
    });
  }
  next();
};

const canManage = (req, res, next) => {
  const allowed = ['admin', 'superadmin'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied.',
    });
  }
  next();
};

// ── Routes ────────────────────────────────────────────────────────────────────

// Create with optional PDF upload
router.post(
  '/',
  canCreate,
  uploadAnnouncement,
  handleUploadError,
  ctrl.createAnnouncement
);

// List
router.get('/',               ctrl.listAnnouncements);
router.get('/unread-count',   ctrl.getUnreadCount);

// Secure PDF serving (authenticated, same company)
router.get('/attachment/:filename',          ctrl.serveAttachment);
router.get('/attachment/:filename/download', ctrl.downloadAttachment);

// Single announcement
router.get('/:id', ctrl.getAnnouncement);

// Mark read
router.patch('/:id/read', ctrl.markRead);

// Pin (admin/superadmin only)
router.patch('/:id/pin', canManage, ctrl.togglePin);

// Delete — creator or admin/superadmin only (enforced in controller too)
router.delete('/:id', canCreate, ctrl.deleteAnnouncement);

module.exports = router;

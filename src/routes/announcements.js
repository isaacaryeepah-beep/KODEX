const express      = require("express");
const authenticate = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/announcementController");

const router = express.Router();
router.use(authenticate);
router.use(requireActiveSubscription);

// Only these roles can access announcements
router.use((req, res, next) => {
  const allowed = ['admin', 'superadmin', 'manager', 'lecturer', 'hod', 'student'];
  if (!allowed.includes(req.user.role)) {
    return res.status(403).json({ error: 'Announcements are not available for your role.' });
  }
  next();
});

router.get("/unread-count", ctrl.unreadCount);
router.get("/",             ctrl.list);
router.post("/",            ctrl.create);
router.patch("/:id/read",   ctrl.markRead);
router.patch("/:id/pin",    ctrl.togglePin);
router.delete("/:id",       ctrl.remove);
router.get("/:id/pdf",      ctrl.downloadPdf);

module.exports = router;

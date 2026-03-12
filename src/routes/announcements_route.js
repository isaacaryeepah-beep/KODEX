const express      = require("express");
const authenticate = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/announcementController");

const router = express.Router();
router.use(authenticate);
router.use(requireActiveSubscription);

router.get("/unread-count", ctrl.unreadCount);
router.get("/",             ctrl.list);
router.post("/",            ctrl.create);
router.patch("/:id/read",   ctrl.markRead);
router.patch("/:id/pin",    ctrl.togglePin);
router.delete("/:id",       ctrl.remove);

module.exports = router;

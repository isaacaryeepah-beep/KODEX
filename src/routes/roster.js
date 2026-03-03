const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const rosterController = require("../controllers/rosterController");

const router = express.Router();

router.use(authenticate);
router.use(requireMode("academic"));
router.use(requireActiveSubscription);

router.post("/:courseId/upload", requireRole("lecturer", "admin", "superadmin"), companyIsolation, rosterController.uploadRoster);
router.get("/:courseId", requireRole("lecturer", "admin", "superadmin"), companyIsolation, rosterController.getRoster);
router.delete("/:courseId/entries/:rosterId", requireRole("lecturer", "admin", "superadmin"), companyIsolation, rosterController.removeFromRoster);
router.delete("/:courseId/clear", requireRole("lecturer", "admin", "superadmin"), companyIsolation, rosterController.clearRoster);

module.exports = router;

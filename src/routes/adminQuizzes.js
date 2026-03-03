const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/adminQuizController");

const router = express.Router();

router.use(authenticate);
router.use(requireMode("academic"));
router.use(requireActiveSubscription);
router.use(requireRole("admin", "superadmin"));

router.get("/reports", ctrl.getReports);
router.get("/", ctrl.listQuizzes);
router.get("/:id", ctrl.getQuiz);
router.get("/:id/attempts/:attemptId", ctrl.getAttemptDetail);

module.exports = router;

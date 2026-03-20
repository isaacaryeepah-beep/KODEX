const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/studentQuizController");

const router = express.Router();

router.use(authenticate);
router.use(requireMode("academic"));
router.use(requireActiveSubscription);
router.use(requireRole("student", "superadmin"));

router.get("/", ctrl.listQuizzes);
router.get("/:id", ctrl.getQuiz);
router.post("/:id/start", ctrl.startAttempt);
router.post("/:id/submit", ctrl.submitAttempt);
router.get("/:id/result", ctrl.getMyResult);

module.exports = router;

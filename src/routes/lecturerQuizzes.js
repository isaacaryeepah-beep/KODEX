const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl = require("../controllers/lecturerQuizController");

const router = express.Router();

router.use(authenticate);
router.use(requireMode("academic"));
router.use(requireActiveSubscription);
router.use(requireRole("lecturer", "superadmin"));

router.post("/", ctrl.createQuiz);
router.get("/", ctrl.listQuizzes);
router.get("/:id", ctrl.getQuiz);
router.put("/:id", ctrl.updateQuiz);
router.delete("/:id", ctrl.deleteQuiz);

router.post("/:id/questions", ctrl.addQuestion);
router.put("/:id/questions/:questionId", ctrl.updateQuestion);
router.delete("/:id/questions/:questionId", ctrl.deleteQuestion);

router.get("/:id/results", ctrl.getQuizResults);

module.exports = router;

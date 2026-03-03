const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { companyIsolation } = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const quizController = require("../controllers/quizController");

const router = express.Router();

router.use(authenticate);
router.use(requireMode("academic"));
router.use(requireActiveSubscription);

router.post("/", requireRole("lecturer", "superadmin"), companyIsolation, quizController.createQuiz);
router.get("/", companyIsolation, quizController.listQuizzes);
router.get("/:id", companyIsolation, quizController.getQuiz);
router.post("/:id/submit", requireRole("student"), quizController.submitQuiz);

module.exports = router;

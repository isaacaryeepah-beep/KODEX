const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const ctrl    = require("../controllers/lecturerQuizController");
const aiCtrl  = require("../controllers/aiQuizController");

const router = express.Router();

router.use(authenticate);
router.use(requireMode("academic"));
router.use(requireActiveSubscription);
router.use(requireRole("lecturer", "hod", "superadmin"));

// HOD gets read-only access — block write operations
router.use((req, res, next) => {
  if (req.user.role === 'hod' && req.method !== 'GET') {
    return res.status(403).json({ error: 'HODs have read-only access to quizzes.' });
  }
  next();
});

router.post("/", ctrl.createQuiz);
router.get("/", ctrl.listQuizzes);
router.get("/:id", ctrl.getQuiz);
router.put("/:id", ctrl.updateQuiz);
router.delete("/:id", ctrl.deleteQuiz);

router.post("/:id/questions", ctrl.addQuestion);
router.put("/:id/questions/:questionId", ctrl.updateQuestion);
router.delete("/:id/questions/:questionId", ctrl.deleteQuestion);

router.get("/:id/results", ctrl.getQuizResults);
router.get("/:id/results/:attemptId", ctrl.getStudentAnswers);
router.post("/:id/ai-generate", aiCtrl.generateQuestions);

module.exports = router;

/**
 * aiQuizController.js
 * Handles AI-powered quiz question generation from PDF or pasted text.
 */

const multer  = require("multer");
const pdfParse = require("pdf-parse");
const Question = require("../models/Question");
const Quiz     = require("../models/Quiz");
const mongoose = require("mongoose");
const { generateQuestionsFromText } = require("../services/aiService");

// Memory storage -- PDF never written to disk
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") return cb(null, true);
    cb(new Error("Only PDF files are accepted"), false);
  },
}).single("pdf");

/**
 * POST /api/lecturer/quizzes/:id/ai-generate
 * Body (multipart/form-data OR application/json):
 *   - pdf        (file, optional)   -- PDF to extract text from
 *   - notes      (string, optional) -- Pasted text/notes
 *   - count      (number)           -- How many questions (1-20, default 5)
 *   - types      (string)           -- Comma-separated: "single,multiple,fill"
 *   - difficulty (string)           -- "easy"|"medium"|"hard"|"mixed"
 */
exports.generateQuestions = (req, res) => {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });

    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: "Invalid quiz ID" });
      }

      // Verify quiz belongs to this lecturer
      const quiz = await Quiz.findOne({
        _id: id,
        company: req.user.company,
        createdBy: req.user._id,
      });
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });

      // ── Extract text ──
      let content = "";

      if (req.file) {
        // PDF upload
        const parsed = await pdfParse(req.file.buffer);
        content = parsed.text || "";
        if (!content.trim()) {
          return res.status(400).json({ error: "Could not extract text from this PDF. Try a text-based PDF or paste your notes instead." });
        }
      } else if (req.body?.notes) {
        content = req.body.notes;
      }

      if (!content.trim()) {
        return res.status(400).json({ error: "Please upload a PDF or paste your notes." });
      }

      // ── Parse options ──
      const count = Math.min(20, Math.max(1, parseInt(req.body?.count) || 5));
      const typesRaw = req.body?.types || "single";
      const types = typesRaw.split(",").map(t => t.trim()).filter(t => ["single","multiple","fill"].includes(t));
      const difficulty = ["easy","medium","hard","mixed"].includes(req.body?.difficulty) ? req.body.difficulty : "mixed";

      if (types.length === 0) types.push("single");

      // ── Generate via AI ──
      const generated = await generateQuestionsFromText(content, count, types, difficulty);

      // ── Save questions to DB ──
      const questionDocs = generated.map(q => ({ ...q, quiz: id }));
      const inserted = await Question.insertMany(questionDocs);

      // ── Update quiz totalMarks ──
      const allQuestions = await Question.find({ quiz: id });
      quiz.totalMarks = allQuestions.reduce((sum, q) => sum + q.marks, 0);
      await quiz.save();

      res.json({
        message: `${inserted.length} questions generated successfully`,
        questions: inserted,
        totalMarks: quiz.totalMarks,
      });

    } catch (err) {
      console.error("AI generate error:", err);
      res.status(500).json({ error: err.message || "AI generation failed" });
    }
  });
};

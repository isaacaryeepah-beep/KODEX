"use strict";

/**
 * Dikly AI action chat — POST /api/ai-actions/chat
 *
 * The tool-enabled chat turn: the model may call read-only, role-gated,
 * company-scoped tools (see services/ai/aiActionService.js) before
 * answering. Rate-limited like every other paid AI call.
 */

const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { aiGenerateLimiter } = require("../middleware/rateLimiter");
const { runActionChat, isConfigured } = require("../services/ai/aiActionService");
const Company = require("../models/Company");

router.use(authenticate);

router.post("/chat", aiGenerateLimiter, async (req, res) => {
  try {
    const { question, history } = req.body || {};
    if (!question || typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ error: "question is required" });
    }
    if (!isConfigured()) {
      // 503 lets the frontend fall back to the classic ai-reports answer path.
      return res.status(503).json({ error: "AI actions are not configured" });
    }

    const cleanHistory = Array.isArray(history)
      ? history
          .slice(-12)
          .filter((h) => h && typeof h.text === "string" && ["user", "assistant"].includes(h.role))
          .map((h) => ({ role: h.role, text: h.text }))
      : [];

    // req.user.company is an ObjectId (auth doesn't populate) — resolve the
    // mode here; tool availability depends on it.
    const co = req.user.company
      ? await Company.findById(req.user.company).select("mode").lean()
      : null;
    const mode = co?.mode || "corporate";
    const { reply, toolsUsed } = await runActionChat({
      user: req.user,
      mode,
      question: question.trim(),
      history: cleanHistory,
    });
    return res.json({ reply, toolsUsed });
  } catch (err) {
    console.error("[aiActions/chat]", err.message);
    return res.status(502).json({ error: "Dikly AI could not answer right now. Please try again." });
  }
});

module.exports = router;

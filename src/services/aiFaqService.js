"use strict";

/**
 * aiFaqService.js
 *
 * Wraps the Anthropic Claude API for the FAQ assistant.
 * Uses the lightweight Haiku model — fast, cost-efficient for Q&A.
 *
 * Exports:
 *   callAI(question, contextFAQs) → { text, confidenceHigh }
 *   assessConfidence(text)        → boolean
 */

const Anthropic = require("@anthropic-ai/sdk");

// ── System prompt ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a helpful AI support assistant for KODEX, a multi-tenant educational and HR management platform.

KODEX features include:
- Attendance tracking (QR code, GPS, ESP32 hardware)
- SnapQuiz (strict exam mode with proctoring)
- Normal quizzes and question banks
- Assignments with grading
- Grade books and academic transcripts
- Course management and resource libraries
- Virtual meetings (Zoom, Jitsi integration)
- HR management: shifts, leave, payroll, employee profiles
- Academic programmes and student progress tracking
- Discussion forums, direct messaging, announcements
- Support ticket system and calendar events
- Badge and achievement system
- Password reset via email

Answer questions clearly and concisely (under 150 words). Be friendly and professional.
If the question is outside KODEX's scope or you genuinely don't know, say so honestly and suggest the user create a support ticket.
Never make up features or settings that you are not sure about.`;

// ── Phrases that signal low confidence ───────────────────────────────────────
const LOW_CONFIDENCE_PHRASES = [
  "i don't know",
  "i do not know",
  "i'm not sure",
  "i am not sure",
  "not certain",
  "cannot find",
  "not familiar",
  "i'm unable",
  "i am unable",
  "unclear to me",
  "you may want to contact",
  "please contact support",
  "reach out to support",
  "i cannot answer",
  "outside my knowledge",
  "i have no information",
];

/**
 * Heuristic confidence check on an AI response.
 * Returns true if the response appears confident and substantive.
 */
function assessConfidence(text) {
  if (!text || text.trim().length < 40) return false;
  const lower = text.toLowerCase();
  for (const phrase of LOW_CONFIDENCE_PHRASES) {
    if (lower.includes(phrase)) return false;
  }
  return true;
}

/**
 * Call the Anthropic API to answer a user question.
 *
 * @param {string}   question    Raw user question
 * @param {Object[]} contextFAQs Up to 5 related FAQ objects {question, answer}
 *                               used as few-shot context when no exact match found
 * @returns {{ text: string, confidenceHigh: boolean }}
 */
async function callAI(question, contextFAQs = []) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const client = new Anthropic({ apiKey });

  let userMessage = question;
  if (contextFAQs.length > 0) {
    const ctx = contextFAQs
      .slice(0, 5)
      .map(f => `Q: ${f.question}\nA: ${f.answer}`)
      .join("\n\n");
    userMessage = `Here are some relevant knowledge base entries:\n\n${ctx}\n\nUser question: ${question}`;
  }

  const message = await client.messages.create({
    model:      "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: "user", content: userMessage }],
  });

  const text = message.content?.[0]?.text || "";
  return { text, confidenceHigh: assessConfidence(text) };
}

module.exports = { callAI, assessConfidence };

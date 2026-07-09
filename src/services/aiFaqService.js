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
// Built per-request from the asking company's mode, not one static list —
// a corporate account has no quizzes/courses/grades, and an academic
// account has no shifts/leave, so naming the other mode's features in the
// welcome/fallback answer is both wrong and confusing. superadmin (mode =
// null) is platform-level and genuinely spans both, so it keeps the full list.
const COMMON_FEATURES = `- Attendance tracking (QR code, GPS, ESP32 hardware)
- Virtual meetings (Zoom, Jitsi integration)
- Discussion forums, direct messaging, announcements
- Support ticket system and calendar events
- Badge and achievement system
- Password reset via email`;

const ACADEMIC_FEATURES = `- SnapQuiz (strict exam mode with proctoring)
- Normal quizzes and question banks
- Assignments with grading
- Grade books and academic transcripts
- Course management and resource libraries
- Academic programmes and student progress tracking`;

const CORPORATE_FEATURES = `- HR management: shifts, leave, attendance summary export, employee profiles (Dikly tracks time and attendance only -- it never computes or stores pay amounts; that stays in the company's own payroll system)`;

function buildSystemPrompt(mode) {
  const platformDesc = mode === "corporate"
    ? "a multi-tenant HR and workforce management platform"
    : mode === "academic"
    ? "a multi-tenant educational management platform"
    : "a multi-tenant educational and HR management platform";

  const featureList = mode === "corporate"
    ? `${CORPORATE_FEATURES}\n${COMMON_FEATURES}`
    : mode === "academic"
    ? `${ACADEMIC_FEATURES}\n${COMMON_FEATURES}`
    : `${ACADEMIC_FEATURES}\n${CORPORATE_FEATURES}\n${COMMON_FEATURES}`;

  return `You are a helpful AI support assistant for DIKLY, ${platformDesc}.

DIKLY features include:
${featureList}

Answer questions clearly and concisely (under 150 words). Be friendly and professional.
If the question is outside DIKLY's scope or you genuinely don't know, say so honestly and suggest the user create a support ticket.
Never make up features or settings that you are not sure about.`;
}

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
 * @param {?string}  mode        Asking company's mode ('corporate' | 'academic'),
 *                               or null for superadmin/unknown — picks which
 *                               feature list the system prompt names.
 * @returns {{ text: string, confidenceHigh: boolean }}
 */
async function callAI(question, contextFAQs = [], mode = null) {
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
    system:     buildSystemPrompt(mode),
    messages:   [{ role: "user", content: userMessage }],
  });

  const text = message.content?.[0]?.text || "";
  return { text, confidenceHigh: assessConfidence(text) };
}

module.exports = { callAI, assessConfidence };

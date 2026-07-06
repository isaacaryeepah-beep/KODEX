"use strict";

/**
 * aiRouter.js
 *
 * Facade for Dikly AI's model calls, modeled on the same provider-registry
 * pattern already used by pushService.js and trafficService.js. Callers
 * never pick a model — they describe the task, and the router picks the
 * best-fit provider automatically:
 *
 *   - "general" (default): everyday writing/analysis — report narratives,
 *     ordinary "Ask Dikly AI" questions. Routed to Gemini Flash.
 *   - "coding": technical questions (integrations, formulas, data exports,
 *     scripts). Routed to DeepSeek. Callers can pass task: "coding"
 *     explicitly, or leave it to be detected from the prompt text.
 *
 * Every route falls through to Claude last. This is deliberate: Claude is
 * the only provider Dikly has run in production so far, so until
 * GEMINI_API_KEY / DEEPSEEK_API_KEY are actually set, behavior is
 * byte-for-byte what it was before this router existed. A configured
 * provider that errors on a given request (rate limit, transient 5xx)
 * still falls through rather than failing the whole request.
 */

const geminiProvider = require("./providers/geminiProvider");
const deepseekProvider = require("./providers/deepseekProvider");
const claudeProvider = require("./providers/claudeProvider");

// Deliberately conservative — false positives just mean a general-purpose
// question gets answered by Gemini Flash instead of DeepSeek, which is
// harmless. Matches things like "write a SQL query", "what's the API for…",
// "debug this formula", "export as CSV".
const CODE_TASK_PATTERN = /\b(sql|regex|json|api|endpoint|webhook|script|formula|algorithm|debug|source code|integration|csv export|programming|function\()\b/i;

function classify(task, promptText) {
  if (task === "coding") return "coding";
  if (task === "general" && promptText && CODE_TASK_PATTERN.test(promptText)) return "coding";
  return "general";
}

const ROUTES = {
  general: [geminiProvider, claudeProvider],
  coding: [deepseekProvider, claudeProvider],
};

/**
 * @param {Object} params
 * @param {string} [params.system]   - system prompt
 * @param {string} params.prompt     - user prompt
 * @param {"general"|"coding"} [params.task] - routing hint; auto-detected from
 *   the prompt when omitted/"general"
 * @param {number} [params.maxTokens]
 * @returns {Promise<string>}
 */
async function chat({ system, prompt, task = "general", maxTokens = 1200 }) {
  const kind = classify(task, prompt);
  const chain = ROUTES[kind] || ROUTES.general;

  let lastErr;
  for (const provider of chain) {
    if (!provider.isConfigured()) continue;
    try {
      return await provider.complete({ system, prompt, maxTokens });
    } catch (err) {
      lastErr = err;
      console.error(`[aiRouter] ${provider.name} failed for a "${kind}" task, trying next provider:`, err.message);
    }
  }
  throw lastErr || new Error("No AI provider is configured (set GEMINI_API_KEY, DEEPSEEK_API_KEY, or ANTHROPIC_API_KEY)");
}

module.exports = { chat, classify };

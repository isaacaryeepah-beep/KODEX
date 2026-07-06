"use strict";

/**
 * claudeProvider.js
 *
 * Anthropic Claude, wrapped to the aiRouter provider shape. Always the last
 * link in every routing chain — it's the one provider Dikly has run in
 * production since day one, so if Gemini/DeepSeek are unconfigured or their
 * request fails, Claude is what keeps Dikly AI working exactly as it did
 * before this router existed.
 */

const Anthropic = require("@anthropic-ai/sdk");

const MODEL = process.env.AI_ROUTER_CLAUDE_MODEL || "claude-haiku-4-5-20251001";

function isConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

async function complete({ system, prompt, maxTokens = 1200 }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: prompt }],
  });
  return msg.content[0]?.text || "";
}

module.exports = { name: "claude", isConfigured, complete };

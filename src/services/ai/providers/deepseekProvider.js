"use strict";

/**
 * deepseekProvider.js
 *
 * DeepSeek, wrapped to the aiRouter provider shape — routed to for
 * technical/coding-flavored questions (e.g. a custom Dikly AI query about
 * a formula, integration, or data export). DeepSeek's chat API is
 * OpenAI-compatible, so this is a plain HTTPS POST like geminiProvider.js —
 * no new npm dependency.
 */

const https = require("https");

const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

function isConfigured() {
  return !!process.env.DEEPSEEK_API_KEY;
}

async function complete({ system, prompt, maxTokens = 1200 }) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY is not configured");

  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const body = JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens });

  const raw = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.deepseek.com",
        path: "/chat/completions",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });

  if (raw.status !== 200) {
    let message = `DeepSeek API error ${raw.status}`;
    try { message = JSON.parse(raw.body).error?.message || message; } catch (_) {}
    const err = new Error(message);
    err.statusCode = raw.status;
    throw err;
  }

  const result = JSON.parse(raw.body);
  const text = result.choices?.[0]?.message?.content || "";
  if (!text) throw new Error("DeepSeek returned an empty response");
  return text;
}

module.exports = { name: "deepseek", isConfigured, complete };

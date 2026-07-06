"use strict";

/**
 * geminiProvider.js
 *
 * Google Gemini Flash, wrapped to the aiRouter provider shape — the default
 * for general conversation/writing tasks (structured report narratives,
 * everyday "Ask Dikly AI" questions). Plain HTTPS against the Generative
 * Language REST API, same no-SDK convention already used by aiService.js
 * for Claude — no new npm dependency for a single JSON POST.
 */

const https = require("https");

const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

function isConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

async function complete({ system, prompt, maxTokens = 1200 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured");

  const body = JSON.stringify({
    system_instruction: system ? { parts: [{ text: system }] } : undefined,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: maxTokens },
  });

  const raw = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "generativelanguage.googleapis.com",
        path: `/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
    let message = `Gemini API error ${raw.status}`;
    try { message = JSON.parse(raw.body).error?.message || message; } catch (_) {}
    const err = new Error(message);
    err.statusCode = raw.status;
    throw err;
  }

  const result = JSON.parse(raw.body);
  const text = result.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  if (!text) throw new Error("Gemini returned an empty response");
  return text;
}

module.exports = { name: "gemini-flash", isConfigured, complete };

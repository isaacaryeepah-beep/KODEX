/**
 * aiService.js
 * Calls Anthropic Claude to generate quiz questions from text content.
 * Uses native https -- no SDK needed.
 */

const https = require("https");

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = "claude-opus-4-6";

/**
 * Generate quiz questions from text content.
 * @param {string} content     - Extracted text (from PDF or pasted notes)
 * @param {number} count       - Number of questions to generate
 * @param {string[]} types     - Array of types to include: "single", "multiple", "fill"
 * @param {string} difficulty  - "easy" | "medium" | "hard" | "mixed"
 * @returns {Promise<Array>}   - Array of question objects ready to insert
 */
async function generateQuestionsFromText(content, count = 5, types = ["single"], difficulty = "mixed") {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set in environment variables");

  const typeInstructions = types.map(t => {
    if (t === "single") return '"single": one correct option index (0-3) in "correctAnswer"';
    if (t === "multiple") return '"multiple": array of correct option indices in "correctAnswers"';
    if (t === "fill") return '"fill": correct answer string in "correctAnswerText", optional alternates in "acceptedAnswers"';
    return t;
  }).join("; ");

  const difficultyNote = difficulty === "mixed"
    ? "Mix difficulty levels -- some easy recall, some application, some analysis."
    : `All questions should be ${difficulty} difficulty.`;

  const prompt = `You are an expert educational assessment creator. Based on the study material below, generate exactly ${count} quiz questions.

RULES:
- ${difficultyNote}
- Question types to use: ${types.join(", ")}. Distribute evenly if multiple types requested.
- For "single" and "multiple" questions: provide exactly 4 options (A-D). Options must be plausible -- avoid obviously wrong distractors.
- For "fill" questions: no options needed. The answer should be a specific term, number, or short phrase.
- Do NOT copy sentences verbatim from the material. Paraphrase and test understanding.
- Marks: 1 for easy/recall, 2 for application, 3 for analysis/evaluation.
- Return ONLY valid JSON -- no markdown, no explanation, no preamble.

JSON format (array of objects):
[
  {
    "questionText": "...",
    "questionType": "single",
    "options": ["...", "...", "...", "..."],
    "correctAnswer": 0,
    "marks": 1
  },
  {
    "questionText": "...",
    "questionType": "multiple",
    "options": ["...", "...", "...", "..."],
    "correctAnswers": [0, 2],
    "marks": 2
  },
  {
    "questionText": "...",
    "questionType": "fill",
    "correctAnswerText": "...",
    "acceptedAnswers": ["..."],
    "marks": 1
  }
]

Type notes:
- ${typeInstructions}

STUDY MATERIAL:
---
${content.slice(0, 12000)}
---

Generate exactly ${count} questions now:`;

  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = await new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path: "/v1/messages",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
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
    const err = JSON.parse(raw.body);
    throw new Error(err.error?.message || `Anthropic API error ${raw.status}`);
  }

  const result = JSON.parse(raw.body);
  const text = result.content?.[0]?.text || "";

  // Strip markdown code fences if present
  const clean = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
  
  let questions;
  try {
    questions = JSON.parse(clean);
  } catch {
    // Try to extract JSON array from the response
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("AI returned invalid JSON -- please try again");
    questions = JSON.parse(match[0]);
  }

  if (!Array.isArray(questions)) throw new Error("AI returned unexpected format");

  // Validate and normalise each question
  return questions.map((q, i) => {
    if (!q.questionText) throw new Error(`Question ${i + 1} missing questionText`);
    const type = q.questionType || "single";
    if (!["single", "multiple", "fill"].includes(type)) {
      throw new Error(`Question ${i + 1} has invalid type: ${type}`);
    }
    if (type === "fill") {
      return {
        questionText: q.questionText.trim(),
        questionType: "fill",
        options: [],
        correctAnswerText: (q.correctAnswerText || "").trim(),
        acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers.map(a => a.trim()).filter(Boolean) : [],
        correctAnswer: null,
        correctAnswers: [],
        marks: Number(q.marks) || 1,
      };
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`Question ${i + 1} needs at least 2 options`);
    }
    return {
      questionText: q.questionText.trim(),
      questionType: type,
      options: q.options.map(o => String(o).trim()),
      correctAnswer: type === "single" ? Number(q.correctAnswer ?? 0) : (q.correctAnswers?.[0] ?? 0),
      correctAnswers: type === "multiple" ? (q.correctAnswers || []).map(Number) : [],
      correctAnswerText: null,
      acceptedAnswers: [],
      marks: Number(q.marks) || 1,
    };
  });
}

module.exports = { generateQuestionsFromText };

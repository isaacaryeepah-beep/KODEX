"use strict";

/**
 * aiGeneratorService.js
 *
 * Enhanced AI question generator — supports all 10 NormalQuiz/SnapQuiz
 * question types, returning questions shaped to match those schemas.
 *
 * Uses the same Anthropic HTTPS call pattern as the existing aiService.js
 * but with richer prompts and response parsing for academic assessment.
 *
 * Does NOT replace aiService.js (which serves the legacy Quiz model).
 */

const https  = require("https");
const crypto = require("crypto");

const MODEL           = process.env.AI_GENERATOR_MODEL || "claude-opus-4-6";
const MAX_TOKENS      = 6000;
const MAX_SOURCE_CHARS = 14000; // trim source to stay within context

// ---------------------------------------------------------------------------
// Question type metadata
// ---------------------------------------------------------------------------

const SUPPORTED_TYPES = [
  "mcq", "mcq_multi", "true_false", "short_answer",
  "fill_blank", "essay", "numeric", "equation", "drawing", "file_upload",
];

const MANUAL_GRADE_TYPES = new Set(["essay", "equation", "drawing", "file_upload"]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate questions from source text using Claude.
 *
 * @param {Object} params
 * @param {string}   params.sourceText      — Extracted/provided text content
 * @param {number}   [params.count=5]       — Number of questions (1–30)
 * @param {string[]} [params.types]         — Types from SUPPORTED_TYPES
 * @param {string}   [params.difficulty]    — "easy"|"medium"|"hard"|"mixed"
 * @param {string}   [params.subject]       — Optional subject context label
 * @param {string}   [params.language]      — ISO language code (default "en")
 * @returns {Promise<{ questions: Array, aiMetadata: Object }>}
 */
async function generateQuestions({
  sourceText,
  count      = 5,
  types      = ["mcq"],
  difficulty = "mixed",
  subject    = null,
  language   = "en",
}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  // Normalise params.
  count = Math.min(30, Math.max(1, Number(count) || 5));
  types = (Array.isArray(types) ? types : [types])
    .filter(t => SUPPORTED_TYPES.includes(t));
  if (types.length === 0) types = ["mcq"];

  const prompt = _buildPrompt({
    sourceText: sourceText.slice(0, MAX_SOURCE_CHARS),
    count,
    types,
    difficulty,
    subject,
    language,
  });

  const startMs = Date.now();
  const { status, body } = await _callAnthropic(prompt, apiKey);
  const processingMs = Date.now() - startMs;

  if (status !== 200) {
    throw new Error(body.error?.message || `Anthropic API error ${status}`);
  }

  const rawText   = body.content?.[0]?.text || "";
  const questions = _parseAndValidate(rawText, types);

  return {
    questions,
    aiMetadata: {
      modelUsed:        MODEL,
      promptTokens:     body.usage?.input_tokens    || null,
      completionTokens: body.usage?.output_tokens   || null,
      processingMs,
      generatedAt:      new Date(),
    },
  };
}

/**
 * Compute a SHA-256 hash of the source text for deduplication.
 */
function hashSource(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function _buildPrompt({ sourceText, count, types, difficulty, subject, language }) {
  const diffNote = difficulty === "mixed"
    ? "Mix difficulty: some easy recall (marks: 1), some application (marks: 2), some analysis (marks: 3)."
    : `All questions should be ${difficulty} difficulty. Assign marks accordingly: easy=1, medium=2, hard=3.`;

  const subjectNote = subject ? `Subject context: ${subject}.` : "";
  const langNote    = language && language !== "en"
    ? `Write all questions in ${language}.`
    : "Write all questions in English.";

  const typeSpec = _buildTypeSpec(types);

  return `You are an expert educational assessment designer. Using the study material below, generate exactly ${count} questions for an academic assessment.

RULES:
- ${diffNote}
- ${subjectNote}
- ${langNote}
- Distribute questions evenly across requested types where multiple types are requested.
- Do NOT copy sentences verbatim from the source. Test genuine understanding.
- Return ONLY a valid JSON array — no markdown fences, no explanation.

QUESTION TYPES TO USE:
${typeSpec}

JSON OUTPUT FORMAT (array of objects):
Each object must have:
  "questionType": one of [${types.join(", ")}]
  "questionText": the question (string, required)
  "marks": integer ≥ 1
  "explanation": brief explanation of the correct answer (for lecturer reference)

Additional fields per type:
- mcq:          "options": [4 strings], "correctOptionIndex": 0-3
- mcq_multi:    "options": [4 strings], "correctOptionIndices": [0,2] (array of correct indices)
- true_false:   "correctBoolean": true or false
- short_answer: "correctAnswerText": string, "acceptedAnswers": [list of accepted variants]
- fill_blank:   "correctAnswerText": string, "acceptedAnswers": [variants], questionText must contain "___"
- essay:        "modelAnswer": guidance for grader (paragraph)
- numeric:      "numericAnswer": {"value": number, "tolerance": number, "unit": string or null}
- equation:     "modelAnswer": expected equation/working
- drawing:      "modelAnswer": description of expected diagram
- file_upload:  "modelAnswer": description of expected file content

STUDY MATERIAL:
---
${sourceText}
---

Generate exactly ${count} questions now:`;
}

function _buildTypeSpec(types) {
  const descriptions = {
    mcq:          "MCQ (single correct): 4 options, one correct.",
    mcq_multi:    "MCQ (multiple correct): 4 options, 2+ correct answers.",
    true_false:   "True/False: single boolean answer.",
    short_answer: "Short answer: brief text answer (1-3 words or a sentence).",
    fill_blank:   "Fill-in-the-blank: sentence with ___ that student completes.",
    essay:        "Essay: open-ended question requiring a paragraph response.",
    numeric:      "Numeric: exact number answer with optional tolerance and unit.",
    equation:     "Equation: student must write or derive an equation/formula.",
    drawing:      "Drawing: student must sketch a diagram (describe expected output in modelAnswer).",
    file_upload:  "File upload: student submits a file (describe requirements in modelAnswer).",
  };
  return types.map(t => `- ${t}: ${descriptions[t] || t}`).join("\n");
}

// ---------------------------------------------------------------------------
// Anthropic HTTP call
// ---------------------------------------------------------------------------

async function _callAnthropic(prompt, apiKey) {
  const payload = JSON.stringify({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.anthropic.com",
        path:     "/v1/messages",
        method:   "POST",
        headers: {
          "Content-Type":     "application/json",
          "x-api-key":        apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Length":   Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", c => data += c);
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch {
            reject(new Error("Invalid JSON response from Anthropic"));
          }
        });
      }
    );
    req.on("error", reject);
    req.setTimeout(90000, () => { req.destroy(); reject(new Error("AI request timed out")); });
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Response parser + validator
// ---------------------------------------------------------------------------

function _parseAndValidate(rawText, requestedTypes) {
  // Strip markdown fences.
  const clean = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("AI returned invalid JSON — please try again");
    parsed = JSON.parse(match[0]);
  }

  if (!Array.isArray(parsed)) throw new Error("AI returned unexpected format (expected array)");

  return parsed.map((q, i) => _normaliseQuestion(q, i, requestedTypes));
}

function _normaliseQuestion(q, idx, requestedTypes) {
  if (!q.questionText) throw new Error(`Question ${idx + 1} missing questionText`);

  const type = SUPPORTED_TYPES.includes(q.questionType) ? q.questionType : requestedTypes[0];
  const marks = Math.max(1, parseInt(q.marks) || 1);
  const isManual = MANUAL_GRADE_TYPES.has(type);

  const base = {
    questionType:          type,
    questionText:          String(q.questionText).trim(),
    marks,
    explanation:           q.explanation ? String(q.explanation).trim() : "",
    requiresManualGrading: isManual,
    allowPartialMarks:     false,
    // Initialise all answer fields to safe defaults.
    options:               [],
    correctOptionIndex:    null,
    correctOptionIndices:  [],
    correctBoolean:        null,
    correctAnswerText:     null,
    acceptedAnswers:       [],
    numericAnswer:         { value: null, tolerance: 0, unit: null },
    modelAnswer:           "",
  };

  switch (type) {
    case "mcq":
      base.options            = _parseOptions(q.options, 4);
      base.correctOptionIndex = Number.isInteger(q.correctOptionIndex) ? q.correctOptionIndex : 0;
      break;

    case "mcq_multi":
      base.options             = _parseOptions(q.options, 4);
      base.correctOptionIndices = Array.isArray(q.correctOptionIndices)
        ? q.correctOptionIndices.map(Number)
        : [0];
      base.allowPartialMarks = true;
      break;

    case "true_false":
      base.correctBoolean = typeof q.correctBoolean === "boolean" ? q.correctBoolean : true;
      break;

    case "short_answer":
    case "fill_blank":
      base.correctAnswerText = q.correctAnswerText ? String(q.correctAnswerText).trim() : "";
      base.acceptedAnswers   = Array.isArray(q.acceptedAnswers)
        ? q.acceptedAnswers.map(a => String(a).trim()).filter(Boolean)
        : [];
      break;

    case "numeric":
      base.numericAnswer = {
        value:     q.numericAnswer?.value != null ? Number(q.numericAnswer.value) : null,
        tolerance: Number(q.numericAnswer?.tolerance) || 0,
        unit:      q.numericAnswer?.unit ? String(q.numericAnswer.unit) : null,
      };
      break;

    case "essay":
    case "equation":
    case "drawing":
    case "file_upload":
      base.modelAnswer = q.modelAnswer ? String(q.modelAnswer).trim() : "";
      break;

    default:
      break;
  }

  return base;
}

function _parseOptions(raw, minCount = 4) {
  if (!Array.isArray(raw) || raw.length < 2) {
    // Provide placeholder options so schema validation doesn't fail.
    return Array.from({ length: minCount }, (_, i) => `Option ${i + 1}`);
  }
  return raw.map(o => String(o).trim()).slice(0, 6);
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = { generateQuestions, hashSource, SUPPORTED_TYPES };

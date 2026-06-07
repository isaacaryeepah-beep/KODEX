"use strict";

/**
 * quizGradingService
 *
 * Shared auto-grading logic used by both snapQuizStudentController and
 * snapQuizLecturerController. Extracted to eliminate duplication and ensure
 * both code paths always apply identical scoring rules.
 *
 * Exports:
 *   autoGradeAttempt(attemptId, companyId) → { rawScore, maxScore, hasManual }
 *   scoreResponse(response, question)       → { isCorrect, earnedMarks }
 */

const SnapQuizResponse = require("../models/SnapQuizResponse");
const SnapQuizQuestion = require("../models/SnapQuizQuestion");
const { QUESTION_TYPES, MANUAL_GRADE_TYPES } = require("../models/SnapQuizQuestion");

/**
 * Grade all responses for a given attempt.
 * Auto-gradable question types are scored immediately; manual types are
 * marked pending_manual. Returns summary totals used by the caller to
 * persist scores on the attempt document.
 */
async function autoGradeAttempt(attemptId, companyId) {
  const responses   = await SnapQuizResponse.find({ attempt: attemptId }).lean();
  const questionIds = responses.map(r => r.question);
  const questions   = await SnapQuizQuestion.find({ _id: { $in: questionIds } }).lean();

  const qMap = {};
  questions.forEach(q => { qMap[q._id.toString()] = q; });

  let rawScore = 0, maxScore = 0, hasManual = false;
  const ops = [];

  for (const response of responses) {
    const q = qMap[response.question.toString()];
    if (!q) continue;
    maxScore += q.marks || 1;

    if (MANUAL_GRADE_TYPES.has(q.questionType)) {
      hasManual = true;
      ops.push({
        updateOne: {
          filter: { _id: response._id },
          update: { $set: { gradingStatus: "pending_manual" } },
        },
      });
      continue;
    }

    const { isCorrect, earnedMarks } = scoreResponse(response, q);
    rawScore += earnedMarks;
    ops.push({
      updateOne: {
        filter: { _id: response._id },
        update: {
          $set: {
            isCorrect, earnedMarks,
            isAutoGraded: true,
            gradingStatus: "auto_graded",
          },
        },
      },
    });
  }

  if (ops.length) await SnapQuizResponse.bulkWrite(ops);
  return { rawScore, maxScore, hasManual };
}

/**
 * Score a single response against its question.
 * Pure function — no DB access.
 */
function scoreResponse(response, question) {
  const marks = question.marks || 1;
  let isCorrect = false;

  switch (question.questionType) {
    case QUESTION_TYPES.MCQ:
    case "mcq":
      isCorrect = question.correctOptionIndex != null &&
                  response.selectedOptionIndex != null &&
                  response.selectedOptionIndex === question.correctOptionIndex;
      break;

    case QUESTION_TYPES.MCQ_MULTI:
    case "mcq_multi": {
      const correct = new Set((question.correctOptionIndices || []).map(String));
      const selected = new Set((response.selectedOptionIndices || []).map(String));
      isCorrect = correct.size > 0 &&
                  correct.size === selected.size &&
                  [...correct].every(v => selected.has(v));
      break;
    }

    case QUESTION_TYPES.TRUE_FALSE:
    case "true_false":
      isCorrect = question.correctBoolean != null &&
                  response.selectedBoolean != null &&
                  response.selectedBoolean === question.correctBoolean;
      break;

    case QUESTION_TYPES.SHORT_ANSWER:
    case "short_answer":
    case QUESTION_TYPES.FILL_BLANK:
    case "fill_blank":
    case "fill": {
      const typed   = (response.textAnswer || "").trim().toLowerCase();
      const correct = (question.correctAnswerText || "").trim().toLowerCase();
      isCorrect = typed.length > 0 && (
        typed === correct ||
        (question.acceptedAnswers || []).map(x => x.trim().toLowerCase()).includes(typed)
      );
      break;
    }

    case QUESTION_TYPES.NUMERIC:
    case "numeric": {
      const expected = question.numericAnswer?.value;
      const tol      = question.numericAnswer?.tolerance || 0;
      if (expected != null && response.numericAnswer != null) {
        isCorrect = Math.abs(response.numericAnswer - expected) <= tol;
      }
      break;
    }

    default:
      isCorrect = false;
  }

  return { isCorrect, earnedMarks: isCorrect ? marks : 0 };
}

module.exports = { autoGradeAttempt, scoreResponse };

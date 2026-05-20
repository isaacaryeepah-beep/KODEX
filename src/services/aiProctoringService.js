'use strict';
const Anthropic = require('@anthropic-ai/sdk');

const RISK_WEIGHTS = {
  face_absent:          10,
  multiple_faces:       15,
  looking_away:          8,
  phone_detected:       20,
  suspicious_activity:  15,
  tab_switch:            5,
  fullscreen_exit:       8,
};

const SEVERITY_MAP = {
  face_absent:          'medium',
  multiple_faces:       'high',
  looking_away:         'low',
  phone_detected:       'high',
  suspicious_activity:  'high',
  tab_switch:           'low',
  fullscreen_exit:      'medium',
};

function riskFor(type)     { return RISK_WEIGHTS[type]   ?? 0; }
function severityFor(type) { return SEVERITY_MAP[type]   ?? 'info'; }

// Uses Claude Haiku for cost-efficient snapshot analysis.
async function analyzeSnapshot(imageBase64) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      facePresent: true, faceCount: 1, lookingAway: false,
      phoneVisible: false, suspiciousActivity: false,
      notes: 'AI key not configured',
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 },
          },
          {
            type: 'text',
            text: 'Analyze this exam monitoring snapshot. Respond ONLY with valid JSON, no markdown fences: { "facePresent": boolean, "faceCount": number, "lookingAway": boolean, "phoneVisible": boolean, "suspiciousActivity": boolean, "notes": "brief" }',
          },
        ],
      }],
    });

    const raw = response.content[0]?.text?.trim() || '{}';
    return JSON.parse(raw);
  } catch (err) {
    console.error('[AIProctoringService] analyzeSnapshot error:', err.message);
    return {
      facePresent: true, faceCount: 1, lookingAway: false,
      phoneVisible: false, suspiciousActivity: false,
      notes: 'analysis_failed',
    };
  }
}

// Converts AI analysis result into a list of violation objects
function detectViolations(analysis) {
  const violations = [];

  if (!analysis.facePresent) {
    violations.push({ type: 'face_absent', severity: severityFor('face_absent'), riskPoints: riskFor('face_absent'), message: 'No face detected in frame' });
  } else if (analysis.faceCount > 1) {
    violations.push({ type: 'multiple_faces', severity: severityFor('multiple_faces'), riskPoints: riskFor('multiple_faces'), message: `${analysis.faceCount} faces detected` });
  }

  if (analysis.lookingAway) {
    violations.push({ type: 'looking_away', severity: severityFor('looking_away'), riskPoints: riskFor('looking_away'), message: 'Candidate is not looking at screen' });
  }

  if (analysis.phoneVisible) {
    violations.push({ type: 'phone_detected', severity: severityFor('phone_detected'), riskPoints: riskFor('phone_detected'), message: 'Mobile device visible in frame' });
  }

  if (analysis.suspiciousActivity) {
    violations.push({ type: 'suspicious_activity', severity: severityFor('suspicious_activity'), riskPoints: riskFor('suspicious_activity'), message: analysis.notes || 'Suspicious activity detected' });
  }

  return violations;
}

// Generates an automated integrity report for a session
async function generateReport(session) {
  const { riskScore, violations, snapshotCount } = session;
  const integrityScore = Math.max(0, 100 - riskScore);

  const counts = {};
  for (const v of violations) {
    counts[v.type] = (counts[v.type] || 0) + 1;
  }

  const lines = Object.entries(counts).map(([t, n]) => `${n}× ${t.replace(/_/g,' ')}`);

  const summary = violations.length === 0
    ? `Session completed with no violations across ${snapshotCount} AI snapshots. Integrity score: ${integrityScore}/100.`
    : `${violations.length} violation(s) detected across ${snapshotCount} AI snapshots: ${lines.join(', ')}. Integrity score: ${integrityScore}/100.`;

  return {
    integrityScore,
    summary,
    violationCount: violations.length,
    generatedAt:    new Date(),
  };
}

module.exports = { analyzeSnapshot, detectViolations, generateReport, riskFor, severityFor };

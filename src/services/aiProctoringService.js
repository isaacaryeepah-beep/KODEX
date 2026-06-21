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

// Uses Claude Opus 4.8 for strict, comprehensive snapshot analysis.
async function analyzeSnapshot(imageBase64, mimeType) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      facePresent: true, faceCount: 1, lookingAway: false,
      phoneVisible: false, suspiciousActivity: false,
      suspiciousActivityType: 'none', notes: 'AI key not configured',
    };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const mediaType = (mimeType || 'image/jpeg');

  const STRICT_PROMPT = `You are a strict AI examination invigilator with zero tolerance for academic dishonesty. Analyze this live exam monitoring snapshot with maximum scrutiny.

Examine for ALL of the following:
1. Face presence — is exactly one face clearly visible and centered?
2. Face count — any additional person is an immediate violation
3. Gaze direction — eyes looking away from screen, to the side, or downward is suspicious
4. Mobile phone, tablet, or secondary screen visible anywhere in frame
5. Written notes, textbooks, printed pages, or any reference material
6. Another person entering or visible in background
7. Earpiece, earbud, or wired device in ear that could provide audio cues
8. Student looking down repeatedly (could be reading notes below camera view)
9. Unusual hand movements suggesting writing notes or using a hidden device
10. Face partially obscured — covering mouth, turning profile, blocking camera
11. Poor or suspicious lighting that prevents clear facial identification
12. Student whispering, mouthing words, or appears to be communicating

Be very strict — flag ANY ambiguity. False positives are acceptable; missed violations are not.

Respond ONLY with valid JSON, no markdown fences, no extra text:
{"facePresent":boolean,"faceCount":number,"lookingAway":boolean,"phoneVisible":boolean,"suspiciousActivity":boolean,"suspiciousActivityType":"none|notes_visible|extra_person|earpiece|writing|obstructed|bad_lighting|looking_down|communication|other","notes":"concise max-80-char description"}`;

  try {
    const response = await client.messages.create({
      model:      'claude-opus-4-8',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
          { type: 'text',  text: STRICT_PROMPT },
        ],
      }],
    });

    // Extract text block (skip any thinking blocks)
    const textBlock = response.content.find(function(b) { return b.type === 'text'; });
    const rawText = (textBlock && textBlock.text ? textBlock.text : '{}').trim();
    const raw = rawText.replace(/^```json?\s*/i, '').replace(/```\s*$/i, '').trim();
    const result = JSON.parse(raw);
    return {
      facePresent:            typeof result.facePresent        === 'boolean' ? result.facePresent        : true,
      faceCount:              typeof result.faceCount          === 'number'  ? result.faceCount          : 1,
      lookingAway:            typeof result.lookingAway        === 'boolean' ? result.lookingAway        : false,
      phoneVisible:           typeof result.phoneVisible       === 'boolean' ? result.phoneVisible       : false,
      suspiciousActivity:     typeof result.suspiciousActivity === 'boolean' ? result.suspiciousActivity : false,
      suspiciousActivityType: result.suspiciousActivityType || 'none',
      notes:                  result.notes || '',
    };
  } catch (err) {
    console.error('[AIProctoringService] analyzeSnapshot error:', err.message);
    return {
      facePresent: true, faceCount: 1, lookingAway: false,
      phoneVisible: false, suspiciousActivity: false,
      suspiciousActivityType: 'none', notes: 'analysis_failed',
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

// Generates an integrity report for a SnapQuiz attempt by querying DB records.
// Returns { integrityScore, summary, violationCount, snapshotCount, flaggedCount, generatedAt }
async function generateQuizReport(attemptId) {
  // Lazy-require to avoid circular deps at module load time
  const SnapQuizViolationLog    = require('../models/SnapQuizViolationLog');
  const SnapQuizProctoringEvent = require('../models/SnapQuizProctoringEvent');

  const [violations, snapshots] = await Promise.all([
    SnapQuizViolationLog.find({ attempt: attemptId }).select('violationType').lean(),
    SnapQuizProctoringEvent.find({ attempt: attemptId }).select('reviewStatus aiRiskScore aiFlags').lean(),
  ]);

  const snapshotCount = snapshots.length;
  const flaggedCount  = snapshots.filter(s => s.reviewStatus === 'flagged').length;

  // Aggregate risk from violations using the existing weight map
  let riskScore = 0;
  for (const v of violations) {
    riskScore += riskFor(v.violationType) || 3;
  }
  // AI risk from snapshots
  for (const s of snapshots) {
    riskScore += (s.aiRiskScore || 0) * 20;
  }
  riskScore = Math.min(100, Math.round(riskScore));

  const integrityScore = Math.max(0, 100 - riskScore);

  const typeCounts = {};
  for (const v of violations) {
    typeCounts[v.violationType] = (typeCounts[v.violationType] || 0) + 1;
  }
  const lines = Object.entries(typeCounts).map(([t, n]) => `${n}× ${t.replace(/_/g, ' ')}`);

  const summary = violations.length === 0 && flaggedCount === 0
    ? `Completed with no violations across ${snapshotCount} AI snapshot${snapshotCount !== 1 ? 's' : ''}. Integrity score: ${integrityScore}/100.`
    : `${violations.length} violation(s) detected${flaggedCount > 0 ? `, ${flaggedCount} flagged snapshot(s)` : ''}. ${lines.join(', ')}. Integrity score: ${integrityScore}/100.`;

  return {
    integrityScore,
    summary,
    violationCount: violations.length,
    snapshotCount,
    flaggedCount,
    generatedAt: new Date(),
  };
}

module.exports = { analyzeSnapshot, detectViolations, generateReport, generateQuizReport, riskFor, severityFor };

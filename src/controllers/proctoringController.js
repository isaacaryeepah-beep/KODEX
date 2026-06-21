'use strict';
const MeetingParticipant = require('../models/MeetingParticipant');
const ProctoringEvent    = require('../models/ProctoringEvent');
const { broadcastMonitor } = require('./meetingMonitorController');
const { broadcastMonitorWs } = require('../services/monitorWs');

// Risk weight added to participant.riskScore per event type
const RISK_WEIGHTS = {
  tab_switch:          5,
  fullscreen_exit:     8,
  face_not_detected:   10,
  multiple_faces:      15,
  camera_off:          6,
  mic_off:             3,
  network_drop:        3,
  reconnect:           2,
  suspicious_activity: 20,
  devtools_open:       12,
  // Zero-weight events (informational only)
  session_start:       0,
  fullscreen_enter:    0,
  camera_on:           0,
  screen_share_started:0,
  screenshot:          0,
};

function severityFor(type) {
  if (['multiple_faces','suspicious_activity','devtools_open'].includes(type)) return 'high';
  if (['face_not_detected','fullscreen_exit','camera_off'].includes(type))     return 'medium';
  if (['tab_switch','mic_off','network_drop'].includes(type))                  return 'low';
  return 'info';
}

// ── POST /api/meetings/:id/proctoring/event  (student-side) ──────────────────
exports.postEvent = async (req, res) => {
  try {
    const { type, metadata } = req.body;
    if (!type) return res.status(400).json({ error: 'type is required' });

    const userId   = req.user._id;
    const mid      = req.params.id;
    const severity = severityFor(type);

    // Persist event
    const event = await ProctoringEvent.create({
      meeting: mid, company: req.user.company,
      user: userId, type, severity,
      metadata: metadata || null,
      timestamp: new Date(),
    });

    // Update participant counters + risk score
    const p = await MeetingParticipant.findOne({ meeting: mid, user: userId });
    if (p) {
      p.riskScore = Math.min(100, (p.riskScore || 0) + (RISK_WEIGHTS[type] ?? 0));

      if (type === 'tab_switch')        p.tabSwitchCount      += 1;
      if (type === 'fullscreen_exit')   p.fullscreenExitCount += 1;
      if (type === 'network_drop')      p.networkDropCount    += 1;
      if (type === 'reconnect')         p.reconnectCount      += 1;
      if (type === 'face_not_detected') p.faceDetectionStatus  = 'no_face';
      if (type === 'multiple_faces')    p.faceDetectionStatus  = 'multiple_faces';
      if (type === 'camera_on')         p.faceDetectionStatus  = 'ok';

      if (type === 'screenshot' && metadata?.url) {
        p.recentScreenshots.push({
          url:         metadata.url,
          thumbnailUrl:metadata.thumbnailUrl || metadata.url,
        });
        if (p.recentScreenshots.length > 5) p.recentScreenshots.shift();
      }

      await p.save();

      // Push to all monitor dashboards watching this meeting
      const proctoringPayload = {
        userId:              String(userId),
        type, severity,
        metadata:            metadata || null,
        timestamp:           event.timestamp,
        riskScore:           p.riskScore,
        tabSwitchCount:      p.tabSwitchCount,
        fullscreenExitCount: p.fullscreenExitCount,
        networkDropCount:    p.networkDropCount,
        faceDetectionStatus: p.faceDetectionStatus,
      };
      broadcastMonitor(mid, 'proctoring_event', proctoringPayload);
      broadcastMonitorWs(mid, 'proctoring_event', proctoringPayload);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/meetings/:id/proctoring/student/:uid  (invigilator) ─────────────
exports.getStudentDetail = async (req, res) => {
  try {
    const p = await MeetingParticipant.findOne({
      meeting: req.params.id,
      user:    req.params.uid,
      company: req.user.company,
    }).populate('user', 'name email role studentId IndexNumber').lean();
    if (!p) return res.status(404).json({ error: 'Participant not found' });

    const events = await ProctoringEvent.find({
      meeting: req.params.id,
      user:    req.params.uid,
    }).sort({ timestamp: -1 }).limit(50).lean();

    res.json({ success: true, data: { participant: p, events } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /api/meetings/:id/proctoring/snapshot  (student AI analysis) ────────
exports.postSnapshot = async (req, res) => {
  try {
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

    const { analyzeSnapshot, detectViolations } = require('../services/aiProctoringService');
    const analysis   = await analyzeSnapshot(imageBase64, mimeType || 'image/jpeg');
    const violations = detectViolations(analysis);

    const userId = req.user._id;
    const mid    = req.params.id;

    let totalRisk = 0;
    for (const v of violations) {
      await ProctoringEvent.create({
        meeting:   mid,
        company:   req.user.company,
        user:      userId,
        type:      v.type,
        severity:  v.severity,
        metadata:  { riskPoints: v.riskPoints, message: v.message, aiNotes: analysis.notes, suspiciousType: analysis.suspiciousActivityType },
        timestamp: new Date(),
      });
      totalRisk += v.riskPoints || 0;
    }

    let currentRisk = 0;
    const p = await MeetingParticipant.findOne({ meeting: mid, user: userId });
    if (p) {
      p.riskScore = Math.min(100, (p.riskScore || 0) + totalRisk);
      if (analysis.facePresent === false)   p.faceDetectionStatus = 'no_face';
      else if (analysis.faceCount > 1)      p.faceDetectionStatus = 'multiple_faces';
      else                                  p.faceDetectionStatus = 'ok';
      await p.save();
      currentRisk = p.riskScore;

      if (violations.length > 0) {
        const payload = {
          userId:              String(userId),
          type:                'ai_snapshot',
          severity:            violations[0].severity,
          timestamp:           new Date(),
          metadata:            { violations: violations.map(v => v.type), aiNotes: analysis.notes },
          riskScore:           p.riskScore,
          faceDetectionStatus: p.faceDetectionStatus,
        };
        broadcastMonitor(mid, 'proctoring_event', payload);
        broadcastMonitorWs(mid, 'proctoring_event', payload);
      }
    }

    res.json({ success: true, violations, riskScore: currentRisk, analysis });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── GET /api/meetings/:id/proctoring/analytics  (invigilator) ───────────────
exports.getAnalytics = async (req, res) => {
  try {
    const mid = req.params.id;

    const [participants, eventCounts] = await Promise.all([
      MeetingParticipant.find({ meeting: mid, company: req.user.company })
        .select('user riskScore tabSwitchCount fullscreenExitCount networkDropCount isFlagged status faceDetectionStatus')
        .populate('user', 'name role').lean(),
      ProctoringEvent.aggregate([
        { $match: { meeting: new (require('mongoose').Types.ObjectId)(mid) } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]),
    ]);

    const eventsByType = {};
    eventCounts.forEach(e => { eventsByType[e._id] = e.count; });

    const riskBuckets = { safe: 0, medium: 0, high: 0, critical: 0 };
    participants.forEach(p => {
      const s = p.riskScore || 0;
      if (s <= 30)      riskBuckets.safe++;
      else if (s <= 60) riskBuckets.medium++;
      else if (s <= 80) riskBuckets.high++;
      else              riskBuckets.critical++;
    });

    const avgRisk = participants.length
      ? Math.round(participants.reduce((acc, p) => acc + (p.riskScore || 0), 0) / participants.length)
      : 0;

    res.json({
      success: true,
      data: {
        totalParticipants: participants.length,
        riskBuckets, eventsByType, avgRisk,
        flaggedCount: participants.filter(p => p.isFlagged).length,
        highRiskCount: participants.filter(p => (p.riskScore || 0) > 60).length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

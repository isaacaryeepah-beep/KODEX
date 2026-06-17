'use strict';
const mongoose         = require('mongoose');
const ExamSession      = require('../models/ExamSession');
const Meeting          = require('../models/Meeting');
const { analyzeSnapshot, detectViolations, generateReport, riskFor, severityFor } = require('../services/aiProctoringService');

const MODERATOR_ROLES = ['lecturer', 'manager', 'admin', 'superadmin', 'hod'];
function isMod(role) { return MODERATOR_ROLES.includes((role || '').toLowerCase()); }

// ── POST /api/exam/sessions  (student starts exam) ────────────────────────────
exports.startSession = async (req, res, next) => {
  try {
    const { meetingId } = req.body;
    if (!meetingId) return res.status(400).json({ error: 'meetingId is required' });
    if (!mongoose.isValidObjectId(meetingId)) return res.status(400).json({ error: 'Invalid meetingId' });

    const meeting = await Meeting.findOne({ _id: meetingId, company: req.user.company, isActive: true });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.status !== 'live') return res.status(403).json({ error: 'Exam is not live yet.' });

    // Prevent duplicate active sessions
    const existing = await ExamSession.findOne({ meeting: meetingId, student: req.user._id, status: 'active' });
    if (existing) return res.json({ success: true, data: { sessionId: existing._id } });

    const session = await ExamSession.create({
      meeting: meetingId,
      student: req.user._id,
      company: req.user.company,
    });

    res.status(201).json({ success: true, data: { sessionId: session._id } });
  } catch (err) { next(err); }
};

// ── POST /api/exam/sessions/:id/snapshot  (student posts AI snapshot) ────────
exports.submitSnapshot = async (req, res, next) => {
  try {
    const session = await ExamSession.findOne({ _id: req.params.id, student: req.user._id, status: 'active' });
    if (!session) return res.status(404).json({ error: 'Active session not found' });

    const { imageData } = req.body; // base64 JPEG
    if (!imageData) return res.status(400).json({ error: 'imageData is required' });

    session.snapshotCount += 1;

    // Run AI analysis
    const analysis  = await analyzeSnapshot(imageData);
    const newViolations = detectViolations(analysis);

    let riskDelta = 0;
    for (const v of newViolations) {
      riskDelta += v.riskPoints;
      session.violations.push({ ...v, timestamp: new Date() });
    }

    session.riskScore = Math.min(100, session.riskScore + riskDelta);
    await session.save();

    res.json({
      success: true,
      data: {
        riskScore:      session.riskScore,
        newViolations,
        snapshotCount:  session.snapshotCount,
      },
    });
  } catch (err) { next(err); }
};

// ── POST /api/exam/sessions/:id/event  (browser event: tab switch, etc.) ─────
exports.submitEvent = async (req, res, next) => {
  try {
    const session = await ExamSession.findOne({ _id: req.params.id, student: req.user._id, status: 'active' });
    if (!session) return res.status(404).json({ error: 'Active session not found' });

    const { type, metadata } = req.body;
    if (!type) return res.status(400).json({ error: 'type is required' });

    const points   = riskFor(type);
    const severity = severityFor(type);

    session.violations.push({
      type,
      severity,
      riskPoints: points,
      message:    (metadata?.message) || type.replace(/_/g, ' '),
      timestamp:  new Date(),
    });
    session.riskScore = Math.min(100, session.riskScore + points);
    await session.save();

    res.json({ success: true, data: { riskScore: session.riskScore } });
  } catch (err) { next(err); }
};

// ── POST /api/exam/sessions/:id/end  (student finishes exam) ─────────────────
exports.endSession = async (req, res, next) => {
  try {
    const session = await ExamSession.findOne({ _id: req.params.id, student: req.user._id, status: 'active' });
    if (!session) return res.status(404).json({ error: 'Active session not found' });

    session.status  = 'completed';
    session.endedAt = new Date();
    session.report  = await generateReport(session);
    await session.save();

    res.json({ success: true, data: { report: session.report, riskScore: session.riskScore } });
  } catch (err) { next(err); }
};

// ── GET /api/exam/sessions/:id/report  (lecturer gets report) ────────────────
exports.getReport = async (req, res, next) => {
  try {
    if (!isMod(req.user.role)) return res.status(403).json({ error: 'Moderators only' });

    const session = await ExamSession.findOne({ _id: req.params.id, company: req.user.company })
      .populate('student', 'name email')
      .populate('meeting', 'title')
      .lean();
    if (!session) return res.status(404).json({ error: 'Session not found' });

    res.json({ success: true, data: session });
  } catch (err) { next(err); }
};

// ── GET /api/exam/meetings/:meetingId/sessions  (lecturer views all students) ─
exports.listSessions = async (req, res, next) => {
  try {
    if (!isMod(req.user.role)) return res.status(403).json({ error: 'Moderators only' });
    if (!mongoose.isValidObjectId(req.params.meetingId)) return res.status(400).json({ error: 'Invalid meetingId' });

    const sessions = await ExamSession.find({ meeting: req.params.meetingId, company: req.user.company })
      .populate('student', 'name email')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: sessions });
  } catch (err) { next(err); }
};

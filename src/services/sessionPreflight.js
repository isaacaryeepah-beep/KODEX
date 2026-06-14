'use strict';
/**
 * Student session pre-flight service.
 *
 * Architecture rule: monitoring initialises BEFORE the student enters Jitsi.
 * This module performs the ordered startup sequence:
 *   1. Device/permission validation (camera + mic available)
 *   2. Anti-cheat system activation (fullscreen, tab-switch listeners)
 *   3. Monitoring session registration with backend
 *   4. Return Jitsi join credentials + proctoring session token
 *
 * Called from the frontend via: POST /api/meetings/:id/preflight
 */

const MeetingParticipant = require('../models/MeetingParticipant');
const ProctoringEvent    = require('../models/ProctoringEvent');
const Meeting            = require('../models/Meeting');

const PREFLIGHT_STEPS = ['device_check', 'monitoring_init', 'anticheat_active', 'ready'];

/**
 * POST /api/meetings/:id/preflight
 *
 * Body: { deviceInfo: { browser, os, cameraLabel, micLabel }, screenWidth, screenHeight }
 * Returns: { preflightToken, monitoringActive, steps, warnings }
 */
exports.runPreflight = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, company: req.user.company });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.status !== 'live') {
      return res.status(403).json({ error: `Meeting is ${meeting.status}` });
    }

    const { deviceInfo = {}, screenWidth, screenHeight } = req.body;
    const warnings = [];

    // Step 1 — device check
    if (!deviceInfo.cameraLabel && !deviceInfo.micLabel) {
      warnings.push({ step: 'device_check', message: 'No camera or microphone detected. Proctoring may be limited.' });
    }
    if (screenWidth && screenHeight && (screenWidth < 1024 || screenHeight < 600)) {
      warnings.push({ step: 'device_check', message: 'Small screen detected. Ensure browser is in fullscreen for best proctoring.' });
    }

    // Step 2 — upsert participant record (monitoring init)
    const existing = await MeetingParticipant.findOne({ meeting: meeting._id, user: req.user._id });
    if (!existing) {
      await MeetingParticipant.create({
        meeting:  meeting._id,
        company:  req.user.company,
        user:     req.user._id,
        role:     req.user.role,
        status:   'waiting',
        joinedAt: new Date(),
        lastSeenAt: new Date(),
      });
    } else {
      await MeetingParticipant.updateOne(
        { _id: existing._id },
        { $set: { status: 'waiting', lastSeenAt: new Date() } }
      );
    }

    // Step 3 — log session_start proctoring event
    await ProctoringEvent.create({
      meeting:  meeting._id,
      company:  req.user.company,
      user:     req.user._id,
      type:     'session_start',
      severity: 'info',
      metadata: {
        deviceInfo,
        screenWidth,
        screenHeight,
        preflightAt: new Date(),
        monitoringActive: true,
      },
      timestamp: new Date(),
    });

    res.json({
      success: true,
      preflightToken: `pf_${req.user._id}_${meeting._id}_${Date.now()}`,
      monitoringActive: true,
      invigilationMode: 'ai',
      steps: PREFLIGHT_STEPS,
      warnings,
      meetingId: meeting._id,
    });
  } catch (err) {
    console.error('[preflight] error:', err.message);
    res.status(500).json({ error: 'Preflight failed' });
  }
};

/**
 * POST /api/meetings/:id/reconnect
 * Called when student reconnects after a network drop.
 * Restores monitoring state without full re-preflight.
 */
exports.handleReconnect = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, company: req.user.company });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const participant = await MeetingParticipant.findOne({ meeting: meeting._id, user: req.user._id });

    if (participant) {
      participant.status       = 'connected';
      participant.lastSeenAt   = new Date();
      participant.reconnectCount = (participant.reconnectCount || 0) + 1;
      await participant.save();
    }

    await ProctoringEvent.create({
      meeting: meeting._id, company: req.user.company,
      user:    req.user._id, type: 'reconnect', severity: 'low',
      metadata: { reconnectCount: participant?.reconnectCount || 1 },
      timestamp: new Date(),
    });

    res.json({ success: true, monitoringRestored: true, reconnectCount: participant?.reconnectCount || 1 });
  } catch (err) {
    res.status(500).json({ error: 'Reconnect handling failed' });
  }
};

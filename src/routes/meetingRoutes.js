'use strict';
const express = require('express');
const router  = express.Router();

const meetCtrl       = require('../controllers/meetingController');
const attendCtrl     = require('../controllers/meetingAttendanceController');
const monitorCtrl    = require('../controllers/meetingMonitorController');
const proctoringCtrl = require('../controllers/proctoringController');
const preflight      = require('../services/sessionPreflight');

const authenticate        = require('../middleware/auth');
const { companyIsolation } = require('../middleware/companyIsolation');
const requireNoDeviceLock  = require('../middleware/requireNoDeviceLock');

const {
  requireActiveSubscription,
  canCreateMeeting,
  attachMode,
  loadMeeting,
  isOwner,
  canJoin,
  isModerator,
} = require('../middleware/meetingMiddleware');

// All routes require auth + company isolation + mode attachment
router.use(authenticate, companyIsolation, attachMode);

// ─── DISCOVERY ────────────────────────────────────────────────────────────────
router.get('/upcoming',    meetCtrl.upcomingMeetings);
router.get('/live',        meetCtrl.liveMeetings);
router.get('/my-meetings', meetCtrl.myMeetings);
router.get('/validate-token', meetCtrl.validateMeetingToken);
// Jitsi infrastructure health: verifies JWT generation + BOSH reachability
router.get('/jitsi/health',  meetCtrl.jitsiHealth);
router.get('/',              meetCtrl.listMeetings);

// ─── CREATE ───────────────────────────────────────────────────────────────────
router.post('/create', canCreateMeeting, requireActiveSubscription, meetCtrl.createMeeting);

// ─── SINGLE MEETING ───────────────────────────────────────────────────────────
router.get('/:id', meetCtrl.getMeeting);

router.put('/:id/update',  loadMeeting, isOwner, meetCtrl.updateMeeting);
router.post('/:id/start',  loadMeeting, isOwner, meetCtrl.startMeeting);
router.post('/:id/end',    loadMeeting, isOwner, meetCtrl.endMeeting);
router.post('/:id/cancel', loadMeeting, isOwner, meetCtrl.cancelMeeting);
router.delete('/:id/delete', loadMeeting, isOwner, meetCtrl.deleteMeeting);

// ─── ROOM CONTROL (moderator) ─────────────────────────────────────────────────
router.post('/:id/lock',                      loadMeeting, isModerator, meetCtrl.lockRoom);
router.post('/:id/unlock',                    loadMeeting, isModerator, meetCtrl.unlockRoom);
router.post('/:id/mute-all',                  loadMeeting, isModerator, meetCtrl.muteAll);
router.post('/:id/participants/:uid/mute',    loadMeeting, isModerator, meetCtrl.muteParticipant);

// ─── INVIGILATOR MANAGEMENT (owner only) ─────────────────────────────────────
router.post('/:id/invigilators/add',    loadMeeting, isOwner, meetCtrl.addInvigilator);
router.post('/:id/invigilators/remove', loadMeeting, isOwner, meetCtrl.removeInvigilator);

// ─── PRE-FLIGHT (monitoring initialises BEFORE Jitsi join) ───────────────────
// Students must POST here first; monitoring activates, then join is returned
router.post('/:id/preflight',  preflight.runPreflight);
router.post('/:id/reconnect',  preflight.handleReconnect);

// ─── JOIN ─────────────────────────────────────────────────────────────────────
router.get('/:id/join', loadMeeting, requireNoDeviceLock, canJoin, meetCtrl.joinMeeting);

// ─── PREFLIGHT (monitoring init before Jitsi join) ────────────────────────────
router.post('/:id/preflight', loadMeeting, requireNoDeviceLock, canJoin, meetCtrl.preflightMeeting);

// ─── RECONNECT (monitoring restore after Jitsi reconnect) ─────────────────────
router.post('/:id/reconnect', meetCtrl.reconnectMeeting);

// ─── LIVE MONITORING (SSE + polling) ─────────────────────────────────────────
// Monitor dashboard data (moderators/invigilators only — enforced inside controller)
router.get('/:id/monitor',        monitorCtrl.getMonitorData);
// SSE stream for monitor dashboard
router.get('/:id/monitor/stream', monitorCtrl.monitorStream);
// Invigilation mode switch (ai | human | hybrid)
router.post('/:id/monitor/invigilation-mode', loadMeeting, isModerator, monitorCtrl.setInvigilationMode);
// SSE stream for individual participant (receives warnings/kicks)
router.get('/:id/participant-stream', monitorCtrl.participantStream);

// ─── PARTICIPANT STATUS (called by client every 10s during meeting) ───────────
router.post('/:id/participants/status', monitorCtrl.updateParticipantStatus);

// ─── MODERATOR ACTIONS ON PARTICIPANTS ────────────────────────────────────────
router.post('/:id/invigilation-mode',        monitorCtrl.setInvigilationMode);
router.post('/:id/participants/:uid/flag',   loadMeeting, isModerator, monitorCtrl.flagParticipant);
router.post('/:id/participants/:uid/unflag', loadMeeting, isModerator, monitorCtrl.unflagParticipant);
router.post('/:id/participants/:uid/warn',   loadMeeting, isModerator, monitorCtrl.sendWarning);
router.post('/:id/participants/:uid/kick',   loadMeeting, isModerator, monitorCtrl.kickParticipant);

// ─── PROCTORING ───────────────────────────────────────────────────────────────
// Student posts a monitoring event (tab switch, fullscreen exit, face detection, etc.)
router.post('/:id/proctoring/event',            proctoringCtrl.postEvent);
// Invigilator gets detailed event log + screenshots for one participant
router.get('/:id/proctoring/student/:uid',      loadMeeting, isModerator, proctoringCtrl.getStudentDetail);
// Invigilator gets session-level analytics (risk distribution, event counts)
router.get('/:id/proctoring/analytics',         loadMeeting, isModerator, proctoringCtrl.getAnalytics);

// ─── ATTENDANCE ───────────────────────────────────────────────────────────────
router.post('/:id/attendance/join',  loadMeeting, requireNoDeviceLock, canJoin, attendCtrl.joinAttendance);
router.post('/:id/attendance/leave', loadMeeting, attendCtrl.leaveAttendance);
router.get('/:id/attendance',        loadMeeting, attendCtrl.getAttendance);
router.get('/:id/attendance/report', loadMeeting, attendCtrl.attendanceReport);
router.get('/:id/attendance/pdf',    loadMeeting, attendCtrl.downloadPDF);

module.exports = router;

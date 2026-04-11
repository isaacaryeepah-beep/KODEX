const express = require('express');
const router  = express.Router();

const meetCtrl  = require('../controllers/meetingController');
const attendCtrl = require('../controllers/meetingAttendanceController');

// Your existing middleware
const authenticate         = require('../middleware/auth');
const { companyIsolation } = require('../middleware/companyIsolation');

// Meeting-specific middleware
const {
  requireActiveSubscription,
  canCreateMeeting,
  attachMode,
  loadMeeting,
  isOwner,
  canJoin
} = require('../middleware/meetingMiddleware');

// All routes require auth + company isolation
router.use(authenticate, companyIsolation, attachMode);

// ─── MEETING ROUTES ───────────────────────────────────────────────────────────
router.get('/upcoming',    meetCtrl.upcomingMeetings);
router.get('/live',        meetCtrl.liveMeetings);
router.get('/my-meetings', meetCtrl.myMeetings);

router.post('/create',
  canCreateMeeting,
  requireActiveSubscription,
  meetCtrl.createMeeting
);

router.get('/',  meetCtrl.listMeetings);
router.get('/:id', meetCtrl.getMeeting);

router.put('/:id/update',  loadMeeting, isOwner, meetCtrl.updateMeeting);
router.post('/:id/start',  loadMeeting, isOwner, meetCtrl.startMeeting);
router.post('/:id/end',    loadMeeting, isOwner, meetCtrl.endMeeting);
router.post('/:id/cancel', loadMeeting, isOwner, meetCtrl.cancelMeeting);
router.delete('/:id/delete', loadMeeting, isOwner, meetCtrl.deleteMeeting);

router.get('/:id/join', loadMeeting, canJoin, meetCtrl.joinMeeting);

// ─── ATTENDANCE ROUTES ────────────────────────────────────────────────────────
router.post('/:id/attendance/join',    loadMeeting, canJoin, attendCtrl.joinAttendance);
router.post('/:id/attendance/leave',   loadMeeting, attendCtrl.leaveAttendance);
router.get('/:id/attendance',          loadMeeting, attendCtrl.getAttendance);
router.get('/:id/attendance/report',   loadMeeting, attendCtrl.attendanceReport);
router.get('/:id/attendance/pdf',      loadMeeting, attendCtrl.downloadPDF);

module.exports = router;

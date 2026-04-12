const express = require('express');
const router  = express.Router();

const authenticate         = require('../middleware/auth');
const { companyIsolation } = require('../middleware/companyIsolation');
const ctrl                 = require('../controllers/sessionDashboardController');

router.use(authenticate);
router.use(companyIsolation);

// ── Role guards ───────────────────────────────────────────────────────────────
const lecturerOrAbove = (req, res, next) => {
  if (!['lecturer', 'hod', 'admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied.' });
  }
  next();
};

// ── Session state control ─────────────────────────────────────────────────────
router.post('/:id/start',   lecturerOrAbove, ctrl.startSession);
router.post('/:id/pause',   lecturerOrAbove, ctrl.pauseSession);
router.post('/:id/resume',  lecturerOrAbove, ctrl.resumeSession);
router.post('/:id/lock',    lecturerOrAbove, ctrl.lockSession);
router.post('/:id/unlock',  lecturerOrAbove, ctrl.unlockSession);
router.post('/:id/stop',    lecturerOrAbove, ctrl.endSession);
router.put('/:id/update',   lecturerOrAbove, ctrl.updateSession);

// ── Dashboard & live data ─────────────────────────────────────────────────────
router.get('/:id/dashboard',         lecturerOrAbove, ctrl.getDashboard);
router.get('/:id/live-activity',     lecturerOrAbove, ctrl.getLiveActivity);
router.get('/:id/suspicious-events', lecturerOrAbove, ctrl.getSuspiciousEvents);
router.get('/:id/student-table',     lecturerOrAbove, ctrl.getStudentTable);
router.get('/:id/network-status',    lecturerOrAbove, ctrl.getNetworkStatus);

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/:id/report',            lecturerOrAbove, ctrl.getReport);
router.get('/:id/report/pdf',        lecturerOrAbove, ctrl.exportPdf);

// ── Device refresh ────────────────────────────────────────────────────────────
router.post('/:id/refresh-device',   lecturerOrAbove, ctrl.refreshDeviceStatus);

// ── Suspicious event management ───────────────────────────────────────────────
router.patch('/:id/suspicious/:eventId/resolve', lecturerOrAbove, ctrl.resolveSuspiciousEvent);

// ── Attendance record management ──────────────────────────────────────────────
router.delete('/:id/records/:recordId',          lecturerOrAbove, ctrl.removeAttendanceRecord);
router.patch('/:id/records/:recordId/flag',      lecturerOrAbove, ctrl.flagAttendanceRecord);

module.exports = router;

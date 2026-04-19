const express = require('express');
const router  = express.Router();

const deviceCtrl  = require('../controllers/deviceController');
const sessionCtrl = require('../controllers/sessionController');

// auth.js exports authenticate as default, companyIsolation is in its own file
const authenticate       = require('../middleware/auth');
const { companyIsolation } = require('../middleware/companyIsolation');

// ─── DEVICE ROUTES ────────────────────────────────────────────────────────────
router.post('/devices/register',          authenticate, companyIsolation, deviceCtrl.registerDevice);
router.post('/devices/heartbeat',         authenticate, companyIsolation, deviceCtrl.heartbeat);
router.post('/devices/sync',              authenticate, companyIsolation, deviceCtrl.syncOfflineRecords);
router.put('/devices/:deviceId/networks', authenticate, companyIsolation, deviceCtrl.updateNetworks);
router.get('/devices/my',                 authenticate, companyIsolation, deviceCtrl.getMyDevice);
router.get('/devices/:deviceId/status',   authenticate, companyIsolation, deviceCtrl.getDeviceStatus);
router.post('/devices/transfer',          authenticate, deviceCtrl.transferDevice);

// ─── SESSION ROUTES ───────────────────────────────────────────────────────────
router.post('/sessions/start',               authenticate, companyIsolation, sessionCtrl.startSession);
router.post('/sessions/end',                 authenticate, companyIsolation, sessionCtrl.endSession);
router.get('/sessions/active/:deviceId',     authenticate, companyIsolation, sessionCtrl.getActiveSession);
router.post('/sessions/attendance/validate', authenticate, companyIsolation, sessionCtrl.validateAttendance);

module.exports = router;

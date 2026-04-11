const express = require('express');
const router  = express.Router();

const deviceCtrl  = require('../controllers/deviceController');
const sessionCtrl = require('../controllers/sessionController');

// Import your existing auth middleware
const { protect, companyIsolation } = require('../../middleware/auth'); // adjust path

// ─── DEVICE ROUTES ────────────────────────────────────────────────────────────
// All require auth + company isolation
router.post('/devices/register',          protect, companyIsolation, deviceCtrl.registerDevice);
router.post('/devices/heartbeat',         protect, companyIsolation, deviceCtrl.heartbeat);
router.post('/devices/sync',              protect, companyIsolation, deviceCtrl.syncOfflineRecords);
router.put('/devices/:deviceId/networks', protect, companyIsolation, deviceCtrl.updateNetworks);
router.get('/devices/:deviceId/status',   protect, companyIsolation, deviceCtrl.getDeviceStatus);

// Superadmin only — transfer device ownership
router.post('/devices/transfer', protect, deviceCtrl.transferDevice);

// ─── SESSION ROUTES ────────────────────────────────────────────────────────────
router.post('/sessions/start',                protect, companyIsolation, sessionCtrl.startSession);
router.post('/sessions/end',                  protect, companyIsolation, sessionCtrl.endSession);
router.get('/sessions/active/:deviceId',      protect, companyIsolation, sessionCtrl.getActiveSession);
router.post('/sessions/attendance/validate',  protect, companyIsolation, sessionCtrl.validateAttendance);

module.exports = router;

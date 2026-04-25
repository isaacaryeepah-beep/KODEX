const express = require('express');
const router  = express.Router();

const deviceCtrl  = require('../controllers/deviceController');

const authenticate         = require('../middleware/auth');
const deviceAuth           = require('../middleware/deviceAuth');
const { companyIsolation } = require('../middleware/companyIsolation');

// ─── ESP32 DEVICE-SIDE ROUTES (device JWT) ────────────────────────────────────
// These are called by the ESP32 firmware using `Authorization: Bearer <token>`
// where the token was issued by /api/devices/pair.
router.post('/devices/heartbeat', deviceAuth, deviceCtrl.heartbeat);
router.post('/devices/sync',      deviceAuth, deviceCtrl.syncOfflineRecords);

// ─── PAIRING (no JWT — device uses pairingCode + institutionCode) ─────────────
router.post('/devices/pair',          deviceCtrl.pairDevice);

// ─── LECTURER PORTAL ROUTES (user JWT) ────────────────────────────────────────
router.post('/devices/pairing-code',   authenticate, deviceCtrl.generatePairingCode);
router.get('/devices/my',              authenticate, companyIsolation, deviceCtrl.getMyDevice);
router.delete('/devices/my',           authenticate, companyIsolation, deviceCtrl.unlinkDevice);
router.patch('/devices/my/rename',     authenticate, companyIsolation, deviceCtrl.renameDevice);
router.get('/devices/my/activity',     authenticate, companyIsolation, deviceCtrl.getDeviceActivity);
router.put('/devices/:deviceId/networks', authenticate, companyIsolation, deviceCtrl.updateNetworks);
router.get('/devices/:deviceId/status',   authenticate, companyIsolation, deviceCtrl.getDeviceStatus);
router.post('/devices/transfer',          authenticate, deviceCtrl.transferDevice);

// WiFi setup helpers — server proxies to the ESP32 over the local network
router.get('/devices/my/scan-wifi',    authenticate, companyIsolation, deviceCtrl.scanWifi);
router.post('/devices/configure-wifi', authenticate, companyIsolation, deviceCtrl.configureWifi);

module.exports = router;

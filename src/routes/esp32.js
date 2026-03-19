const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/esp32Controller');
const authenticate = require('../middleware/auth');

// ESP32 device routes (no user auth — uses ESP32 token/secret)
router.post('/register', ctrl.register);
router.get('/poll',      ctrl.poll);

// ESP32 student page mark (no user auth — uses index+PIN)
router.post('/mark', ctrl.markViaESP32);

// App routes (requires logged-in user)
router.get('/status',  authenticate, ctrl.status);
router.post('/set-pin', authenticate, ctrl.setPin);

module.exports = router;

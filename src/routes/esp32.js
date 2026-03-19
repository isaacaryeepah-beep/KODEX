const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/esp32Controller');
const authenticate = require('../middleware/auth');

// ESP32 device routes (no user auth -- uses ESP32 token/secret)
router.post('/register', ctrl.register);
router.get('/poll',      ctrl.poll);

// ESP32 student page mark (no user auth -- uses index+PIN)
router.post('/mark', ctrl.markViaESP32);

// ESP32 device routes -- student list + pin verify (uses ESP32 token)
router.get('/student-list', ctrl.studentList);
router.post('/verify-pin',  ctrl.verifyPin);

// App routes (requires logged-in user)
router.get('/status',   authenticate, ctrl.status);
router.post('/set-pin', authenticate, ctrl.setPin);

module.exports = router;

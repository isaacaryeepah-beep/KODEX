const express    = require('express');
const router     = express.Router();
const ctrl       = require('../controllers/esp32Controller');
const authenticate = require('../middleware/auth');

// ESP32 device routes (no user auth — uses ESP32 token/secret)
router.post('/register', ctrl.register);
router.get('/poll',      ctrl.poll);

// App routes (requires logged-in user)
router.get('/status', authenticate, ctrl.status);

module.exports = router;

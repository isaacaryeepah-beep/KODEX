const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/classRepController');

router.get('/device',      authenticate, ctrl.getMyDevice);
router.get('/lecturers',   authenticate, ctrl.getCourseLecturers);
router.post('/connect',    authenticate, ctrl.connectDevice);
router.post('/disconnect', authenticate, ctrl.disconnectDevice);
router.post('/set-pin',    authenticate, ctrl.setLecturerPin);

module.exports = router;

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const ctrl = require('../controllers/classRepController');

router.get('/device',      authenticate, ctrl.getMyDevice);
router.get('/lecturers',   authenticate, ctrl.getCourseLecturers);
router.get('/search-lecturers', authenticate, ctrl.searchLecturers);
router.post('/connect',    authenticate, ctrl.connectDevice);
router.post('/disconnect', authenticate, ctrl.disconnectDevice);
router.post('/set-pin',    authenticate, ctrl.setLecturerPin);
router.delete('/set-pin',  authenticate, ctrl.clearLecturerPin);

module.exports = router;

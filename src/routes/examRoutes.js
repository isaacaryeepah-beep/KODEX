'use strict';
const express    = require('express');
const router     = express.Router();
const examCtrl   = require('../controllers/examController');
const auth       = require('../middleware/auth');
const { companyIsolation } = require('../middleware/companyIsolation');

router.use(auth, companyIsolation);

// Student routes
router.post('/sessions',                         examCtrl.startSession);
router.post('/sessions/:id/snapshot',            examCtrl.submitSnapshot);
router.post('/sessions/:id/event',               examCtrl.submitEvent);
router.post('/sessions/:id/end',                 examCtrl.endSession);

// Lecturer / admin routes
router.get('/sessions/:id/report',               examCtrl.getReport);
router.get('/meetings/:meetingId/sessions',      examCtrl.listSessions);

module.exports = router;

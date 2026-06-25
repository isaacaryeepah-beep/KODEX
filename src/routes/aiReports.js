'use strict';

const express    = require('express');
const router     = express.Router();
const authenticate        = require('../middleware/auth');
const { requireCompanyScope } = require('../middleware/requireCompanyScope');
const ctrl                = require('../controllers/aiReportController');
const { aiGenerateLimiter } = require('../middleware/rateLimiter');

// All routes require a valid JWT
router.use(authenticate);

// Generate — rate-limited (reuse the existing AI limiter: 15 req/hour)
router.post('/generate', aiGenerateLimiter, ctrl.generate);

// List recent reports for this company
router.get('/', requireCompanyScope, ctrl.list);

// Get a specific report
router.get('/:id', requireCompanyScope, ctrl.getOne);

// Delete a report
router.delete('/:id', requireCompanyScope, ctrl.deleteOne);

module.exports = router;

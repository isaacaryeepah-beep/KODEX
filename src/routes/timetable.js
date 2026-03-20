const express    = require('express');
const authenticate = require('../middleware/auth');
const { requireActiveSubscription } = require('../middleware/subscription');
const ctrl = require('../controllers/timetableController');

const router = express.Router();
router.use(authenticate);
router.use(requireActiveSubscription);

router.get('/',    ctrl.list);
router.post('/',   ctrl.create);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;

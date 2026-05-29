const express      = require('express');
const router       = express.Router();
const authenticate = require('../middleware/auth');
const { requireRole } = require('../middleware/role');
const ctrl         = require('../controllers/classRepAdminController');

const canManage = requireRole('admin', 'superadmin', 'hod');

router.post  ('/assign',           authenticate, canManage, ctrl.assignRep);
router.delete('/remove/:userId',   authenticate, canManage, ctrl.removeRep);
router.get   ('/list',             authenticate, canManage, ctrl.listReps);
router.get   ('/students',         authenticate, canManage, ctrl.listStudents);

module.exports = router;

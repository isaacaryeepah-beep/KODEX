const express    = require('express');
const router     = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl       = require('../controllers/classRepAdminController');

const canManage = authorize('admin', 'superadmin', 'hod');

router.post  ('/assign',           protect, canManage, ctrl.assignRep);
router.delete('/remove/:userId',   protect, canManage, ctrl.removeRep);
router.get   ('/list',             protect, canManage, ctrl.listReps);
router.get   ('/students',         protect, canManage, ctrl.listStudents);

module.exports = router;

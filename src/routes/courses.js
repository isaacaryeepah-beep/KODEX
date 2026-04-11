const express = require('express');
const router  = express.Router();

const authenticate      = require('../middleware/auth');
const { companyIsolation } = require('../middleware/companyIsolation');
const { validateCourse, validateEnroll } = require('../middleware/courseValidation');
const courseCtrl        = require('../controllers/courseController');

// All routes require authentication + company isolation
router.use(authenticate);
router.use(companyIsolation);

// ── Role guards ───────────────────────────────────────────────────────────────
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied for your role.' });
  }
  next();
};

const canCreate  = requireRole('lecturer', 'admin', 'superadmin');
const canManage  = requireRole('admin', 'superadmin');
const canUpdate  = requireRole('lecturer', 'admin', 'superadmin');
const canEnroll  = requireRole('admin', 'superadmin', 'lecturer');

// ── Academic mode guard ───────────────────────────────────────────────────────
const requireAcademic = (req, res, next) => {
  const mode = req.user.company?.mode || req.user.companyMode;
  if (mode === 'corporate') {
    return res.status(400).json({ error: 'Courses are only available in Academic mode.' });
  }
  next();
};
router.use(requireAcademic);

// ── Routes ────────────────────────────────────────────────────────────────────

// Create
router.post('/create',   canCreate,  validateCourse, courseCtrl.createCourse);

// List & get
router.get('/',                                      courseCtrl.listCourses);
router.get('/:id',                                   courseCtrl.getCourseById);
router.get('/:id/stats',                             courseCtrl.getCourseStats);

// Update & lifecycle
router.put('/:id/update',   canUpdate,               courseCtrl.updateCourse);
router.put('/:id/archive',  canManage,               courseCtrl.archiveCourse);
router.put('/:id/restore',  canManage,               courseCtrl.restoreCourse);
router.delete('/:id',       canManage,               courseCtrl.deleteCourse);

// Lecturer assignment
router.put('/:id/assign-lecturer', canManage,        courseCtrl.assignLecturer);

// Enrollment
router.post('/:id/enroll-student',  canEnroll, validateEnroll, courseCtrl.enrollStudent);
router.post('/:id/bulk-enroll',     canEnroll,                 courseCtrl.bulkEnrollStudents);
router.delete('/:id/remove-student/:studentId', canEnroll,     courseCtrl.removeStudent);

module.exports = router;

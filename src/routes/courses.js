const express  = require('express');
const router   = express.Router();

const authenticate         = require('../middleware/auth');
const { companyIsolation } = require('../middleware/companyIsolation');
const { validateCreateCourse, validateEnroll } = require('../middleware/courseValidation');
const ctrl                 = require('../controllers/courseController');

// All routes: auth + company isolation
router.use(authenticate);
router.use(companyIsolation);

// ── Role guards ───────────────────────────────────────────────────────────────
const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'Access denied for your role.',
    });
  }
  next();
};

// ── Academic mode guard ───────────────────────────────────────────────────────
const requireAcademic = (req, res, next) => {
  const mode = req.user.company?.mode || req.user.companyMode;
  if (mode === 'corporate') {
    return res.status(400).json({
      success: false,
      message: 'Courses are only available in Academic mode.',
    });
  }
  next();
};
router.use(requireAcademic);

// ── Routes ────────────────────────────────────────────────────────────────────

// Create
router.post(
  '/create',
  requireRole('lecturer', 'admin', 'superadmin'),
  validateCreateCourse,
  ctrl.createCourse
);

// List + Search
router.get('/', ctrl.listCourses);

// Get one + stats
router.get('/:id',       ctrl.getCourseById);
// Stats: lecturer/hod/admin/superadmin only — students get counts via getCourseById
router.get('/:id/stats', requireRole('lecturer', 'hod', 'admin', 'superadmin'), ctrl.getCourseStats);

// Update
router.put(
  '/:id/update',
  requireRole('lecturer', 'admin', 'superadmin'),
  ctrl.updateCourse
);

// Archive / Restore
router.put('/:id/archive', requireRole('admin', 'superadmin'), ctrl.archiveCourse);
router.put('/:id/restore', requireRole('admin', 'superadmin'), ctrl.restoreCourse);

// Delete (hard — only if no history)
router.delete('/:id', requireRole('admin', 'superadmin'), ctrl.deleteCourse);

// Lecturer assignment
router.put(
  '/:id/assign-lecturer',
  requireRole('admin', 'superadmin'),
  ctrl.assignLecturer
);

// Enrollment
router.post(
  '/:id/enroll-student',
  requireRole('admin', 'superadmin', 'lecturer'),
  validateEnroll,
  ctrl.enrollStudent
);
router.post(
  '/:id/bulk-enroll',
  requireRole('admin', 'superadmin', 'lecturer'),
  ctrl.bulkEnrollStudents
);
router.delete(
  '/:id/remove-student/:studentId',
  requireRole('admin', 'superadmin', 'lecturer'),
  ctrl.removeStudent
);

module.exports = router;

const courseService     = require('../services/courseService');
const enrollmentService = require('../services/enrollmentService');

function getCompanyId(req) {
  return req.user.company || req.user.companyId;
}

// ─── POST /courses/create ─────────────────────────────────────────────────────
exports.createCourse = async (req, res) => {
  try {
    const companyId  = getCompanyId(req);
    const creatorId  = req.user._id;
    const isLecturer = req.user.role === 'lecturer';

    // Lecturer-created courses enter HOD approval queue.
    // Admin / superadmin courses are immediately approved.
    const data = {
      ...req.body,
      lecturerId:     isLecturer ? req.user._id : (req.body.lecturerId || null),
      needsApproval:  isLecturer,
      approvalStatus: isLecturer ? 'pending' : 'approved',
    };

    const course = await courseService.createCourse(data, creatorId, companyId);

    return res.status(201).json({
      success: true,
      message: 'Course created successfully.',
      data:    course,
    });
  } catch (err) {
    console.error('[createCourse]', err);
    return res.status(err.status || (err.code === 11000 ? 409 : 500)).json({
      success: false,
      message: err.code === 11000
        ? 'A course with this code already exists for this academic period.'
        : err.message || 'Server error.',
    });
  }
};

// ─── GET /courses ─────────────────────────────────────────────────────────────
exports.listCourses = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const result = await courseService.listCourses(
      req.user.role,
      req.user._id,
      companyId,
      req.query
    );
    return res.json({ success: true, ...result });
  } catch (err) {
    console.error('[listCourses]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /courses/:id ─────────────────────────────────────────────────────────
exports.getCourseById = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const course    = await courseService.getCourse(req.params.id, companyId);

    // Access checks
    const role = req.user.role;
    if (role === 'student') {
      const enrolled = course.enrolledStudents.some(
        s => s._id.toString() === req.user._id.toString()
      );
      if (!enrolled) {
        return res.status(403).json({
          success: false,
          message: 'You are not enrolled in this course.',
        });
      }
    }
    if (role === 'lecturer') {
      const isOwner = course.lecturerId?._id?.toString() === req.user._id.toString();
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'You are not allowed to access this course.',
        });
      }
    }

    return res.json({ success: true, data: course });
  } catch (err) {
    console.error('[getCourseById]', err);
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ─── GET /courses/:id/stats ───────────────────────────────────────────────────
exports.getCourseStats = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const stats     = await courseService.getCourseStats(req.params.id, companyId);
    return res.json({ success: true, data: stats });
  } catch (err) {
    console.error('[getCourseStats]', err);
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ─── PUT /courses/:id/update ──────────────────────────────────────────────────
exports.updateCourse = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const course    = await courseService.updateCourse(
      req.params.id, companyId, req.body, req.user._id, req.user.role
    );
    return res.json({ success: true, message: 'Course updated.', data: course });
  } catch (err) {
    console.error('[updateCourse]', err);
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ─── PUT /courses/:id/archive ─────────────────────────────────────────────────
exports.archiveCourse = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    await courseService.archiveCourse(req.params.id, companyId, req.user._id);
    return res.json({
      success: true,
      message: 'Course archived. Historical data is preserved.',
    });
  } catch (err) {
    console.error('[archiveCourse]', err);
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ─── PUT /courses/:id/restore ─────────────────────────────────────────────────
exports.restoreCourse = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    await courseService.restoreCourse(req.params.id, companyId);
    return res.json({ success: true, message: 'Course restored to active.' });
  } catch (err) {
    console.error('[restoreCourse]', err);
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ─── PUT /courses/:id/assign-lecturer ────────────────────────────────────────
exports.assignLecturer = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { lecturerId } = req.body;
    if (!lecturerId) {
      return res.status(400).json({ success: false, message: 'lecturerId is required.' });
    }
    const course = await courseService.assignLecturer(
      req.params.id, companyId, lecturerId, req.user._id
    );
    return res.json({ success: true, message: 'Lecturer assigned.', data: course });
  } catch (err) {
    console.error('[assignLecturer]', err);
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

// ─── POST /courses/:id/enroll-student ────────────────────────────────────────
exports.enrollStudent = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const result = await enrollmentService.enrollStudent(
      req.params.id, req.body.studentId, companyId
    );
    return res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    console.error('[enrollStudent]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── POST /courses/:id/bulk-enroll ───────────────────────────────────────────
exports.bulkEnrollStudents = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const result = await enrollmentService.bulkEnroll(
      req.params.id, companyId, req.body
    );
    return res.status(result.success ? 200 : 400).json(result);
  } catch (err) {
    console.error('[bulkEnrollStudents]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE /courses/:id/remove-student/:studentId ───────────────────────────
exports.removeStudent = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const result = await enrollmentService.removeStudent(
      req.params.id, req.params.studentId, companyId
    );
    return res.json(result);
  } catch (err) {
    console.error('[removeStudent]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE /courses/:id ─────────────────────────────────────────────────────
exports.deleteCourse = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    await courseService.deleteCourse(req.params.id, companyId);
    return res.json({ success: true, message: 'Course deleted permanently.' });
  } catch (err) {
    console.error('[deleteCourse]', err);
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
};

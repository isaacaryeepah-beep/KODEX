const Course        = require('../models/Course');
const User          = require('../models/User');
const StudentRoster = require('../models/StudentRoster');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCompanyId(req) {
  return req.user.company || req.user.companyId;
}

// ─── CREATE COURSE ────────────────────────────────────────────────────────────
exports.createCourse = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const {
      title, code, description,
      departmentId, programmeId,
      academicYear, semester,
      level, group, sessionType,
    } = req.body;

    if (!title || !code) {
      return res.status(400).json({ error: 'Title and code are required.' });
    }

    // Determine lecturerId
    const lecturerId = req.user.role === 'lecturer' ? req.user._id : (req.body.lecturerId || null);

    // Check uniqueness: same code in same academic context
    const existing = await Course.findOne({
      companyId,
      code:         code.toUpperCase().trim(),
      academicYear: academicYear || null,
      semester:     semester     || null,
      level:        level        || null,
      group:        group        || null,
    });

    if (existing) {
      return res.status(409).json({
        error: `Course "${code}" already exists for this semester, level, and group.`
      });
    }

    const course = await Course.create({
      title,
      code:         code.toUpperCase().trim(),
      description:  description || '',
      companyId,
      departmentId: departmentId || req.user.department || null,
      programmeId:  programmeId  || null,
      lecturerId,
      createdBy:    req.user._id,
      assignedBy:   req.user.role !== 'lecturer' ? req.user._id : null,
      academicYear: academicYear || null,
      semester:     semester     || null,
      level:        level        || null,
      group:        group        || null,
      sessionType:  sessionType  || null,
    });

    await course.populate('lecturerId', 'name email');
    res.status(201).json({ message: 'Course created successfully', course });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'A course with this code already exists for this academic period.' });
    }
    console.error('[createCourse]', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// ─── LIST COURSES ─────────────────────────────────────────────────────────────
exports.listCourses = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const role      = req.user.role;
    const { status, academicYear, semester, departmentId, level, group } = req.query;

    // Base query — always company-isolated and active
    const query = { companyId, isActive: true };

    // Optional filters
    if (status)       query.status       = status;
    if (academicYear) query.academicYear = academicYear;
    if (semester)     query.semester     = semester;
    if (level)        query.level        = level;
    if (group)        query.group        = group;

    // Role-based scoping
    if (role === 'lecturer') {
      query.lecturerId = req.user._id;
    } else if (role === 'student') {
      query.enrolledStudents = req.user._id;
    } else if (role === 'hod') {
      query.departmentId = departmentId || req.user.department;
    } else if (departmentId) {
      query.departmentId = departmentId;
    }
    // admin / superadmin: no scope restriction — see all

    const courses = await Course.find(query)
      .sort({ createdAt: -1 })
      .populate('lecturerId', 'name email department')
      .populate('createdBy',  'name email')
      .lean();

    res.json({ courses });
  } catch (err) {
    console.error('[listCourses]', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// ─── GET COURSE BY ID ─────────────────────────────────────────────────────────
exports.getCourseById = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const course = await Course.findOne({ _id: req.params.id, companyId })
      .populate('lecturerId',       'name email department')
      .populate('createdBy',        'name email')
      .populate('assignedBy',       'name email')
      .populate('enrolledStudents', 'name email indexNumber programme studentLevel studentGroup')
      .lean();

    if (!course) return res.status(404).json({ error: 'Course not found.' });

    // Students can only access their enrolled courses
    const role = req.user.role;
    if (role === 'student' && !course.enrolledStudents.some(s => s._id.toString() === req.user._id.toString())) {
      return res.status(403).json({ error: 'You are not enrolled in this course.' });
    }

    // HOD: only their department
    if (role === 'hod' && course.departmentId !== req.user.department) {
      return res.status(403).json({ error: 'This course is not in your department.' });
    }

    // Lecturer: only own courses
    if (role === 'lecturer' && course.lecturerId?._id?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Attach roster count
    const rosterCount = await StudentRoster.countDocuments({ course: course._id });
    course.rosterCount = rosterCount;

    res.json({ course });
  } catch (err) {
    console.error('[getCourseById]', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// ─── UPDATE COURSE ────────────────────────────────────────────────────────────
exports.updateCourse = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const course = await Course.findOne({ _id: req.params.id, companyId });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    // Lecturer can only update their own courses
    if (req.user.role === 'lecturer' && course.lecturerId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'You can only update your own courses.' });
    }

    const allowed = [
      'title', 'description', 'departmentId', 'programmeId',
      'academicYear', 'semester', 'level', 'group', 'sessionType', 'status'
    ];
    allowed.forEach(f => {
      if (req.body[f] !== undefined) course[f] = req.body[f];
    });

    await course.save();
    await course.populate('lecturerId', 'name email');
    res.json({ message: 'Course updated', course });
  } catch (err) {
    console.error('[updateCourse]', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// ─── ARCHIVE COURSE (soft) ────────────────────────────────────────────────────
exports.archiveCourse = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const course = await Course.findOne({ _id: req.params.id, companyId });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    if (course.status === 'archived') {
      return res.status(400).json({ error: 'Course is already archived.' });
    }

    course.status     = 'archived';
    course.isArchived = true;
    course.isActive   = false;
    await course.save();

    res.json({ message: 'Course archived successfully. Historical data is preserved.' });
  } catch (err) {
    console.error('[archiveCourse]', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// ─── RESTORE COURSE ───────────────────────────────────────────────────────────
exports.restoreCourse = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const course = await Course.findOne({ _id: req.params.id, companyId });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    course.status     = 'active';
    course.isArchived = false;
    course.isActive   = true;
    await course.save();

    res.json({ message: 'Course restored to active.' });
  } catch (err) {
    console.error('[restoreCourse]', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// ─── ASSIGN LECTURER ──────────────────────────────────────────────────────────
exports.assignLecturer = async (req, res) => {
  try {
    const companyId   = getCompanyId(req);
    const { lecturerId } = req.body;

    if (!lecturerId) return res.status(400).json({ error: 'lecturerId is required.' });

    // Verify lecturer exists and belongs to same company
    const lecturer = await User.findOne({
      _id:     lecturerId,
      company: companyId,
      role:    'lecturer',
    });
    if (!lecturer) return res.status(404).json({ error: 'Lecturer not found in this institution.' });

    const course = await Course.findOne({ _id: req.params.id, companyId });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    course.lecturerId = lecturerId;
    course.assignedBy = req.user._id;
    await course.save();

    res.json({ message: `Lecturer assigned to ${course.title}`, course });
  } catch (err) {
    console.error('[assignLecturer]', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// ─── ENROLL STUDENT (manual single) ──────────────────────────────────────────
exports.enrollStudent = async (req, res) => {
  try {
    const companyId  = getCompanyId(req);
    const { studentId } = req.body;

    if (!studentId) return res.status(400).json({ error: 'studentId is required.' });

    const student = await User.findOne({ _id: studentId, company: companyId, role: 'student' });
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    const course = await Course.findOne({ _id: req.params.id, companyId });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    if (course.enrolledStudents.includes(studentId)) {
      return res.status(409).json({ error: 'Student is already enrolled.' });
    }

    course.enrolledStudents.push(studentId);
    await course.save();

    res.json({ message: `${student.name} enrolled in ${course.title}` });
  } catch (err) {
    console.error('[enrollStudent]', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// ─── BULK ENROLL (department / level / group) ─────────────────────────────────
exports.bulkEnrollStudents = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { departmentId, level, group, sessionType, semester, studentIds } = req.body;

    const course = await Course.findOne({ _id: req.params.id, companyId });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    let students = [];

    if (studentIds && Array.isArray(studentIds) && studentIds.length > 0) {
      // Explicit list
      students = await User.find({
        _id:     { $in: studentIds },
        company: companyId,
        role:    'student',
      }).select('_id').lean();
    } else {
      // Auto-match by academic filters
      const filter = { company: companyId, role: 'student' };
      if (departmentId || course.departmentId) filter.department   = departmentId || course.departmentId;
      if (level        || course.level)        filter.studentLevel = level        || course.level;
      if (group        || course.group)        filter.studentGroup = group        || course.group;
      if (sessionType  || course.sessionType)  filter.sessionType  = sessionType  || course.sessionType;
      if (semester     || course.semester)     filter.semester     = semester     || course.semester;

      students = await User.find(filter).select('_id').lean();
    }

    if (!students.length) {
      return res.status(404).json({ error: 'No matching students found.' });
    }

    const existing  = new Set(course.enrolledStudents.map(id => id.toString()));
    const toAdd     = students.filter(s => !existing.has(s._id.toString())).map(s => s._id);

    if (!toAdd.length) {
      return res.json({ message: 'All matching students are already enrolled.', enrolled: 0 });
    }

    course.enrolledStudents.push(...toAdd);
    await course.save();

    res.json({
      message:  `${toAdd.length} student${toAdd.length !== 1 ? 's' : ''} enrolled in ${course.title}`,
      enrolled: toAdd.length,
      total:    course.enrolledStudents.length,
    });
  } catch (err) {
    console.error('[bulkEnrollStudents]', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// ─── REMOVE STUDENT ───────────────────────────────────────────────────────────
// Syncs both enrolledStudents AND StudentRoster
exports.removeStudent = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { studentId } = req.params;

    const course = await Course.findOne({ _id: req.params.id, companyId });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    // Remove from enrolledStudents
    const before = course.enrolledStudents.length;
    course.enrolledStudents = course.enrolledStudents.filter(
      id => id.toString() !== studentId
    );

    // Remove from StudentRoster (sync)
    const student = await User.findOne({ _id: studentId }).select('indexNumber IndexNumber').lean();
    if (student) {
      const indexNum = student.indexNumber || student.IndexNumber;
      if (indexNum) {
        await StudentRoster.deleteOne({ course: course._id, studentId: indexNum });
      }
    }

    await course.save();

    const removed = before - course.enrolledStudents.length;
    res.json({
      message: removed > 0
        ? 'Student removed from course and roster.'
        : 'Student was not enrolled in this course.',
    });
  } catch (err) {
    console.error('[removeStudent]', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// ─── COURSE STATS (for dashboard tabs) ───────────────────────────────────────
exports.getCourseStats = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const course = await Course.findOne({ _id: req.params.id, companyId }).lean();
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    const [
      rosterCount,
      sessionCount,
      meetingCount,
    ] = await Promise.all([
      StudentRoster.countDocuments({ course: req.params.id }),
      mongoose.model('AttendanceSession').countDocuments({ course: req.params.id, company: companyId }),
      mongoose.model('Meeting').countDocuments({ linkedCourseId: req.params.id, companyId, isActive: true }),
    ]);

    res.json({
      enrolledStudents: course.enrolledStudents.length,
      rosterStudents:   rosterCount,
      sessions:         sessionCount,
      meetings:         meetingCount,
    });
  } catch (err) {
    console.error('[getCourseStats]', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// ─── DELETE COURSE (admin/superadmin only, hard delete only if no history) ────
exports.deleteCourse = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const course = await Course.findOne({ _id: req.params.id, companyId });
    if (!course) return res.status(404).json({ error: 'Course not found.' });

    // Check for attendance history
    const sessionCount = await mongoose.model('AttendanceSession')
      .countDocuments({ course: req.params.id });

    if (sessionCount > 0) {
      return res.status(400).json({
        error: 'Cannot delete a course with attendance history. Archive it instead.',
        sessions: sessionCount,
      });
    }

    // Safe to hard delete — no history
    await StudentRoster.deleteMany({ course: req.params.id });
    await course.deleteOne();

    res.json({ message: 'Course deleted permanently.' });
  } catch (err) {
    console.error('[deleteCourse]', err);
    res.status(500).json({ error: 'Server error', details: err.message });
  }
};

// ─── ROSTER SYNC ──────────────────────────────────────────────────────────────
// Called after student registers — auto-link if their index number is on roster
exports.syncRosterEnrollment = async (studentId, companyId) => {
  try {
    const student = await User.findById(studentId).lean();
    if (!student) return;

    const indexNum = student.indexNumber || student.IndexNumber;
    if (!indexNum) return;

    // Find all roster entries matching this student's index number in this company
    const rosterEntries = await StudentRoster.find({ studentId: indexNum })
      .populate({ path: 'course', match: { companyId } })
      .lean();

    for (const entry of rosterEntries) {
      if (!entry.course) continue; // different company

      // Mark roster as registered
      await StudentRoster.updateOne(
        { _id: entry._id },
        { $set: { registered: true, userId: studentId } }
      );

      // Add to enrolledStudents if not already there
      await Course.updateOne(
        { _id: entry.course._id, enrolledStudents: { $ne: studentId } },
        { $push: { enrolledStudents: studentId } }
      );
    }
  } catch (err) {
    console.error('[syncRosterEnrollment]', err.message);
  }
};

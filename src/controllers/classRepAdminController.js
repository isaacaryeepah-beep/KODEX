const User         = require('../models/User');
const notifService = require('../services/notificationService');

// ── Helper: build "same class" filter ─────────────────────────────────────────
function classFilter(student, companyId) {
  return {
    company:      companyId,
    role:         'student',
    isClassRep:   true,
    studentLevel: student.studentLevel,
    studentGroup: student.studentGroup,
    sessionType:  student.sessionType,
    semester:     student.semester,
    programme:    student.programme,
  };
}

// POST /api/class-rep-admin/assign
// Body: { studentId }
// HOD: can only assign within their department
// Admin/superadmin: can assign anyone
exports.assignRep = async (req, res) => {
  try {
    const { studentId } = req.body;
    if (!studentId) return res.status(400).json({ error: 'studentId is required' });

    const student = await User.findOne({
      _id:     studentId,
      company: req.user.company,
      role:    'student',
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // HOD scope — only their department
    if (req.user.role === 'hod') {
      const hodDept = (req.user.department || '').toString();
      const stuDept = (student.department || '').toString();
      if (hodDept !== stuDept) {
        return res.status(403).json({ error: 'You can only assign class reps within your department' });
      }
    }

    if (student.isClassRep) {
      return res.status(400).json({ error: 'This student is already a class representative' });
    }

    // Enforce 2-rep cap per class group
    const repCount = await User.countDocuments(classFilter(student, req.user.company));
    if (repCount >= 2) {
      return res.status(400).json({
        error: `This class (Level ${student.studentLevel} · Group ${student.studentGroup} · ${student.sessionType}) already has 2 class representatives. Remove one first.`,
      });
    }

    student.isClassRep = true;
    await student.save();

    // Notify the student
    await notifService.notify({
      company:   req.user.company,
      recipient: student._id,
      type:      'class_rep_assigned',
      title:     '🎓 You are now a Class Representative',
      body:      `You have been appointed as a Class Representative for Level ${student.studentLevel || ''}, Group ${student.studentGroup || ''} (${student.sessionType || ''} session). You can now manage the class device and help coordinate attendance for your group.`,
      data:      { level: student.studentLevel, group: student.studentGroup },
    });

    res.json({
      success: true,
      message: `${student.name} is now a class representative`,
      student: { id: student._id, name: student.name, indexNumber: student.IndexNumber },
    });
  } catch (e) {
    console.error('[ClassRepAdmin] assignRep:', e);
    res.status(500).json({ error: 'Failed to assign class representative' });
  }
};

// DELETE /api/class-rep-admin/remove/:userId
exports.removeRep = async (req, res) => {
  try {
    const student = await User.findOne({
      _id:     req.params.userId,
      company: req.user.company,
      role:    'student',
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    if (req.user.role === 'hod') {
      const hodDept = (req.user.department || '').toString();
      const stuDept = (student.department || '').toString();
      if (hodDept !== stuDept) {
        return res.status(403).json({ error: 'You can only manage class reps within your department' });
      }
    }

    if (!student.isClassRep) {
      return res.status(400).json({ error: 'This student is not currently a class representative' });
    }

    student.isClassRep    = false;
    student.classRepCourse = undefined;
    await student.save();

    // Notify the student
    await notifService.notify({
      company:   req.user.company,
      recipient: student._id,
      type:      'class_rep_removed',
      title:     'Class Representative Role Removed',
      body:      'Your class representative role has been removed by administration.',
      data:      {},
    });

    res.json({ success: true, message: `${student.name} is no longer a class representative` });
  } catch (e) {
    console.error('[ClassRepAdmin] removeRep:', e);
    res.status(500).json({ error: 'Failed to remove class representative' });
  }
};

// GET /api/class-rep-admin/list
// Lists all class reps in the institution (admin: all, HOD: own dept only)
exports.listReps = async (req, res) => {
  try {
    const filter = { company: req.user.company, role: 'student', isClassRep: true };
    if (req.user.role === 'hod' && req.user.department) {
      filter.department = req.user.department;
    }

    const reps = await User.find(filter)
      .select('name email IndexNumber studentLevel studentGroup sessionType semester programme department profilePhoto')
      .sort({ studentLevel: 1, studentGroup: 1, name: 1 })
      .lean();

    res.json({ success: true, reps });
  } catch (e) {
    console.error('[ClassRepAdmin] listReps:', e);
    res.status(500).json({ error: 'Failed to fetch class representatives' });
  }
};

// GET /api/class-rep-admin/students?level=&group=&sessionType=&semester=&programme=&department=
// Returns students in a class group so HOD/Admin can pick reps
exports.listStudents = async (req, res) => {
  try {
    const { level, group, sessionType, semester, programme, department } = req.query;

    const filter = { company: req.user.company, role: 'student' };
    if (level)       filter.studentLevel = level;
    if (group)       filter.studentGroup = group;
    if (sessionType) filter.sessionType  = sessionType;
    if (semester)    filter.semester     = semester;
    if (programme)   filter.programme    = programme;

    // HOD restricted to their department
    if (req.user.role === 'hod' && req.user.department) {
      filter.department = req.user.department;
    } else if (department) {
      filter.department = department;
    }

    const students = await User.find(filter)
      .select('name email IndexNumber studentLevel studentGroup sessionType semester programme department isClassRep profilePhoto')
      .sort({ isClassRep: -1, name: 1 })
      .lean();

    res.json({ success: true, students });
  } catch (e) {
    console.error('[ClassRepAdmin] listStudents:', e);
    res.status(500).json({ error: 'Failed to fetch students' });
  }
};

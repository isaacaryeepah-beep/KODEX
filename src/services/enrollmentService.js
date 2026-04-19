/**
 * enrollmentService.js
 *
 * All enrollment business logic lives here.
 * Controllers call these functions — no DB queries in controllers.
 */

const Course        = require('../models/Course');
const User          = require('../models/User');
const StudentRoster = require('../models/StudentRoster');

/**
 * Enroll a single student manually.
 */
async function enrollStudent(courseId, studentId, companyId) {
  const student = await User.findOne({
    _id:     studentId,
    company: companyId,
    role:    'student',
  }).select('_id name').lean();

  if (!student) {
    return { success: false, message: 'Student not found in this institution.' };
  }

  const course = await Course.findOne({ _id: courseId, companyId });
  if (!course) return { success: false, message: 'Course not found.' };

  if (course.enrolledStudents.map(id => id.toString()).includes(studentId)) {
    return { success: false, message: 'Student is already enrolled in this course.' };
  }

  course.enrolledStudents.push(studentId);
  await course.save();

  return {
    success: true,
    message: `${student.name} enrolled successfully in ${course.title}.`,
  };
}

/**
 * Bulk enroll students by academic filters or explicit ID list.
 */
async function bulkEnroll(courseId, companyId, filters = {}) {
  const course = await Course.findOne({ _id: courseId, companyId });
  if (!course) return { success: false, message: 'Course not found.' };

  let students = [];

  if (filters.studentIds && Array.isArray(filters.studentIds) && filters.studentIds.length) {
    students = await User.find({
      _id:     { $in: filters.studentIds },
      company: companyId,
      role:    'student',
    }).select('_id').lean();
  } else {
    // Auto-match by academic profile
    const q = { company: companyId, role: 'student' };
    if (filters.departmentId  || course.departmentId)   q.department          = filters.departmentId  || course.departmentId;
    if (filters.level         || course.level)           q.studentLevel        = filters.level         || course.level;
    if (filters.group         || course.group)           q.studentGroup        = filters.group         || course.group;
    if (filters.studyType     || course.studyType)       q.studyType           = filters.studyType     || course.studyType;
    if (filters.qualificationType || course.qualificationType) {
      q.qualificationType = filters.qualificationType || course.qualificationType;
    }
    if (filters.semester      || course.semester)        q.semester            = filters.semester      || course.semester;

    students = await User.find(q).select('_id').lean();
  }

  if (!students.length) {
    return { success: false, message: 'No matching students found.' };
  }

  const existing = new Set(course.enrolledStudents.map(id => id.toString()));
  const toAdd    = students.filter(s => !existing.has(s._id.toString())).map(s => s._id);

  if (!toAdd.length) {
    return {
      success: true,
      message: 'All matching students are already enrolled.',
      enrolled: 0,
      total: course.enrolledStudents.length,
    };
  }

  course.enrolledStudents.push(...toAdd);
  await course.save();

  return {
    success:  true,
    message:  `${toAdd.length} student${toAdd.length !== 1 ? 's' : ''} enrolled in ${course.title}.`,
    enrolled: toAdd.length,
    total:    course.enrolledStudents.length,
  };
}

/**
 * Remove a student from a course and sync roster.
 */
async function removeStudent(courseId, studentId, companyId) {
  const course = await Course.findOne({ _id: courseId, companyId });
  if (!course) return { success: false, message: 'Course not found.' };

  const before = course.enrolledStudents.length;
  course.enrolledStudents = course.enrolledStudents.filter(
    id => id.toString() !== studentId
  );

  // Sync roster
  const student = await User.findOne({ _id: studentId })
    .select('indexNumber IndexNumber')
    .lean();

  if (student) {
    const indexNum = student.indexNumber || student.IndexNumber;
    if (indexNum) {
      await StudentRoster.deleteOne({
        course:    course._id,
        studentId: { $regex: new RegExp(`^${indexNum}$`, 'i') },
      });
    }
  }

  await course.save();

  const removed = before - course.enrolledStudents.length;
  return {
    success: true,
    message: removed > 0
      ? 'Student removed from course and roster.'
      : 'Student was not enrolled in this course.',
  };
}

module.exports = { enrollStudent, bulkEnroll, removeStudent };

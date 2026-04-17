/**
 * courseService.js
 *
 * All course business logic.
 * Controllers are thin wrappers — logic lives here.
 */

const Course        = require('../models/Course');
const User          = require('../models/User');
const StudentRoster = require('../models/StudentRoster');

// ─── Create ───────────────────────────────────────────────────────────────────
async function createCourse(data, creatorId, companyId) {
  const {
    title, code, description,
    departmentId, programmeId,
    academicYear, semester,
    level, group, sessionType,
    qualificationType, customQualificationLabel, studyType,
    lecturerId,
    needsApproval, approvalStatus,
  } = data;

  // Check uniqueness with full academic compound
  const existing = await Course.findOne({
    companyId,
    code:              code.toUpperCase().trim(),
    academicYear:      academicYear      || null,
    semester:          semester          || null,
    level:             level             || null,
    group:             group             || null,
    qualificationType: qualificationType || null,
    studyType:         studyType         || null,
  });

  if (existing) {
    const err = new Error(
      `Course "${code}" already exists for this academic year, semester, level, and group.`
    );
    err.status = 409;
    throw err;
  }

  const resolvedLecturer = lecturerId || null;

  const course = await Course.create({
    title:                   title.trim(),
    code:                    code.toUpperCase().trim(),
    description:             description?.trim() || '',
    companyId,
    departmentId:            departmentId            || null,
    programmeId:             programmeId             || null,
    qualificationType:       qualificationType       || null,
    customQualificationLabel: (qualificationType === 'Other' && customQualificationLabel)
      ? customQualificationLabel.trim()
      : null,
    studyType:               studyType               || null,
    lecturerId:              resolvedLecturer,
    createdBy:               creatorId,
    assignedBy:              resolvedLecturer && resolvedLecturer.toString() !== creatorId.toString()
      ? creatorId
      : null,
    academicYear:            academicYear            || null,
    semester:                semester                || null,
    level:                   level                   || null,
    group:                   group?.toUpperCase()    || null,
    sessionType:             sessionType             || null,
    needsApproval:           needsApproval           || false,
    approvalStatus:          approvalStatus          || 'approved',
    // Auto-publish admin/superadmin courses; lecturer courses stay unpublished until HOD approves
    isPublished:             !(needsApproval         || false),
  });

  await course.populate([
    { path: 'lecturerId', select: 'name email department' },
    { path: 'createdBy',  select: 'name email' },
  ]);

  return course;
}

// ─── List ─────────────────────────────────────────────────────────────────────
async function listCourses(userRole, userId, companyId, queryParams) {
  const {
    status, academicYear, semester, departmentId,
    level, group, qualificationType, studyType,
    search, page = 1, limit = 50,
  } = queryParams;

  const skip = (Number(page) - 1) * Number(limit);
  const query = { companyId, isActive: true };

  if (status)            query.status            = status;
  if (academicYear)      query.academicYear      = academicYear;
  if (semester)          query.semester          = semester;
  if (level)             query.level             = level;
  if (group)             query.group             = group;
  if (qualificationType) query.qualificationType = qualificationType;
  if (studyType)         query.studyType         = studyType;
  if (departmentId)      query.departmentId      = departmentId;

  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { code:  { $regex: search, $options: 'i' } },
    ];
  }

  // Role scoping
  if (userRole === 'lecturer') {
    query.lecturerId = userId;
  } else if (userRole === 'student') {
    query.enrolledStudents = userId;
  } else if (userRole === 'hod') {
    // HOD sees their department if set — otherwise all (no department enforcement)
    // departmentId filter above already handles explicit HOD filtering
  }
  // admin / superadmin: no scope restriction

  const [courses, total] = await Promise.all([
    Course.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('lecturerId', 'name email department')
      .populate('createdBy',  'name email')
      .lean(),
    Course.countDocuments(query),
  ]);

  return {
    courses,
    pagination: {
      total,
      page:       Number(page),
      pageSize:   Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    },
  };
}

// ─── Get one ──────────────────────────────────────────────────────────────────
async function getCourse(courseId, companyId) {
  const course = await Course.findOne({ _id: courseId, companyId })
    .populate('lecturerId',       'name email department')
    .populate('createdBy',        'name email')
    .populate('assignedBy',       'name email')
    .populate('enrolledStudents', 'name email indexNumber IndexNumber programme studentLevel studentGroup studyType qualificationType')
    .lean();

  if (!course) {
    const err = new Error('Course not found.');
    err.status = 404;
    throw err;
  }

  const rosterCount = await StudentRoster.countDocuments({ course: courseId });
  course.rosterCount = rosterCount;

  return course;
}

// ─── Update ───────────────────────────────────────────────────────────────────
async function updateCourse(courseId, companyId, updates, updaterId, userRole) {
  const course = await Course.findOne({ _id: courseId, companyId });
  if (!course) {
    const err = new Error('Course not found.');
    err.status = 404;
    throw err;
  }

  if (userRole === 'lecturer' && course.lecturerId?.toString() !== updaterId.toString()) {
    const err = new Error('You can only update your own courses.');
    err.status = 403;
    throw err;
  }

  const allowed = [
    'title', 'description', 'departmentId', 'programmeId',
    'academicYear', 'semester', 'level', 'group', 'sessionType',
    'qualificationType', 'customQualificationLabel', 'studyType', 'status',
  ];
  allowed.forEach(f => {
    if (updates[f] !== undefined) course[f] = updates[f];
  });
  course.updatedBy = updaterId;
  if (updates.group) course.group = updates.group.toUpperCase();

  await course.save();
  await course.populate('lecturerId', 'name email');
  return course;
}

// ─── Archive ──────────────────────────────────────────────────────────────────
async function archiveCourse(courseId, companyId, archiverId) {
  const course = await Course.findOne({ _id: courseId, companyId });
  if (!course) {
    const err = new Error('Course not found.');
    err.status = 404;
    throw err;
  }
  if (course.status === 'archived') {
    const err = new Error('Course is already archived.');
    err.status = 400;
    throw err;
  }

  course.status     = 'archived';
  course.isArchived = true;
  course.isActive   = false;
  course.archivedBy = archiverId;
  await course.save();

  return course;
}

// ─── Restore ──────────────────────────────────────────────────────────────────
async function restoreCourse(courseId, companyId) {
  const course = await Course.findOne({ _id: courseId, companyId });
  if (!course) {
    const err = new Error('Course not found.');
    err.status = 404;
    throw err;
  }

  course.status     = 'active';
  course.isArchived = false;
  course.isActive   = true;
  course.archivedBy = null;
  await course.save();

  return course;
}

// ─── Assign lecturer ──────────────────────────────────────────────────────────
async function assignLecturer(courseId, companyId, lecturerId, assignedById) {
  const lecturer = await User.findOne({
    _id:     lecturerId,
    company: companyId,
    role:    'lecturer',
  });
  if (!lecturer) {
    const err = new Error('Lecturer not found in this institution.');
    err.status = 404;
    throw err;
  }

  const course = await Course.findOne({ _id: courseId, companyId });
  if (!course) {
    const err = new Error('Course not found.');
    err.status = 404;
    throw err;
  }

  course.lecturerId  = lecturerId;
  course.assignedBy  = assignedById;
  await course.save();

  return course;
}

// ─── Stats for dashboard tabs ─────────────────────────────────────────────────
async function getCourseStats(courseId, companyId) {
  const course = await Course.findOne({ _id: courseId, companyId }).lean();
  if (!course) {
    const err = new Error('Course not found.');
    err.status = 404;
    throw err;
  }

  const mongoose = require('mongoose');
  const [rosterCount, sessionCount, meetingCount] = await Promise.all([
    StudentRoster.countDocuments({ course: courseId }),
    mongoose.model('AttendanceSession').countDocuments({
      course: courseId, company: companyId
    }).catch(() => 0),
    mongoose.model('Meeting').countDocuments({
      linkedCourseId: courseId, companyId, isActive: true
    }).catch(() => 0),
  ]);

  return {
    enrolledStudents: course.enrolledStudents.length,
    rosterStudents:   rosterCount,
    sessions:         sessionCount,
    meetings:         meetingCount,
  };
}

// ─── Delete (only if no history) ─────────────────────────────────────────────
async function deleteCourse(courseId, companyId) {
  const mongoose   = require('mongoose');
  const course = await Course.findOne({ _id: courseId, companyId });
  if (!course) {
    const err = new Error('Course not found.');
    err.status = 404;
    throw err;
  }

  const sessionCount = await mongoose.model('AttendanceSession')
    .countDocuments({ course: courseId }).catch(() => 0);

  if (sessionCount > 0) {
    const err = new Error(
      `Cannot delete a course with ${sessionCount} attendance session(s). Archive it instead.`
    );
    err.status = 400;
    throw err;
  }

  await StudentRoster.deleteMany({ course: courseId });
  await course.deleteOne();
}

module.exports = {
  createCourse, listCourses, getCourse,
  updateCourse, archiveCourse, restoreCourse,
  assignLecturer, getCourseStats, deleteCourse,
};

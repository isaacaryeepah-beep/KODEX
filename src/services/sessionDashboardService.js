/**
 * sessionDashboardService.js
 *
 * Core business logic for the Lecturer Session Control Dashboard.
 * Handles session state machine, device checks, anti-cheat validation,
 * suspicious event logging, and live dashboard data assembly.
 */

const mongoose       = require('mongoose');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord  = require('../models/AttendanceRecord');
const SuspiciousEvent   = require('../models/SuspiciousEvent');
const Device            = require('../models/Device');
const User              = require('../models/User');
const Course            = require('../models/Course');

const DEVICE_OFFLINE_THRESHOLD_MS = 15000; // 15 seconds

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isDeviceOnline(lastHeartbeat) {
  if (!lastHeartbeat) return false;
  return (Date.now() - new Date(lastHeartbeat).getTime()) < DEVICE_OFFLINE_THRESHOLD_MS;
}

function getCompanyId(req) {
  return req.user.company || req.user.companyId;
}

// ─── Get full device status for session ───────────────────────────────────────
async function getDeviceStatus(companyId) {
  const device = await Device.findOne({ companyId, isActive: true })
    .select('deviceName deviceId lastHeartbeat status apSSID assignedRoom assignedDepartment')
    .lean();

  if (!device) return { hasDevice: false, deviceOnline: false };

  const online = isDeviceOnline(device.lastHeartbeat);
  return {
    hasDevice:       true,
    deviceOnline:    online,
    deviceName:      device.deviceName,
    deviceId:        device.deviceId,
    lastHeartbeat:   device.lastHeartbeat,
    apSSID:          device.apSSID,
    assignedRoom:    device.assignedRoom,
    assignedDept:    device.assignedDepartment,
    offlineWarning:  !online,
  };
}

// ─── Get current code metadata (no plaintext — just freshness info) ───────────
async function getCodeMeta(session) {
  if (!session.currentCode) return { hasCode: false };
  const age = session.currentCodeGeneratedAt
    ? (Date.now() - new Date(session.currentCodeGeneratedAt).getTime()) / 1000
    : 999;
  const rotationSecs = session.codeRotationSeconds || 30;
  return {
    hasCode:           true,
    rotationSeconds:   rotationSecs,
    ageSeconds:        Math.round(age),
    secondsRemaining:  Math.max(0, rotationSecs - Math.round(age)),
    isExpired:         age > rotationSecs,
  };
}

// ─── Assemble full dashboard payload ─────────────────────────────────────────
async function getDashboardData(sessionId, companyId) {
  const session = await AttendanceSession.findOne({ _id: sessionId, company: companyId })
    .populate('course',    'title code level group departmentId qualificationType studyType')
    .populate('createdBy', 'name email')
    .lean();

  if (!session) {
    const err = new Error('Session not found.');
    err.status = 404;
    throw err;
  }

  const [
    deviceStatus,
    markedCount,
    enrolledCount,
    suspiciousCount,
    recentActivity,
    suspiciousEvents,
  ] = await Promise.all([
    getDeviceStatus(companyId),
    AttendanceRecord.countDocuments({ session: sessionId }),
    session.course
      ? Course.findById(session.course._id || session.course).select('enrolledStudents').lean()
          .then(c => c?.enrolledStudents?.length || 0)
      : 0,
    SuspiciousEvent.countDocuments({ sessionId, resolved: false }),
    AttendanceRecord.find({ session: sessionId })
      .sort({ createdAt: -1 }).limit(20)
      .populate('student', 'name IndexNumber indexNumber')
      .lean(),
    SuspiciousEvent.find({ sessionId })
      .sort({ createdAt: -1 }).limit(20)
      .populate('userId', 'name IndexNumber indexNumber')
      .lean(),
  ]);

  const codeMeta = await getCodeMeta(session);

  return {
    session: {
      _id:                session._id,
      title:              session.title,
      status:             session.status,
      startedAt:          session.startedAt,
      stoppedAt:          session.stoppedAt,
      pausedAt:           session.pausedAt,
      lockedAt:           session.lockedAt,
      venue:              session.venue,
      networkEnforcement: session.networkEnforcement,
      networkStatus:      session.networkStatus,
      codeRotationSeconds: session.codeRotationSeconds,
      linkedMeetingId:    session.linkedMeetingId,
    },
    course: session.course,
    lecturer: session.createdBy,
    device: deviceStatus,
    code: codeMeta,
    counts: {
      marked:     markedCount,
      expected:   enrolledCount,
      absent:     Math.max(0, enrolledCount - markedCount),
      suspicious: suspiciousCount,
    },
    recentActivity,
    suspiciousEvents,
  };
}

// ─── Session state machine ────────────────────────────────────────────────────

async function startSession(sessionId, companyId, userId, userRole) {
  const session = await AttendanceSession.findOne({ _id: sessionId, company: companyId });
  if (!session) throw Object.assign(new Error('Session not found.'), { status: 404 });

  if (!['scheduled', 'paused'].includes(session.status)) {
    throw Object.assign(
      new Error(`Cannot start a session that is ${session.status}.`),
      { status: 400 }
    );
  }

  // Permission: lecturer must own the course + course must be approved
  if (userRole === 'lecturer' || session.course) {
    const course = session.course
      ? await Course.findById(session.course).select('lecturerId needsApproval approvalStatus').lean()
      : null;

    if (userRole === 'lecturer') {
      if (!course || course.lecturerId?.toString() !== userId.toString()) {
        throw Object.assign(new Error('You are not assigned to this course.'), { status: 403 });
      }
    }

    if (course && course.needsApproval && course.approvalStatus !== 'approved') {
      const label = course.approvalStatus === 'pending' ? 'pending HOD approval' : 'rejected';
      throw Object.assign(
        new Error(`This course is ${label} and cannot have active sessions.`),
        { status: 403 }
      );
    }
  }

  // Device check (warn but don't hard-block — device may be optional per institution)
  const device = await Device.findOne({ companyId, isActive: true }).select('lastHeartbeat').lean();
  const deviceOnline = device ? isDeviceOnline(device.lastHeartbeat) : false;

  session.status    = 'live';
  session.startedAt = session.startedAt || new Date();
  session.pausedAt  = null;
  await session.save();

  return { session, deviceWarning: !deviceOnline };
}

async function pauseSession(sessionId, companyId, userId, userRole) {
  const session = await _findAndCheckOwnership(sessionId, companyId, userId, userRole);
  if (session.status !== 'live') {
    throw Object.assign(new Error('Only a live session can be paused.'), { status: 400 });
  }
  session.status   = 'paused';
  session.pausedAt = new Date();
  await session.save();
  return session;
}

async function resumeSession(sessionId, companyId, userId, userRole) {
  const session = await _findAndCheckOwnership(sessionId, companyId, userId, userRole);
  if (session.status !== 'paused') {
    throw Object.assign(new Error('Only a paused session can be resumed.'), { status: 400 });
  }
  session.status   = 'live';
  session.pausedAt = null;
  await session.save();
  return session;
}

async function lockSession(sessionId, companyId, userId, userRole) {
  const session = await _findAndCheckOwnership(sessionId, companyId, userId, userRole);
  if (!['live', 'paused'].includes(session.status)) {
    throw Object.assign(new Error('Session cannot be locked in its current state.'), { status: 400 });
  }
  session.status   = 'locked';
  session.lockedAt = new Date();
  await session.save();
  return session;
}

async function unlockSession(sessionId, companyId, userId, userRole) {
  const session = await _findAndCheckOwnership(sessionId, companyId, userId, userRole);
  if (session.status !== 'locked') {
    throw Object.assign(new Error('Session is not locked.'), { status: 400 });
  }
  session.status   = 'live';
  session.lockedAt = null;
  await session.save();
  return session;
}

async function endSession(sessionId, companyId, userId, userRole) {
  const session = await _findAndCheckOwnership(sessionId, companyId, userId, userRole);
  if (session.status === 'ended') {
    throw Object.assign(new Error('Session is already ended.'), { status: 400 });
  }

  session.status    = 'ended';
  session.stoppedAt = new Date();
  await session.save();

  // Generate report summary
  const [marked, enrolled] = await Promise.all([
    AttendanceRecord.countDocuments({ session: sessionId }),
    Course.findById(session.course).select('enrolledStudents').lean()
      .then(c => c?.enrolledStudents?.length || 0),
  ]);
  const suspicious = await SuspiciousEvent.countDocuments({ sessionId });

  return {
    session,
    summary: {
      marked,
      expected: enrolled,
      absent:   Math.max(0, enrolled - marked),
      suspicious,
    },
  };
}

async function updateSession(sessionId, companyId, userId, userRole, updates) {
  const session = await _findAndCheckOwnership(sessionId, companyId, userId, userRole);
  if (session.status === 'ended') {
    throw Object.assign(new Error('Cannot edit an ended session.'), { status: 400 });
  }

  const allowed = [
    'title', 'venue', 'networkEnforcement',
    'codeRotationSeconds', 'linkedMeetingId', 'notes',
  ];
  allowed.forEach(f => {
    if (updates[f] !== undefined) session[f] = updates[f];
  });

  // Clamp code rotation to sane limits
  if (session.codeRotationSeconds) {
    session.codeRotationSeconds = Math.min(120, Math.max(15, session.codeRotationSeconds));
  }

  await session.save();
  return session;
}

// ─── Anti-cheat attendance validation ────────────────────────────────────────

async function validateAttendanceMark(data) {
  const {
    sessionId, code, userId, companyId,
    deviceFingerprint, ipAddress, networkStatus,
  } = data;

  const session = await AttendanceSession.findOne({ _id: sessionId, company: companyId })
    .populate('course', 'enrolledStudents companyId qualificationType studyType level group')
    .lean();

  // ── 1. Session existence ───────────────────────────────────────────────────
  if (!session) {
    return fail('wrong_session_attempt', 'Session not found or access denied.', null, userId);
  }

  // ── 2. Session state ───────────────────────────────────────────────────────
  if (session.status === 'paused') {
    return fail('paused_session_attempt', 'Session is paused. Please wait for the lecturer to resume.', session, userId);
  }
  if (session.status === 'locked') {
    return fail('locked_session_attempt', 'Session is locked. No more attendance is being accepted.', session, userId);
  }
  if (session.status === 'ended') {
    return fail('ended_session_attempt', 'Session has ended.', session, userId);
  }
  if (session.status !== 'live') {
    return fail('paused_session_attempt', `Session is ${session.status} and not accepting marks.`, session, userId);
  }

  // ── 3. Company isolation ──────────────────────────────────────────────────
  const student = await User.findOne({ _id: userId, company: companyId, role: 'student' })
    .select('_id company')
    .lean();
  if (!student) {
    return fail('cross_company_attempt', 'Student not found in this institution.', session, userId);
  }

  // ── 4. Course enrollment ──────────────────────────────────────────────────
  const course = session.course;
  const isEnrolled = course?.enrolledStudents?.some(id => id.toString() === userId.toString());
  if (!isEnrolled) {
    return fail('non_enrolled_attempt', 'You are not enrolled in this course.', session, userId);
  }

  // ── 5. Device heartbeat ───────────────────────────────────────────────────
  const device = await Device.findOne({ companyId, isActive: true })
    .select('lastHeartbeat deviceId')
    .lean();
  if (device && !isDeviceOnline(device.lastHeartbeat)) {
    return fail('offline_device_attempt', 'Classroom device is offline. Cannot mark attendance.', session, userId);
  }

  // ── 6. Code validation ────────────────────────────────────────────────────
  if (!code) {
    return fail('invalid_code', 'Attendance code is required.', session, userId);
  }
  if (!session.currentCode || session.currentCode !== code.trim().toUpperCase()) {
    return fail('invalid_code', 'Incorrect attendance code.', session, userId);
  }
  const codeAge = session.currentCodeGeneratedAt
    ? (Date.now() - new Date(session.currentCodeGeneratedAt).getTime()) / 1000
    : 999;
  const rotationSecs = session.codeRotationSeconds || 30;
  if (codeAge > rotationSecs) {
    return fail('expired_code', 'This attendance code has expired. Please use the latest code.', session, userId);
  }

  // ── 7. Duplicate check ────────────────────────────────────────────────────
  const alreadyMarked = await AttendanceRecord.findOne({ session: sessionId, student: userId });
  if (alreadyMarked) {
    return fail('already_marked_attempt', 'You have already marked attendance for this session.', session, userId);
  }

  // ── 8. Repeated device/IP suspicious check ────────────────────────────────
  if (deviceFingerprint) {
    const otherUserSameDevice = await AttendanceRecord.findOne({
      session:  sessionId,
      student:  { $ne: userId },
      deviceId: deviceFingerprint,
    });
    if (otherUserSameDevice) {
      // Log suspicious but don't block — lecturer can review
      await logSuspiciousEvent({
        sessionId, courseId: course._id, companyId,
        userId, deviceId: deviceFingerprint, ipAddress,
        eventType: 'repeated_device_attempt',
        reason: 'Same device fingerprint used by multiple students in this session.',
        actionTaken: 'flagged',
      });
    }
  }

  // ── 9. Network enforcement (optional) ────────────────────────────────────
  if (session.networkEnforcement === true && networkStatus === 'unverified') {
    return fail('unverified_network_attempt', 'You must be connected to the classroom network to mark attendance.', session, userId);
  }

  // ── All checks passed ─────────────────────────────────────────────────────
  return { valid: true, session, student };
}

function fail(eventType, reason, session, userId) {
  return { valid: false, eventType, reason, session, userId };
}

// ─── Log suspicious event ─────────────────────────────────────────────────────
async function logSuspiciousEvent(data) {
  try {
    await SuspiciousEvent.create({
      sessionId:   data.sessionId,
      courseId:    data.courseId,
      companyId:   data.companyId,
      userId:      data.userId   || null,
      deviceId:    data.deviceId || null,
      ipAddress:   data.ipAddress || null,
      eventType:   data.eventType,
      reason:      data.reason,
      actionTaken: data.actionTaken || 'blocked',
    });
  } catch (err) {
    console.error('[SuspiciousEvent] log failed:', err.message);
  }
}

// ─── Live activity feed ───────────────────────────────────────────────────────
async function getLiveActivity(sessionId, companyId, limit = 30) {
  const session = await AttendanceSession.findOne({ _id: sessionId, company: companyId })
    .select('_id').lean();
  if (!session) throw Object.assign(new Error('Session not found.'), { status: 404 });

  const [marks, suspicious] = await Promise.all([
    AttendanceRecord.find({ session: sessionId })
      .sort({ createdAt: -1 }).limit(limit)
      .populate('student', 'name IndexNumber indexNumber')
      .lean(),
    SuspiciousEvent.find({ sessionId })
      .sort({ createdAt: -1 }).limit(limit)
      .populate('userId', 'name IndexNumber indexNumber')
      .lean(),
  ]);

  // Merge and sort by time
  const markEvents = marks.map(m => ({
    type:      'mark_success',
    student:   m.student,
    method:    m.method,
    timestamp: m.createdAt,
  }));
  const flagEvents = suspicious.map(s => ({
    type:      'suspicious',
    eventType: s.eventType,
    student:   s.userId,
    reason:    s.reason,
    timestamp: s.createdAt,
  }));

  const all = [...markEvents, ...flagEvents]
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, limit);

  return all;
}

// ─── Student attendance table ─────────────────────────────────────────────────
async function getStudentAttendanceTable(sessionId, companyId) {
  const session = await AttendanceSession.findOne({ _id: sessionId, company: companyId })
    .populate('course', 'enrolledStudents')
    .lean();
  if (!session) throw Object.assign(new Error('Session not found.'), { status: 404 });

  const enrolledIds = session.course?.enrolledStudents || [];

  const [enrolled, marked, suspicious] = await Promise.all([
    User.find({ _id: { $in: enrolledIds } })
      .select('name IndexNumber indexNumber studentLevel studentGroup studyType qualificationType')
      .lean(),
    AttendanceRecord.find({ session: sessionId })
      .select('student method createdAt')
      .lean(),
    SuspiciousEvent.find({ sessionId, userId: { $ne: null } })
      .select('userId eventType reason')
      .lean(),
  ]);

  const markedSet     = new Map(marked.map(m => [m.student.toString(), m]));
  const suspiciousSet = new Map();
  suspicious.forEach(s => {
    if (s.userId) suspiciousSet.set(s.userId.toString(), s);
  });

  return enrolled.map(student => ({
    student,
    status:    markedSet.has(student._id.toString()) ? 'present' : 'absent',
    markedAt:  markedSet.get(student._id.toString())?.createdAt || null,
    method:    markedSet.get(student._id.toString())?.method || null,
    suspicious: suspiciousSet.has(student._id.toString())
      ? suspiciousSet.get(student._id.toString())
      : null,
  }));
}

// ─── Session report data ──────────────────────────────────────────────────────
async function getSessionReport(sessionId, companyId) {
  const [dashboard, table, suspiciousAll] = await Promise.all([
    getDashboardData(sessionId, companyId),
    getStudentAttendanceTable(sessionId, companyId),
    SuspiciousEvent.find({ sessionId }).lean(),
  ]);

  return {
    ...dashboard,
    studentTable: table,
    allSuspiciousEvents: suspiciousAll,
    generatedAt: new Date(),
  };
}

// ─── Internal helper ─────────────────────────────────────────────────────────
async function _findAndCheckOwnership(sessionId, companyId, userId, userRole) {
  const session = await AttendanceSession.findOne({ _id: sessionId, company: companyId });
  if (!session) throw Object.assign(new Error('Session not found.'), { status: 404 });

  if (userRole === 'lecturer') {
    const course = await Course.findById(session.course).select('lecturerId').lean();
    if (!course || course.lecturerId?.toString() !== userId.toString()) {
      throw Object.assign(new Error('You can only control your own sessions.'), { status: 403 });
    }
  }
  return session;
}

module.exports = {
  getDashboardData,
  getDeviceStatus,
  startSession,
  pauseSession,
  resumeSession,
  lockSession,
  unlockSession,
  endSession,
  updateSession,
  validateAttendanceMark,
  logSuspiciousEvent,
  getLiveActivity,
  getStudentAttendanceTable,
  getSessionReport,
};

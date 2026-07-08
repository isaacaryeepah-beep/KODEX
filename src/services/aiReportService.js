'use strict';

/**
 * aiReportService.js
 *
 * Dikly AI Report System — gathers data from MongoDB, formats a structured
 * prompt, calls Claude, and returns a Markdown narrative report.
 *
 * Each exported function maps to one of the 10 report types.
 */

const mongoose  = require('mongoose');

const AIReport  = require('../models/AIReport');
const aiRouter  = require('./ai/aiRouter');

// ── Helpers ──────────────────────────────────────────────────────────────────

// ms since epoch → human-readable date string
function fmtDate(d) { return d ? new Date(d).toDateString() : 'N/A'; }

// daysAgo(n) → Date n calendar days in the past
function daysAgo(n) { return new Date(Date.now() - n * 864e5); }

const SYSTEM_PROMPT = `You are Dikly AI, the built-in analytics assistant for the Dikly SaaS platform (academic + corporate management).

Your job is to analyse structured data snapshots and write clear, concise, actionable intelligence reports in Markdown.

Rules:
- Use plain Markdown (headings ##/###, bullet lists, bold, tables where useful).
- Lead with a 1-sentence executive summary in bold.
- Be specific: name individuals, cite percentages, flag exact issues.
- End each report with a "## Recommendations" section (3-5 bullet points).
- Tone: professional, direct, empathetic — never alarmist.
- If data is thin or a metric is N/A, note it and move on — don't make things up.
- Maximum 600 words unless the data warrants more.
- Dikly tracks time and attendance only — it never computes, stores, or
  displays pay/salary amounts; that stays in the company's own payroll
  system. Never claim payroll analysis as something Dikly AI can do, even
  as an example, even if the user's question mentions payroll.
- If a request falls outside analysing Dikly's own data (e.g. writing
  general-purpose code, unrelated tools), say so briefly and redirect to
  what you can actually help with from the platform's data — don't invent
  capabilities Dikly doesn't have.`;

// Routed through aiRouter (Gemini Flash by default, DeepSeek for
// technical/coding-flavored questions, Claude as the resilient fallback) —
// see src/services/ai/aiRouter.js. The 9 structured report types are all
// "general" writing/analysis; custom_query's free-form question is where a
// coding-flavored question would actually occur, and the router
// auto-detects that from the prompt text.
async function callAI(userMessage) {
  return aiRouter.chat({ system: SYSTEM_PROMPT, prompt: userMessage, maxTokens: 1200 });
}

// ── Cache helper ─────────────────────────────────────────────────────────────
// Returns a cached report if less than 6 hours old and same params key.
async function getCached(type, company, paramsKey) {
  const sixHoursAgo = new Date(Date.now() - 6 * 3600 * 1000);
  return AIReport.findOne({
    type,
    company:   company || null,
    'parameters._cacheKey': paramsKey,
    createdAt: { $gte: sixHoursAgo },
  }).sort({ createdAt: -1 }).lean();
}

// ── 1. At-Risk Students ───────────────────────────────────────────────────────
async function gatherAtRisk(companyId, { courseId, days = 30 } = {}) {
  const User                = require('../models/User');
  const AttendanceSession   = require('../models/AttendanceSession');
  const AttendanceRecord    = require('../models/AttendanceRecord');
  const NormalQuizResult    = require('../models/NormalQuizResult');
  const SnapQuizResult      = require('../models/SnapQuizResult');
  const AssignmentSubmission= require('../models/AssignmentSubmission');
  const Assignment          = require('../models/Assignment');

  const since = daysAgo(days);

  const studentFilter = { company: companyId, role: 'student', isActive: { $ne: false } };
  if (courseId) {
    const Course = require('../models/Course');
    const course = await Course.findById(courseId).select('enrolledStudents title code').lean();
    if (!course) throw new Error('Course not found');
    studentFilter._id = { $in: course.enrolledStudents || [] };
  }

  const students = await User.find(studentFilter)
    .select('name studentLevel department programme')
    .lean()
    .limit(300);

  if (!students.length) return { totalStudents: 0, atRiskStudents: [], period: `Last ${days} days` };

  const studentIds = students.map(s => s._id);

  // Attendance
  const sessionFilter = { company: companyId, startedAt: { $gte: since }, status: { $in: ['ended', 'stopped', 'locked', 'live', 'active'] } };
  if (courseId) sessionFilter.course = mongoose.Types.ObjectId.isValid(courseId) ? new mongoose.Types.ObjectId(courseId) : null;
  const sessions = await AttendanceSession.find(sessionFilter).select('_id').lean();
  const sessionIds = sessions.map(s => s._id);
  const totalSessions = sessionIds.length;

  const attAgg = await AttendanceRecord.aggregate([
    { $match: { company: new mongoose.Types.ObjectId(companyId), session: { $in: sessionIds }, user: { $in: studentIds }, status: { $in: ['present', 'late'] } } },
    { $group: { _id: '$user', attended: { $sum: 1 } } },
  ]);
  const attMap = Object.fromEntries(attAgg.map(r => [r._id.toString(), r.attended]));

  // Quiz scores — combine Normal + Snap
  const [nqAgg, sqAgg] = await Promise.all([
    NormalQuizResult.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(companyId), student: { $in: studentIds }, percentageScore: { $ne: null } } },
      { $group: { _id: '$student', avg: { $avg: '$percentageScore' }, count: { $sum: 1 } } },
    ]),
    SnapQuizResult.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(companyId), student: { $in: studentIds }, percentageScore: { $ne: null } } },
      { $group: { _id: '$student', avg: { $avg: '$percentageScore' }, count: { $sum: 1 } } },
    ]),
  ]);
  const quizMap = {};
  [...nqAgg, ...sqAgg].forEach(r => {
    const k = r._id.toString();
    if (!quizMap[k]) { quizMap[k] = { sum: 0, count: 0 }; }
    quizMap[k].sum   += r.avg * r.count;
    quizMap[k].count += r.count;
  });

  // Assignment completion
  const totalAssignments = await Assignment.countDocuments({ company: companyId, createdAt: { $gte: since } });
  const subAgg = await AssignmentSubmission.aggregate([
    { $match: { student: { $in: studentIds }, submittedAt: { $exists: true, $ne: null }, createdAt: { $gte: since } } },
    { $group: { _id: '$student', submitted: { $sum: 1 } } },
  ]);
  const subMap = Object.fromEntries(subAgg.map(r => [r._id.toString(), r.submitted]));

  const profiles = students.map(s => {
    const sid = s._id.toString();
    const attended = attMap[sid] || 0;
    const attRate  = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : null;
    const qData    = quizMap[sid];
    const quizAvg  = qData ? Math.round(qData.sum / qData.count) : null;
    const submitted= subMap[sid] || 0;
    const subRate  = totalAssignments > 0 ? Math.round((submitted / totalAssignments) * 100) : null;

    let risk = 0;
    if (attRate  !== null) risk += Math.max(0, 70 - attRate);
    if (quizAvg  !== null) risk += Math.max(0, 60 - quizAvg);
    if (subRate  !== null) risk += Math.max(0, 80 - subRate);

    return {
      name:       s.name,
      level:      s.studentLevel || '—',
      department: s.department   || '—',
      programme:  s.programme    || '—',
      attendance: attRate  !== null ? `${attRate}%`  : 'N/A',
      quizScore:  quizAvg  !== null ? `${quizAvg}%`  : 'N/A',
      assignments:subRate  !== null ? `${subRate}%`  : 'N/A',
      riskScore:  risk,
      riskLevel:  risk >= 70 ? 'HIGH' : risk >= 35 ? 'MEDIUM' : 'LOW',
    };
  });
  profiles.sort((a, b) => b.riskScore - a.riskScore);

  return {
    period:        `Last ${days} days`,
    totalStudents: students.length,
    totalSessions,
    totalAssignments,
    highRisk:      profiles.filter(p => p.riskLevel === 'HIGH').length,
    medRisk:       profiles.filter(p => p.riskLevel === 'MEDIUM').length,
    lowRisk:       profiles.filter(p => p.riskLevel === 'LOW').length,
    atRiskStudents: profiles.slice(0, 25),
  };
}

// ── 2. Class Health ────────────────────────────────────────────────────────────
async function gatherClassHealth(companyId, courseId) {
  const Course              = require('../models/Course');
  const User                = require('../models/User');
  const AttendanceSession   = require('../models/AttendanceSession');
  const AttendanceRecord    = require('../models/AttendanceRecord');
  const NormalQuizResult    = require('../models/NormalQuizResult');
  const SnapQuizResult      = require('../models/SnapQuizResult');
  const AssignmentSubmission= require('../models/AssignmentSubmission');
  const Assignment          = require('../models/Assignment');

  const course = await Course.findOne({ _id: courseId, companyId }).lean();
  if (!course) throw new Error('Course not found');

  const enrolledIds = course.enrolledStudents || [];
  const totalEnrolled = enrolledIds.length;

  const since = daysAgo(60);

  const sessions = await AttendanceSession.find({ company: companyId, course: courseId, startedAt: { $gte: since }, status: { $in: ['ended', 'stopped', 'locked', 'live', 'active'] } }).select('_id startedAt').lean();
  const sessionIds = sessions.map(s => s._id);

  const attAgg = await AttendanceRecord.aggregate([
    { $match: { session: { $in: sessionIds }, status: { $in: ['present', 'late'] } } },
    { $group: { _id: null, totalPresent: { $sum: 1 } } },
  ]);
  const totalPresent = attAgg[0]?.totalPresent || 0;
  const avgAttRate = sessionIds.length && totalEnrolled ? Math.round((totalPresent / (sessionIds.length * totalEnrolled)) * 100) : null;

  const [nqAvg, sqAvg] = await Promise.all([
    NormalQuizResult.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(companyId), student: { $in: enrolledIds }, percentageScore: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$percentageScore' }, count: { $sum: 1 } } },
    ]),
    SnapQuizResult.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(companyId), student: { $in: enrolledIds }, percentageScore: { $ne: null } } },
      { $group: { _id: null, avg: { $avg: '$percentageScore' }, count: { $sum: 1 } } },
    ]),
  ]);

  const allQuizAvgs = [...nqAvg, ...sqAvg].filter(r => r.count > 0);
  const combinedQuizAvg = allQuizAvgs.length
    ? Math.round(allQuizAvgs.reduce((s, r) => s + r.avg * r.count, 0) / allQuizAvgs.reduce((s, r) => s + r.count, 0))
    : null;
  const totalQuizAttempts = allQuizAvgs.reduce((s, r) => s + r.count, 0);

  const assignments = await Assignment.find({ company: companyId, course: courseId, createdAt: { $gte: since } }).select('title dueDate').lean();
  const subAgg = await AssignmentSubmission.aggregate([
    { $match: { assignment: { $in: assignments.map(a => a._id) }, submittedAt: { $exists: true, $ne: null } } },
    { $group: { _id: null, count: { $sum: 1 } } },
  ]);
  const totalSubmissions = subAgg[0]?.count || 0;
  const maxSubmissions = assignments.length * totalEnrolled;
  const subRate = maxSubmissions > 0 ? Math.round((totalSubmissions / maxSubmissions) * 100) : null;

  // Low-attendance students (below 60%)
  const perStudentAtt = await AttendanceRecord.aggregate([
    { $match: { session: { $in: sessionIds }, status: { $in: ['present', 'late'] } } },
    { $group: { _id: '$user', count: { $sum: 1 } } },
  ]);
  const attByStudent = Object.fromEntries(perStudentAtt.map(r => [r._id.toString(), r.count]));
  const lowAttStudents = enrolledIds.filter(id => {
    const attended = attByStudent[id.toString()] || 0;
    return sessionIds.length > 0 && (attended / sessionIds.length) < 0.6;
  }).length;

  return {
    course:       { title: course.title, code: course.code },
    period:       'Last 60 days',
    totalEnrolled,
    sessions:     sessionIds.length,
    avgAttendance: avgAttRate !== null ? `${avgAttRate}%` : 'N/A',
    lowAttStudents,
    avgQuizScore:  combinedQuizAvg !== null ? `${combinedQuizAvg}%` : 'N/A',
    totalQuizAttempts,
    assignments:   assignments.length,
    submissionRate: subRate !== null ? `${subRate}%` : 'N/A',
  };
}

// ── 3. Department Overview ────────────────────────────────────────────────────
async function gatherDepartmentOverview(companyId, department) {
  const Course              = require('../models/Course');
  const AttendanceSession   = require('../models/AttendanceSession');
  const AttendanceRecord    = require('../models/AttendanceRecord');
  const NormalQuizResult    = require('../models/NormalQuizResult');
  const User                = require('../models/User');

  const since = daysAgo(60);

  const courses = await Course.find({ companyId, departmentId: department }).select('title code enrolledStudents').lean();
  const courseIds = courses.map(c => c._id);

  const allEnrolled = new Set(courses.flatMap(c => (c.enrolledStudents || []).map(id => id.toString())));

  const sessions = await AttendanceSession.find({ company: companyId, course: { $in: courseIds }, startedAt: { $gte: since }, status: { $in: ['ended', 'stopped', 'locked'] } }).select('_id course').lean();
  const sessionIds = sessions.map(s => s._id);

  const attAgg = await AttendanceRecord.aggregate([
    { $match: { session: { $in: sessionIds }, status: { $in: ['present', 'late'] } } },
    { $group: { _id: null, total: { $sum: 1 } } },
  ]);
  const totalPresent = attAgg[0]?.total || 0;
  const maxAtt = sessionIds.length * allEnrolled.size;
  const deptAttRate = maxAtt > 0 ? Math.round((totalPresent / maxAtt) * 100) : null;

  const lecturers = await User.find({ company: companyId, role: 'lecturer', department }).select('name').lean();

  const qAgg = await NormalQuizResult.aggregate([
    { $match: { company: new mongoose.Types.ObjectId(companyId), percentageScore: { $ne: null }, createdAt: { $gte: since } } },
    { $group: { _id: null, avg: { $avg: '$percentageScore' }, count: { $sum: 1 } } },
  ]);
  const quizAvg = qAgg[0] ? Math.round(qAgg[0].avg) : null;

  return {
    department,
    courses:     courses.map(c => ({ title: c.title, code: c.code, enrolled: (c.enrolledStudents || []).length })),
    totalCourses: courses.length,
    totalStudents: allEnrolled.size,
    totalLecturers: lecturers.length,
    sessions:    sessionIds.length,
    deptAttRate: deptAttRate !== null ? `${deptAttRate}%` : 'N/A',
    avgQuizScore: quizAvg !== null ? `${quizAvg}%` : 'N/A',
    period: 'Last 60 days',
  };
}

// ── 4. Exam Readiness ─────────────────────────────────────────────────────────
async function gatherExamReadiness(companyId, courseId, userId = null) {
  const Course              = require('../models/Course');
  const User                = require('../models/User');
  const AttendanceSession   = require('../models/AttendanceSession');
  const AttendanceRecord    = require('../models/AttendanceRecord');
  const NormalQuizResult    = require('../models/NormalQuizResult');
  const SnapQuizResult      = require('../models/SnapQuizResult');
  const AssignmentSubmission= require('../models/AssignmentSubmission');
  const Assignment          = require('../models/Assignment');

  const course = await Course.findOne({ _id: courseId, companyId }).lean();
  if (!course) throw new Error('Course not found');

  const enrolledIds = course.enrolledStudents || [];
  const students = await User.find({ _id: { $in: enrolledIds } }).select('name studentLevel').lean();

  const sessions = await AttendanceSession.find({ company: companyId, course: courseId, status: { $in: ['ended', 'stopped', 'locked'] } }).select('_id').lean();
  const sessionIds = sessions.map(s => s._id);

  const [attAgg, nqAgg, sqAgg] = await Promise.all([
    AttendanceRecord.aggregate([
      { $match: { session: { $in: sessionIds }, user: { $in: enrolledIds }, status: { $in: ['present', 'late'] } } },
      { $group: { _id: '$user', count: { $sum: 1 } } },
    ]),
    NormalQuizResult.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(companyId), student: { $in: enrolledIds }, percentageScore: { $ne: null } } },
      { $group: { _id: '$student', avg: { $avg: '$percentageScore' } } },
    ]),
    SnapQuizResult.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(companyId), student: { $in: enrolledIds }, percentageScore: { $ne: null } } },
      { $group: { _id: '$student', avg: { $avg: '$percentageScore' } } },
    ]),
  ]);

  const attMap  = Object.fromEntries(attAgg.map(r => [r._id.toString(), r.count]));
  const nqMap   = Object.fromEntries(nqAgg.map(r => [r._id.toString(), r.avg]));
  const sqMap   = Object.fromEntries(sqAgg.map(r => [r._id.toString(), r.avg]));

  const totalAssignments = await Assignment.countDocuments({ company: companyId, course: courseId });
  const subAgg = await AssignmentSubmission.aggregate([
    { $match: { student: { $in: enrolledIds }, submittedAt: { $exists: true, $ne: null } } },
    { $lookup: { from: 'assignments', localField: 'assignment', foreignField: '_id', as: 'a' } },
    { $unwind: '$a' },
    { $match: { 'a.course': new mongoose.Types.ObjectId(courseId) } },
    { $group: { _id: '$student', count: { $sum: 1 } } },
  ]);
  const subMap = Object.fromEntries(subAgg.map(r => [r._id.toString(), r.count]));

  const roster = students.map(s => {
    const sid = s._id.toString();
    const attRate = sessionIds.length ? Math.round(((attMap[sid] || 0) / sessionIds.length) * 100) : null;
    const quizScore = nqMap[sid] != null ? nqMap[sid] : sqMap[sid] != null ? sqMap[sid] : null;
    const subRate = totalAssignments > 0 ? Math.round(((subMap[sid] || 0) / totalAssignments) * 100) : null;

    const components = [attRate, quizScore, subRate].filter(v => v !== null);
    const composite = components.length ? Math.round(components.reduce((a, b) => a + b, 0) / components.length) : null;
    const readiness = composite === null ? 'Unknown' : composite >= 70 ? 'High' : composite >= 50 ? 'Medium' : 'At Risk';

    return {
      _studentId: sid,
      name:      s.name,
      level:     s.studentLevel || '—',
      attendance: attRate !== null ? `${attRate}%` : 'N/A',
      quizScore:  quizScore !== null ? `${Math.round(quizScore)}%` : 'N/A',
      assignments: subRate !== null ? `${subRate}%` : 'N/A',
      composite:  composite !== null ? `${composite}%` : 'N/A',
      readiness,
    };
  });

  roster.sort((a, b) => {
    const order = { 'At Risk': 0, 'Medium': 1, 'High': 2, 'Unknown': 3 };
    return order[a.readiness] - order[b.readiness];
  });

  // Students only see their own row; lecturers/admins/hods see all
  const visibleRoster = userId
    ? roster.filter(r => r._studentId === userId.toString())
    : roster;

  return {
    course:    { title: course.title, code: course.code },
    totalEnrolled: students.length,
    sessions:  sessionIds.length,
    assignments: totalAssignments,
    readinessSummary: {
      high:     roster.filter(r => r.readiness === 'High').length,
      medium:   roster.filter(r => r.readiness === 'Medium').length,
      atRisk:   roster.filter(r => r.readiness === 'At Risk').length,
      unknown:  roster.filter(r => r.readiness === 'Unknown').length,
    },
    students: visibleRoster.map(({ _studentId, ...rest }) => rest),
  };
}

// ── 5. Workforce Attendance ───────────────────────────────────────────────────
async function gatherWorkforceAttendance(companyId, { days = 30 } = {}) {
  const CorporateAttendance = require('../models/CorporateAttendance');
  const User                = require('../models/User');

  const since = daysAgo(days);

  const employees = await User.find({ company: companyId, role: { $in: ['employee', 'manager'] }, isActive: { $ne: false } }).select('name department').lean();
  const empIds = employees.map(e => e._id);

  const records = await CorporateAttendance.find({
    company:  companyId,
    employee: { $in: empIds },
    date:     { $gte: since },
  }).select('employee status hoursWorked date department').lean();

  const byEmployee = {};
  employees.forEach(e => {
    byEmployee[e._id.toString()] = { name: e.name, department: e.department || '—', present: 0, absent: 0, late: 0, total: 0, hours: 0 };
  });
  records.forEach(r => {
    const k = r.employee.toString();
    if (!byEmployee[k]) return;
    byEmployee[k].total++;
    if (r.status === 'present' || r.status === 'remote') byEmployee[k].present++;
    if (r.status === 'absent')  byEmployee[k].absent++;
    if (r.status === 'late')    byEmployee[k].late++;
    byEmployee[k].hours += r.hoursWorked || 0;
  });

  const stats = Object.values(byEmployee);
  const statusBreakdown = { present: 0, absent: 0, late: 0, on_leave: 0 };
  records.forEach(r => { if (statusBreakdown[r.status] !== undefined) statusBreakdown[r.status]++; });
  const totalWorkdays = records.length;

  // Dept breakdown
  const depts = {};
  records.forEach(r => {
    const emp = employees.find(e => e._id.toString() === r.employee.toString());
    const dept = emp?.department || 'Unassigned';
    if (!depts[dept]) depts[dept] = { present: 0, absent: 0, total: 0 };
    depts[dept].total++;
    if (r.status === 'present' || r.status === 'remote') depts[dept].present++;
    if (r.status === 'absent') depts[dept].absent++;
  });
  const deptStats = Object.entries(depts).map(([dept, d]) => ({
    department: dept,
    attendanceRate: d.total ? `${Math.round((d.present / d.total) * 100)}%` : 'N/A',
    absences: d.absent,
  }));

  // Chronic absentees (>3 absences)
  const absentees = stats.filter(s => s.absent >= 3).sort((a, b) => b.absent - a.absent).slice(0, 10);

  return {
    period:       `Last ${days} days`,
    totalEmployees: employees.length,
    totalWorkdays,
    statusBreakdown,
    overallAttRate: totalWorkdays > 0 ? `${Math.round(((statusBreakdown.present + (statusBreakdown.late || 0)) / totalWorkdays) * 100)}%` : 'N/A',
    departments:  deptStats,
    chronicAbsentees: absentees.map(e => ({ name: e.name, department: e.department, absences: e.absent, presentDays: e.present })),
  };
}

// ── 6. Leave Anomaly ─────────────────────────────────────────────────────────
async function gatherLeaveAnomaly(companyId) {
  const LeaveRequest = require('../models/LeaveRequest');
  const User         = require('../models/User');

  const now   = new Date();
  const curr  = daysAgo(90);
  const prev  = daysAgo(180);

  const [currentPeriod, prevPeriod] = await Promise.all([
    LeaveRequest.find({ company: companyId, createdAt: { $gte: curr } }).select('employee type days status startDate').lean(),
    LeaveRequest.find({ company: companyId, createdAt: { $gte: prev, $lt: curr } }).select('employee type days').lean(),
  ]);

  const empIds = [...new Set([...currentPeriod, ...prevPeriod].map(r => r.employee?.toString()).filter(Boolean))];
  const users = await User.find({ _id: { $in: empIds } }).select('name department').lean();
  const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u]));

  // By type breakdown
  const byType = {};
  currentPeriod.forEach(r => {
    if (!byType[r.type]) byType[r.type] = { count: 0, days: 0 };
    byType[r.type].count++;
    byType[r.type].days += r.days || 0;
  });

  // Per-employee current vs previous
  const byEmpCurr = {};
  currentPeriod.forEach(r => {
    const k = r.employee?.toString(); if (!k) return;
    if (!byEmpCurr[k]) byEmpCurr[k] = { count: 0, days: 0 };
    byEmpCurr[k].count++; byEmpCurr[k].days += r.days || 0;
  });
  const byEmpPrev = {};
  prevPeriod.forEach(r => {
    const k = r.employee?.toString(); if (!k) return;
    if (!byEmpPrev[k]) byEmpPrev[k] = { count: 0, days: 0 };
    byEmpPrev[k].count++; byEmpPrev[k].days += r.days || 0;
  });

  // Anomalies: employees whose leave frequency doubled vs previous period
  const anomalies = Object.entries(byEmpCurr)
    .filter(([id, c]) => {
      const p = byEmpPrev[id];
      return c.count >= 2 && (!p || c.count > p.count * 1.5);
    })
    .map(([id, c]) => ({
      name:       userMap[id]?.name || id,
      department: userMap[id]?.department || '—',
      currentRequests: c.count,
      currentDays:     c.days,
      previousRequests: byEmpPrev[id]?.count || 0,
    }))
    .sort((a, b) => b.currentRequests - a.currentRequests)
    .slice(0, 10);

  // Pending approvals
  const pending = currentPeriod.filter(r => r.status === 'pending').length;

  return {
    currentPeriod:  'Last 90 days',
    previousPeriod: '90–180 days ago',
    totalRequests:   currentPeriod.length,
    totalDays:       currentPeriod.reduce((s, r) => s + (r.days || 0), 0),
    pendingApprovals: pending,
    byType,
    anomalies,
  };
}

// ── 7. Shift Compliance ───────────────────────────────────────────────────────
async function gatherShiftCompliance(companyId, { days = 30 } = {}) {
  const CorporateAttendance = require('../models/CorporateAttendance');
  const ShiftAssignment     = require('../models/ShiftAssignment');
  const Shift               = require('../models/Shift');
  const User                = require('../models/User');

  const since = daysAgo(days);

  const shifts = await Shift.find({ company: companyId }).select('name startTime endTime gracePeriodMinutes').lean();
  const shiftMap = Object.fromEntries(shifts.map(s => [s._id.toString(), s]));

  const assignments = await ShiftAssignment.find({ company: companyId, startDate: { $lte: new Date() } })
    .select('employee shift')
    .lean();

  const empIds = [...new Set(assignments.map(a => a.employee.toString()))];
  const users = await User.find({ _id: { $in: empIds } }).select('name department').lean();
  const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u]));

  const records = await CorporateAttendance.find({
    company:  companyId,
    employee: { $in: empIds },
    date:     { $gte: since },
  }).select('employee status clockIn date').lean();

  // Count late vs on-time per employee
  const compliance = {};
  empIds.forEach(id => {
    const ass   = assignments.find(a => a.employee.toString() === id);
    const shift = ass ? shiftMap[ass.shift.toString()] : null;
    compliance[id] = { name: userMap[id]?.name || '—', department: userMap[id]?.department || '—', shiftName: shift?.name || '—', onTime: 0, late: 0, absent: 0, total: 0 };
  });
  records.forEach(r => {
    const k = r.employee.toString();
    if (!compliance[k]) return;
    compliance[k].total++;
    if (r.status === 'absent') { compliance[k].absent++; return; }
    if (r.status === 'late')   { compliance[k].late++;   return; }
    compliance[k].onTime++;
  });

  const list = Object.values(compliance).filter(c => c.total > 0);
  const poorCompliance = list
    .filter(c => c.total > 0 && (c.late + c.absent) / c.total >= 0.3)
    .sort((a, b) => (b.late + b.absent) - (a.late + a.absent))
    .slice(0, 10);

  const totals = list.reduce((acc, c) => {
    acc.total  += c.total;
    acc.onTime += c.onTime;
    acc.late   += c.late;
    acc.absent += c.absent;
    return acc;
  }, { total: 0, onTime: 0, late: 0, absent: 0 });

  return {
    period: `Last ${days} days`,
    shifts: shifts.map(s => ({ name: s.name, hours: `${s.startTime}–${s.endTime}`, grace: `${s.gracePeriodMinutes}min` })),
    overall: {
      onTimeRate:  totals.total ? `${Math.round((totals.onTime / totals.total) * 100)}%` : 'N/A',
      lateRate:    totals.total ? `${Math.round((totals.late   / totals.total) * 100)}%` : 'N/A',
      absentRate:  totals.total ? `${Math.round((totals.absent / totals.total) * 100)}%` : 'N/A',
    },
    poorCompliance,
  };
}

// ── 8. Custom Query ───────────────────────────────────────────────────────────
async function gatherCustomQuery(companyId, question, role) {
  const User = require('../models/User');
  const counts = await User.aggregate([
    { $match: { company: new mongoose.Types.ObjectId(companyId) } },
    { $group: { _id: '$role', count: { $sum: 1 } } },
  ]);
  const roleCounts = Object.fromEntries(counts.map(r => [r._id, r.count]));

  // Corporate companies get the full executive snapshot so questions like
  // "Who was absent today?", "Which branch performed best?", or "Generate
  // today's executive summary" can be answered from real data.
  let executive = null;
  try {
    const Company = require('../models/Company');
    const company = await Company.findById(companyId).select('mode').lean();
    if (company?.mode === 'corporate' || company?.mode === 'both') {
      const { computeExecutiveSnapshot } = require('../controllers/executiveController');
      const s = await computeExecutiveSnapshot(companyId);
      executive = {
        today: s.kpis,
        absentToday: s.absentNames,
        lateToday: s.lateNames,
        departmentAttendance30d: s.departmentPerformance,
        branchAttendance30d: s.branchPerformance,
        leaveLast90d: s.leaveStats,
        alerts: s.alerts.map(a => `[${a.level}] ${a.text}`),
      };
    }
  } catch (e) {
    console.warn('[aiReport customQuery] executive context unavailable:', e.message);
  }

  return { question, role, roleCounts, executive, note: 'Answer based on available platform context and the question asked.' };
}

// ── 9. Weekly Digest ─────────────────────────────────────────────────────────
async function gatherWeeklyDigest(companyId, role) {
  const User                = require('../models/User');
  const AttendanceSession   = require('../models/AttendanceSession');
  const AttendanceRecord    = require('../models/AttendanceRecord');
  const Announcement        = require('../models/Announcement');
  const LeaveRequest        = require('../models/LeaveRequest');

  const since = daysAgo(7);

  const [userCount, sessions, announcements, leaveRequests] = await Promise.all([
    User.countDocuments({ company: companyId, isActive: { $ne: false } }),
    AttendanceSession.find({ company: companyId, startedAt: { $gte: since } }).select('status course').lean(),
    Announcement.countDocuments({ company: companyId, createdAt: { $gte: since }, isActive: true }),
    LeaveRequest.find({ company: companyId, createdAt: { $gte: since } }).select('status type').lean(),
  ]);

  const attRecords = sessions.length
    ? await AttendanceRecord.find({ session: { $in: sessions.map(s => s._id) } }).select('status').lean()
    : [];

  const presentCount = attRecords.filter(r => ['present', 'late'].includes(r.status)).length;
  const attRate = attRecords.length > 0 ? Math.round((presentCount / attRecords.length) * 100) : null;

  return {
    period:       'Last 7 days',
    role,
    totalUsers:   userCount,
    sessions:     sessions.length,
    activeSessions: sessions.filter(s => ['live', 'active'].includes(s.status)).length,
    attendanceRate: attRate !== null ? `${attRate}%` : 'N/A',
    announcements,
    leaveRequests:  leaveRequests.length,
    pendingLeave:   leaveRequests.filter(r => r.status === 'pending').length,
    approvedLeave:  leaveRequests.filter(r => r.status === 'approved').length,
  };
}

// ── 10. Platform Health (superadmin only) ─────────────────────────────────────
async function gatherPlatformHealth() {
  const Company  = require('../models/Company');
  const User     = require('../models/User');
  const PaymentLog = require('../models/PaymentLog');

  const companies = await Company.find().select('name mode isActive subscriptionActive subscriptionStatus trialUsed subscriptionEndDate userCount').lean();

  const since30 = daysAgo(30);
  const userAgg = await User.aggregate([
    { $group: { _id: '$company', count: { $sum: 1 } } },
  ]);
  const usersByCompany = Object.fromEntries(userAgg.map(r => [r._id.toString(), r.count]));

  const recentPayments = await PaymentLog.find({ createdAt: { $gte: since30 } })
    .select('amount company createdAt')
    .lean();

  const revenueByCompany = {};
  recentPayments.forEach(p => {
    const k = p.company?.toString(); if (!k) return;
    revenueByCompany[k] = (revenueByCompany[k] || 0) + (p.amount || 0);
  });

  const activeCount   = companies.filter(c => c.isActive !== false && (c.subscriptionActive || c.trialUsed === false)).length;
  const inactiveCount = companies.length - activeCount;
  const totalRevenue30 = recentPayments.reduce((s, p) => s + (p.amount || 0), 0);

  const companyStats = companies.map(c => ({
    name:     c.name,
    mode:     c.mode,
    active:   c.isActive !== false,
    subscribed: c.subscriptionActive,
    users:    usersByCompany[c._id.toString()] || 0,
    revenueGHS: revenueByCompany[c._id.toString()] || 0,
    expiresAt: c.subscriptionEndDate ? fmtDate(c.subscriptionEndDate) : '—',
  }));

  return {
    totalCompanies: companies.length,
    activeCompanies: activeCount,
    inactiveCompanies: inactiveCount,
    totalRevenueLast30Days: `GHS ${totalRevenue30.toLocaleString()}`,
    companies: companyStats,
  };
}

// ── Main generate function ─────────────────────────────────────────────────────
async function generateReport({ type, companyId, parameters = {}, userId, forceRefresh = false }) {
  const cacheKey = JSON.stringify({ type, ...parameters });

  if (!forceRefresh) {
    const cached = await getCached(type, companyId, cacheKey);
    if (cached) return cached;
  }

  let data;
  let prompt;

  switch (type) {
    case 'at_risk_students': {
      data   = await gatherAtRisk(companyId, parameters);
      prompt = `Generate an At-Risk Students report for the period: ${data.period}.

Total students analysed: ${data.totalStudents}
Attendance sessions held: ${data.totalSessions}
Total assignments: ${data.totalAssignments}
Risk distribution — HIGH: ${data.highRisk}, MEDIUM: ${data.medRisk}, LOW: ${data.lowRisk}

Top at-risk students (sorted by risk score, highest first):
${data.atRiskStudents.map((s, i) => `${i + 1}. ${s.name} [${s.riskLevel}] | Level: ${s.level} | Attendance: ${s.attendance} | Quiz avg: ${s.quizScore} | Assignments: ${s.assignments}`).join('\n')}

Write a clear report identifying patterns, naming the highest-risk students, and providing targeted intervention recommendations.`;
      break;
    }
    case 'class_health': {
      data   = await gatherClassHealth(companyId, parameters.courseId);
      prompt = `Generate a Class Health Report for course: ${data.course.title} (${data.course.code}).
Period: ${data.period}

Enrolled students: ${data.totalEnrolled}
Attendance sessions: ${data.sessions}
Average attendance rate: ${data.avgAttendance}
Students with < 60% attendance: ${data.lowAttStudents}
Average quiz score: ${data.avgQuizScore} (across ${data.totalQuizAttempts} attempts)
Assignments set: ${data.assignments}
Overall submission rate: ${data.submissionRate}

Analyse the course health, flag concerns, and give recommendations to improve engagement.`;
      break;
    }
    case 'department_overview': {
      data   = await gatherDepartmentOverview(companyId, parameters.department);
      prompt = `Generate a Department Overview Report for: ${data.department} Department
Period: ${data.period}

Courses (${data.totalCourses}):
${data.courses.map(c => `  • ${c.title} (${c.code}) — ${c.enrolled} students`).join('\n')}

Total students: ${data.totalStudents} | Total lecturers: ${data.totalLecturers}
Attendance sessions: ${data.sessions}
Dept-wide attendance rate: ${data.deptAttRate}
Avg quiz score across dept: ${data.avgQuizScore}

Write an overview highlighting strengths, weaknesses, and cross-course patterns. Recommend improvements.`;
      break;
    }
    case 'exam_readiness': {
      data   = await gatherExamReadiness(companyId, parameters.courseId, parameters.role === 'student' ? userId : null);
      prompt = `Generate an Exam Readiness Report for: ${data.course.title} (${data.course.code})

Enrolled: ${data.totalEnrolled} | Sessions: ${data.sessions} | Assignments: ${data.assignments}
Readiness summary — High: ${data.readinessSummary.high}, Medium: ${data.readinessSummary.medium}, At Risk: ${data.readinessSummary.atRisk}, Unknown: ${data.readinessSummary.unknown}

Student breakdown (sorted At Risk → High):
${data.students.slice(0, 30).map(s => `  ${s.name} | ${s.readiness} | Att: ${s.attendance} | Quiz: ${s.quizScore} | Assign: ${s.assignments} | Composite: ${s.composite}`).join('\n')}

Write a pre-exam readiness assessment. Focus on At Risk students. Recommend last-minute interventions.`;
      break;
    }
    case 'workforce_attendance': {
      data   = await gatherWorkforceAttendance(companyId, parameters);
      prompt = `Generate a Workforce Attendance Intelligence Report.
Period: ${data.period}

Total employees tracked: ${data.totalEmployees}
Total working-day records: ${data.totalWorkdays}
Overall attendance rate: ${data.overallAttRate}
Status breakdown: Present: ${data.statusBreakdown.present}, Absent: ${data.statusBreakdown.absent}, Late: ${data.statusBreakdown.late}, On Leave: ${data.statusBreakdown.on_leave}

Department breakdown:
${data.departments.map(d => `  • ${d.department}: ${d.attendanceRate} attendance, ${d.absences} absences`).join('\n')}

Chronic absentees (≥3 absences):
${data.chronicAbsentees.map(e => `  • ${e.name} (${e.department}): ${e.absences} absences, ${e.presentDays} present`).join('\n')}

Analyse attendance patterns, identify at-risk departments, and recommend interventions.`;
      break;
    }
    case 'leave_anomaly': {
      data   = await gatherLeaveAnomaly(companyId);
      prompt = `Generate a Leave & Absence Anomaly Report.

Current period (${data.currentPeriod}): ${data.totalRequests} requests totalling ${data.totalDays} days
Pending approvals: ${data.pendingApprovals}
Previous period (${data.previousPeriod}) used for comparison.

Leave by type:
${Object.entries(data.byType).map(([type, d]) => `  • ${type}: ${d.count} requests, ${d.days} days`).join('\n')}

Employees with anomalous leave patterns (frequency increased ≥50% vs prior period):
${data.anomalies.map(a => `  • ${a.name} (${a.department}): ${a.currentRequests} requests now vs ${a.previousRequests} before`).join('\n') || '  None detected'}

Analyse leave patterns, flag anomalies, and recommend HR actions.`;
      break;
    }
    case 'shift_compliance': {
      data   = await gatherShiftCompliance(companyId, parameters);
      prompt = `Generate a Shift Compliance Report.
Period: ${data.period}

Shifts configured:
${data.shifts.map(s => `  • ${s.name}: ${s.hours} (grace: ${s.grace})`).join('\n')}

Overall compliance:
  On-time rate: ${data.overall.onTimeRate}
  Late rate:    ${data.overall.lateRate}
  Absent rate:  ${data.overall.absentRate}

Employees with poor compliance (≥30% late or absent):
${data.poorCompliance.map(e => `  • ${e.name} (${e.department}, ${e.shiftName}): ${e.late} late, ${e.absent} absent out of ${e.total} days`).join('\n') || '  All employees within acceptable compliance'}

Write a shift compliance analysis. Name specific employees with issues and recommend corrective actions.`;
      break;
    }
    case 'custom_query': {
      data   = await gatherCustomQuery(companyId, parameters.question, parameters.role);
      prompt = `A ${data.role} is asking: "${data.question}"

Platform context (user counts by role): ${JSON.stringify(data.roleCounts)}
${data.executive ? `
Live company snapshot (generated now):
${JSON.stringify(data.executive, null, 1)}
` : ''}
Answer the question as best you can using the context provided. Prefer concrete numbers and names from the live snapshot when they answer the question. If you cannot answer from the data given, say so and suggest where the admin could find the information.`;
      break;
    }
    case 'weekly_digest': {
      data   = await gatherWeeklyDigest(companyId, parameters.role || 'admin');
      prompt = `Generate a Weekly Digest Report for a ${data.role}.
Period: ${data.period}

Platform activity:
  Total active users: ${data.totalUsers}
  Attendance sessions held: ${data.sessions} (${data.activeSessions} still active)
  Overall attendance rate: ${data.attendanceRate}
  Announcements posted: ${data.announcements}
  Leave requests: ${data.leaveRequests} (${data.pendingLeave} pending, ${data.approvedLeave} approved)

Write a concise weekly digest summarising the week's activity, highlighting notable trends, and flagging anything requiring attention.`;
      break;
    }
    case 'platform_health': {
      data   = await gatherPlatformHealth();
      prompt = `Generate a Platform Health Report (Superadmin view).

Total institutions: ${data.totalCompanies} (${data.activeCompanies} active, ${data.inactiveCompanies} inactive)
Revenue last 30 days: ${data.totalRevenueLast30Days}

Institution breakdown:
${data.companies.map(c => `  • ${c.name} [${c.mode}] — ${c.users} users, subscribed: ${c.subscribed}, revenue: GHS ${c.revenueGHS}, expires: ${c.expiresAt}`).join('\n')}

Analyse platform health, identify institutions at risk of churning (low users, expiring soon), growth trends, and strategic recommendations.`;
      break;
    }
    default:
      throw new Error(`Unknown report type: ${type}`);
  }

  const report = await callAI(prompt);

  // Extract first sentence as summary
  const summary = report.replace(/^#+[^\n]*\n+/, '').replace(/\*\*/g, '').split('. ')[0].slice(0, 200);

  const saved = await AIReport.create({
    company:     companyId || null,
    type,
    requestedBy: userId || null,
    parameters:  { ...parameters, _cacheKey: cacheKey },
    report,
    summary,
  });

  return saved.toObject();
}

module.exports = { generateReport };

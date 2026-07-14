'use strict';

/**
 * examTimetable.js
 * Mounted at: /api/exam-timetable   (registered in server.js)
 *
 * Route summary
 * -------------
 * GET    /                  view entries, scoped to the caller's reach
 * GET    /editable-courses  courses the caller may schedule exams for
 * POST   /                  create entry (HOD / class rep / admin)
 * PATCH  /:id               update entry (same edit scope)
 * DELETE /:id               delete entry (same edit scope)
 *
 * Edit scope (server-enforced; the UI only mirrors it):
 *   - admin/superadmin: any course in the company
 *   - hod:              courses whose departmentId matches their department
 *   - student with isClassRep: courses whose level+group equal the rep's own
 *     studentLevel/studentGroup — "their class only" — and, when both the
 *     course and the rep carry a department, those must match too
 *
 * View scope:
 *   - admin/superadmin: everything
 *   - hod/lecturer:     their department (plus undepartmented entries)
 *   - student:          their level+group class (plus department-wide
 *                       entries with no level/group set)
 *
 * Academic mode only.
 */

const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const { requireMode } = require('../middleware/role');
const { companyIsolation } = require('../middleware/companyIsolation');
const ExamTimetableEntry = require('../models/ExamTimetableEntry');
const Course = require('../models/Course');

const mw = [authenticate, requireMode('academic'), companyIsolation];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ── Edit-permission core ─────────────────────────────────────────────────────
// Returns null when the user may schedule/edit exams for this course, or an
// error message explaining why not.
function editDenialReason(user, course) {
  const role = user.role;
  if (role === 'admin' || role === 'superadmin') return null;

  if (role === 'hod') {
    const dept = (user.department || '').toString().trim().toLowerCase();
    const courseDept = (course.departmentId || '').toString().trim().toLowerCase();
    if (!dept) return 'Your HOD account has no department set.';
    if (courseDept && courseDept !== dept) {
      return 'HODs can only manage exam entries for courses in their own department.';
    }
    return null;
  }

  if (role === 'student' && user.isClassRep) {
    const lvl = (user.studentLevel || '').toString().trim();
    const grp = (user.studentGroup || '').toString().trim();
    if (!lvl || !grp) return 'Your class rep account has no level/group set.';
    if ((course.level || '').toString().trim() !== lvl ||
        (course.group || '').toString().trim() !== grp) {
      return 'Class reps can only manage exam entries for courses of their own class (level and group).';
    }
    const repDept = (user.department || '').toString().trim().toLowerCase();
    const courseDept = (course.departmentId || '').toString().trim().toLowerCase();
    if (repDept && courseDept && repDept !== courseDept) {
      return 'Class reps can only manage exam entries for courses in their own department.';
    }
    return null;
  }

  return 'Only HODs, class representatives, and admins can manage the exams timetable.';
}

async function loadCourseInCompany(req, courseId) {
  if (!courseId) return null;
  return Course.findOne({ _id: courseId, companyId: req.user.company }).lean();
}

// ── GET / — view, scoped ─────────────────────────────────────────────────────
router.get('/', ...mw, async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = { company: req.user.company, isActive: true };
    if (from || to) {
      filter.examDate = {};
      if (from) filter.examDate.$gte = new Date(from);
      if (to)   filter.examDate.$lte = new Date(to);
    }

    const role = req.user.role;
    if (role === 'hod' || role === 'lecturer') {
      const dept = (req.user.department || '').toString().trim();
      if (dept) {
        filter.$or = [
          { department: new RegExp(`^${dept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { department: null },
        ];
      }
    } else if (role === 'student') {
      const lvl = (req.user.studentLevel || '').toString().trim();
      const grp = (req.user.studentGroup || '').toString().trim();
      filter.$or = [
        { level: lvl || null, group: grp || null },
        { level: null, group: null }, // department-wide sittings apply to everyone
      ];
    }
    // admin/superadmin: no extra filter

    const entries = await ExamTimetableEntry.find(filter)
      .populate('course', 'title code level group departmentId')
      .populate('createdBy', 'name role')
      .sort({ examDate: 1, startTime: 1 })
      .lean();

    // Tell the client whether the caller may edit each entry, so the UI can
    // show/hide controls without duplicating the permission rules.
    const withEditable = entries.map(e => ({
      ...e,
      canEdit: e.course ? editDenialReason(req.user, {
        departmentId: e.course.departmentId,
        level: e.course.level,
        group: e.course.group,
      }) === null : false,
    }));

    res.json({ entries: withEditable });
  } catch (err) {
    console.error('exam-timetable list:', err);
    res.status(500).json({ error: 'Failed to load exams timetable' });
  }
});

// ── GET /editable-courses — what can the caller schedule for? ────────────────
router.get('/editable-courses', ...mw, async (req, res) => {
  try {
    const role = req.user.role;
    const base = { companyId: req.user.company, isActive: { $ne: false } };
    let filter = null;

    if (role === 'admin' || role === 'superadmin') {
      filter = base;
    } else if (role === 'hod') {
      const dept = (req.user.department || '').toString().trim();
      if (!dept) return res.json({ courses: [] });
      filter = { ...base, departmentId: new RegExp(`^${dept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    } else if (role === 'student' && req.user.isClassRep) {
      const lvl = (req.user.studentLevel || '').toString().trim();
      const grp = (req.user.studentGroup || '').toString().trim();
      if (!lvl || !grp) return res.json({ courses: [] });
      filter = { ...base, level: lvl, group: grp };
      // Mirror editDenialReason's department rule: when the rep has a
      // department, exclude other departments' same-level/group courses —
      // otherwise the dropdown offers courses the POST would then 403.
      const repDept = (req.user.department || '').toString().trim();
      if (repDept) {
        filter.$or = [
          { departmentId: new RegExp(`^${repDept.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
          { departmentId: null },
          { departmentId: '' },
        ];
      }
    } else {
      return res.json({ courses: [] });
    }

    const courses = await Course.find(filter)
      .select('title code level group departmentId')
      .sort({ code: 1 })
      .lean();
    res.json({ courses });
  } catch (err) {
    console.error('exam-timetable editable-courses:', err);
    res.status(500).json({ error: 'Failed to load courses' });
  }
});

// ── Shared create/update validation ──────────────────────────────────────────
function validateBody(body) {
  const { examDate, startTime, endTime } = body;
  if (!examDate || isNaN(new Date(examDate).getTime())) return 'A valid exam date is required.';
  if (!TIME_RE.test(startTime || '')) return 'startTime must be HH:MM (24h).';
  if (!TIME_RE.test(endTime || ''))   return 'endTime must be HH:MM (24h).';
  if (endTime <= startTime) return 'endTime must be after startTime.';
  return null;
}

// ── POST / — create ──────────────────────────────────────────────────────────
router.post('/', ...mw, async (req, res) => {
  try {
    const { courseId, examDate, startTime, endTime, venue, notes } = req.body;

    const course = await loadCourseInCompany(req, courseId);
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const denial = editDenialReason(req.user, course);
    if (denial) return res.status(403).json({ error: denial });

    const invalid = validateBody(req.body);
    if (invalid) return res.status(400).json({ error: invalid });

    const entry = await ExamTimetableEntry.create({
      company:    req.user.company,
      course:     course._id,
      department: course.departmentId || null,
      level:      course.level || null,
      group:      course.group || null,
      examDate:   new Date(examDate),
      startTime,
      endTime,
      venue: venue?.trim() || null,
      notes: notes?.trim() || null,
      createdBy: req.user._id,
    });

    res.status(201).json({ message: 'Exam scheduled', entry });
  } catch (err) {
    console.error('exam-timetable create:', err);
    res.status(500).json({ error: 'Failed to create exam entry' });
  }
});

// ── PATCH /:id — update ──────────────────────────────────────────────────────
router.patch('/:id', ...mw, async (req, res) => {
  try {
    const entry = await ExamTimetableEntry.findOne({ _id: req.params.id, company: req.user.company });
    if (!entry) return res.status(404).json({ error: 'Exam entry not found' });

    // Permission is checked against the entry's CURRENT course, and again
    // against the new course when the exam is being moved to one — so a rep
    // can't hijack an out-of-class entry by "editing" it into their class,
    // nor push one of their entries out of their own editable scope.
    const currentCourse = await loadCourseInCompany(req, entry.course);
    if (!currentCourse) return res.status(404).json({ error: 'Course for this entry no longer exists' });
    const denialCurrent = editDenialReason(req.user, currentCourse);
    if (denialCurrent) return res.status(403).json({ error: denialCurrent });

    let course = currentCourse;
    if (req.body.courseId && req.body.courseId.toString() !== entry.course.toString()) {
      course = await loadCourseInCompany(req, req.body.courseId);
      if (!course) return res.status(404).json({ error: 'Course not found' });
      const denialNew = editDenialReason(req.user, course);
      if (denialNew) return res.status(403).json({ error: denialNew });
      entry.course = course._id;
    }

    if (req.body.examDate !== undefined || req.body.startTime !== undefined || req.body.endTime !== undefined) {
      const merged = {
        examDate:  req.body.examDate  ?? entry.examDate,
        startTime: req.body.startTime ?? entry.startTime,
        endTime:   req.body.endTime   ?? entry.endTime,
      };
      const invalid = validateBody(merged);
      if (invalid) return res.status(400).json({ error: invalid });
      entry.examDate  = new Date(merged.examDate);
      entry.startTime = merged.startTime;
      entry.endTime   = merged.endTime;
    }
    if (req.body.venue !== undefined) entry.venue = req.body.venue?.trim() || null;
    if (req.body.notes !== undefined) entry.notes = req.body.notes?.trim() || null;

    entry.department = course.departmentId || null;
    entry.level      = course.level || null;
    entry.group      = course.group || null;
    entry.updatedBy  = req.user._id;
    await entry.save();

    res.json({ message: 'Exam entry updated', entry });
  } catch (err) {
    console.error('exam-timetable update:', err);
    res.status(500).json({ error: 'Failed to update exam entry' });
  }
});

// ── DELETE /:id ──────────────────────────────────────────────────────────────
router.delete('/:id', ...mw, async (req, res) => {
  try {
    const entry = await ExamTimetableEntry.findOne({ _id: req.params.id, company: req.user.company });
    if (!entry) return res.status(404).json({ error: 'Exam entry not found' });

    const course = await loadCourseInCompany(req, entry.course);
    // A deleted course orphans the entry; let admins clean those up.
    const denial = course
      ? editDenialReason(req.user, course)
      : (['admin', 'superadmin'].includes(req.user.role) ? null : 'Only admins can remove entries for deleted courses.');
    if (denial) return res.status(403).json({ error: denial });

    await entry.deleteOne();
    res.json({ message: 'Exam entry removed' });
  } catch (err) {
    console.error('exam-timetable delete:', err);
    res.status(500).json({ error: 'Failed to delete exam entry' });
  }
});

module.exports = router;

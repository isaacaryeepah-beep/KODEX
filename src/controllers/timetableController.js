const Timetable = require('../models/Timetable');
const Course    = require('../models/Course');

const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// ── List timetable slots ──────────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    const filter = { company: req.user.company, isActive: true };

    if (req.user.role === 'lecturer') {
      filter.lecturer = req.user._id;
    } else if (req.user.role === 'hod' && req.user.department) {
      filter.department = req.user.department;
    } else if (req.user.role === 'student') {
      // Students see slots for courses they're enrolled in
      const enrolledCourses = await Course.find({
        company: req.user.company,
        enrolledStudents: req.user._id,
      }).select('_id').lean();
      filter.course = { $in: enrolledCourses.map(c => c._id) };
    }
    // admin/superadmin/manager see all

    const slots = await Timetable.find(filter)
      .populate('course',   'title code')
      .populate('lecturer', 'name department')
      .sort({ dayOfWeek: 1, startTime: 1 });

    res.json({ slots });
  } catch (err) {
    console.error('Timetable list error:', err);
    res.status(500).json({ error: 'Failed to load timetable' });
  }
};

// ── Create a slot ─────────────────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    if (!['lecturer', 'admin', 'superadmin', 'manager', 'hod'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only lecturers and admins can add timetable slots' });
    }

    const { courseId, dayOfWeek, startTime, endTime, title, room, color, notes } = req.body;

    if (!courseId || dayOfWeek === undefined || !startTime || !endTime) {
      return res.status(400).json({ error: 'Course, day, start time and end time are required' });
    }
    if (dayOfWeek < 0 || dayOfWeek > 6) {
      return res.status(400).json({ error: 'Day must be 0 (Sun) to 6 (Sat)' });
    }
    if (startTime >= endTime) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    const course = await Course.findOne({ _id: courseId, company: req.user.company });
    if (!course) return res.status(404).json({ error: 'Course not found' });

    // Check for time clash for this lecturer on the same day
    const clash = await Timetable.findOne({
      company:   req.user.company,
      lecturer:  req.user.role === 'lecturer' ? req.user._id : req.body.lecturerId,
      dayOfWeek: Number(dayOfWeek),
      isActive:  true,
      $or: [
        { startTime: { $lt: endTime }, endTime: { $gt: startTime } },
      ],
    });
    if (clash) {
      const clashCourse = await Course.findById(clash.course).select('title').lean();
      return res.status(400).json({
        error: `Time clash with "${clashCourse?.title || 'another class'}" on ${DAYS[dayOfWeek]} ${clash.startTime}-${clash.endTime}`
      });
    }

    const slot = await Timetable.create({
      company:    req.user.company,
      course:     courseId,
      lecturer:   req.user.role === 'lecturer' ? req.user._id : (req.body.lecturerId || req.user._id),
      department: req.user.department || course.department || null,
      dayOfWeek:  Number(dayOfWeek),
      startTime,
      endTime,
      title:      title?.trim() || null,
      room:       room?.trim() || null,
      color:      color || '#6366f1',
      notes:      notes?.trim() || null,
    });

    const populated = await slot.populate([
      { path: 'course',   select: 'title code' },
      { path: 'lecturer', select: 'name department' },
    ]);

    res.status(201).json({ slot: populated });
  } catch (err) {
    console.error('Timetable create error:', err);
    res.status(500).json({ error: 'Failed to create timetable slot' });
  }
};

// ── Update a slot ─────────────────────────────────────────────────────────────
exports.update = async (req, res) => {
  try {
    const slot = await Timetable.findOne({ _id: req.params.id, company: req.user.company });
    if (!slot) return res.status(404).json({ error: 'Slot not found' });

    // Only the lecturer who created it or an admin can edit
    if (req.user.role === 'lecturer' && String(slot.lecturer) !== String(req.user._id)) {
      return res.status(403).json({ error: 'You can only edit your own timetable slots' });
    }

    const { dayOfWeek, startTime, endTime, title, room, color, notes } = req.body;
    if (dayOfWeek !== undefined) slot.dayOfWeek = Number(dayOfWeek);
    if (startTime) slot.startTime = startTime;
    if (endTime)   slot.endTime   = endTime;
    if (title !== undefined) slot.title = title?.trim() || null;
    if (room  !== undefined) slot.room  = room?.trim()  || null;
    if (color)  slot.color = color;
    if (notes !== undefined) slot.notes = notes?.trim() || null;

    if (slot.startTime >= slot.endTime) {
      return res.status(400).json({ error: 'End time must be after start time' });
    }

    await slot.save();
    const populated = await slot.populate([
      { path: 'course',   select: 'title code' },
      { path: 'lecturer', select: 'name department' },
    ]);
    res.json({ slot: populated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update slot' });
  }
};

// ── Delete a slot ─────────────────────────────────────────────────────────────
exports.remove = async (req, res) => {
  try {
    const slot = await Timetable.findOne({ _id: req.params.id, company: req.user.company });
    if (!slot) return res.status(404).json({ error: 'Slot not found' });

    if (req.user.role === 'lecturer' && String(slot.lecturer) !== String(req.user._id)) {
      return res.status(403).json({ error: 'You can only delete your own timetable slots' });
    }

    await Timetable.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete slot' });
  }
};

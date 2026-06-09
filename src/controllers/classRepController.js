const bcrypt = require('bcryptjs');
const Device = require('../models/Device');
const Course = require('../models/Course');
const User = require('../models/User');

// GET /api/class-rep/device
exports.getMyDevice = async (req, res) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const device = await Device.findOne({ classRepId: req.user._id, companyId: req.user.company, isActive: true })
      .populate('activeLecturerId', 'name email');
    res.json({ device: device || null });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /api/class-rep/lecturers — lecturers who teach the class rep's course(s)
exports.getCourseLecturers = async (req, res) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const user = await User.findById(req.user._id).select('classRepCourse programme studentLevel studentGroup sessionType semester');

    // Find all courses matching this student's class group
    const query = { companyId: req.user.company, isActive: true };
    if (user.studentLevel) query.level = user.studentLevel;
    if (user.studentGroup) query.group = user.studentGroup;
    if (user.sessionType) query.sessionType = user.sessionType;
    if (user.semester) query.semester = user.semester;
    if (user.programme) query.qualificationType = user.programme;

    const courses = await Course.find(query).populate('lecturerId', 'name email').lean();

    const lecturers = courses
      .filter(c => c.lecturerId)
      .map(c => ({
        lecturerId: c.lecturerId._id,
        lecturerName: c.lecturerId.name,
        lecturerEmail: c.lecturerId.email,
        courseId: c._id,
        courseTitle: c.title,
        courseCode: c.code,
      }));

    res.json({ lecturers });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// GET /api/class-rep/search-lecturers?q=... — search any lecturer in the same company
exports.searchLecturers = async (req, res) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const q = (req.query.q || req.query.search || '').trim();
    if (q.length < 2) return res.json({ users: [] });
    const regex = new RegExp(q, 'i');
    const lecturers = await User.find({
      companyId: req.user.company,
      role: 'lecturer',
      isActive: true,
      $or: [{ name: regex }, { email: regex }],
    }).select('_id name email').limit(10).lean();
    res.json({ users: lecturers });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /api/class-rep/connect — connect device to a lecturer for this session
exports.connectDevice = async (req, res) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const { lecturerId, courseId, lecturerPin } = req.body;
    if (!lecturerId || !courseId) return res.status(400).json({ error: 'lecturerId and courseId required' });

    const device = await Device.findOne({ classRepId: req.user._id, companyId: req.user.company, isActive: true });
    if (!device) return res.status(404).json({ error: 'No device is assigned to your class. Contact your admin.' });

    // Check device online (within 20s — matches Device model isOnline virtual)
    const ms = Date.now() - new Date(device.lastHeartbeat || 0).getTime();
    if (ms > 20000) return res.status(503).json({ error: 'Device is offline. Power it on first.' });

    // Check if device already active
    if (device.activeLecturerId) return res.status(409).json({ error: 'Device is already connected to a session. End that session first.' });

    // Verify lecturer belongs to same company
    const lecturer = await User.findOne({ _id: lecturerId, company: req.user.company, role: 'lecturer', isActive: true }).select('+classRepPin name email');
    if (!lecturer) return res.status(404).json({ error: 'Lecturer not found' });

    // Verify lecturer PIN if they have set one
    if (lecturer.classRepPin) {
      const pinOk = lecturerPin && await bcrypt.compare(String(lecturerPin), lecturer.classRepPin);
      if (!pinOk) return res.status(403).json({ error: 'Incorrect lecturer PIN', requiresPin: true });
    }

    // Verify course belongs to this lecturer
    const course = await Course.findOne({ _id: courseId, companyId: req.user.company, isActive: true, lecturerId: lecturerId });
    if (!course) return res.status(404).json({ error: 'Course not found or not assigned to this lecturer' });

    device.activeLecturerId = lecturerId;
    device.activeCourseId = courseId;
    device.connectedAt = new Date();
    await device.save({ validateModifiedOnly: true });

    res.json({ ok: true, message: `Device connected to ${lecturer.name} — ${course.code}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /api/class-rep/disconnect — release device after session
exports.disconnectDevice = async (req, res) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const device = await Device.findOne({ classRepId: req.user._id, companyId: req.user.company, isActive: true });
    if (!device) return res.status(404).json({ error: 'No device assigned' });

    device.activeLecturerId = null;
    device.activeCourseId = null;
    device.connectedAt = null;
    await device.save({ validateModifiedOnly: true });

    res.json({ ok: true, message: 'Device released successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// POST /api/class-rep/set-pin — lecturer sets their 4-digit PIN
exports.setLecturerPin = async (req, res) => {
  try {
    if (req.user.role !== 'lecturer') return res.status(403).json({ error: 'Only lecturers can set a PIN' });
    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    const hashed = await bcrypt.hash(String(pin), 10);
    await User.findByIdAndUpdate(req.user._id, { classRepPin: hashed });
    res.json({ ok: true, message: 'PIN set successfully' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// DELETE /api/class-rep/set-pin — lecturer clears their PIN (allows open connection)
exports.clearLecturerPin = async (req, res) => {
  try {
    if (req.user.role !== 'lecturer') return res.status(403).json({ error: 'Only lecturers can clear a PIN' });
    await User.findByIdAndUpdate(req.user._id, { $unset: { classRepPin: 1 } });
    res.json({ ok: true, message: 'PIN cleared. Class reps can now connect without a PIN.' });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

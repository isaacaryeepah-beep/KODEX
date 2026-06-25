const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Device = require('../models/Device');
const Course = require('../models/Course');
const User = require('../models/User');

const OFFLINE_PIN_PEPPER = 'dikly_offline_v1';

const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/class-rep/device
exports.getMyDevice = async (req, res, next) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const device = await Device.findOne({ classRepId: req.user._id, companyId: req.user.company, isActive: true })
      .populate('activeLecturerId', 'name email');
    if (!device) return res.json({ device: null });
    const secsSinceHeartbeat = device.lastHeartbeat
      ? Math.floor((Date.now() - device.lastHeartbeat.getTime()) / 1000)
      : null;
    res.json({ device, secsSinceHeartbeat });
  } catch (e) { next(e); }
};

// GET /api/class-rep/lecturers — lecturers assigned to the class rep's device by admin
exports.getCourseLecturers = async (req, res, next) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });

    // Primary source: device.assignedLecturers set by admin
    const device = await Device.findOne({ classRepId: req.user._id, companyId: req.user.company, isActive: true })
      .populate('assignedLecturers.lecturerId', 'name email')
      .populate('assignedLecturers.courseId', 'title code')
      .lean();

    if (device && device.assignedLecturers && device.assignedLecturers.length) {
      const lecturers = device.assignedLecturers
        .filter(a => a.lecturerId && a.courseId)
        .map(a => ({
          lecturerId:   a.lecturerId._id,
          lecturerName: a.lecturerId.name,
          lecturerEmail: a.lecturerId.email,
          courseId:    a.courseId._id,
          courseTitle: a.courseId.title,
          courseCode:  a.courseId.code,
        }));
      if (lecturers.length) return res.json({ lecturers });
    }

    // Fallback: query courses matching the class rep's class-group profile
    const user = await User.findById(req.user._id).select('classRepCourse programme studentLevel studentGroup sessionType semester department').lean();
    const query = { companyId: req.user.company, isActive: true };
    if (user.studentLevel) query.level = user.studentLevel;
    if (user.studentGroup) query.group = user.studentGroup;
    if (user.sessionType) query.sessionType = user.sessionType;
    if (user.semester) query.semester = user.semester;
    if (user.programme) query.qualificationType = user.programme;

    const courses = await Course.find(query).populate('lecturerId', 'name email').lean();
    let lecturers = courses
      .filter(c => c.lecturerId)
      .map(c => ({
        lecturerId:   c.lecturerId._id,
        lecturerName: c.lecturerId.name,
        lecturerEmail: c.lecturerId.email,
        courseId:    c._id,
        courseTitle: c.title,
        courseCode:  c.code,
      }));

    // Last resort: all lecturers in the rep's department (no course association)
    if (!lecturers.length) {
      const fallbackFilter = { company: req.user.company, role: 'lecturer', isActive: true };
      if (user.department) fallbackFilter.department = user.department;
      const fallback = await User.find(fallbackFilter).select('_id name email').limit(50).lean();
      lecturers = fallback.map(l => ({
        lecturerId:   l._id,
        lecturerName: l.name,
        lecturerEmail: l.email,
        courseId:    null,
        courseTitle: null,
        courseCode:  null,
      }));
    }

    res.json({ lecturers });
  } catch (e) { next(e); }
};

// GET /api/class-rep/search-lecturers?q=... — search lecturers in the rep's department
exports.searchLecturers = async (req, res, next) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const q = (req.query.q || req.query.search || '').trim();
    if (q.length < 2) return res.json({ users: [] });
    const rep = await User.findById(req.user._id).select('department').lean();
    const regex = new RegExp(escapeRegex(q), 'i');
    const filter = {
      company: req.user.company,
      role: 'lecturer',
      isActive: true,
      $or: [{ name: regex }, { email: regex }],
    };
    if (rep && rep.department) filter.department = rep.department;
    const lecturers = await User.find(filter).select('_id name email').limit(10).lean();
    res.json({ users: lecturers });
  } catch (e) { next(e); }
};

// POST /api/class-rep/connect — connect device to a lecturer for this session
exports.connectDevice = async (req, res, next) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const { lecturerId, lecturerPin } = req.body;
    const courseId = req.body.courseId && req.body.courseId !== 'null' ? req.body.courseId : null;
    if (!lecturerId) return res.status(400).json({ error: 'lecturerId required' });

    const device = await Device.findOne({ classRepId: req.user._id, companyId: req.user.company, isActive: true });
    if (!device) return res.status(404).json({ error: 'No device is assigned to your class. Contact your admin.' });

    const ms = Date.now() - new Date(device.lastHeartbeat || 0).getTime();
    if (ms > 20000) return res.status(503).json({ error: 'Device is offline. Power it on first.' });

    if (device.activeLecturerId) return res.status(409).json({ error: 'Device is already connected to a session. End that session first.' });

    const lecturer = await User.findOne({ _id: lecturerId, company: req.user.company, role: 'lecturer', isActive: true }).select('+classRepPin name email');
    if (!lecturer) return res.status(404).json({ error: 'Lecturer not found' });

    if (lecturer.classRepPin) {
      const pinOk = lecturerPin && await bcrypt.compare(String(lecturerPin), lecturer.classRepPin);
      if (!pinOk) return res.status(403).json({ error: 'Incorrect lecturer PIN', requiresPin: true });
    }

    // courseId is optional — provided when connecting via course dropdown, absent for manual assignments
    let course = null;
    if (courseId) {
      course = await Course.findOne({ _id: courseId, companyId: req.user.company, isActive: true, lecturerId });
      if (!course) return res.status(404).json({ error: 'Course not found or not assigned to this lecturer' });
    }

    device.activeLecturerId = lecturerId;
    device.activeCourseId = course ? course._id : null;
    device.connectedAt = new Date();
    await device.save({ validateModifiedOnly: true });

    res.json({ ok: true, message: course ? `Device connected to ${lecturer.name} — ${course.code}` : `Device connected to ${lecturer.name}` });
  } catch (e) { next(e); }
};

// POST /api/class-rep/disconnect — release device after session
exports.disconnectDevice = async (req, res, next) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const device = await Device.findOne({ classRepId: req.user._id, companyId: req.user.company, isActive: true });
    if (!device) return res.status(404).json({ error: 'No device assigned' });

    device.activeLecturerId = null;
    device.activeCourseId = null;
    device.connectedAt = null;
    await device.save({ validateModifiedOnly: true });

    res.json({ ok: true, message: 'Device released successfully' });
  } catch (e) { next(e); }
};

// POST /api/class-rep/set-pin — lecturer sets their 4-digit PIN
exports.setLecturerPin = async (req, res, next) => {
  try {
    if (req.user.role !== 'lecturer') return res.status(403).json({ error: 'Only lecturers can set a PIN' });
    const { pin } = req.body;
    if (!pin || !/^\d{4}$/.test(String(pin))) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    const hashed = await bcrypt.hash(String(pin), 10);
    // Offline hash: HMAC-SHA256(pepper, lecturerId:pin) — verified by the ESP32 device without internet
    const offlinePinHash = crypto.createHmac('sha256', OFFLINE_PIN_PEPPER)
      .update(`${req.user._id}:${pin}`)
      .digest('hex');
    await User.findByIdAndUpdate(req.user._id, { classRepPin: hashed, offlinePinHash });
    res.json({ ok: true, message: 'PIN set successfully', hasOfflinePin: true });
  } catch (e) { next(e); }
};

// GET /api/class-rep/bundle — device fetches pre-auth bundle for offline session start
// Authenticated with device JWT (authenticateDevice middleware)
exports.getDeviceBundle = async (req, res, next) => {
  try {
    const device = req.device;
    if (!device.classRepId) return res.status(400).json({ error: 'No class rep assigned to this device' });

    const rep = await User.findById(device.classRepId)
      .select('classRepCourse studentLevel studentGroup programme sessionType semester')
      .lean();
    if (!rep) return res.status(404).json({ error: 'Class rep not found' });

    // Find all courses for this rep's class group
    const query = { companyId: device.companyId, isActive: true };
    if (rep.studentLevel) query.level   = rep.studentLevel;
    if (rep.studentGroup) query.group   = rep.studentGroup;
    if (rep.sessionType)  query.sessionType = rep.sessionType;
    if (rep.semester)     query.semester = rep.semester;
    if (rep.programme)    query.qualificationType = rep.programme;

    const courses = await Course.find(query)
      .select('_id title code lecturerId')
      .lean();

    // Collect all unique lecturer IDs across courses
    const lecturerIds = [...new Set(courses.map(c => c.lecturerId?.toString()).filter(Boolean))];

    // Also include lecturers from CourseLecturerAssignment if that model exists
    let extraAssignments = [];
    try {
      const CLA = require('../models/CourseLecturerAssignment');
      extraAssignments = await CLA.find({
        course: { $in: courses.map(c => c._id) },
        isActive: { $ne: false },
      }).select('course lecturer').lean();
      extraAssignments.forEach(a => {
        const id = a.lecturer?.toString();
        if (id && !lecturerIds.includes(id)) lecturerIds.push(id);
      });
    } catch (_) { /* model may not exist */ }

    // Fetch lecturers with their offline hash
    const lecturers = await User.find({
      _id: { $in: lecturerIds },
      company: device.companyId,
      role: 'lecturer',
      isActive: true,
    }).select('+offlinePinHash name email').lean();

    const lecturerMap = {};
    lecturers.forEach(l => { lecturerMap[l._id.toString()] = l; });

    // Build bundle: one entry per course, list of eligible lecturers
    const bundleCourses = courses.map(course => {
      const courseLecturerIds = [course.lecturerId?.toString()].filter(Boolean);
      extraAssignments
        .filter(a => a.course.toString() === course._id.toString())
        .forEach(a => {
          const id = a.lecturer?.toString();
          if (id && !courseLecturerIds.includes(id)) courseLecturerIds.push(id);
        });

      return {
        courseId:   course._id,
        courseCode: course.code,
        courseName: course.title,
        lecturers: courseLecturerIds
          .map(id => lecturerMap[id])
          .filter(Boolean)
          .map(l => ({
            id:             l._id,
            name:           l.name,
            offlinePinHash: l.offlinePinHash || null,
          })),
      };
    }).filter(c => c.lecturers.length > 0);

    res.json({
      bundle:    bundleCourses,
      issuedAt:  Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 48 * 3600, // 48 h validity
    });
  } catch (e) { next(e); }
};

// DELETE /api/class-rep/set-pin — lecturer clears their PIN (allows open connection)
exports.clearLecturerPin = async (req, res, next) => {
  try {
    if (req.user.role !== 'lecturer') return res.status(403).json({ error: 'Only lecturers can clear a PIN' });
    await User.findByIdAndUpdate(req.user._id, { $unset: { classRepPin: 1 } });
    res.json({ ok: true, message: 'PIN cleared. Class reps can now connect without a PIN.' });
  } catch (e) { next(e); }
};

// GET /api/class-rep/scan-wifi — server-side proxy so mixed-content is avoided
exports.scanWifi = async (req, res, next) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const device = await Device.findOne({ classRepId: req.user._id, isActive: true }).select('localIp').lean();
    const ip = (req.query.ip || '').trim() || device?.localIp;
    if (!ip) return res.status(400).json({ message: 'Device IP not available — ensure the device has sent a heartbeat.' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const r = await fetch(`http://${ip}/wifi/scan`, { signal: controller.signal });
      clearTimeout(timer);
      if (!r.ok) throw new Error(`ESP32 returned ${r.status}`);
      const body = await r.json();
      const networks = Array.isArray(body) ? body : (body.networks || []);
      res.json({ success: true, networks, deviceIp: ip });
    } catch (e) {
      clearTimeout(timer);
      res.status(502).json({ message: 'Could not reach the device. Make sure the server and device are on the same network.', error: e.message });
    }
  } catch (e) { next(e); }
};

// POST /api/class-rep/configure-wifi — server-side proxy to reconfigure device WiFi
exports.configureWifi = async (req, res, next) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const { ssid, password } = req.body;
    if (!ssid) return res.status(400).json({ message: 'ssid is required' });
    const device = await Device.findOne({ classRepId: req.user._id, isActive: true }).select('localIp').lean();
    const ip = (req.body.deviceIp || '').trim() || device?.localIp;
    if (!ip) return res.status(400).json({ message: 'Device IP not available.' });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 38000);
    try {
      const r = await fetch(`http://${ip}/wifi/reconfigure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid, password: password || '' }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const json = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(json.error || `ESP32 returned ${r.status}`);
      res.json({ success: true, message: json.message || `Switching to ${ssid}` });
    } catch (e) {
      clearTimeout(timer);
      const timedOut = e.name === 'AbortError' || (e.message || '').includes('aborted');
      res.status(timedOut ? 504 : 502).json({ message: timedOut ? 'Timed out — device may be rebooting on the new network' : e.message });
    }
  } catch (e) { next(e); }
};

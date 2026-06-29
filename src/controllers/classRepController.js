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
      .populate('activeLecturerId', 'name email')
      .populate('pendingAssignment.lecturerId', 'name')
      .populate('pendingAssignment.requestedBy', 'name');
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

    // Only return lecturers explicitly assigned to this class rep's device by admin.
    // No fallbacks — this prevents courses from other classes leaking into the list.
    const device = await Device.findOne({ classRepId: req.user._id, companyId: req.user.company, isActive: true })
      .populate('assignedLecturers.lecturerId', 'name email')
      .populate('assignedLecturers.courseId', 'title code')
      .lean();

    const lecturers = (device?.assignedLecturers || [])
      .filter(a => a.lecturerId && a.courseId)
      .map(a => ({
        lecturerId:   a.lecturerId._id,
        lecturerName: a.lecturerId.name,
        lecturerEmail: a.lecturerId.email,
        courseId:    a.courseId._id,
        courseTitle: a.courseId.title,
        courseCode:  a.courseId.code,
      }));

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

// POST /api/class-rep/request-session — rep picks lecturer+course; no PIN needed
exports.requestSession = async (req, res, next) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const { lecturerId, courseId } = req.body;
    if (!lecturerId) return res.status(400).json({ error: 'lecturerId required' });

    const device = await Device.findOne({ classRepId: req.user._id, companyId: req.user.company, isActive: true });
    if (!device) return res.status(404).json({ error: 'No device is assigned to your class. Contact your admin.' });

    const ms = Date.now() - new Date(device.lastHeartbeat || 0).getTime();
    if (ms > 20000) return res.status(503).json({ error: 'Device is offline. Power it on first.' });

    if (device.activeLecturerId) return res.status(409).json({ error: 'Device is already in an active session. End it first.' });

    const lecturer = await User.findOne({ _id: lecturerId, company: req.user.company, role: 'lecturer', isActive: true }).select('name');
    if (!lecturer) return res.status(404).json({ error: 'Lecturer not found' });

    const resolvedCourseId = courseId && courseId !== 'null' ? courseId : null;
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    device.pendingAssignment = {
      lecturerId,
      courseId: resolvedCourseId,
      requestedBy: req.user._id,
      requestedAt: new Date(),
      expiresAt,
    };
    await device.save({ validateModifiedOnly: true });

    res.json({ ok: true, lecturerName: lecturer.name, expiresAt });
  } catch (e) { next(e); }
};

// DELETE /api/class-rep/request-session — rep cancels a pending request
exports.cancelRequest = async (req, res, next) => {
  try {
    if (!req.user.isClassRep) return res.status(403).json({ error: 'Not a class rep' });
    const device = await Device.findOne({ classRepId: req.user._id, companyId: req.user.company, isActive: true });
    if (!device) return res.status(404).json({ error: 'No device assigned' });

    device.pendingAssignment = { lecturerId: null, courseId: null, requestedBy: null, requestedAt: null, expiresAt: null };
    await device.save({ validateModifiedOnly: true });
    res.json({ ok: true });
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

    // Fetch all active lecturers for this institution
    const lecturers = await User.find({
      company: device.companyId,
      role: 'lecturer',
      isActive: true,
    }).select('+offlinePinHash name employeeId').lean();

    if (!lecturers.length) return res.json({ bundle: [], issuedAt: Math.floor(Date.now() / 1000) });

    const lecturerIds = lecturers.map(l => l._id);

    // Find all active courses assigned to these lecturers
    const courses = await Course.find({
      companyId: device.companyId,
      isActive: true,
      lecturerId: { $in: lecturerIds },
    }).select('_id title code lecturerId level group').lean();

    // Extra assignments from CourseLecturerAssignment if the model exists
    let extraAssignments = [];
    try {
      const CLA = require('../models/CourseLecturerAssignment');
      extraAssignments = await CLA.find({
        course: { $in: courses.map(c => c._id) },
        isActive: { $ne: false },
      }).select('course lecturer').lean();
    } catch (_) {}

    // Build lecturer → courses map
    const lectCoursesMap = {};
    courses.forEach(c => {
      const lid = c.lecturerId?.toString();
      if (!lid) return;
      if (!lectCoursesMap[lid]) lectCoursesMap[lid] = [];
      lectCoursesMap[lid].push(c);
    });
    extraAssignments.forEach(a => {
      const lid = a.lecturer?.toString();
      const c   = courses.find(x => x._id.toString() === a.course.toString());
      if (!lid || !c) return;
      if (!lectCoursesMap[lid]) lectCoursesMap[lid] = [];
      if (!lectCoursesMap[lid].find(x => x._id.toString() === c._id.toString()))
        lectCoursesMap[lid].push(c);
    });

    // Build lecturer-centric bundle — one entry per lecturer with their courses
    const bundle = lecturers
      .filter(l => lectCoursesMap[l._id.toString()]?.length)
      .map(l => ({
        id:             l._id,
        employeeId:     l.employeeId || '',
        name:           l.name,
        offlinePinHash: l.offlinePinHash || null,
        courses: (lectCoursesMap[l._id.toString()] || []).map(c => ({
          courseId:   c._id,
          courseCode: c.code,
          courseName: c.title,
          level:      c.level  || '',
          group:      c.group  || '',
        })),
      }));

    res.json({
      bundle,
      issuedAt:  Math.floor(Date.now() / 1000),
      expiresAt: Math.floor(Date.now() / 1000) + 48 * 3600,
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

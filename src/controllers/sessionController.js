const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord  = require('../models/AttendanceRecord');
const Device            = require('../models/Device');
const crypto            = require('crypto');

// Generate rotating HMAC code — 4 minute slots
function generateCode(seed, sessionId) {
  const slot = Math.floor(Date.now() / (240 * 1000));
  const data = `${seed}:${sessionId}:${slot}`;
  return crypto.createHmac('sha256', seed).update(data).digest('hex').slice(0, 6).toUpperCase();
}

// ─── START SESSION ────────────────────────────────────────────────────────────
exports.startSession = async (req, res) => {
  try {
    const { courseId, departmentId, classLevel, room, deviceId, title } = req.body;
    const createdBy = req.user._id;
    const company   = req.user.companyId;

    const device = await Device.findOne({ deviceId, companyId: company });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    if (device.lecturerId.toString() !== createdBy.toString()) {
      return res.status(403).json({
        message: 'This ESP32 device is assigned to another lecturer and cannot be used for this session.'
      });
    }

    const isOnline = device.lastHeartbeat &&
      (Date.now() - device.lastHeartbeat.getTime()) < 10000;
    if (!isOnline) {
      return res.status(400).json({
        message: 'Device is offline. Power on the ESP32 and wait for it to connect before starting a session.'
      });
    }

    const existingSession = await AttendanceSession.findOne({ createdBy, status: 'active' });
    if (existingSession) {
      return res.status(400).json({
        message: 'You already have an active session. Stop it before starting a new one.',
        sessionId: existingSession._id
      });
    }

    const seed = crypto.randomBytes(16).toString('hex');
    const session = await AttendanceSession.create({
      company,
      createdBy,
      title:       title || '',
      course:      courseId || null,
      deviceId,
      department:  departmentId || null,
      classLevel,
      room,
      esp32Seed:   seed,
      currentCode: null,
      lastCodeRotation: new Date(),
      requiresDeviceOnline: true,
      status: 'active'
    });

    session.currentCode = generateCode(seed, session._id.toString());
    await session.save();

    res.status(201).json({
      success: true,
      message: 'Session started',
      data: {
        sessionId:   session._id,
        deviceId,
        currentCode: session.currentCode,
        esp32Seed:   seed,
        startTime:   session.startedAt
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── END SESSION ──────────────────────────────────────────────────────────────
exports.endSession = async (req, res) => {
  try {
    const { sessionId, reason } = req.body;
    const createdBy = req.user._id;

    const session = await AttendanceSession.findOne({
      _id: sessionId,
      createdBy,
      status: 'active'
    });
    if (!session) return res.status(404).json({ message: 'Active session not found' });

    const endTime = new Date();
    session.status        = 'stopped';
    session.stoppedAt     = endTime;
    session.stoppedBy     = createdBy;
    session.stoppedReason = reason || 'manual';
    session.totalMarked   = await AttendanceRecord.countDocuments({ session: session._id });
    await session.save();

    res.json({ success: true, message: 'Session ended', data: session });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET ACTIVE SESSION FOR DEVICE ───────────────────────────────────────────
exports.getActiveSession = async (req, res) => {
  try {
    const { deviceId } = req.params;

    const device = await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    const session = await AttendanceSession.findOne({ deviceId, status: 'active' })
      .populate('course', 'name code')
      .populate('department', 'name')
      .populate('createdBy', 'name');

    if (!session) return res.json({ success: true, active: false, data: null });

    const secsSinceRotation = (Date.now() - new Date(session.lastCodeRotation).getTime()) / 1000;
    if (secsSinceRotation >= 240) {
      session.currentCode      = generateCode(session.esp32Seed, session._id.toString());
      session.lastCodeRotation = new Date();
      await session.save();
    }

    const deviceOnline = device.lastHeartbeat &&
      (Date.now() - device.lastHeartbeat.getTime()) < 10000;

    res.json({
      success: true,
      active: true,
      deviceOnline,
      data: {
        sessionId:   session._id,
        currentCode: session.currentCode,
        esp32Seed:   session.esp32Seed,
        course:      session.course,
        department:  session.department,
        lecturer:    session.createdBy,
        startTime:   session.startedAt
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── VALIDATE ATTENDANCE ──────────────────────────────────────────────────────
exports.validateAttendance = async (req, res) => {
  try {
    const { sessionId, deviceId, codeUsed, userId, markedVia } = req.body;

    // 1. IP SUBNET CHECK — block mobile data cheating
    const studentIP = req.ip || req.headers['x-forwarded-for']?.split(',')[0].trim();
    const deviceForIP = await Device.findOne({ deviceId });
    if (deviceForIP) {
      const onESP32AP    = studentIP.startsWith('192.168.4.');
      const onSchoolWifi = deviceForIP.allowedSubnets?.some(sub => studentIP.startsWith(sub));
      if (!onESP32AP && !onSchoolWifi) {
        return res.status(403).json({
          message: 'You must be connected to the classroom WiFi or KODEX hotspot to mark attendance.'
        });
      }
    }

    // 2. Find session
    const session = await AttendanceSession.findById(sessionId);
    if (!session || session.status !== 'active') {
      return res.status(400).json({ message: 'Session is not active' });
    }

    // 3. Device must match session
    if (session.deviceId !== deviceId) {
      return res.status(403).json({ message: 'Wrong device for this session' });
    }

    // 4. Ownership check
    const device = deviceForIP || await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ message: 'Device not found' });
    if (device.lecturerId.toString() !== session.createdBy.toString()) {
      return res.status(403).json({
        message: 'This ESP32 device is assigned to another lecturer and cannot be used for this session.'
      });
    }

    // 5. Device must be online
    const deviceOnline = device.lastHeartbeat &&
      (Date.now() - device.lastHeartbeat.getTime()) < 10000;
    if (session.requiresDeviceOnline && !deviceOnline) {
      return res.status(400).json({ message: 'Device is offline. Attendance cannot be marked.' });
    }

    // 6. Validate rotating code (±1 slot grace)
    const seed = session.esp32Seed;
    const slot = Math.floor(Date.now() / (240 * 1000));
    const validCodes = [-1, 0, 1].map(offset => {
      const data = `${seed}:${session._id}:${slot + offset}`;
      return crypto.createHmac('sha256', seed).update(data).digest('hex').slice(0, 6).toUpperCase();
    });
    if (!validCodes.includes(codeUsed.toUpperCase())) {
      return res.status(400).json({ message: 'Invalid or expired attendance code' });
    }

    // 7. Save record
    try {
      const record = await AttendanceRecord.create({
        session:     sessionId,
        user:        userId,
        company:     session.company,
        deviceId,
        codeUsed,
        method:      markedVia === 'esp32_ap' ? 'esp32_ap' : 'code_mark',
        checkInTime: new Date(),
        syncStatus:  'synced'
      });

      res.json({ success: true, message: 'Attendance marked', data: record });
    } catch (e) {
      if (e.code === 11000) {
        return res.status(400).json({ message: 'Attendance already marked for this session' });
      }
      throw e;
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── HEARTBEAT WATCHDOG ───────────────────────────────────────────────────────
exports.runWatchdog = async () => {
  try {
    const threshold = new Date(Date.now() - 10000);
    const staleSessions = await AttendanceSession.find({ status: 'active' });

    for (const session of staleSessions) {
      const device = await Device.findOne({ deviceId: session.deviceId });
      if (!device) continue;

      const isOnline = device.lastHeartbeat && device.lastHeartbeat > threshold;
      if (!isOnline) {
        await Device.updateOne({ deviceId: session.deviceId }, { status: 'offline' });
        await AttendanceSession.updateOne(
          { _id: session._id },
          { status: 'device_disconnected', stoppedReason: 'heartbeat_timeout', stoppedAt: new Date() }
        );
        console.log(`[Watchdog] Session ${session._id} stopped — device ${session.deviceId} offline`);
      }
    }
  } catch (err) {
    console.error('[Watchdog] Error:', err.message);
  }
};

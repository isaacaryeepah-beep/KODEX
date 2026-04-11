const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord  = require('../models/AttendanceRecord');
const Device            = require('../models/Device');
const crypto            = require('crypto');

// Generate rotating HMAC code
function generateCode(seed, sessionId) {
  const slot = Math.floor(Date.now() / (240 * 1000)); // rotates every 30s
  const data = `${seed}:${sessionId}:${slot}`;
  return crypto.createHmac('sha256', seed).update(data).digest('hex').slice(0, 6).toUpperCase();
}

// ─── START SESSION ────────────────────────────────────────────────────────────
exports.startSession = async (req, res) => {
  try {
    const { courseId, departmentId, classLevel, room, deviceId } = req.body;
    const lecturerId = req.user._id;
    const companyId  = req.user.companyId;

    // 1. Find the device
    const device = await Device.findOne({ deviceId, companyId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    // 2. STRICT OWNERSHIP CHECK
    if (device.lecturerId.toString() !== lecturerId.toString()) {
      return res.status(403).json({
        message: 'This ESP32 device is assigned to another lecturer and cannot be used for this session.'
      });
    }

    // 3. Check device is online
    const isOnline = device.lastHeartbeat &&
      (Date.now() - device.lastHeartbeat.getTime()) < 10000;
    if (!isOnline) {
      return res.status(400).json({
        message: 'Device is offline. Power on the ESP32 and wait for it to connect before starting a session.'
      });
    }

    // 4. Block if lecturer already has an active session
    const existingSession = await AttendanceSession.findOne({ lecturerId, status: 'active' });
    if (existingSession) {
      return res.status(400).json({
        message: 'You already have an active session. Stop it before starting a new one.',
        sessionId: existingSession._id
      });
    }

    // 5. Generate seed and initial code
    const seed = crypto.randomBytes(16).toString('hex');
    const session = await AttendanceSession.create({
      companyId, lecturerId, courseId, departmentId,
      classLevel, room, deviceId,
      esp32Seed: seed,
      currentCode: null, // will be set after we have the _id
      lastCodeRotation: new Date(),
      requiresDeviceOnline: true,
      status: 'active'
    });

    // Set initial code now that we have sessionId
    session.currentCode = generateCode(seed, session._id.toString());
    await session.save();

    res.status(201).json({
      success: true,
      message: 'Session started',
      data: {
        sessionId:    session._id,
        deviceId,
        currentCode:  session.currentCode,
        esp32Seed:    seed,
        startTime:    session.startTime
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
    const lecturerId = req.user._id;

    const session = await AttendanceSession.findOne({
      _id: sessionId,
      lecturerId,
      status: 'active'
    });
    if (!session) return res.status(404).json({ message: 'Active session not found' });

    const endTime = new Date();
    session.status          = 'stopped';
    session.endTime         = endTime;
    session.stoppedReason   = reason || 'manual';
    session.durationSeconds = Math.floor((endTime - session.startTime) / 1000);
    session.totalMarked     = await AttendanceRecord.countDocuments({ sessionId });
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
      .populate('courseId', 'name code')
      .populate('departmentId', 'name')
      .populate('lecturerId', 'name');

    if (!session) return res.json({ success: true, active: false, data: null });

    // Rotate code if needed (30s window)
    const secsSinceRotation = (Date.now() - session.lastCodeRotation.getTime()) / 1000;
    if (secsSinceRotation >= 30) {
      session.currentCode      = generateCode(session.esp32Seed, session._id.toString());
      session.lastCodeRotation = new Date();
      await session.save();
    }

    // Check device heartbeat
    const deviceOnline = device.lastHeartbeat &&
      (Date.now() - device.lastHeartbeat.getTime()) < 10000;

    res.json({
      success: true,
      active: true,
      deviceOnline,
      data: {
        sessionId:    session._id,
        currentCode:  session.currentCode,
        course:       session.courseId,
        department:   session.departmentId,
        lecturer:     session.lecturerId,
        startTime:    session.startTime,
        esp32Seed:    session.esp32Seed
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
    // Student must be on KODEX-CLASSROOM (192.168.4.x) or school WiFi
    // app.set("trust proxy", true) must be set in server.js for this to work on Render
    const studentIP = req.ip || req.headers['x-forwarded-for']?.split(',')[0].trim();

    // Get device to find allowed subnets
    const deviceForIP = await Device.findOne({ deviceId });
    if (deviceForIP) {
      const onESP32AP     = studentIP.startsWith('192.168.4.');
      const onSchoolWifi  = deviceForIP.allowedSubnets?.some(sub => studentIP.startsWith(sub));

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

    // 2. Device must match session
    if (session.deviceId !== deviceId) {
      return res.status(403).json({ message: 'Wrong device for this session' });
    }

    // 3. Ownership: session device must belong to session lecturer
    const device = await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ message: 'Device not found' });
    if (device.lecturerId.toString() !== session.lecturerId.toString()) {
      return res.status(403).json({
        message: 'This ESP32 device is assigned to another lecturer and cannot be used for this session.'
      });
    }

    // 4. Device must be online
    const deviceOnline = device.lastHeartbeat &&
      (Date.now() - device.lastHeartbeat.getTime()) < 10000;
    if (session.requiresDeviceOnline && !deviceOnline) {
      return res.status(400).json({ message: 'Device is offline. Attendance cannot be marked.' });
    }

    // 5. Validate rotating code (allow ±1 slot grace)
    const seed = session.esp32Seed;
    const slot = Math.floor(Date.now() / (240 * 1000));
    const validCodes = [-1, 0, 1].map(offset => {
      const data = `${seed}:${session._id}:${slot + offset}`;
      return crypto.createHmac('sha256', seed).update(data).digest('hex').slice(0, 6).toUpperCase();
    });

    if (!validCodes.includes(codeUsed.toUpperCase())) {
      return res.status(400).json({ message: 'Invalid or expired attendance code' });
    }

    // 6. Save record — unique index prevents duplicates
    try {
      const record = await AttendanceRecord.create({
        companyId:    session.companyId,
        userId,
        lecturerId:   session.lecturerId,
        courseId:     session.courseId,
        departmentId: session.departmentId,
        sessionId,
        deviceId,
        codeUsed,
        markedVia:    markedVia || 'mobile',
        timestamp:    new Date(),
        syncStatus:   'synced'
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

// ─── HEARTBEAT WATCHDOG (call on cron every 5s or on-demand) ─────────────────
exports.runWatchdog = async () => {
  try {
    const threshold = new Date(Date.now() - 10000); // 10s

    // Find active sessions where device has gone offline
    const staleSessions = await AttendanceSession.find({ status: 'active' });

    for (const session of staleSessions) {
      const device = await Device.findOne({ deviceId: session.deviceId });
      if (!device) continue;

      const isOnline = device.lastHeartbeat && device.lastHeartbeat > threshold;
      if (!isOnline) {
        // Mark device offline
        await Device.updateOne({ deviceId: session.deviceId }, { status: 'offline' });
        // Mark session as device disconnected
        await AttendanceSession.updateOne(
          { _id: session._id },
          { status: 'device_disconnected', stoppedReason: 'heartbeat_timeout' }
        );
        console.log(`[Watchdog] Session ${session._id} stopped — device ${session.deviceId} offline`);
      }
    }
  } catch (err) {
    console.error('[Watchdog] Error:', err.message);
  }
};

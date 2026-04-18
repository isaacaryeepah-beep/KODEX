const Device          = require('../models/Device');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord  = require('../models/AttendanceRecord');
const jwt = require('jsonwebtoken');

// ─── REGISTER DEVICE ─────────────────────────────────────────────────────────
// Binds device permanently to one lecturer. One device = one lecturer.
exports.registerDevice = async (req, res) => {
  try {
    const { deviceId, deviceName, allowedNetworks, apSSID, assignedRoom, assignedDepartment } = req.body;
    const lecturerId = req.user._id;
    const companyId = req.user.company;

    // Block if device already registered to another lecturer
    const existing = await Device.findOne({ deviceId });
    if (existing) {
      if (existing.lecturerId.toString() !== lecturerId.toString()) {
        return res.status(403).json({
          message: 'This ESP32 device is assigned to another lecturer and cannot be used for this session.'
        });
      }
      // Same lecturer — update allowed networks only
      existing.allowedNetworks = allowedNetworks || existing.allowedNetworks;
      existing.apSSID = apSSID || existing.apSSID;
      existing.assignedRoom = assignedRoom || existing.assignedRoom;
      existing.assignedDepartment = assignedDepartment || existing.assignedDepartment;
      await existing.save();
      return res.json({ success: true, message: 'Device updated', data: existing });
    }

    // Block if lecturer already owns a different device
    const lecturerDevice = await Device.findOne({ lecturerId });
    if (lecturerDevice) {
      return res.status(400).json({
        message: `You already own device ${lecturerDevice.deviceId}. Each lecturer can only have one dedicated device.`
      });
    }

    // Generate device token
    const token = jwt.sign({ deviceId, lecturerId, companyId }, process.env.JWT_SECRET, { expiresIn: '10y' });

    const device = await Device.create({
      deviceId,
      deviceName,
      companyId,
      lecturerId,
      allowedNetworks: allowedNetworks || [],
      apSSID: apSSID || `KODEX-${deviceId.slice(-6).toUpperCase()}`,
      assignedRoom,
      assignedDepartment,
      token,
      ownershipType: 'dedicated',
      isTransferable: false
    });

    res.status(201).json({ success: true, message: 'Device registered', data: device, token });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Device ID or lecturer already has a device registered.' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── HEARTBEAT ───────────────────────────────────────────────────────────────
exports.heartbeat = async (req, res) => {
  try {
    const { deviceId, currentNetwork, mode } = req.body;

    const device = await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    // Enforce ownership — heartbeat only accepted from device's assigned lecturer context
    if (device.companyId.toString() !== req.user?.company?.toString()) {
      return res.status(403).json({ message: 'Device does not belong to your institution' });
    }

    device.lastHeartbeat = new Date();
    device.status        = 'online';
    device.currentNetwork = currentNetwork || device.currentNetwork;
    device.mode          = mode || device.mode;
    await device.save();

    // Check for active session
    const session = await AttendanceSession.findOne({ deviceId, status: 'active' });

    res.json({
      success: true,
      lastSeenAt: device.lastHeartbeat,
      activeSession: session ? {
        sessionId:   session._id,
        currentCode: session.currentCode,
        courseId:    session.courseId,
        departmentId: session.departmentId
      } : null
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── OFFLINE SYNC ────────────────────────────────────────────────────────────
// ESP32 sends batch of attendance records collected while offline
exports.syncOfflineRecords = async (req, res) => {
  try {
    const { deviceId, records } = req.body;

    if (!records?.length) return res.json({ success: true, synced: 0, skipped: 0 });

    const device = await Device.findOne({ deviceId });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    // Ownership check
    if (device.lecturerId.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        message: 'This ESP32 device is assigned to another lecturer and cannot be used for this session.'
      });
    }

    let synced = 0, skipped = 0, errors = [];

    for (const rec of records) {
      try {
        // Validate session exists and belongs to this device
        const session = await AttendanceSession.findById(rec.sessionId);
        if (!session || session.deviceId !== deviceId) { skipped++; continue; }

        await AttendanceRecord.create({
          companyId:    device.companyId,
          userId:       rec.userId,
          lecturerId:   session.lecturerId,
          courseId:     session.courseId,
          departmentId: session.departmentId,
          sessionId:    rec.sessionId,
          deviceId,
          codeUsed:     rec.codeUsed,
          markedVia:    'esp32_ap',
          timestamp:    new Date(rec.timestamp),
          syncStatus:   'synced',
          syncedAt:     new Date()
        });
        synced++;
      } catch (e) {
        if (e.code === 11000) skipped++; // duplicate
        else errors.push({ rec, error: e.message });
      }
    }

    res.json({ success: true, synced, skipped, errors });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── UPDATE NETWORKS ─────────────────────────────────────────────────────────
exports.updateNetworks = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { allowedNetworks } = req.body;

    const device = await Device.findOne({ deviceId, companyId: req.user.company });
    if (!device) return res.status(404).json({ message: 'Device not found' });

    // Only owner or admin can update networks
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    if (!isAdmin && device.lecturerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        message: 'This ESP32 device is assigned to another lecturer and cannot be used for this session.'
      });
    }

    device.allowedNetworks = allowedNetworks;
    await device.save();

    // Return without passwords in response
    const safe = device.toObject();
    safe.allowedNetworks = safe.allowedNetworks.map(n => ({ ssid: n.ssid, priority: n.priority }));

    res.json({ success: true, message: 'Networks updated', data: safe });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET MY DEVICE ────────────────────────────────────────────────────────────
// Returns the device owned by the authenticated lecturer (lecturer-only).
exports.getMyDevice = async (req, res) => {
  try {
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const query = isAdmin
      ? { companyId: req.user.company }
      : { lecturerId: req.user._id, companyId: req.user.company };

    const device = await Device.findOne(query).populate('lecturerId', 'name email');
    if (!device) return res.json({ success: true, data: null });

    const activeSession = await AttendanceSession.findOne({ deviceId: device.deviceId, status: 'active' });
    const secsSince = device.lastHeartbeat
      ? Math.floor((Date.now() - device.lastHeartbeat.getTime()) / 1000)
      : null;

    res.json({
      success: true,
      data: {
        deviceId:           device.deviceId,
        deviceName:         device.deviceName,
        owner:              device.lecturerId,
        status:             device.isOnline ? 'online' : 'offline',
        mode:               device.mode,
        currentNetwork:     device.currentNetwork,
        apSSID:             device.apSSID,
        assignedRoom:       device.assignedRoom,
        assignedDepartment: device.assignedDepartment,
        lastHeartbeat:      device.lastHeartbeat,
        secsSinceHeartbeat: secsSince,
        registeredAt:       device.registeredAt,
        activeSession:      activeSession ? { sessionId: activeSession._id, status: activeSession.status } : null,
        allowedNetworks:    device.allowedNetworks.map(n => ({ ssid: n.ssid, priority: n.priority })), // no passwords
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── DEVICE STATUS ────────────────────────────────────────────────────────────
exports.getDeviceStatus = async (req, res) => {
  try {
    const { deviceId } = req.params;
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);

    const device = await Device.findOne({ deviceId, companyId: req.user.company })
      .populate('lecturerId', 'name email');
    if (!device) return res.status(404).json({ message: 'Device not found' });

    // Ownership: only the owning lecturer (or admin) may view device details
    if (!isAdmin && device.lecturerId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You do not own this device.' });
    }

    const activeSession = await AttendanceSession.findOne({ deviceId, status: 'active' })
      .populate('courseId', 'name')
      .populate('departmentId', 'name');

    const secsSince = device.lastHeartbeat
      ? Math.floor((Date.now() - device.lastHeartbeat.getTime()) / 1000)
      : null;

    res.json({
      success: true,
      data: {
        deviceId:      device.deviceId,
        deviceName:    device.deviceName,
        owner:         device.lecturerId,
        ownershipType: device.ownershipType,
        isTransferable: device.isTransferable,
        status:        device.isOnline ? 'online' : 'offline',
        mode:          device.mode,
        currentNetwork: device.currentNetwork,
        lastHeartbeat: device.lastHeartbeat,
        secsSinceHeartbeat: secsSince,
        activeSession: activeSession || null
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── UNLINK DEVICE ───────────────────────────────────────────────────────────
// Only the owning lecturer (or admin) may unlink their device.
// Blocked if an active attendance session is running.
exports.unlinkDevice = async (req, res) => {
  try {
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const query = isAdmin
      ? { companyId: req.user.company, ...(req.body.deviceId ? { deviceId: req.body.deviceId } : {}) }
      : { lecturerId: req.user._id, companyId: req.user.company };

    const device = await Device.findOne(query);
    if (!device) return res.status(404).json({ message: 'No device found to unlink.' });

    // Block unlink if active session running on this device
    const active = await AttendanceSession.findOne({ deviceId: device.deviceId, status: 'active' });
    if (active) {
      return res.status(409).json({ message: 'Cannot unlink device while an attendance session is active. Stop the session first.' });
    }

    await Device.deleteOne({ _id: device._id });
    res.json({ success: true, message: 'Device unlinked successfully.' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── RENAME DEVICE ───────────────────────────────────────────────────────────
exports.renameDevice = async (req, res) => {
  try {
    const { deviceName } = req.body;
    if (!deviceName?.trim()) return res.status(400).json({ message: 'Device name is required.' });

    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const query = isAdmin
      ? { companyId: req.user.company, ...(req.body.deviceId ? { deviceId: req.body.deviceId } : {}) }
      : { lecturerId: req.user._id, companyId: req.user.company };

    const device = await Device.findOneAndUpdate(query, { deviceName: deviceName.trim() }, { new: true });
    if (!device) return res.status(404).json({ message: 'Device not found or not yours.' });

    res.json({ success: true, deviceName: device.deviceName });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── SUPERADMIN TRANSFER (only way to reassign a device) ─────────────────────
exports.transferDevice = async (req, res) => {
  try {
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({ message: 'Only superadmin can transfer device ownership.' });
    }

    const { deviceId, newLecturerId } = req.body;

    // Check new lecturer doesn't already own a device
    const existingOwnership = await Device.findOne({ lecturerId: newLecturerId });
    if (existingOwnership) {
      return res.status(400).json({
        message: `The target lecturer already owns device ${existingOwnership.deviceId}.`
      });
    }

    const device = await Device.findOneAndUpdate(
      { deviceId },
      { lecturerId: newLecturerId },
      { new: true }
    );
    if (!device) return res.status(404).json({ message: 'Device not found' });

    res.json({ success: true, message: 'Device ownership transferred', data: device });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

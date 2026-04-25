const Device            = require('../models/Device');
const AttendanceSession = require('../models/AttendanceSession');
const AttendanceRecord  = require('../models/AttendanceRecord');
const User              = require('../models/User');
const AuditLog          = require('../models/AuditLog');
const { AUDIT_ACTIONS } = require('../models/AuditLog');
const crypto            = require('crypto');
const jwt               = require('jsonwebtoken');

// Device is considered offline if no heartbeat within this window.
const HEARTBEAT_OFFLINE_MS = 20_000;

// Fire-and-forget device audit helper (never throws).
function _auditDevice(actor, action, device, meta = {}, req = null) {
  AuditLog.record({
    company:       actor?.company || device?.companyId,
    actor,
    action,
    resource:      'Device',
    resourceId:    device?._id,
    resourceLabel: device?.deviceId,
    metadata:      { deviceName: device?.deviceName, ...meta },
    mode:          'academic',
    req,
  }).catch(() => {});
}

// ─── GENERATE PAIRING CODE ───────────────────────────────────────────────────
// Lecturer calls this to get a one-time 6-char code the ESP32 uses to claim
// ownership. Code is hashed server-side; expires after 5 minutes.
exports.generatePairingCode = async (req, res) => {
  try {
    if (req.user.role !== 'lecturer' && !['admin','superadmin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only lecturers can generate pairing codes.' });
    }

    // Block if they already own a device
    const existing = await Device.findOne({ lecturerId: req.user._id });
    if (existing) {
      return res.status(400).json({ message: 'You already have a linked device. Unlink it before pairing a new one.' });
    }

    // Generate readable 6-char code (uppercase A-Z + 0-9, avoid ambiguous chars)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join('');
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await User.findByIdAndUpdate(req.user._id, {
      devicePairingCode:   hash,
      devicePairingExpiry: expiresAt,
    });

    res.json({ success: true, code, expiresAt });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── PAIR DEVICE (ESP32-initiated) ───────────────────────────────────────────
// ESP32 calls this (no JWT — authenticated via pairing code + institutionCode).
// Body: { pairingCode, deviceId, deviceName, institutionCode }
exports.pairDevice = async (req, res) => {
  try {
    const { pairingCode, deviceId, deviceName, institutionCode } = req.body;
    if (!pairingCode || !deviceId || !institutionCode) {
      return res.status(400).json({ message: 'pairingCode, deviceId, and institutionCode are required.' });
    }

    // Find company by institution code
    const Company = require('../models/Company');
    const company = await Company.findOne({ institutionCode: institutionCode.trim().toUpperCase() });
    if (!company) return res.status(404).json({ message: 'Institution not found.' });

    // Find lecturer with matching pairing code hash, within same company, not expired
    const hash = crypto.createHash('sha256').update(pairingCode.trim().toUpperCase()).digest('hex');
    const now = new Date();
    const lecturer = await User.findOne({
      company: company._id,
      role: { $in: ['lecturer'] },
      devicePairingCode: hash,
      devicePairingExpiry: { $gt: now },
    }).select('+devicePairingCode');

    if (!lecturer) {
      // Log failed attempt (no actor — device not yet authenticated)
      AuditLog.record({
        company: company._id,
        actor: null,
        action: AUDIT_ACTIONS.ACCESS_DENIED,
        resource: 'Device',
        resourceLabel: deviceId,
        metadata: { action: 'pairing_failed', reason: 'invalid_or_expired_code', deviceId },
        severity: 'medium',
        mode: 'academic',
      }).catch(() => {});
      return res.status(403).json({ message: 'Invalid or expired pairing code.' });
    }

    // Block if device already claimed by another lecturer
    const devExists = await Device.findOne({ deviceId });
    if (devExists) {
      if (devExists.lecturerId.toString() !== lecturer._id.toString()) {
        return res.status(409).json({ message: 'This device is already linked to another lecturer.' });
      }
      // Same lecturer re-pairing — update token and clear code
      await User.findByIdAndUpdate(lecturer._id, { devicePairingCode: null, devicePairingExpiry: null });
      return res.json({ success: true, message: 'Device already linked to you.', token: devExists.token });
    }

    // Block if lecturer already owns a different device
    const lecturerDev = await Device.findOne({ lecturerId: lecturer._id });
    if (lecturerDev) {
      return res.status(400).json({ message: 'Lecturer already owns a device. Unlink it first.' });
    }

    // Create device and clear pairing code (one-time use)
    const token = jwt.sign({ deviceId, lecturerId: lecturer._id, companyId: company._id }, process.env.JWT_SECRET, { expiresIn: '10y' });
    const device = await Device.create({
      deviceId,
      deviceName: deviceName || `Device-${deviceId.slice(-6).toUpperCase()}`,
      companyId: company._id,
      lecturerId: lecturer._id,
      apSSID: `KODEX-${deviceId.slice(-6).toUpperCase()}`,
      token,
      ownershipType: 'dedicated',
      isTransferable: false,
    });

    await User.findByIdAndUpdate(lecturer._id, { devicePairingCode: null, devicePairingExpiry: null });

    _auditDevice(lecturer, AUDIT_ACTIONS.CREATE, device, { action: 'device_paired_via_code', deviceId });
    res.status(201).json({ success: true, message: 'Device paired successfully.', token, deviceId: device.deviceId });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Device or lecturer already has a device registered.' });
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

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

    _auditDevice(req.user, AUDIT_ACTIONS.CREATE, device, { action: 'device_linked' }, req);
    res.status(201).json({ success: true, message: 'Device registered', data: device, token });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: 'Device ID or lecturer already has a device registered.' });
    }
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── HEARTBEAT ───────────────────────────────────────────────────────────────
// Authenticated by middleware/deviceAuth (req.device is set).
// Body: { currentNetwork, mode, localIp, rtcValid, sdOK, firmwareVersion }
// Response includes activeSession with esp32Seed + duration so the device can
// derive the rotating 6-digit code locally without polling.
exports.heartbeat = async (req, res) => {
  try {
    const device = req.device;
    if (!device) return res.status(401).json({ message: 'Device authentication missing' });

    const { currentNetwork, mode, localIp, rtcValid, sdOK, firmwareVersion } = req.body || {};

    const wasOffline = device.status === 'offline';
    device.lastHeartbeat  = new Date();
    device.status         = 'online';
    if (currentNetwork)            device.currentNetwork = currentNetwork;
    if (mode)                      device.mode           = mode;
    if (localIp)                   device.localIp        = localIp;
    if (rtcValid !== undefined)    device.rtcValid       = !!rtcValid;
    if (sdOK     !== undefined)    device.sdOK           = !!sdOK;
    if (firmwareVersion)           device.firmwareVersion = String(firmwareVersion).slice(0, 32);

    // Track the public IP this device is reaching the server from.
    // This is the same NAT IP the school router will hand to students on the
    // same WiFi — used by markAttendance to block off-network requests.
    const clientIp = (
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.headers['x-real-ip'] ||
      (req.socket && req.socket.remoteAddress) ||
      ''
    ).replace(/^::ffff:/, '');

    if (clientIp) {
      const TEN_MIN_MS = 10 * 60 * 1000;
      const cutoff = Date.now() - TEN_MIN_MS;
      const kept = (device.recentPublicIps || [])
        .filter(e => e.seenAt && new Date(e.seenAt).getTime() > cutoff && e.ip !== clientIp);
      kept.push({ ip: clientIp, seenAt: new Date() });
      // Cap to 8 most recent entries to keep doc size bounded.
      device.recentPublicIps = kept.slice(-8);
    }

    await device.save();

    if (wasOffline) {
      _auditDevice(null, AUDIT_ACTIONS.UPDATE, device, { action: 'heartbeat_restored', network: device.currentNetwork });
    }

    // Active session lookup — if the lecturer has started a session, deliver
    // the seed and duration so the firmware can display the rotating code.
    const session = await AttendanceSession.findOne({
      deviceId: device.deviceId,
      status:   'active',
    }).select('_id title esp32Seed durationSeconds startedAt').lean();

    return res.json({
      ok:         true,
      success:    true,
      serverTime: new Date().toISOString(),
      lastSeenAt: device.lastHeartbeat,
      activeSession: session ? {
        sessionId:       session._id,
        title:           session.title || '',
        esp32Seed:       session.esp32Seed,
        durationSeconds: session.durationSeconds || 300,
        startedAt:       session.startedAt,
      } : null,
    });
  } catch (err) {
    console.error('[device heartbeat]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── OFFLINE SYNC ────────────────────────────────────────────────────────────
// ESP32 sends a batch of attendance records collected while it was offline.
// Authenticated by middleware/deviceAuth (req.device is set).
// Body: { records: [{ sessionId, userId? , indexNumber?, codeUsed, timestamp }] }
//
// For each record, we resolve the user (by _id or institutional indexNumber),
// verify the session belongs to this device, and create an AttendanceRecord
// (skipping duplicates and sessions that don't match this device).
exports.syncOfflineRecords = async (req, res) => {
  try {
    const device = req.device;
    if (!device) return res.status(401).json({ message: 'Device authentication missing' });

    const { records } = req.body || {};
    if (!Array.isArray(records) || records.length === 0) {
      return res.json({ success: true, synced: 0, skipped: 0, errors: [] });
    }

    let synced = 0, skipped = 0, errors = [];

    for (const rec of records) {
      try {
        const session = rec.sessionId ? await AttendanceSession.findById(rec.sessionId) : null;
        if (!session || session.deviceId !== device.deviceId) { skipped++; continue; }

        // Resolve user — prefer _id, fall back to indexNumber for offline-only marks
        let userId = rec.userId || null;
        if (!userId && rec.indexNumber) {
          const idx = String(rec.indexNumber).trim().toUpperCase();
          const user = await User.findOne({
            company: device.companyId,
            role:    'student',
            $or: [{ IndexNumber: idx }, { indexNumber: idx }],
          }).select('_id').lean();
          if (user) userId = user._id;
        }
        if (!userId) { skipped++; continue; }

        const markedAt = rec.timestamp ? new Date(rec.timestamp) : new Date();
        const late = (markedAt - new Date(session.startedAt)) > 15 * 60 * 1000;

        await AttendanceRecord.create({
          session:     session._id,
          user:        userId,
          company:     device.companyId,
          deviceId:    device.deviceId,
          codeUsed:    rec.codeUsed || null,
          method:      'esp32_ap',
          status:      late ? 'late' : 'present',
          checkInTime: markedAt,
          syncStatus:  'synced',
          syncedAt:    new Date(),
        });
        synced++;
      } catch (e) {
        if (e.code === 11000) skipped++;
        else errors.push({ ref: rec.indexNumber || rec.userId || null, error: e.message });
      }
    }

    res.json({ success: true, synced, skipped, errors });
  } catch (err) {
    console.error('[device sync]', err);
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

// ─── MARK STALE DEVICES OFFLINE ──────────────────────────────────────────────
// Called whenever device status is queried; marks device offline if heartbeat
// has not been received within HEARTBEAT_OFFLINE_MS.
async function _markStaleOffline(device) {
  if (device.status !== 'online') return device;
  if (!device.lastHeartbeat) return device;
  const elapsed = Date.now() - device.lastHeartbeat.getTime();
  if (elapsed > HEARTBEAT_OFFLINE_MS) {
    device.status = 'offline';
    await device.save().catch(() => {});
    _auditDevice(null, AUDIT_ACTIONS.UPDATE, device, { action: 'heartbeat_lost', elapsed_ms: elapsed });
  }
  return device;
}

// ─── GET MY DEVICE ────────────────────────────────────────────────────────────
// Returns the device owned by the authenticated lecturer (lecturer-only).
exports.getMyDevice = async (req, res) => {
  try {
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const query = isAdmin
      ? { companyId: req.user.company }
      : { lecturerId: req.user._id, companyId: req.user.company };

    let device = await Device.findOne(query).populate('lecturerId', 'name email');
    if (!device) return res.json({ success: true, data: null });

    device = await _markStaleOffline(device);
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
        localIp:            device.localIp,
        assignedRoom:       device.assignedRoom,
        assignedDepartment: device.assignedDepartment,
        lastHeartbeat:      device.lastHeartbeat,
        secsSinceHeartbeat: secsSince,
        registeredAt:       device.registeredAt,
        activeSession:      activeSession ? { sessionId: activeSession._id, status: activeSession.status } : null,
        allowedNetworks:    device.allowedNetworks.map(n => ({ ssid: n.ssid, priority: n.priority })),
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

    _auditDevice(req.user, AUDIT_ACTIONS.DELETE, device, { action: 'device_unlinked' }, req);
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

// ─── DEVICE ACTIVITY LOG ─────────────────────────────────────────────────────
// Returns recent synthetic activity entries built from device + session data.
exports.getDeviceActivity = async (req, res) => {
  try {
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const query = isAdmin
      ? { companyId: req.user.company }
      : { lecturerId: req.user._id, companyId: req.user.company };

    const device = await Device.findOne(query);
    if (!device) return res.json({ success: true, events: [] });

    // Gather recent sessions for this device
    const sessions = await AttendanceSession.find({ deviceId: device.deviceId })
      .sort({ startedAt: -1 }).limit(10).lean();

    const events = [];

    // Device registered
    events.push({ type: 'linked', label: 'Device registered', at: device.registeredAt, color: 'blue' });

    // Session events
    for (const s of sessions) {
      events.push({ type: 'session_start', label: `Session started${s.title ? `: ${s.title}` : ''}`, at: s.startedAt, color: 'green' });
      if (s.stoppedAt) events.push({ type: 'session_stop', label: `Session ended (${s.stoppedReason || 'manual'})`, at: s.stoppedAt, color: 'gray' });
    }

    // Last heartbeat
    if (device.lastHeartbeat) {
      events.push({ type: 'heartbeat', label: 'Last heartbeat received', at: device.lastHeartbeat, color: 'green' });
    }

    // Status transitions
    if (device.status === 'offline' && device.lastHeartbeat) {
      const secsSince = Math.floor((Date.now() - device.lastHeartbeat.getTime()) / 1000);
      if (secsSince > 30) {
        events.push({ type: 'offline', label: 'Device went offline', at: new Date(device.lastHeartbeat.getTime() + 15000), color: 'red' });
      }
    }

    // Sort newest first
    events.sort((a, b) => new Date(b.at) - new Date(a.at));

    res.json({ success: true, events: events.slice(0, 20) });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── SCAN WIFI (proxy to ESP32) ──────────────────────────────────────────────
// GET /api/devices/my/scan-wifi[?ip=192.168.x.x]
// Optional ?ip= overrides the stored localIp and saves it to the device.
exports.scanWifi = async (req, res) => {
  try {
    // IP can come from: ?ip= query param (explicit) or stored on linked device
    const ipOverride = (req.query.ip || '').trim();
    let ip = ipOverride;

    if (!ip) {
      const device = await Device.findOne({ lecturerId: req.user._id });
      if (device?.localIp) ip = device.localIp;
    }

    if (!ip) {
      return res.status(400).json({
        message: 'Enter the ESP32 IP address (e.g. 192.168.4.1 for AP/hotspot mode) and try again.',
      });
    }

    // If a device is linked and the IP changed, save it
    if (ipOverride) {
      const device = await Device.findOne({ lecturerId: req.user._id });
      if (device && device.localIp !== ip) {
        await Device.findByIdAndUpdate(device._id, { localIp: ip });
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const esp32Res = await fetch(`http://${ip}/wifi/scan`, { signal: controller.signal });
      clearTimeout(timer);
      if (!esp32Res.ok) throw new Error(`ESP32 returned ${esp32Res.status}`);
      const body = await esp32Res.json();
      const networks = Array.isArray(body) ? body : (body.networks || []);
      res.json({ success: true, networks, deviceIp: ip });
    } catch (proxyErr) {
      clearTimeout(timer);
      res.status(502).json({
        message: 'Could not reach the ESP32. Check the IP and ensure the device is powered on and reachable.',
        error: proxyErr.message,
      });
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── CONFIGURE WIFI (proxy to ESP32 + persist credentials) ───────────────────
// Body: { ssid, password, deviceIp? }
// deviceIp overrides the stored localIp and is saved to the device.
exports.configureWifi = async (req, res) => {
  try {
    const { ssid, password, deviceIp } = req.body;
    if (!ssid || !password) {
      return res.status(400).json({ message: 'ssid and password are required.' });
    }

    const device = await Device.findOne({ lecturerId: req.user._id });

    // Resolve IP: body override → stored localIp (device may not exist yet)
    const ip = (deviceIp || '').trim() || (device ? device.localIp : null);

    if (!ip && !device) {
      return res.status(400).json({ message: 'Enter the ESP32 IP address — the device is not linked yet.' });
    }

    // Persist credentials in DB only if device is already linked
    if (device) {
      const idx = device.allowedNetworks.findIndex(n => n.ssid === ssid);
      if (idx >= 0) {
        device.allowedNetworks[idx].password = password;
        device.allowedNetworks[idx].priority = 10;
      } else {
        device.allowedNetworks.push({ ssid, password, priority: 10 });
      }
      if (ip && ip !== device.localIp) device.localIp = ip;
      await device.save();
    }

    if (!ip) {
      return res.json({
        success: true,
        status: 'saved',
        message: 'Credentials saved. Power on the ESP32 — it will connect automatically.',
      });
    }

    // Forward to ESP32
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const esp32Res = await fetch(`http://${ip}/wifi/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid, password }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const body = await esp32Res.json().catch(() => ({}));
      return res.json({
        success: true,
        status: body.status || (esp32Res.ok ? 'connected' : 'failed'),
        message: body.message || (esp32Res.ok ? 'WiFi configured. Device is connecting…' : 'ESP32 reported an error.'),
      });
    } catch (proxyErr) {
      clearTimeout(timer);
      return res.json({
        success: true,
        status: 'saved',
        message: 'Credentials saved. The device may have restarted to connect — wait 15 s then refresh.',
        warning: proxyErr.name === 'AbortError' ? 'Request timed out.' : proxyErr.message,
      });
    }
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

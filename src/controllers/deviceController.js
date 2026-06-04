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
// Any authorized role calls this to get a one-time 6-char code the ESP32 uses
// to pair with the institution. Code is hashed server-side; expires after 7 days.
exports.generatePairingCode = async (req, res) => {
  try {
    const PAIRING_ROLES = ['lecturer', 'class_rep', 'hod', 'admin', 'superadmin'];
    if (!PAIRING_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized to generate pairing codes.' });
    }

    // Generate readable 6-char code (uppercase A-Z + 0-9, avoid ambiguous chars)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const code = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join('');
    const hash = crypto.createHash('sha256').update(code).digest('hex');
    // Code stays valid for 7 days — lecturer generates once, pairs device at leisure.
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

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

    const Company = require('../models/Company');
    const company = await Company.findOne({ institutionCode: institutionCode.trim().toUpperCase() });
    if (!company) return res.status(404).json({ message: 'Institution not found.' });

    const hash = crypto.createHash('sha256').update(pairingCode.trim().toUpperCase()).digest('hex');
    const now = new Date();
    const PAIRING_ROLES = ['lecturer', 'class_rep', 'hod', 'admin', 'superadmin'];
    const pairer = await User.findOne({
      company: company._id,
      role: { $in: PAIRING_ROLES },
      devicePairingCode: hash,
      devicePairingExpiry: { $gt: now },
    }).select('+devicePairingCode');

    if (!pairer) {
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

    // Device already paired — if same deviceId exists, re-issue token
    const devExists = await Device.findOne({ deviceId });
    if (devExists) {
      if (devExists.companyId.toString() !== company._id.toString()) {
        return res.status(409).json({ message: 'This device is registered to a different institution.' });
      }
      // Allow re-pairing (e.g. firmware reflash) — clear code and return existing token
      await User.findByIdAndUpdate(pairer._id, { devicePairingCode: null, devicePairingExpiry: null });
      return res.json({ success: true, message: 'Device already linked to this institution.', token: devExists.token, deviceId: devExists.deviceId });
    }

    // New device — institution-owned, not tied to a specific lecturer
    const token = jwt.sign({ deviceId, companyId: company._id }, process.env.JWT_SECRET, { expiresIn: '10y' });
    const device = await Device.create({
      deviceId,
      deviceName: deviceName || `Device-${deviceId.slice(-6).toUpperCase()}`,
      companyId: company._id,
      lecturerId: pairer._id,   // audit: who did the pairing
      apSSID: `DIKLY-${deviceId.slice(-6).toUpperCase()}`,
      token,
      ownershipType: 'shared',
      isTransferable: true,
    });

    await User.findByIdAndUpdate(pairer._id, { devicePairingCode: null, devicePairingExpiry: null });

    _auditDevice(pairer, AUDIT_ACTIONS.CREATE, device, { action: 'device_paired_via_code', deviceId });
    res.status(201).json({ success: true, message: 'Device paired successfully.', token, deviceId: device.deviceId });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Device already has a device registered.' });
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
      apSSID: apSSID || `DIKLY-${deviceId.slice(-6).toUpperCase()}`,
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

    const { currentNetwork, mode, localIp, rtcValid, sdOK, firmwareVersion, pendingRecords } = req.body || {};

    const wasOffline = device.status === 'offline';
    device.lastHeartbeat  = new Date();
    device.status         = 'online';
    if (currentNetwork)            device.currentNetwork = currentNetwork;
    if (mode)                      device.mode           = mode;
    if (localIp)                   device.localIp        = localIp;
    if (rtcValid !== undefined)    device.rtcValid       = !!rtcValid;
    if (sdOK     !== undefined)    device.sdOK           = !!sdOK;
    if (firmwareVersion)           device.firmwareVersion     = String(firmwareVersion).slice(0, 32);
    if (pendingRecords !== undefined) device.pendingRecordsCount = Math.max(0, Number(pendingRecords) || 0);

    // Track the public IP this device is reaching the server from.
    // This is the same NAT IP the school router will hand to students on the
    // same WiFi — used by markAttendance to block off-network requests.
    const clientIp = (req.ip || '').replace(/^::ffff:/, '');

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
// Body: {
//   sessions?: [{ sessionId, courseCode, title, lecturer, startedAt, duration, seed }],
//   records:   [{ sessionId, userId?, indexNumber?, codeUsed, timestamp }]
// }
//
// Sessions are processed first. Local IDs ("local_*") are mapped to real
// MongoDB session IDs so records can reference either form.
exports.syncOfflineRecords = async (req, res) => {
  try {
    const device = req.device;
    if (!device) return res.status(401).json({ message: 'Device authentication missing' });

    const { records, sessions } = req.body || {};

    // ── Step 1: sync device-initiated sessions ────────────────────────────────
    const sessionIdMap = {}; // localId → serverSessionId string

    // Defensive size caps — a stolen device JWT must not be able to flood the DB
    if (Array.isArray(sessions) && sessions.length > 50) {
      return res.status(400).json({ message: 'Too many sessions in one sync (max 50)' });
    }
    if (Array.isArray(records) && records.length > 500) {
      return res.status(400).json({ message: 'Too many records in one sync (max 500)' });
    }

    if (Array.isArray(sessions) && sessions.length > 0) {
      const Course = require('../models/Course');

      for (const s of sessions) {
        try {
          if (!s.sessionId) continue;

          // Dedup: if we already synced this local session, return the existing ID
          if (s.sessionId.startsWith('local_')) {
            const existing = await AttendanceSession.findOne({
              deviceLocalId: s.sessionId,
              company: device.companyId,
            }).select('_id').lean();
            if (existing) { sessionIdMap[s.sessionId] = existing._id.toString(); continue; }
          }

          // Resolve course by code
          let courseRef = null;
          if (s.courseCode) {
            const course = await Course.findOne({ code: s.courseCode, company: device.companyId }).select('_id').lean();
            if (course) courseRef = course._id;
          }

          // Resolve creator: device's primary lecturer → any admin of the company
          let creatorId = device.lecturerId || null;
          if (!creatorId) {
            const admin = await User.findOne({ company: device.companyId, role: { $in: ['admin', 'superadmin'] } }).select('_id').lean();
            if (admin) creatorId = admin._id;
          }
          if (!creatorId) { console.warn('[sync] no creator found for device session', s.sessionId); continue; }

          const startedAt = s.startedAt ? new Date(Number(s.startedAt) * 1000) : new Date();
          const durationSecs = Number(s.duration) || 300;
          const stoppedAt = new Date(startedAt.getTime() + durationSecs * 1000);

          const newSession = await AttendanceSession.create({
            company:            device.companyId,
            createdBy:          creatorId,
            title:              String(s.title || 'Attendance').slice(0, 120),
            course:             courseRef,
            deviceId:           device.deviceId,
            esp32Seed:          s.seed || '',
            durationSeconds:    durationSecs,
            startedAt,
            stoppedAt,
            status:             'ended',
            mode:               'offline-ready',
            requiresDeviceOnline: false,
            deviceLocalId:      s.sessionId.startsWith('local_') ? s.sessionId : null,
          });

          sessionIdMap[s.sessionId] = newSession._id.toString();
        } catch (e) {
          if (e.code === 11000) {
            // Race condition — already exists, look it up
            const dup = await AttendanceSession.findOne({ deviceLocalId: s.sessionId, company: device.companyId }).select('_id').lean();
            if (dup) sessionIdMap[s.sessionId] = dup._id.toString();
          } else {
            console.error('[sync session]', s.sessionId, e.message);
          }
        }
      }
    }

    // ── Step 2: sync attendance records ───────────────────────────────────────
    if (!Array.isArray(records) || records.length === 0) {
      return res.json({ success: true, synced: 0, skipped: 0, errors: [], sessionIdMap });
    }

    let synced = 0, skipped = 0, errors = [];

    for (const rec of records) {
      try {
        // Translate local session ID if needed
        const resolvedId = sessionIdMap[rec.sessionId] || rec.sessionId;
        const session = resolvedId ? await AttendanceSession.findById(resolvedId).catch(() => null) : null;
        if (!session || session.deviceId !== device.deviceId) { skipped++; continue; }

        // Resolve user — prefer _id, fall back to indexNumber
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

        // Firmware stores timestamps in Unix seconds; convert to ms
        const markedAt = rec.timestamp ? new Date(Number(rec.timestamp) * 1000) : new Date();
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

    res.json({ success: true, synced, skipped, errors, sessionIdMap });
  } catch (err) {
    console.error('[device sync]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── DEVICE ROSTER ───────────────────────────────────────────────────────────
// Returns all active students for this device's institution so the device can
// validate student IDs offline during attendance marking.
exports.getRoster = async (req, res) => {
  try {
    const device = req.device;
    if (!device) return res.status(401).json({ message: 'Device authentication missing' });

    const students = await User.find({
      company: device.companyId,
      role: 'student',
      isActive: { $ne: false },
    }).select('_id indexNumber IndexNumber name email').lean();

    const roster = students.map(s => ({
      id:          s._id.toString(),
      indexNumber: (s.indexNumber || s.IndexNumber || '').toUpperCase(),
      name:        s.name || s.email || '',
    })).filter(s => s.indexNumber || s.id);

    res.json({ ok: true, roster, count: roster.length });
  } catch (err) {
    console.error('[device roster]', err);
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
// Returns the institution's device for any authorized role.
exports.getMyDevice = async (req, res) => {
  try {
    const ALLOWED_ROLES = ['lecturer', 'class_rep', 'hod', 'admin', 'superadmin'];
    if (!ALLOWED_ROLES.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    let device = await Device.findOne({ companyId: req.user.company })
      .populate('lecturerId', 'name email');
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
        pairedBy:           device.lecturerId,
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
        pendingRecordsCount: device.pendingRecordsCount || 0,
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

    // Ownership: admin sees all; shared devices visible to any company member;
    // dedicated devices visible only to the owning lecturer.
    const canView = isAdmin
      || device.ownershipType === 'shared'
      || device.lecturerId?._id?.toString() === req.user._id.toString();
    if (!canView) {
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
// Admin, HOD, or superadmin can unlink the institution's device.
// Blocked if an active attendance session is running.
exports.unlinkDevice = async (req, res) => {
  try {
    const isPrivileged = ['admin', 'superadmin', 'hod'].includes(req.user.role);
    const query = isPrivileged
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

// ─── ASSIGN DEVICE TO GROUP ───────────────────────────────────────────────────
// Class rep, HOD, admin, or superadmin assigns the device to a student group.
// Once assigned, lecturer authorization is derived automatically from
// CourseLecturerAssignment — no manual lecturer list needed.
exports.assignGroup = async (req, res) => {
  try {
    const ALLOWED = ['class_rep', 'hod', 'admin', 'superadmin'];
    if (!ALLOWED.includes(req.user.role)) {
      return res.status(403).json({ message: 'Only class reps, HODs, and admins can assign a device to a group.' });
    }

    const { deviceId, department, level, group } = req.body;
    if (!deviceId) {
      return res.status(400).json({ message: 'deviceId is required.' });
    }
    if (!group || !level) {
      return res.status(400).json({ message: 'group and level are required.' });
    }

    const device = await Device.findOne({ deviceId, companyId: req.user.company });
    if (!device) return res.status(404).json({ message: 'Device not found.' });

    device.assignedGroup      = group.trim().toUpperCase();
    device.assignedLevel      = String(level).trim();
    device.assignedDepartment = department ? department.trim() : device.assignedDepartment;
    await device.save();

    _auditDevice(req.user, AUDIT_ACTIONS.UPDATE, device, {
      action: 'group_assigned',
      assignedGroup: device.assignedGroup,
      assignedLevel: device.assignedLevel,
      assignedDepartment: device.assignedDepartment,
    });

    res.json({
      success: true,
      message: `Device assigned to Group ${device.assignedGroup}, Level ${device.assignedLevel}.`,
      data: {
        deviceId:           device.deviceId,
        assignedGroup:      device.assignedGroup,
        assignedLevel:      device.assignedLevel,
        assignedDepartment: device.assignedDepartment,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── RENAME DEVICE ───────────────────────────────────────────────────────────
exports.renameDevice = async (req, res) => {
  try {
    const { deviceName } = req.body;
    if (!deviceName?.trim()) return res.status(400).json({ message: 'Device name is required.' });

    const isPrivileged = ['admin', 'superadmin', 'hod'].includes(req.user.role);
    const query = isPrivileged
      ? { companyId: req.user.company, ...(req.body.deviceId ? { deviceId: req.body.deviceId } : {}) }
      : { lecturerId: req.user._id, companyId: req.user.company };

    const device = await Device.findOneAndUpdate(query, { deviceName: deviceName.trim() }, { new: true });
    if (!device) return res.status(404).json({ message: 'Device not found or not authorized.' });

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

// ─── ASSIGN DEVICE TO CLASS REP ──────────────────────────────────────────────
// PATCH /api/devices/:deviceId/assign-class-rep
exports.assignClassRep = async (req, res) => {
  try {
    const { classRepId } = req.body;
    const device = await Device.findOne({ deviceId: req.params.deviceId, companyId: req.user.company });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    if (classRepId) {
      const classRep = await User.findOne({ _id: classRepId, company: req.user.company, role: 'student' });
      if (!classRep) return res.status(404).json({ error: 'Student not found' });

      // Mark student as class rep
      await User.findByIdAndUpdate(classRepId, { isClassRep: true });

      device.classRepId = classRepId;
      device.ownershipType = 'shared';
      device.lecturerId = null;
    } else {
      // Unassign
      device.classRepId = null;
      device.ownershipType = 'dedicated';
    }
    await device.save({ validateModifiedOnly: true });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
};

// ─── GET AVAILABLE DEVICES FOR A COURSE ──────────────────────────────────────
// ─── LIST ALL DEVICES (Admin / HOD) ──────────────────────────────────────────
// GET /api/devices/all — returns every paired device in the institution.
// HOD sees only devices whose assignedDepartment matches their department.
exports.listAllDevices = async (req, res) => {
  try {
    const companyId = req.user.company;
    const ALLOWED = ['admin', 'superadmin', 'hod'];
    if (!ALLOWED.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    const filter = { companyId };
    // HODs see all institution devices (not filtered by department) so they can
    // manage newly-paired devices that haven't been assigned yet.
    // The department context is advisory, not a hard filter.

    const devices = await Device.find(filter)
      .populate('lecturerId', 'name email role')
      .populate('assignedLecturers.lecturerId', 'name email')
      .populate('assignedLecturers.courseId',   'title code')
      .sort({ createdAt: -1 })
      .lean();

    const now = Date.now();
    const result = devices.map(d => ({
      _id:                d._id,
      deviceId:           d.deviceId,
      deviceName:         d.deviceName,
      assignedGroup:      d.assignedGroup,
      assignedLevel:      d.assignedLevel,
      assignedDepartment: d.assignedDepartment,
      assignedRoom:       d.assignedRoom,
      localIp:            d.localIp,
      firmwareVersion:    d.firmwareVersion,
      online: d.lastHeartbeat
        ? (now - new Date(d.lastHeartbeat).getTime()) < 20000
        : false,
      lastHeartbeat: d.lastHeartbeat,
      pairedBy:         d.lecturerId ? { name: d.lecturerId.name, role: d.lecturerId.role } : null,
      assignedLecturers: (d.assignedLecturers || []).map(a => ({
        lecturerId: a.lecturerId,
        courseId:   a.courseId,
        assignedAt: a.assignedAt,
      })),
      createdAt:     d.createdAt,
    }));

    res.json({ success: true, devices: result });
  } catch (err) {
    console.error('[listAllDevices]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// GET /api/devices/available?courseId=xxx
// Returns devices in this institution that serve the groups enrolled in the
// given course. For lecturers: only returns devices they are authorized for
// (i.e. they must be assigned to the course). For admin/HOD: returns all
// company devices with their online status.
exports.getAvailableDevices = async (req, res) => {
  try {
    const companyId = req.user.company;
    const { courseId } = req.query;

    if (!courseId) {
      return res.status(400).json({ message: 'courseId is required.' });
    }

    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: 'Invalid courseId.' });
    }

    const Course = require('../models/Course');

    // Verify course exists in this company
    const course = await Course.findOne({ _id: courseId, companyId });
    if (!course) {
      return res.status(404).json({ message: 'Course not found.' });
    }

    // Lecturers must be assigned to the course
    const BYPASS_ROLES = ['admin', 'superadmin', 'hod'];
    if (!BYPASS_ROLES.includes(req.user.role)) {
      const CourseLecturerAssignment = require('../models/CourseLecturerAssignment');
      const isLegacyOwner = course.lecturerId?.toString() === req.user._id.toString();
      if (!isLegacyOwner) {
        const assignment = await CourseLecturerAssignment.findActiveAssignment(
          companyId, course._id, req.user._id
        );
        if (!assignment) {
          return res.status(403).json({ message: 'You are not assigned to teach this course.' });
        }
      }
    }

    // Find groups enrolled in this course via StudentCourseEnrollment snapshots
    const StudentCourseEnrollment = require('../models/StudentCourseEnrollment');
    const enrollments = await StudentCourseEnrollment.find(
      { course: courseId, company: companyId, status: 'active' },
      { 'academicSnapshot.group': 1, 'academicSnapshot.level': 1, 'academicSnapshot.department': 1 }
    ).lean();

    // Collect unique group/level combos from enrollment snapshots
    const groupSet = new Map();
    for (const e of enrollments) {
      const g = e.academicSnapshot?.group;
      const l = e.academicSnapshot?.level;
      if (g && l) {
        const key = `${String(l).trim()}::${g.trim().toUpperCase()}`;
        if (!groupSet.has(key)) groupSet.set(key, { level: String(l).trim(), group: g.trim().toUpperCase() });
      }
    }

    let devices;
    if (groupSet.size > 0) {
      // Build OR query matching any of the group/level combos
      const groupConditions = Array.from(groupSet.values()).map(({ level, group }) => ({
        assignedLevel: level,
        assignedGroup: group,
      }));
      devices = await Device.find({
        companyId,
        $or: groupConditions,
      }).lean();
    } else {
      // No enrollment snapshots — fall back to all company devices
      devices = await Device.find({ companyId }).lean();
    }

    const now = Date.now();
    const result = devices.map(d => ({
      deviceId:           d.deviceId,
      deviceName:         d.deviceName,
      assignedGroup:      d.assignedGroup,
      assignedLevel:      d.assignedLevel,
      assignedDepartment: d.assignedDepartment,
      assignedRoom:       d.assignedRoom,
      online: d.lastHeartbeat
        ? (now - new Date(d.lastHeartbeat).getTime()) < 20000
        : false,
      lastHeartbeat: d.lastHeartbeat,
    }));

    res.json({ success: true, devices: result });
  } catch (err) {
    console.error('[getAvailableDevices]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── ASSIGN LECTURER TO DEVICE ───────────────────────────────────────────────
// POST /api/devices/:deviceId/assign-lecturer
// Binds a specific lecturer+course pair to this device.
// Allowed roles: admin, superadmin, hod, class_rep
exports.assignLecturer = async (req, res) => {
  try {
    const ALLOWED = ['admin', 'superadmin', 'hod', 'class_rep'];
    if (!ALLOWED.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized to assign lecturers to devices.' });
    }

    const { lecturerId, courseId } = req.body;
    const deviceId = req.params.deviceId;

    if (!deviceId || !lecturerId || !courseId) {
      return res.status(400).json({ message: 'deviceId, lecturerId, and courseId are required.' });
    }

    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(lecturerId) || !mongoose.Types.ObjectId.isValid(courseId)) {
      return res.status(400).json({ message: 'Invalid lecturerId or courseId.' });
    }

    // Device must exist and belong to this company
    const device = await Device.findOne({ deviceId, companyId: req.user.company });
    if (!device) return res.status(404).json({ message: 'Device not found.' });

    // Lecturer must exist, belong to company, and be a lecturer
    const lecturer = await User.findOne({ _id: lecturerId, company: req.user.company, role: 'lecturer' });
    if (!lecturer) return res.status(404).json({ message: 'Lecturer not found or is not a lecturer role.' });

    const Course = require('../models/Course');
    const course = await Course.findOne({ _id: courseId, companyId: req.user.company });
    if (!course) return res.status(404).json({ message: 'Course not found.' });

    // Verify lecturer teaches this course (legacy field or CourseLecturerAssignment)
    const CourseLecturerAssignment = require('../models/CourseLecturerAssignment');
    const isLegacyOwner = course.lecturerId?.toString() === lecturerId.toString();
    if (!isLegacyOwner) {
      const cla = await CourseLecturerAssignment.findActiveAssignment(req.user.company, course._id, lecturerId);
      if (!cla) {
        return res.status(422).json({
          message: 'Lecturer is not assigned to teach this course. Assign the course first via Course Management.',
        });
      }
    }

    // Prevent duplicates
    const alreadyAssigned = (device.assignedLecturers || []).some(a =>
      a.lecturerId.toString() === lecturerId.toString() &&
      a.courseId.toString()   === courseId.toString()
    );
    if (alreadyAssigned) {
      return res.status(409).json({ message: 'This lecturer+course pair is already assigned to this device.' });
    }

    device.assignedLecturers.push({
      lecturerId,
      courseId,
      assignedBy: req.user._id,
      assignedAt: new Date(),
    });
    await device.save();

    await device.populate([
      { path: 'assignedLecturers.lecturerId', select: 'name email' },
      { path: 'assignedLecturers.courseId',   select: 'title code' },
    ]);

    _auditDevice(req.user, AUDIT_ACTIONS.UPDATE, device, {
      action: 'lecturer_assigned',
      lecturerId,
      courseId,
    }, req);

    res.json({ success: true, message: 'Lecturer assigned to device.', data: device.assignedLecturers });
  } catch (err) {
    console.error('[assignLecturer]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── REMOVE LECTURER FROM DEVICE ─────────────────────────────────────────────
// DELETE /api/devices/:deviceId/remove-lecturer
// Removes a lecturer+course pair from this device.
// Allowed roles: admin, superadmin, hod, class_rep
exports.removeLecturer = async (req, res) => {
  try {
    const ALLOWED = ['admin', 'superadmin', 'hod', 'class_rep'];
    if (!ALLOWED.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized to remove lecturer assignments.' });
    }

    const { lecturerId, courseId } = req.body;
    const deviceId = req.params.deviceId;

    if (!deviceId || !lecturerId || !courseId) {
      return res.status(400).json({ message: 'deviceId, lecturerId, and courseId are required.' });
    }

    const device = await Device.findOne({ deviceId, companyId: req.user.company });
    if (!device) return res.status(404).json({ message: 'Device not found.' });

    const before = (device.assignedLecturers || []).length;
    device.assignedLecturers = (device.assignedLecturers || []).filter(a =>
      !(a.lecturerId.toString() === lecturerId.toString() && a.courseId.toString() === courseId.toString())
    );

    if (device.assignedLecturers.length === before) {
      return res.status(404).json({ message: 'Assignment not found on this device.' });
    }

    await device.save();

    _auditDevice(req.user, AUDIT_ACTIONS.UPDATE, device, {
      action: 'lecturer_removed',
      lecturerId,
      courseId,
    }, req);

    res.json({ success: true, message: 'Lecturer removed from device.', data: device.assignedLecturers });
  } catch (err) {
    console.error('[removeLecturer]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── REMOVE DEVICE ───────────────────────────────────────────────────────────
// DELETE /api/devices/:deviceId/remove
// Admin/HOD: unpairs the device from the institution (deletes the Device doc).
exports.removeDevice = async (req, res) => {
  try {
    const companyId = req.user.company;
    const { deviceId } = req.params;
    const device = await Device.findOne({ deviceId, companyId });
    if (!device) return res.status(404).json({ message: 'Device not found' });
    await Device.deleteOne({ _id: device._id });
    res.json({ message: 'Device removed' });
  } catch (err) {
    console.error('[removeDevice]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── FACTORY RESET DEVICE ────────────────────────────────────────────────────
// POST /api/devices/:deviceId/factory-reset
// Revokes the device JWT token so the next heartbeat returns 401, which
// triggers the firmware's built-in factoryReset() (clears Preferences +
// ESP.restart()). The DB record is deleted immediately so the device is
// removed from the institution list and can be re-paired fresh.
exports.factoryResetDevice = async (req, res) => {
  try {
    const companyId = req.user.company;
    const { deviceId } = req.params;
    const ALLOWED = ['admin', 'superadmin', 'hod'];
    if (!ALLOWED.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized.' });
    }
    const device = await Device.findOne({ deviceId, companyId });
    if (!device) return res.status(404).json({ message: 'Device not found.' });

    // Revoke the token first — any in-flight heartbeat will get 401 and
    // trigger the firmware's factoryReset(). Then delete the record so
    // the device cannot authenticate again with its old JWT.
    device.token = '';
    await device.save();
    await Device.deleteOne({ _id: device._id });

    _auditDevice(req.user, AUDIT_ACTIONS.DELETE, device, { action: 'factory_reset', deviceName: device.deviceName });
    res.json({ success: true, message: 'Factory reset initiated. The device will wipe itself on next heartbeat.' });
  } catch (err) {
    console.error('[factoryResetDevice]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET DEVICE LECTURERS ─────────────────────────────────────────────────────
// GET /api/devices/:deviceId/lecturers
// Returns populated assignedLecturers for the device.
exports.getDeviceLecturers = async (req, res) => {
  try {
    const deviceId = req.params.deviceId;
    const ALLOWED = ['admin', 'superadmin', 'hod', 'class_rep', 'lecturer'];
    if (!ALLOWED.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    const device = await Device.findOne({ deviceId, companyId: req.user.company })
      .populate('assignedLecturers.lecturerId', 'name email')
      .populate('assignedLecturers.courseId',   'title code');

    if (!device) return res.status(404).json({ message: 'Device not found.' });

    res.json({ success: true, assignedLecturers: device.assignedLecturers });
  } catch (err) {
    console.error('[getDeviceLecturers]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET LECTURERS FOR ASSIGNMENT DROPDOWN ────────────────────────────────────
// GET /api/devices/lecturers-for-assignment
// Returns all lecturers in this company, each with their courses array.
// Used to populate the assign-lecturer modal dropdown.
exports.getLecturersForAssignment = async (req, res) => {
  try {
    const ALLOWED = ['admin', 'superadmin', 'hod', 'class_rep'];
    if (!ALLOWED.includes(req.user.role)) {
      return res.status(403).json({ message: 'Not authorized.' });
    }

    const companyId = req.user.company;
    const Course = require('../models/Course');
    const CourseLecturerAssignment = require('../models/CourseLecturerAssignment');

    const lecturers = await User.find({ company: companyId, role: 'lecturer' }, 'name email').lean();

    // Gather courses for each lecturer from both legacy field and CourseLecturerAssignment
    const result = await Promise.all(lecturers.map(async (lec) => {
      // Legacy: courses where lecturerId === this lecturer
      const legacyCourses = await Course.find(
        { lecturerId: lec._id, companyId, isArchived: { $ne: true } },
        'title code'
      ).lean();

      // CLA: courses via active assignments
      const assignments = await CourseLecturerAssignment.find(
        { lecturer: lec._id, company: companyId, status: 'active' },
        'course'
      ).populate('course', 'title code').lean();

      const claCoursesRaw = assignments.map(a => a.course).filter(Boolean);

      // Merge and deduplicate by _id
      const courseMap = new Map();
      for (const c of [...legacyCourses, ...claCoursesRaw]) {
        if (c && c._id) courseMap.set(c._id.toString(), { _id: c._id, name: c.title, courseCode: c.code });
      }

      return {
        _id:     lec._id,
        name:    lec.name,
        email:   lec.email,
        courses: Array.from(courseMap.values()),
      };
    }));

    res.json({ success: true, lecturers: result });
  } catch (err) {
    console.error('[getLecturersForAssignment]', err);
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

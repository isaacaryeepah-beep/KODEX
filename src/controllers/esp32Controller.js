/**
 * esp32Controller.js  —  KODEX ESP32 Device Business Logic
 * ─────────────────────────────────────────────────────────────────────────────
 * Handles all ESP32 device operations:
 *   Device-side (authenticated via x-esp32-secret + x-esp32-token):
 *     register, poll, mark, studentList, ping, session, qr, scan, heartbeat
 *   Web-side (authenticated via JWT):
 *     sendCommand, deviceStatus
 * ─────────────────────────────────────────────────────────────────────────────
 */

const crypto            = require("crypto");
const bcrypt            = require("bcryptjs");

const User              = require("../models/User");
const Company           = require("../models/Company");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord  = require("../models/AttendanceRecord");
const QrToken           = require("../models/QrToken");

// ── Shared helper: HMAC-SHA256 ────────────────────────────────────────────────
function makeHmac(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest("hex");
}

// ── Shared helper: resolve device from token ──────────────────────────────────
// Returns { company, device } or throws if token is invalid.
async function resolveDevice(token) {
  if (!token) throw { status: 401, message: "x-esp32-token required" };
  const company = await Company.findOne({ "esp32Devices.token": token });
  if (!company) throw { status: 401, message: "Invalid device token" };
  const device = (company.esp32Devices || []).find((d) => d.token === token);
  return { company, device };
}

// ── POST /api/esp32/register ──────────────────────────────────────────────────
// First-boot device registration. Returns a token for subsequent calls.
exports.register = async (req, res) => {
  try {
    const { institutionCode, deviceId } = req.body;
    if (!institutionCode) {
      return res.status(400).json({ error: "institutionCode is required" });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) {
      return res.status(404).json({ error: "Institution not found. Check your institution code." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const devId = deviceId || ("esp32_" + Date.now());

    if (!company.esp32Devices) company.esp32Devices = [];
    // Remove existing entry for this deviceId so re-registration works cleanly
    company.esp32Devices = company.esp32Devices.filter((d) => d.deviceId !== devId);
    company.esp32Devices.push({
      deviceId: devId,
      token,
      registeredAt: new Date(),
      lastSeenAt: new Date(),
    });
    // Mark that this institution requires an ESP32 device to be online for attendance
    company.esp32Required = true;
    await company.save();

    console.log("[ESP32] Device registered:", devId, "for", company.name);

    res.json({
      ok: true,
      token,
      deviceId: devId,
      company: { name: company.name, code: company.institutionCode, mode: company.mode },
    });
  } catch (err) {
    console.error("[ESP32 register]", err);
    res.status(500).json({ error: "Registration failed: " + err.message });
  }
};

// ── GET /api/esp32/poll ───────────────────────────────────────────────────────
// Device polls for pending start/stop commands. One-shot delivery — command
// is cleared after being sent so it is never delivered twice.
exports.poll = async (req, res) => {
  try {
    const token = req.headers["x-esp32-token"];
    const { company, device } = await resolveDevice(token);

    // Touch lastSeenAt on every poll
    if (device) device.lastSeenAt = new Date();

    const cmd = company.esp32PendingCommand;
    if (cmd && cmd.action) {
      const cmdCopy = {
        action:    cmd.action,
        sessionId: cmd.sessionId,
        title:     cmd.title,
        issuedAt:  cmd.issuedAt,
      };
      // Clear the command so it is not delivered again
      company.esp32PendingCommand = { action: null, sessionId: null, title: null, issuedAt: null };
      await company.save();
      console.log("[ESP32 poll] Delivering command:", cmdCopy.action, "to", device?.deviceId);
      return res.json({ command: cmdCopy });
    }

    await company.save();

    // No pending command — return active session info so device stays in sync
    const activeSession = await AttendanceSession
      .findOne({ company: company._id, status: "active" })
      .select("_id title startedAt");

    res.json({
      command: null,
      activeSession: activeSession
        ? { id: activeSession._id, title: activeSession.title, startedAt: activeSession.startedAt }
        : null,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[ESP32 poll]", err);
    res.status(500).json({ error: "Poll failed" });
  }
};

// ── POST /api/esp32/mark ──────────────────────────────────────────────────────
// Online PIN verification + attendance mark. Called when the device has WiFi.
exports.mark = async (req, res) => {
  try {
    const token = req.headers["x-esp32-token"];
    const { indexNumber, pin, sessionId } = req.body;

    if (!indexNumber || !pin) {
      return res.status(400).json({ ok: false, error: "indexNumber and pin required" });
    }

    const { company, device } = await resolveDevice(token);
    if (device) { device.lastSeenAt = new Date(); await company.save(); }

    const idxUpper = indexNumber.toUpperCase();
    const user = await User.findOne({
      $or: [
        { IndexNumber: idxUpper, company: company._id },
        { indexNumber: idxUpper, company: company._id },
      ],
      role: "student",
    }).select("+attendancePin");

    if (!user) {
      return res.status(404).json({ ok: false, error: "Student not found. Check your index number." });
    }

    if (!user.attendancePin) {
      return res.status(403).json({
        ok: false,
        pinNotSet: true,
        error: "No attendance PIN set. Open the KODEX app → My Profile → Set Attendance PIN.",
      });
    }

    const pinMatch = await bcrypt.compare(pin, user.attendancePin);
    if (!pinMatch) {
      return res.status(401).json({ ok: false, error: "Incorrect PIN. Please try again." });
    }

    // Resolve active session
    let session;
    if (sessionId) {
      session = await AttendanceSession.findOne({ _id: sessionId, company: company._id, status: "active" });
    }
    if (!session) {
      session = await AttendanceSession.findOne({ company: company._id, status: "active" }).sort({ startedAt: -1 });
    }
    if (!session) {
      return res.status(404).json({ ok: false, error: "No active session found." });
    }

    // Duplicate check
    const existing = await AttendanceRecord.findOne({ session: session._id, user: user._id });
    if (existing) {
      return res.status(409).json({ ok: false, error: "Already marked for this session." });
    }

    const markedAt = new Date();
    const late = (markedAt - new Date(session.startedAt)) > 15 * 60 * 1000;

    await AttendanceRecord.create({
      session: session._id,
      user:    user._id,
      company: company._id,
      status:  late ? "late" : "present",
      method:  "esp32_pin",
      markedAt,
    });

    // HMAC fingerprint for offline SD caching
    const hash = makeHmac(device?.token || "", idxUpper + ":" + pin);

    console.log("[ESP32 mark]", user.name, idxUpper, "→", late ? "late" : "present");

    res.json({
      ok: true,
      name: user.name,
      indexNumber: idxUpper,
      status: late ? "late" : "present",
      sessionId: session._id,
      markedAt: markedAt.toISOString(),
      hash,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ ok: false, error: err.message });
    console.error("[ESP32 mark]", err);
    res.status(500).json({ ok: false, error: "Mark failed: " + err.message });
  }
};

// ── GET /api/esp32/student-list ───────────────────────────────────────────────
// Returns HMAC fingerprints for offline identity verification.
// Real PIN hashes are only generated by /mark after online verification.
exports.studentList = async (req, res) => {
  try {
    const token = req.headers["x-esp32-token"];
    if (!token) return res.status(401).json({ error: "x-esp32-token required" });

    const { company, device } = await resolveDevice(token);

    const students = await User.find({
      company:       company._id,
      role:          "student",
      isActive:      true,
      attendancePin: { $ne: null },
    }).select("+attendancePin");

    const list = students.map((s) => {
      const idx         = (s.IndexNumber || s.indexNumber || "").toUpperCase();
      const fingerprint = makeHmac(device?.token || "", idx);
      return { id: idx, name: s.name, hash: fingerprint };
    });

    console.log("[ESP32 student-list]", list.length, "students for", company.name);
    res.json({
      students:    list,
      count:       list.length,
      company:     company.name,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[ESP32 student-list]", err);
    res.status(500).json({ error: "Failed to fetch student list" });
  }
};

// ── POST /api/esp32/ping ──────────────────────────────────────────────────────
// Lightweight connectivity check. No token required.
exports.ping = async (req, res) => {
  try {
    const { institutionCode, deviceId, firmwareVersion } = req.body;
    const company = institutionCode
      ? await Company.findOne({ institutionCode: institutionCode.toUpperCase() })
          .select("name institutionCode mode")
      : null;

    res.json({
      ok:              true,
      serverTime:      new Date().toISOString(),
      company:         company ? { name: company.name, code: company.institutionCode, mode: company.mode } : null,
      deviceId:        deviceId || null,
      firmwareVersion: firmwareVersion || null,
    });
  } catch (err) {
    console.error("[ESP32 ping]", err);
    res.status(500).json({ error: "Ping failed" });
  }
};

// ── GET /api/esp32/session ────────────────────────────────────────────────────
// Returns the active session + current QR token for the institution.
exports.getSession = async (req, res) => {
  try {
    const { institutionCode } = req.query;
    if (!institutionCode) return res.status(400).json({ error: "institutionCode required" });

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) return res.status(404).json({ error: "Institution not found" });

    const session = await AttendanceSession
      .findOne({ company: company._id, status: "active" })
      .populate("createdBy", "name")
      .populate("course", "title code level group")
      .sort({ startedAt: -1 });

    if (!session) return res.json({ session: null, qrCode: null, attendeeCount: 0 });

    const qrToken      = await QrToken.findOne({ session: session._id, expiresAt: { $gt: new Date() }, codeType: "qr" }).sort({ createdAt: -1 });
    const attendeeCount = await AttendanceRecord.countDocuments({ session: session._id });

    res.json({
      session: {
        id:         session._id,
        title:      session.title || "Attendance Session",
        startedAt:  session.startedAt,
        createdBy:  session.createdBy?.name || "Lecturer",
        course:     session.course
          ? { title: session.course.title, code: session.course.code, level: session.course.level, group: session.course.group }
          : null,
      },
      qrCode: qrToken
        ? { code: qrToken.code, token: qrToken.token, expiresAt: qrToken.expiresAt, expiresInSeconds: Math.max(0, Math.round((new Date(qrToken.expiresAt) - Date.now()) / 1000)) }
        : null,
      attendeeCount,
    });
  } catch (err) {
    console.error("[ESP32 session]", err);
    res.status(500).json({ error: "Failed to fetch session" });
  }
};

// ── GET /api/esp32/qr ─────────────────────────────────────────────────────────
// Returns only the current QR token for a session.
exports.getQr = async (req, res) => {
  try {
    const { institutionCode, sessionId } = req.query;
    if (!institutionCode) return res.status(400).json({ error: "institutionCode required" });

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) return res.status(404).json({ error: "Institution not found" });

    const filter = { company: company._id, status: "active" };
    if (sessionId) filter._id = sessionId;

    const session = await AttendanceSession.findOne(filter).sort({ startedAt: -1 });
    if (!session) return res.json({ qrCode: null });

    const qrToken       = await QrToken.findOne({ session: session._id, expiresAt: { $gt: new Date() }, codeType: "qr" }).sort({ createdAt: -1 });
    const attendeeCount = await AttendanceRecord.countDocuments({ session: session._id });

    res.json({
      qrCode: qrToken
        ? { code: qrToken.code, token: qrToken.token, expiresAt: qrToken.expiresAt, expiresInSeconds: Math.max(0, Math.round((new Date(qrToken.expiresAt) - Date.now()) / 1000)) }
        : null,
      sessionId:    session._id,
      attendeeCount,
    });
  } catch (err) {
    console.error("[ESP32 qr]", err);
    res.status(500).json({ error: "Failed to fetch QR" });
  }
};

// ── POST /api/esp32/scan ──────────────────────────────────────────────────────
// Validates a scanned QR code or verbal code against active session.
exports.scan = async (req, res) => {
  try {
    const { institutionCode, scannedCode } = req.body;
    if (!institutionCode || !scannedCode) {
      return res.status(400).json({ error: "institutionCode and scannedCode required" });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) return res.status(404).json({ error: "Institution not found" });

    const now = new Date();

    // Try full token match first, then 6-digit verbal code match
    let qrToken = await QrToken.findOne({ token: scannedCode, company: company._id, expiresAt: { $gt: now } }).populate("session");
    if (!qrToken && scannedCode.length <= 6) {
      const active = await AttendanceSession.findOne({ company: company._id, status: "active" }).sort({ startedAt: -1 });
      if (active) {
        qrToken = await QrToken.findOne({ code: scannedCode.toUpperCase(), session: active._id, expiresAt: { $gt: now } }).populate("session");
      }
    }

    if (!qrToken) {
      return res.status(410).json({ ok: false, result: "expired", message: "QR code expired or not found." });
    }
    if (!qrToken.session || qrToken.session.status !== "active") {
      return res.status(400).json({ ok: false, result: "session_inactive", message: "Session is no longer active." });
    }

    const attendeeCount = await AttendanceRecord.countDocuments({ session: qrToken.session._id });

    res.json({
      ok:             true,
      result:         "valid",
      message:        "Valid QR — session active",
      session:        { id: qrToken.session._id, title: qrToken.session.title || "Attendance Session", attendeeCount },
      expiresInSeconds: Math.max(0, Math.round((new Date(qrToken.expiresAt) - Date.now()) / 1000)),
    });
  } catch (err) {
    console.error("[ESP32 scan]", err);
    res.status(500).json({ error: "Scan failed: " + err.message });
  }
};

// ── POST /api/esp32/heartbeat ─────────────────────────────────────────────────
// Device sends this every 6s. Updates lastSeenAt so the server can detect
// if the device goes offline. Also checks for RTC drift and requests resync.
exports.heartbeat = async (req, res) => {
  try {
    const token = req.headers["x-esp32-token"];
    if (!token) return res.status(401).json({ error: "x-esp32-token required" });

    const { company, device } = await resolveDevice(token);

    if (device) {
      device.lastSeenAt = new Date();
      await company.save();
    }

    const serverNow = new Date();
    let rtcDrift = null;
    if (req.body.rtcTime) {
      const deviceTime = new Date(req.body.rtcTime);
      if (!isNaN(deviceTime)) rtcDrift = Math.abs(serverNow - deviceTime);
    }

    res.json({
      ok:         true,
      serverTime: serverNow.toISOString(),
      deviceId:   device?.deviceId,
      rtcDriftMs: rtcDrift,
      resyncRTC:  rtcDrift !== null && rtcDrift > 60000,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[ESP32 heartbeat]", err);
    res.status(500).json({ error: "Heartbeat failed" });
  }
};

// ── POST /api/esp32/command  (JWT — web app side) ─────────────────────────────
// Lecturer/admin pushes a start or stop command to the device.
// The device picks this up on its next poll cycle.
exports.sendCommand = async (req, res) => {
  try {
    const { action, sessionId, title } = req.body;

    if (!action || !["start", "stop"].includes(action)) {
      return res.status(400).json({ error: "action must be 'start' or 'stop'" });
    }

    const company = await Company.findById(req.user.company);
    if (!company) return res.status(404).json({ error: "Company not found" });

    if (!company.esp32Devices || company.esp32Devices.length === 0) {
      return res.status(404).json({ error: "No ESP32 device registered for this institution" });
    }

    company.esp32PendingCommand = {
      action,
      sessionId: sessionId || null,
      title:     title || (action === "start" ? "Classroom Session" : null),
      issuedAt:  new Date(),
    };
    await company.save();

    console.log("[ESP32 command]", action, "issued by", req.user.name);
    res.json({ ok: true, command: company.esp32PendingCommand });
  } catch (err) {
    console.error("[ESP32 command]", err);
    res.status(500).json({ error: "Failed to send command" });
  }
};

// ── GET /api/esp32/device-status  (JWT — web app side) ───────────────────────
// Returns whether the device is currently online (heartbeat within last 20s).
// Used by the frontend before allowing attendance to be started.
exports.deviceStatus = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company).select("esp32Devices esp32Required");
    if (!company) return res.status(404).json({ error: "Company not found" });

    const hasDevice   = company.esp32Devices && company.esp32Devices.length > 0;
    const esp32Required = !!company.esp32Required;

    if (!hasDevice) {
      return res.json({ hasDevice: false, deviceOnline: false, esp32Required });
    }

    const latestDevice = company.esp32Devices
      .filter((d) => d.lastSeenAt)
      .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))[0];

    const lastSeen = latestDevice?.lastSeenAt ? new Date(latestDevice.lastSeenAt) : null;
    const isOnline = lastSeen && (Date.now() - lastSeen.getTime()) < 20000;

    res.json({
      hasDevice:            true,
      deviceOnline:         !!isOnline,
      esp32Required,
      deviceId:             latestDevice?.deviceId || null,
      lastSeenAt:           lastSeen ? lastSeen.toISOString() : null,
      secondsSinceLastSeen: lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 1000) : null,
    });
  } catch (err) {
    console.error("[ESP32 device-status]", err);
    res.status(500).json({ error: "Failed to check device status" });
  }
};

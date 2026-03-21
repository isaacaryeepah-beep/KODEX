/**
 * esp32Controller.js — KODEX ESP32 Device Controller
 * ─────────────────────────────────────────────────────
 * FLOW:
 *   1. ESP32 boots → POST /register → gets token, sets esp32Required=true
 *   2. ESP32 sends POST /heartbeat every 6s → server updates lastSeenAt
 *   3. Lecturer starts session on web → POST /command queues "start"
 *   4. ESP32 polls GET /poll → receives "start" → starts local session
 *   5. Students connect to ESP32 hotspot → mark attendance locally on device
 *   6. Lecturer stops session → POST /command queues "stop"
 *   7. ESP32 receives "stop" → POSTs records to /sync → done
 *
 * Device auth:  x-esp32-secret header (shared secret from .env)
 * Web auth:     JWT (standard Bearer token)
 */

const crypto  = require("crypto");
const Company = require("../models/Company");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord  = require("../models/AttendanceRecord");
const User    = require("../models/User");

// ─────────────────────────────────────────────────────────
// HELPER: resolve company + device from x-esp32-token
// ─────────────────────────────────────────────────────────
async function resolveDevice(token) {
  if (!token) {
    const err = new Error("x-esp32-token required");
    err.status = 401;
    throw err;
  }
  const company = await Company.findOne({ "esp32Devices.token": token });
  if (!company) {
    const err = new Error("Invalid device token — please re-register the device");
    err.status = 401;
    throw err;
  }
  const device = company.esp32Devices.find(d => d.token === token);
  return { company, device };
}

// ─────────────────────────────────────────────────────────
// POST /api/esp32/register
// Called once on first boot. Returns token for future calls.
// ─────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { institutionCode, deviceId } = req.body;

    if (!institutionCode) {
      return res.status(400).json({ error: "institutionCode is required" });
    }

    const company = await Company.findOne({
      institutionCode: institutionCode.trim().toUpperCase(),
    });
    if (!company) {
      return res.status(404).json({ error: "Institution not found. Check your institution code." });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const devId = deviceId || ("esp32_" + Date.now());

    // Clean re-registration: remove old entry for this deviceId
    company.esp32Devices = (company.esp32Devices || []).filter(d => d.deviceId !== devId);
    company.esp32Devices.push({
      deviceId:     devId,
      token,
      registeredAt: new Date(),
      lastSeenAt:   new Date(),
    });

    // This flag tells the server: this institution has a device,
    // so attendance cannot start without it being online.
    company.esp32Required = true;

    await company.save();
    console.log(`[ESP32] Device "${devId}" registered for "${company.name}"`);

    return res.json({
      ok:       true,
      token,
      deviceId: devId,
      company:  { name: company.name, code: company.institutionCode },
    });
  } catch (err) {
    console.error("[ESP32 register]", err);
    return res.status(500).json({ error: "Registration failed: " + err.message });
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/esp32/heartbeat
// Device calls this every 6s. Updates lastSeenAt timestamp.
// Server checks this to know if device is currently powered on.
// ─────────────────────────────────────────────────────────
exports.heartbeat = async (req, res) => {
  try {
    const token = req.headers["x-esp32-token"];
    const { company, device } = await resolveDevice(token);

    device.lastSeenAt = new Date();
    await company.save();

    // Tell device to resync RTC if it's drifted more than 60s
    let resyncRTC = false;
    if (req.body.rtcTime) {
      const drift = Math.abs(Date.now() - new Date(req.body.rtcTime).getTime());
      resyncRTC = !isNaN(drift) && drift > 60000;
    }

    return res.json({
      ok:         true,
      serverTime: new Date().toISOString(),
      resyncRTC,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[ESP32 heartbeat]", err);
    return res.status(500).json({ error: "Heartbeat failed" });
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/esp32/poll
// Device calls this every 6s alongside heartbeat (same WiFi session).
// Returns one pending command then clears it (one-shot delivery).
// ─────────────────────────────────────────────────────────
exports.poll = async (req, res) => {
  try {
    const token = req.headers["x-esp32-token"];
    const { company, device } = await resolveDevice(token);

    // Update lastSeenAt on poll too
    device.lastSeenAt = new Date();

    const cmd = company.esp32PendingCommand;
    if (cmd && cmd.action) {
      const delivered = {
        action:    cmd.action,
        sessionId: cmd.sessionId || null,
        title:     cmd.title || null,
        issuedAt:  cmd.issuedAt || null,
      };
      // Clear so it isn't delivered twice
      company.esp32PendingCommand = { action: null, sessionId: null, title: null, issuedAt: null };
      await company.save();

      console.log(`[ESP32 poll] Delivered "${delivered.action}" to ${device.deviceId}`);
      return res.json({ command: delivered });
    }

    await company.save();

    // No command pending — also return active session state so device stays in sync
    const activeSession = await AttendanceSession
      .findOne({ company: company._id, status: "active" })
      .select("_id title startedAt")
      .lean();

    return res.json({
      command: null,
      activeSession: activeSession
        ? { id: activeSession._id, title: activeSession.title, startedAt: activeSession.startedAt }
        : null,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[ESP32 poll]", err);
    return res.status(500).json({ error: "Poll failed" });
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/esp32/sync
// After session ends, device pushes all offline attendance records.
// Finds each student by index number and creates attendance records.
// ─────────────────────────────────────────────────────────
exports.sync = async (req, res) => {
  try {
    const token = req.headers["x-esp32-token"];
    const { company } = await resolveDevice(token);

    const { offlineSession, records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.json({ ok: true, message: "No records to sync", synced: 0, skipped: 0 });
    }

    // Find existing session or create one for these records
    let session = null;
    if (offlineSession?.id) {
      session = await AttendanceSession
        .findOne({ _id: offlineSession.id, company: company._id })
        .catch(() => null);
    }

    if (!session) {
      session = await AttendanceSession.create({
        company:   company._id,
        title:     offlineSession?.title || "ESP32 Session",
        status:    "stopped",
        startedAt: offlineSession?.startedAt ? new Date(offlineSession.startedAt) : new Date(),
        stoppedAt: new Date(),
        source:    "esp32",
      });
      console.log(`[ESP32 sync] Created session ${session._id} for ${company.name}`);
    }

    let synced  = 0;
    let skipped = 0;

    for (const rec of records) {
      const indexNumber = (rec.indexNumber || "").trim().toUpperCase();
      if (!indexNumber) { skipped++; continue; }

      // Find student by index number
      const student = await User.findOne({
        $or: [
          { IndexNumber: indexNumber, company: company._id },
          { indexNumber: indexNumber, company: company._id },
        ],
        role: "student",
      }).select("_id").lean();

      if (!student) {
        console.warn(`[ESP32 sync] Student not found: ${indexNumber}`);
        skipped++;
        continue;
      }

      // Skip if already marked
      const already = await AttendanceRecord.exists({
        session: session._id,
        user:    student._id,
      });
      if (already) { skipped++; continue; }

      const markedAt = rec.markedAt ? new Date(rec.markedAt) : new Date();
      const late = (markedAt - new Date(session.startedAt)) > 15 * 60 * 1000;

      await AttendanceRecord.create({
        session:  session._id,
        user:     student._id,
        company:  company._id,
        status:   late ? "late" : "present",
        method:   rec.method || "esp32_offline",
        markedAt,
      });
      synced++;
    }

    console.log(`[ESP32 sync] ${synced} synced, ${skipped} skipped for ${company.name}`);
    return res.json({
      ok:        true,
      synced,
      skipped,
      sessionId: session._id,
      message:   `${synced} record(s) synced.`,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[ESP32 sync]", err);
    return res.status(500).json({ error: "Sync failed: " + err.message });
  }
};

// ─────────────────────────────────────────────────────────
// POST /api/esp32/command  (JWT — web app side)
// Lecturer/admin queues a start or stop command.
// Device picks it up on its next poll.
// ─────────────────────────────────────────────────────────
exports.sendCommand = async (req, res) => {
  try {
    const { action, sessionId, title } = req.body;

    if (!action || !["start", "stop"].includes(action)) {
      return res.status(400).json({ error: "action must be 'start' or 'stop'" });
    }

    const company = await Company.findById(req.user.company);
    if (!company) return res.status(404).json({ error: "Company not found" });

    if (!company.esp32Devices || company.esp32Devices.length === 0) {
      return res.status(404).json({
        error: "No ESP32 device registered. Power on the device and send REGISTER via serial.",
      });
    }

    company.esp32PendingCommand = {
      action,
      sessionId: sessionId || null,
      title:     title || (action === "start" ? "Classroom Session" : null),
      issuedAt:  new Date(),
    };
    await company.save();

    console.log(`[ESP32 command] "${action}" queued by ${req.user.name}`);
    return res.json({ ok: true, command: company.esp32PendingCommand });
  } catch (err) {
    console.error("[ESP32 command]", err);
    return res.status(500).json({ error: "Failed to queue command" });
  }
};

// ─────────────────────────────────────────────────────────
// GET /api/esp32/device-status  (JWT — web app side)
// Returns whether the device is online (heartbeat in last 20s).
// Called by the frontend before allowing a session to start.
// ─────────────────────────────────────────────────────────
exports.deviceStatus = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company)
      .select("esp32Devices esp32Required");
    if (!company) return res.status(404).json({ error: "Company not found" });

    const esp32Required = !!company.esp32Required;
    const devices = company.esp32Devices || [];

    if (devices.length === 0) {
      return res.json({ hasDevice: false, deviceOnline: false, esp32Required });
    }

    const latest = devices
      .filter(d => d.lastSeenAt)
      .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))[0];

    const lastSeen    = latest?.lastSeenAt ? new Date(latest.lastSeenAt) : null;
    const deviceOnline = lastSeen ? (Date.now() - lastSeen.getTime()) < 20000 : false;

    return res.json({
      hasDevice:            true,
      deviceOnline,
      esp32Required,
      deviceId:             latest?.deviceId || null,
      lastSeenAt:           lastSeen ? lastSeen.toISOString() : null,
      secondsSinceLastSeen: lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 1000) : null,
    });
  } catch (err) {
    console.error("[ESP32 device-status]", err);
    return res.status(500).json({ error: "Failed to check device status" });
  }
};

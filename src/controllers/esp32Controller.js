/**
 * esp32Controller.js — KODEX ESP32 Device Logic
 *
 * FLOW:
 *  1. Device boots → POST /register → saves token + sets esp32Required=true
 *  2. Device sends POST /heartbeat every 6s → updates lastSeenAt
 *  3. Lecturer starts session on web → POST /command queues "start"
 *  4. Device polls GET /poll → gets "start" command → starts local session
 *  5. Students connect to device hotspot → mark attendance locally
 *  6. Lecturer stops → POST /command queues "stop"
 *  7. Device gets "stop" → POSTs records to POST /sync
 */

const crypto  = require("crypto");
const Company = require("../models/Company");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord  = require("../models/AttendanceRecord");
const User    = require("../models/User");

async function resolveDevice(token) {
  if (!token) { const e = new Error("x-esp32-token required"); e.status = 401; throw e; }
  const company = await Company.findOne({ "esp32Devices.token": token });
  if (!company)  { const e = new Error("Invalid device token — send REGISTER via serial to re-register"); e.status = 401; throw e; }
  const device = company.esp32Devices.find(d => d.token === token);
  return { company, device };
}

// POST /api/esp32/register
exports.register = async (req, res) => {
  try {
    const { institutionCode, deviceId } = req.body;
    if (!institutionCode) return res.status(400).json({ error: "institutionCode is required" });

    const company = await Company.findOne({ institutionCode: institutionCode.trim().toUpperCase() });
    if (!company) return res.status(404).json({ error: "Institution not found. Check your institution code." });

    const token = crypto.randomBytes(32).toString("hex");
    const devId = deviceId || ("esp32_" + Date.now());

    company.esp32Devices = (company.esp32Devices || []).filter(d => d.deviceId !== devId);
    company.esp32Devices.push({ deviceId: devId, token, registeredAt: new Date(), lastSeenAt: new Date() });
    company.esp32Required = true;
    await company.save();

    console.log(`[ESP32] Device "${devId}" registered for "${company.name}"`);
    return res.json({ ok: true, token, deviceId: devId, company: { name: company.name, code: company.institutionCode } });
  } catch (err) {
    console.error("[ESP32 register]", err);
    return res.status(500).json({ error: "Registration failed: " + err.message });
  }
};

// POST /api/esp32/heartbeat
exports.heartbeat = async (req, res) => {
  try {
    const token = req.headers["x-esp32-token"];
    const { company, device } = await resolveDevice(token);
    device.lastSeenAt = new Date();
    await company.save();

    let resyncRTC = false;
    if (req.body.rtcTime) {
      const drift = Math.abs(Date.now() - new Date(req.body.rtcTime).getTime());
      resyncRTC = !isNaN(drift) && drift > 60000;
    }
    return res.json({ ok: true, serverTime: new Date().toISOString(), resyncRTC });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[ESP32 heartbeat]", err);
    return res.status(500).json({ error: "Heartbeat failed" });
  }
};

// GET /api/esp32/poll
exports.poll = async (req, res) => {
  try {
    const token = req.headers["x-esp32-token"];
    const { company, device } = await resolveDevice(token);

    device.lastSeenAt = new Date();

    const cmd = company.esp32PendingCommand;
    if (cmd && cmd.action) {
      const delivered = { action: cmd.action, sessionId: cmd.sessionId || null, title: cmd.title || null, issuedAt: cmd.issuedAt || null };
      company.esp32PendingCommand = { action: null, sessionId: null, title: null, issuedAt: null };
      await company.save();
      console.log(`[ESP32 poll] Delivered "${delivered.action}" to ${device.deviceId}`);
      return res.json({ command: delivered });
    }

    await company.save();

    const activeSession = await AttendanceSession
      .findOne({ company: company._id, status: "active" })
      .select("_id title startedAt").lean();

    return res.json({
      command: null,
      activeSession: activeSession ? { id: activeSession._id, title: activeSession.title, startedAt: activeSession.startedAt } : null,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[ESP32 poll]", err);
    return res.status(500).json({ error: "Poll failed" });
  }
};

// POST /api/esp32/sync
exports.sync = async (req, res) => {
  try {
    const token = req.headers["x-esp32-token"];
    const { company } = await resolveDevice(token);
    const { offlineSession, records } = req.body;

    if (!records || !Array.isArray(records) || records.length === 0) {
      return res.json({ ok: true, message: "No records to sync", synced: 0, skipped: 0 });
    }

    let session = null;
    if (offlineSession?.id) {
      session = await AttendanceSession.findOne({ _id: offlineSession.id, company: company._id }).catch(() => null);
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
    }

    let synced = 0, skipped = 0;
    for (const rec of records) {
      const idx = (rec.indexNumber || "").trim().toUpperCase();
      if (!idx) { skipped++; continue; }

      const student = await User.findOne({
        $or: [{ IndexNumber: idx, company: company._id }, { indexNumber: idx, company: company._id }],
        role: "student",
      }).select("_id").lean();

      if (!student) { skipped++; continue; }

      const already = await AttendanceRecord.exists({ session: session._id, user: student._id });
      if (already) { skipped++; continue; }

      const markedAt = rec.markedAt ? new Date(rec.markedAt) : new Date();
      const late = (markedAt - new Date(session.startedAt)) > 15 * 60 * 1000;
      await AttendanceRecord.create({
        session: session._id, user: student._id, company: company._id,
        status: late ? "late" : "present", method: rec.method || "esp32_offline", markedAt,
      });
      synced++;
    }

    console.log(`[ESP32 sync] ${synced} synced, ${skipped} skipped for ${company.name}`);
    return res.json({ ok: true, synced, skipped, sessionId: session._id, message: `${synced} record(s) synced.` });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error("[ESP32 sync]", err);
    return res.status(500).json({ error: "Sync failed: " + err.message });
  }
};

// POST /api/esp32/command  (JWT — web app)
exports.sendCommand = async (req, res) => {
  try {
    const { action, sessionId, title } = req.body;
    if (!action || !["start","stop"].includes(action)) return res.status(400).json({ error: "action must be 'start' or 'stop'" });

    const company = await Company.findById(req.user.company);
    if (!company) return res.status(404).json({ error: "Company not found" });
    if (!company.esp32Devices || company.esp32Devices.length === 0)
      return res.status(404).json({ error: "No ESP32 device registered. Power on the device and send REGISTER via serial." });

    company.esp32PendingCommand = { action, sessionId: sessionId || null, title: title || (action === "start" ? "Classroom Session" : null), issuedAt: new Date() };
    await company.save();
    console.log(`[ESP32 command] "${action}" queued by ${req.user.name}`);
    return res.json({ ok: true, command: company.esp32PendingCommand });
  } catch (err) {
    console.error("[ESP32 command]", err);
    return res.status(500).json({ error: "Failed to queue command" });
  }
};

// GET /api/esp32/device-status  (JWT — web app)
exports.deviceStatus = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company).select("esp32Devices esp32Required");
    if (!company) return res.status(404).json({ error: "Company not found" });

    const devices = company.esp32Devices || [];
    const esp32Required = !!company.esp32Required;
    if (devices.length === 0) return res.json({ hasDevice: false, deviceOnline: false, esp32Required });

    const latest   = devices.filter(d => d.lastSeenAt).sort((a,b) => new Date(b.lastSeenAt)-new Date(a.lastSeenAt))[0];
    const lastSeen  = latest?.lastSeenAt ? new Date(latest.lastSeenAt) : null;
    const deviceOnline = lastSeen ? (Date.now() - lastSeen.getTime()) < 20000 : false;

    return res.json({
      hasDevice: true, deviceOnline, esp32Required,
      deviceId: latest?.deviceId || null,
      lastSeenAt: lastSeen ? lastSeen.toISOString() : null,
      secondsSinceLastSeen: lastSeen ? Math.round((Date.now()-lastSeen.getTime())/1000) : null,
    });
  } catch (err) {
    console.error("[ESP32 device-status]", err);
    return res.status(500).json({ error: "Failed to check device status" });
  }
};

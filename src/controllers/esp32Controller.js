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

    // Store V2 firmware hardware status so deviceStatus can report it
    if (req.body.rtcValid      !== undefined) device.rtcValid      = !!req.body.rtcValid;
    if (req.body.sdOK          !== undefined) device.sdOK          = !!req.body.sdOK;
    if (req.body.bleOK         !== undefined) device.bleOK         = !!req.body.bleOK;
    if (req.body.sessionActive !== undefined) device.sessionActive = !!req.body.sessionActive;

    await company.save();

    let resyncRTC = false;
    if (req.body.rtcTime) {
      const drift = Math.abs(Date.now() - new Date(req.body.rtcTime).getTime());
      resyncRTC = !isNaN(drift) && drift > 60000;
    }
    console.log(`[ESP32 HB] ${device.deviceId} ok | lastSeenAt=${device.lastSeenAt.toISOString()}`);
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
      const delivered = {
        action:    cmd.action,
        sessionId: cmd.sessionId || null,
        title:     cmd.title     || null,
        seed:      cmd.seed      || cmd.sessionId || null, // seed = sessionId if not explicitly set
        duration:  cmd.duration  || 300,
        issuedAt:  cmd.issuedAt  || null,
      };
      company.esp32PendingCommand = { action: null, sessionId: null, title: null, seed: null, duration: 300, issuedAt: null };
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
    const { action, sessionId, title, duration } = req.body;
    if (!action || !["start","stop"].includes(action)) return res.status(400).json({ error: "action must be 'start' or 'stop'" });

    const company = await Company.findById(req.user.company);
    if (!company) return res.status(404).json({ error: "Company not found" });
    if (!company.esp32Devices || company.esp32Devices.length === 0)
      return res.status(404).json({ error: "No ESP32 device registered. Power on the device and send REGISTER via serial." });

    // seed = sessionId — both ESP32 and server derive the same rotating code from this
    const seed = sessionId || null;
    const durationSecs = Number(duration) || 300;

    company.esp32PendingCommand = {
      action,
      sessionId: sessionId || null,
      title: title || (action === "start" ? "Classroom Session" : null),
      seed,
      duration: durationSecs,
      issuedAt: new Date(),
    };
    await company.save();

    // Also persist seed and duration on the AttendanceSession if it exists
    if (action === "start" && sessionId) {
      await AttendanceSession.findByIdAndUpdate(sessionId, {
        esp32Seed: seed,
        durationSeconds: durationSecs,
      }).catch(() => {}); // non-fatal
    }

    console.log(`[ESP32 command] "${action}" queued by ${req.user.name} | seed: ${seed?.substring(0,8)}... | duration: ${durationSecs}s`);
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
    const secsSince = lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 1000) : null;
    const deviceOnline = lastSeen ? (Date.now() - lastSeen.getTime()) < 60000 : false; // 60s window
    console.log(`[ESP32 status] lastSeen=${lastSeen?.toISOString()} secsSince=${secsSince} online=${deviceOnline}`);

    // V2 firmware hardware flags (populated from heartbeat)
    const rtcValid     = latest?.rtcValid  ?? null;
    const sdOK         = latest?.sdOK      ?? null;
    const bleOK        = latest?.bleOK     ?? null;
    const sessionActive = latest?.sessionActive ?? false;

    // Device is ready if online. RTC/SD/BLE are warnings not blockers —
    // RTC not found means NTP fallback is used (still valid for code derivation)
    // SD not found means no local logging (records still synced via WiFi)
    // BLE removed from V3 firmware entirely
    const deviceReady = deviceOnline;

    // Build failure reason — only block on DEVICE_OFFLINE
    let notReadyReason = null;
    if (!deviceOnline) notReadyReason = "DEVICE_OFFLINE";

    return res.json({
      hasDevice: true,
      deviceOnline,
      deviceReady,
      esp32Required,
      notReadyReason,
      sessionActive,
      deviceId:   latest?.deviceId || null,
      lastSeenAt: lastSeen ? lastSeen.toISOString() : null,
      secondsSinceLastSeen: lastSeen ? Math.round((Date.now()-lastSeen.getTime())/1000) : null,
      hardware: { rtcValid, sdOK, bleOK },
    });
  } catch (err) {
    console.error("[ESP32 device-status]", err);
    return res.status(500).json({ error: "Failed to check device status" });
  }
};

// POST /api/esp32/ble-verify  (JWT — web app, called by student's phone)
// Verifies a BLE token scanned from the ESP32 beacon.
// Anti-cheat layers:
//   1. IP must be 192.168.4.x (student on KODEX-CLASSROOM WiFi)
//   2. bleToken must be valid HMAC-SHA256(deviceToken, sessionId:timestamp)
//   3. timestamp must be < 60s old (prevents replay)
//   4. bleToken is single-use (stored in session.usedBleTokens)
//   5. Device must be online (heartbeat within 30s)
exports.bleVerify = async (req, res) => {
  try {
    const { bleToken, sessionId, timestamp } = req.body;

    if (!bleToken || !timestamp) {
      return res.status(400).json({ error: 'bleToken and timestamp are required' });
    }

    // ── 1. IP check — must be on KODEX-CLASSROOM hotspot ─────
    // NOTE: Android "WiFi Assist" routes through mobile data when the ESP32
    // hotspot has no internet, so req IP won't be 192.168.4.x.
    // Fix: the front-end reads X-ESP32-Hotspot-Key served by the ESP32 captive
    // portal page and forwards it here. If it matches the device token, we
    // accept the request regardless of IP.
    const clientIp = (
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.headers['x-real-ip'] ||
      (req.socket && req.socket.remoteAddress) ||
      ''
    );
    const isOnEsp32Network =
      clientIp.startsWith('192.168.4.') ||
      clientIp === '127.0.0.1' ||
      clientIp === '::1' ||
      clientIp === '::ffff:127.0.0.1';

    // Resolve latest device early so we can check hotspot key
    const allDevices = (await Company.findById(req.user.company).select('esp32Devices'))?.esp32Devices || [];
    const latestDevice = allDevices
      .filter(d => d.lastSeenAt)
      .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))[0];

    const hotspotKey = (req.headers['x-esp32-hotspot-key'] || '').trim();
    const hotspotKeyValid = hotspotKey.length > 0 && latestDevice && hotspotKey === latestDevice.token;

    if (!isOnEsp32Network && !hotspotKeyValid) {
      console.warn(`[BLE-VERIFY] Blocked IP ${clientIp} — not on hotspot and no valid hotspot key`);
      return res.status(403).json({
        error: 'You must be connected to KODEX-CLASSROOM WiFi to use BLE attendance.',
        code: 'NOT_ON_HOTSPOT',
      });
    }

    // ── 2. Timestamp freshness — must be < 60s old ────────────
    const tokenTime = parseInt(timestamp, 10);
    if (isNaN(tokenTime) || Math.abs(Date.now() - tokenTime) > 60000) {
      return res.status(400).json({
        error: 'BLE token has expired. Move closer to the device and try again.',
        code: 'TOKEN_EXPIRED',
      });
    }

    // ── 3. Find company and device ────────────────────────────
    const company = await Company.findById(req.user.company)
      .select('esp32Devices esp32Required');
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const devices = company.esp32Devices || [];
    if (devices.length === 0) {
      return res.status(404).json({ error: 'No ESP32 device registered' });
    }

    // ── 4. Device must be online ──────────────────────────────
    const latest = devices
      .filter(d => d.lastSeenAt)
      .sort((a, b) => new Date(b.lastSeenAt) - new Date(a.lastSeenAt))[0];
    const deviceOnline = latest
      ? (Date.now() - new Date(latest.lastSeenAt).getTime()) < 60000 // 60s window
      : false;

    if (!deviceOnline) {
      return res.status(503).json({
        error: 'The classroom device is offline. Ask your lecturer to power it on.',
        code: 'DEVICE_OFFLINE',
      });
    }

    // ── 5. Verify HMAC signature ──────────────────────────────
    // ESP32 computes: HMAC-SHA256(deviceToken, sessionId:timestamp)
    // We recompute it server-side using the stored device token.
    // If they match, the token genuinely came from the ESP32.
    const deviceToken = latest.token;
    const payload = `${sessionId || ''}:${timestamp}`;
    const expected = crypto
      .createHmac('sha256', deviceToken)
      .update(payload)
      .digest('hex');

    if (bleToken !== expected) {
      console.warn(`[BLE-VERIFY] Invalid token from ${clientIp} — possible forgery`);
      return res.status(401).json({
        error: 'Invalid BLE token. You must be next to the classroom device.',
        code: 'INVALID_TOKEN',
      });
    }

    // ── 6. Single-use check ───────────────────────────────────
    const session = await AttendanceSession.findOne({
      company: company._id,
      status: 'active',
      ...(sessionId ? { _id: sessionId } : {}),
    });

    if (!session) {
      return res.status(404).json({ error: 'No active session found.' });
    }

    if (session.usedBleTokens && session.usedBleTokens.includes(bleToken)) {
      return res.status(409).json({
        error: 'This BLE token has already been used. Each scan is single-use.',
        code: 'TOKEN_ALREADY_USED',
      });
    }

    // Mark token as used — store the token in the session
    await AttendanceSession.updateOne(
      { _id: session._id },
      { $addToSet: { usedBleTokens: bleToken } }
    );

    console.log(`[BLE-VERIFY] ✓ Valid token for session ${session._id} from ${clientIp}`);

    // Return session info so the frontend can complete the attendance mark
    return res.json({
      ok: true,
      sessionId: session._id,
      verified: true,
    });

  } catch (err) {
    console.error('[BLE-VERIFY]', err);
    return res.status(500).json({ error: 'BLE verification failed' });
  }
};

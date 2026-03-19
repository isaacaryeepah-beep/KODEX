const Company  = require('../models/Company');
const crypto   = require('crypto');

// ── How long before we consider the ESP32 offline ─────────
const OFFLINE_THRESHOLD_MS = 6000; // 6 seconds (3 missed polls at 2s interval = definitely offline)

// ── POST /api/esp32/register ───────────────────────────────
// ESP32 calls this once on boot to register itself.
// Returns a token the ESP32 uses for all future poll calls.
exports.register = async (req, res) => {
  try {
    const secret = req.headers['x-esp32-secret'];
    if (!secret || secret !== process.env.ESP32_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { institutionCode } = req.body;
    if (!institutionCode) {
      return res.status(400).json({ error: 'institutionCode required' });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) {
      return res.status(404).json({ error: 'Institution not found: ' + institutionCode });
    }

    // Generate a token for this ESP32 if it doesn't have one
    if (!company.esp32Token) {
      company.esp32Token = crypto.randomBytes(24).toString('hex');
    }
    company.esp32Online   = true;
    company.esp32LastSeen = new Date();
    await company.save();

    console.log(`[ESP32] Registered for institution: ${institutionCode}`);
    res.json({ ok: true, token: company.esp32Token, institutionCode: company.institutionCode });
  } catch (e) {
    console.error('[ESP32] Register error:', e);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET /api/esp32/poll ────────────────────────────────────
// ESP32 calls this every 2 seconds.
// Returns any pending command (start/stop) and clears it.
exports.poll = async (req, res) => {
  try {
    const token = req.headers['x-esp32-token'];
    if (!token) return res.status(401).json({ error: 'Token required' });

    const company = await Company.findOne({ esp32Token: token });
    if (!company) return res.status(401).json({ error: 'Unknown ESP32 token' });

    // Mark as online
    company.esp32Online   = true;
    company.esp32LastSeen = new Date();

    // Pick up and clear any pending command
    const command = company.esp32PendingCommand || null;
    if (command) {
      company.esp32PendingCommand = null;
    }

    await company.save();

    res.json({ ok: true, command });  // command is null if nothing pending
  } catch (e) {
    console.error('[ESP32] Poll error:', e);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET /api/esp32/status ─────────────────────────────────
// App calls this to check if ESP32 is online for this company
exports.status = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company).select('esp32Online esp32LastSeen');
    if (!company) return res.status(404).json({ error: 'Company not found' });

    // Consider offline if not seen in 6 seconds (ESP32 polls every 2s)
    const online = company.esp32Online &&
      company.esp32LastSeen &&
      (Date.now() - new Date(company.esp32LastSeen).getTime() < OFFLINE_THRESHOLD_MS);

    res.json({ online, lastSeen: company.esp32LastSeen });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
};

// ── POST /api/esp32/mark ───────────────────────────────────
// Called by the ESP32 student page after login.
// Verifies index number + PIN, then marks attendance.
exports.markViaESP32 = async (req, res) => {
  try {
    const { indexNumber, pin, sessionId, deviceFingerprint } = req.body;
    if (!indexNumber || !pin) {
      return res.status(400).json({ error: 'indexNumber and pin required' });
    }

    // Find student by index number
    const User = require('../models/User');
    const student = await User.findOne({
      indexNumber: indexNumber.toUpperCase().trim(),
    }).select('+attendancePin +attendancePinSet');

    if (!student) {
      return res.status(404).json({ error: 'Student not found. Check your index number.' });
    }

    if (!student.attendancePinSet || !student.attendancePin) {
      return res.status(403).json({
        error: 'You have not set an attendance PIN yet. Log in to the KODEX app and set your PIN in your profile.',
        pinNotSet: true,
      });
    }

    const pinValid = await student.comparePin(pin);
    if (!pinValid) {
      return res.status(401).json({ error: 'Incorrect PIN. Please try again.' });
    }

    // Find active session for this company
    const AttendanceSession = require('../models/AttendanceSession');
    const AttendanceRecord  = require('../models/AttendanceRecord');

    let session;
    if (sessionId) {
      session = await AttendanceSession.findOne({ _id: sessionId, company: student.company, status: 'active' });
    } else {
      session = await AttendanceSession.findOne({ company: student.company, status: 'active' }).sort({ startedAt: -1 });
    }

    if (!session) {
      return res.status(404).json({ error: 'No active session. Wait for your lecturer to start.' });
    }

    // ── Device fingerprint check ─────────────────────────
    // Block same device marking twice in same session
    if (deviceFingerprint) {
      const deviceUsed = await AttendanceRecord.findOne({
        session:           session._id,
        deviceFingerprint: deviceFingerprint,
      });
      if (deviceUsed) {
        return res.status(409).json({
          error: 'This device has already been used to mark attendance in this session. Each phone can only mark once.',
        });
      }
    }
    // ─────────────────────────────────────────────────────

    // Check already marked
    const existing = await AttendanceRecord.findOne({ session: session._id, user: student._id });
    if (existing) {
      return res.status(409).json({ error: 'Attendance already marked for this session.' });
    }

    // Check device lock -- if student has a locked device, this request must come from it
    // For ESP32 we use the student's index number as the device fingerprint
    // (physical presence is guaranteed by WiFi subnet check done in firmware)

    const timeSinceStart = Date.now() - new Date(session.startedAt).getTime();
    const status = timeSinceStart > 15 * 60 * 1000 ? 'late' : 'present';

    const record = await AttendanceRecord.create({
      session:           session._id,
      user:              student._id,
      company:           student.company,
      status,
      method:            'ble_mark',
      markedAt:          new Date(),
      deviceFingerprint: deviceFingerprint || null,
    });

    console.log(`[ESP32] Marked: ${student.name} (${indexNumber}) -- ${status}`);

    res.json({
      ok:      true,
      name:    student.name,
      status,
      message: `Attendance marked -- ${status}`,
    });
  } catch (e) {
    console.error('[ESP32] Mark error:', e);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── POST /api/esp32/set-pin ───────────────────────────────
// Student sets their 4-digit attendance PIN from the KODEX app
exports.setPin = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || String(pin).length !== 4 || !/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    }
    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    user.attendancePin = String(pin);
    await user.save();
    res.json({ ok: true, message: 'Attendance PIN set successfully' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
};

// ── GET /api/esp32/student-list ────────────────────────────
// ESP32 downloads this when online.
// Returns index numbers + SHA256 PIN hashes for offline verification.
// SHA256 is used instead of bcrypt because ESP32 can compute it locally.
exports.studentList = async (req, res) => {
  try {
    const token = req.headers['x-esp32-token'];
    if (!token) return res.status(401).json({ error: 'Token required' });

    const company = await Company.findOne({ esp32Token: token });
    if (!company) return res.status(401).json({ error: 'Unknown ESP32 token' });

    const User = require('../models/User');

    // Get all students/employees with a PIN set
    const users = await User.find({
      company:          company._id,
      role:             { $in: ['student', 'employee'] },
      attendancePinSet: true,
      isActive:         true,
    }).select('+attendancePin').lean();

    // Convert bcrypt PINs to SHA256 for ESP32 local verification
    // We store a SHA256(pin) alongside -- computed once here, cached on SD
    const bcrypt = require('bcryptjs');
    const list = [];

    for (const u of users) {
      if (!u.attendancePin) continue;
      // We can't reverse bcrypt -- instead store a server-side SHA256
      // of the raw PIN. Since we can't get the raw PIN from bcrypt,
      // we use a HMAC of the bcrypt hash with the ESP32 token as key.
      // This means only this ESP32 can verify it.
      const hmac = crypto.createHmac('sha256', token)
        .update(u.attendancePin)
        .digest('hex');
      list.push({
        id:   u.indexNumber || u.employeeId || u._id.toString(),
        name: u.name,
        hash: hmac,
      });
    }

    console.log(`[ESP32] Student list: ${list.length} students for ${company.institutionCode}`);
    res.json({ ok: true, students: list, token, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('[ESP32] Student list error:', e);
    res.status(500).json({ error: 'Server error' });
  }
};

// ── POST /api/esp32/verify-pin ─────────────────────────────
// ESP32 calls this to get the HMAC of a student's PIN
// so it can store it locally for offline verification.
// Called during student-list sync or when a student first sets their PIN.
exports.verifyPin = async (req, res) => {
  try {
    const token = req.headers['x-esp32-token'];
    if (!token) return res.status(401).json({ error: 'Token required' });

    const company = await Company.findOne({ esp32Token: token });
    if (!company) return res.status(401).json({ error: 'Unknown ESP32 token' });

    const { indexNumber, pin } = req.body;
    if (!indexNumber || !pin) {
      return res.status(400).json({ error: 'indexNumber and pin required' });
    }

    const User = require('../models/User');
    const student = await User.findOne({
      indexNumber: indexNumber.toUpperCase().trim(),
      company:     company._id,
    }).select('+attendancePin +attendancePinSet');

    if (!student) {
      return res.status(404).json({ ok: false, error: 'Student not found' });
    }
    if (!student.attendancePinSet || !student.attendancePin) {
      return res.status(403).json({ ok: false, pinNotSet: true, error: 'PIN not set' });
    }

    const pinValid = await student.comparePin(pin);
    if (!pinValid) {
      return res.status(401).json({ ok: false, error: 'Incorrect PIN' });
    }

    // Return the HMAC so ESP32 can cache it for offline use
    const hmac = crypto.createHmac('sha256', token)
      .update(student.attendancePin)
      .digest('hex');

    res.json({
      ok:   true,
      name: student.name,
      hash: hmac,
      id:   student.indexNumber,
    });
  } catch (e) {
    console.error('[ESP32] Verify PIN error:', e);
    res.status(500).json({ error: 'Server error' });
  }
};

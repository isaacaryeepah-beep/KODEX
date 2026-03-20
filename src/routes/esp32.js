/**
 * esp32.js — Routes for the KODEX ESP32 attendance device
 *
 * The ESP32 device:
 *   1. Polls this API for the active session & current QR code to display
 *   2. Scans a QR code from a student/employee's phone camera
 *   3. Posts the scanned code here to mark attendance
 *   4. Syncs offline records when reconnected (via /api/attendance-sessions/esp32-sync)
 *
 * Authentication: all ESP32 endpoints use the x-esp32-secret header
 * (set ESP32_SECRET in your .env file)
 */

const express           = require("express");
const router            = express.Router();
const QrToken           = require("../models/QrToken");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord  = require("../models/AttendanceRecord");
const User              = require("../models/User");
const Company           = require("../models/Company");

// ── Auth middleware ───────────────────────────────────────────────────────────
function esp32Auth(req, res, next) {
  const secret = req.headers["x-esp32-secret"];
  if (!secret || secret !== process.env.ESP32_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── POST /api/esp32/ping ──────────────────────────────────────────────────────
// Device health-check / clock sync
// Body: { institutionCode, deviceId, firmwareVersion }
router.post("/ping", esp32Auth, async (req, res) => {
  const { institutionCode, deviceId, firmwareVersion } = req.body;

  const company = institutionCode
    ? await Company.findOne({ institutionCode: institutionCode.toUpperCase() }).select("name institutionCode")
    : null;

  res.json({
    ok: true,
    serverTime: new Date().toISOString(),
    company: company ? { name: company.name, code: company.institutionCode } : null,
    deviceId: deviceId || null,
    firmwareVersion: firmwareVersion || null,
  });
});

// ── GET /api/esp32/session ─────────────────────────────────────────────────────
// Returns the active session + current rotating QR code for the institution
// Query: ?institutionCode=ABC123
router.get("/session", esp32Auth, async (req, res) => {
  try {
    const { institutionCode } = req.query;
    if (!institutionCode) {
      return res.status(400).json({ error: "institutionCode is required" });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) {
      return res.status(404).json({ error: "Institution not found" });
    }

    // Get the active session
    const session = await AttendanceSession.findOne({
      company: company._id,
      status: "active",
    })
      .populate("createdBy", "name")
      .populate("course", "title code level group")
      .sort({ startedAt: -1 });

    if (!session) {
      return res.json({ session: null, qrCode: null, attendeeCount: 0 });
    }

    // Get the most recent valid QR token for this session
    const qrToken = await QrToken.findOne({
      session: session._id,
      expiresAt: { $gt: new Date() },
      codeType: "qr",
    }).sort({ createdAt: -1 });

    // Attendee count
    const attendeeCount = await AttendanceRecord.countDocuments({
      session: session._id,
    });

    res.json({
      session: {
        id: session._id,
        title: session.title || "Attendance Session",
        startedAt: session.startedAt,
        createdBy: session.createdBy?.name || "Lecturer",
        course: session.course
          ? {
              title: session.course.title,
              code: session.course.code,
              level: session.course.level,
              group: session.course.group,
            }
          : null,
      },
      qrCode: qrToken
        ? {
            code: qrToken.code,
            token: qrToken.token,
            expiresAt: qrToken.expiresAt,
            expiresInSeconds: Math.max(
              0,
              Math.round((new Date(qrToken.expiresAt) - Date.now()) / 1000)
            ),
          }
        : null,
      attendeeCount,
    });
  } catch (err) {
    console.error("[ESP32 /session]", err);
    res.status(500).json({ error: "Failed to fetch session" });
  }
});

// ── POST /api/esp32/scan ───────────────────────────────────────────────────────
// ESP32 posts the QR code it scanned from a student/employee's phone
// Body: { institutionCode, scannedCode, deviceId }
//
// The scanned code is the `token` (full hex string embedded in the QR) OR
// the short `code` (4-char verbal code).
router.post("/scan", esp32Auth, async (req, res) => {
  try {
    const { institutionCode, scannedCode, deviceId } = req.body;

    if (!institutionCode || !scannedCode) {
      return res.status(400).json({ error: "institutionCode and scannedCode are required" });
    }

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) return res.status(404).json({ error: "Institution not found" });

    // Find QR token — try token first (full hex), then short code
    const now = new Date();
    let qrToken = await QrToken.findOne({
      token: scannedCode,
      company: company._id,
      expiresAt: { $gt: now },
    }).populate("session");

    if (!qrToken && scannedCode.length <= 6) {
      // Try short code lookup against active session
      const activeSession = await AttendanceSession.findOne({
        company: company._id,
        status: "active",
      }).sort({ startedAt: -1 });

      if (activeSession) {
        qrToken = await QrToken.findOne({
          code: scannedCode.toUpperCase(),
          session: activeSession._id,
          expiresAt: { $gt: now },
        }).populate("session");
      }
    }

    if (!qrToken) {
      return res.status(410).json({
        ok: false,
        result: "expired",
        message: "QR code expired or not found. Ask for a fresh code.",
      });
    }

    const session = qrToken.session;
    if (!session || session.status !== "active") {
      return res.status(400).json({
        ok: false,
        result: "session_inactive",
        message: "Session is no longer active.",
      });
    }

    // ── Determine who scanned ────────────────────────────────────────────────
    // For the ESP32, we can't identify the student from the QR alone —
    // the QR is a session token, not a user token. The attendance is marked
    // when the student's phone hits /api/qr-tokens/validate after scanning.
    //
    // The ESP32 scan endpoint is for DISPLAY CONFIRMATION only:
    // it tells the device "valid QR — session is active, X people marked in".
    const attendeeCount = await AttendanceRecord.countDocuments({ session: session._id });

    res.json({
      ok: true,
      result: "valid",
      message: "Valid QR — session is active",
      session: {
        id: session._id,
        title: session.title || "Attendance Session",
        attendeeCount,
      },
      expiresInSeconds: Math.max(
        0,
        Math.round((new Date(qrToken.expiresAt) - Date.now()) / 1000)
      ),
    });
  } catch (err) {
    console.error("[ESP32 /scan]", err);
    res.status(500).json({ error: "Scan failed: " + err.message });
  }
});

// ── GET /api/esp32/qr ─────────────────────────────────────────────────────────
// Returns just the current QR token data for the display
// Used to auto-refresh the on-screen QR code every 15 seconds
// Query: ?institutionCode=ABC123&sessionId=<id>
router.get("/qr", esp32Auth, async (req, res) => {
  try {
    const { institutionCode, sessionId } = req.query;
    if (!institutionCode) return res.status(400).json({ error: "institutionCode required" });

    const company = await Company.findOne({ institutionCode: institutionCode.toUpperCase() });
    if (!company) return res.status(404).json({ error: "Institution not found" });

    const sessionFilter = { company: company._id, status: "active" };
    if (sessionId) sessionFilter._id = sessionId;

    const session = await AttendanceSession.findOne(sessionFilter).sort({ startedAt: -1 });
    if (!session) return res.json({ qrCode: null });

    const qrToken = await QrToken.findOne({
      session: session._id,
      expiresAt: { $gt: new Date() },
      codeType: "qr",
    }).sort({ createdAt: -1 });

    if (!qrToken) return res.json({ qrCode: null, sessionId: session._id });

    res.json({
      qrCode: {
        code: qrToken.code,
        token: qrToken.token,
        expiresAt: qrToken.expiresAt,
        expiresInSeconds: Math.max(
          0,
          Math.round((new Date(qrToken.expiresAt) - Date.now()) / 1000)
        ),
      },
      sessionId: session._id,
      attendeeCount: await AttendanceRecord.countDocuments({ session: session._id }),
    });
  } catch (err) {
    console.error("[ESP32 /qr]", err);
    res.status(500).json({ error: "Failed to fetch QR" });
  }
});

module.exports = router;

const mongoose = require("mongoose");
const crypto = require("crypto");
const User = require("../models/User");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord = require("../models/AttendanceRecord");
const QrToken = require("../models/QrToken");
const Company = require("../models/Company");
const Device  = require("../models/Device");

// Heartbeat freshness windows.
const DEVICE_ONLINE_WINDOW_MS = 20_000;   // session start gate
const DEVICE_MARK_WINDOW_MS   = 15_000;   // mark-attendance gate

// Finds the device that should handle a session for the given user + course.
// Priority:
//   1. Device assigned to the group enrolled in this course (new group model)
//   2. Any online company device (fallback for admins or unassigned devices)
async function _resolveSessionDevice(user, courseId, explicitDeviceId) {
  const companyId = user.company;

  // If the caller explicitly picked a device, use it directly
  if (explicitDeviceId) {
    return Device.findOne({ deviceId: explicitDeviceId, companyId });
  }

  // Try to find the device assigned to the group for this course
  if (courseId) {
    const StudentCourseEnrollment = require('../models/StudentCourseEnrollment');
    // Sample one active enrollment to get the group snapshot
    const enrollment = await StudentCourseEnrollment.findOne({
      course:  courseId,
      company: companyId,
      status:  'active',
    }).lean();

    if (enrollment?.academicSnapshot?.group && enrollment?.academicSnapshot?.level) {
      const grouped = await Device.findOne({
        companyId,
        assignedGroup: enrollment.academicSnapshot.group,
        assignedLevel: String(enrollment.academicSnapshot.level),
      });
      if (grouped) return grouped;
    }
  }

  // Fallback — return freshest device in the company
  return Device.findOne({ companyId }).sort({ lastHeartbeat: -1 });
}

function _deviceFreshness(device, windowMs = DEVICE_ONLINE_WINDOW_MS) {
  if (!device || !device.lastHeartbeat) {
    return { online: false, secondsAgo: null, lastSeenAt: null };
  }
  const ms = Date.now() - new Date(device.lastHeartbeat).getTime();
  return {
    online:     ms <= windowMs,
    secondsAgo: Math.round(ms / 1000),
    lastSeenAt: device.lastHeartbeat,
  };
}

exports.startSession = async (req, res) => {
  try {
    const companyId = req.user.company;

    const company = await Company.findById(companyId);
    if (!company || !company.isActive) {
      return res.status(404).json({ error: "Company not found or inactive" });
    }

    // ── STRICT device check — always enforced, no bypass ──
    // The lecturer's paired ESP32 must be powered on and actively sending
    // heartbeats before any attendance session can start. The Device model
    // is the single source of truth — there is no "company-level" device.
    const device  = await _resolveSessionDevice(req.user, req.body.courseId, req.body.deviceId || null);
    const freshness = _deviceFreshness(device, DEVICE_ONLINE_WINDOW_MS);

    console.log(`[SESSION START] company=${company.name} deviceRegistered=${!!device} deviceOnline=${freshness.online} secondsAgo=${freshness.secondsAgo}`);

    if (!device) {
      return res.status(503).json({
        error: "ESP32 device not paired",
        message: req.user.role === 'lecturer'
          ? "You haven't paired a classroom device yet. Open the Attendance Device page, generate a pairing code, and enter it on your ESP32."
          : "No classroom device is paired for this institution. A lecturer must pair an ESP32 from the Attendance Device page.",
        deviceStatus: { online: false, registered: false },
      });
    }

    if (!freshness.online) {
      const lastSeenMsg = freshness.lastSeenAt
        ? `Last seen ${freshness.secondsAgo}s ago.`
        : "Device has never sent a heartbeat.";
      return res.status(503).json({
        error: "ESP32 device is offline",
        message: `The DIKLY classroom device is not responding. ${lastSeenMsg} Power it on and wait a few seconds, then try again.`,
        deviceStatus: {
          online:      false,
          registered:  true,
          deviceId:    device.deviceId,
          lastSeenAt:  freshness.lastSeenAt,
          secondsAgo:  freshness.secondsAgo,
        },
      });
    }

    console.log(`[SESSION START] ✓ Device ${device.deviceId} online (${freshness.secondsAgo}s ago) — allowing start for ${company.name}`);
    // ── End device check ──────────────────────────────────

    const activeFilter = { company: companyId, status: "active" };
    if (req.user.role === "lecturer") {
      activeFilter.createdBy = req.user._id;
    }

    const existingActive = await AttendanceSession.findOne(activeFilter);

    if (existingActive) {
      return res.status(409).json({
        error: "You already have an active session running",
        session: existingActive,
      });
    }

    // Course is required — every session must belong to a course
    // This is what prevents cross-course session visibility
    if (!req.body.courseId) {
      return res.status(400).json({ error: "Please select a course to start attendance for" });
    }

    const Course = require("../models/Course");
    const CourseLecturerAssignment = require('../models/CourseLecturerAssignment');

    const course = await Course.findOne({ _id: req.body.courseId, companyId });
    if (!course) {
      return res.status(400).json({ error: "Course not found." });
    }

    // Authorization check for lecturers:
    // Accept if (a) they are the course's legacy primary lecturer, OR
    // (b) they have an active CourseLecturerAssignment for this course.
    // HOD, admin, superadmin bypass this check.
    if (req.user.role === 'lecturer') {
      const isLegacyOwner = course.lecturerId?.toString() === req.user._id.toString();
      const assignment = isLegacyOwner
        ? true
        : await CourseLecturerAssignment.findActiveAssignment(companyId, course._id, req.user._id);
      if (!assignment) {
        return res.status(403).json({
          error: "You are not assigned to teach this course.",
          message: "Ask your admin or HOD to assign you to this course via the Course Management page.",
        });
      }
    }

    // Block sessions on unapproved courses
    if (course.needsApproval && course.approvalStatus !== "approved") {
      const label = course.approvalStatus === "pending" ? "pending HOD approval" : "rejected";
      return res.status(403).json({
        error: `This course is ${label} and cannot have active sessions until it is approved.`,
      });
    }

    const courseRef = course._id;

    // ── Shared-device course mismatch warning ────────────────────────────
    // If the class rep connected this device for a specific course but the
    // lecturer started a session for a different course, include a warning
    // in the response (soft — session still starts).
    let courseWarning = null;
    if (device.ownershipType === 'shared' && device.activeCourseId) {
      const repCourseId = device.activeCourseId.toString();
      const sessionCourseId = courseRef.toString();
      if (repCourseId !== sessionCourseId) {
        const RepCourse = require('../models/Course');
        const repCourse = await RepCourse.findById(device.activeCourseId).select('title code').lean();
        courseWarning = repCourse
          ? `Note: the class rep connected this device for ${repCourse.code} – ${repCourse.title}, but you started a session for ${course.code} – ${course.title}. If this is wrong, stop the session, ask the class rep to reconnect for the correct course, and try again.`
          : 'Note: the course selected by the class rep does not match the course you started attendance for.';
      }
    }
    // ────────────────────────────────────────────────────────────────────

    // ── Per-session secret seed ───────────────────────────────────────────
    // The seed is what makes the rotating 6-digit code unguessable. It is
    // never sent to students — only to the paired ESP32 (via /api/devices/
    // heartbeat) and held server-side for code verification.
    const SEED     = crypto.randomBytes(24).toString("hex");
    const DURATION = Number(req.body.durationSeconds) || 300; // 5 min default

    const sessionData = {
      company: companyId,
      createdBy: req.user._id,
      title: req.body.title || "",
      course: courseRef,
      deviceId: device.deviceId,
      esp32Seed: SEED,
      durationSeconds: DURATION,
      status: "active",
      startedAt: new Date(),
    };

    if (company.qrSeed)        sessionData.qrSeed        = company.qrSeed;
    if (company.bleLocationId) sessionData.bleLocationId = company.bleLocationId;

    const session = await AttendanceSession.create(sessionData);

    const populated = await session.populate([
      { path: "company", select: "name" },
      { path: "createdBy", select: "name email" },
      { path: "course", select: "title code" },
    ]);

    res.status(201).json({ session: populated, ...(courseWarning && { warning: courseWarning }) });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    console.error("Start session error:", error);
    res.status(500).json({ error: "Failed to start attendance session" });
  }
};

exports.stopSession = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid session ID" });
    }

    const stopFilter = { _id: id, ...req.companyFilter };
    if (req.user.role === "lecturer") {
      stopFilter.createdBy = req.user._id;
    }

    const session = await AttendanceSession.findOne(stopFilter);

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (session.status === "stopped") {
      return res.status(400).json({ error: "Session is already stopped" });
    }

    session.status = "stopped";
    session.stoppedAt = new Date();
    session.stoppedBy = req.user._id;
    session.stoppedReason = "manual";
    await session.save();

    // Auto-release shared device when session stops so the class rep doesn't
    // have to manually disconnect after the lecturer ends attendance.
    await Device.findOneAndUpdate(
      { deviceId: session.deviceId, ownershipType: 'shared', companyId: session.company },
      { $set: { activeLecturerId: null, activeCourseId: null, connectedAt: null } }
    );

    // No explicit ESP32 stop command needed. The device polls
    // /api/devices/heartbeat every few seconds; once `activeSession` returns
    // null (because status flipped to stopped), the firmware clears the OLED
    // automatically.

    const populated = await session.populate([
      { path: "company", select: "name" },
      { path: "createdBy", select: "name email" },
      { path: "stoppedBy", select: "name email" },
    ]);

    res.json({ session: populated });
  } catch (error) {
    console.error("Stop session error:", error);
    res.status(500).json({ error: "Failed to stop attendance session" });
  }
};

exports.listSessions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20, courseId } = req.query;
    const filter = { ...req.companyFilter };

    if (req.user.role === "lecturer") {
      filter.createdBy = req.user._id;
    }

    // HOD sees only sessions from lecturers in their department
    if (req.user.role === "hod" && req.user.department) {
      const User = require("../models/User");
      const deptLecturers = await User.find(
        { company: req.user.company, role: "lecturer", department: req.user.department },
        "_id"
      ).lean();
      filter.createdBy = { $in: deptLecturers.map(u => u._id) };
    }

    // Students only see sessions for their enrolled courses.
    // If a courseId is also provided, honour it only when the student is enrolled in it.
    if (req.user.role === "student") {
      const Course = require("../models/Course");
      const enrolledCourses = await Course.find({
        companyId: req.user.company,
        enrolledStudents: req.user._id,
      }).select("_id").lean();
      const enrolledIds = enrolledCourses.map(c => c._id);

      if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
        const isEnrolled = enrolledIds.some(id => id.toString() === courseId);
        if (!isEnrolled) {
          return res.status(403).json({ error: "You are not enrolled in that course" });
        }
        filter.course = courseId;
      } else {
        filter.course = { $in: enrolledIds };
      }
    } else if (courseId && mongoose.Types.ObjectId.isValid(courseId)) {
      // Non-student role: apply course filter directly
      filter.course = courseId;
    }

    const allStatuses = ["scheduled", "active", "live", "paused", "locked", "stopped", "ended", "device_disconnected"];
    if (status && allStatuses.includes(status)) {
      filter.status = status;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [sessions, total] = await Promise.all([
      AttendanceSession.find(filter)
        .sort({ startedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("company", "name")
        .populate("createdBy", "name email")
        .populate("stoppedBy", "name email")
        .populate("course", "title code"),
      AttendanceSession.countDocuments(filter),
    ]);

    res.json({
      sessions,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("List sessions error:", error);
    res.status(500).json({ error: "Failed to fetch attendance sessions" });
  }
};

exports.getActiveSession = async (req, res) => {
  try {
    // Include all states where a session is "open" (legacy "active" + dashboard states)
    const activeFilter = { ...req.companyFilter, status: { $in: ["active", "live", "paused", "locked"] } };
    if (req.user.role === "lecturer") {
      activeFilter.createdBy = req.user._id;
    }

    // Students only see sessions for courses they are enrolled in.
    if (req.user.role === "student") {
      const Course = require("../models/Course");
      const enrolledCourses = await Course.find({
        companyId: req.user.company,
        enrolledStudents: req.user._id,
      }).select("_id").lean();
      activeFilter.course = { $in: enrolledCourses.map(c => c._id) };
    }

    const session = await AttendanceSession.findOne(activeFilter)
      .populate("company", "name")
      .populate("createdBy", "name email")
      .populate("course", "title code");

    // Include device localIp so the app can reach the ESP32 on the same network
    let deviceLocalIp = null;
    if (session && session.deviceId) {
      const sessionDevice = await Device.findOne({ deviceId: session.deviceId, companyId: req.user.company }).select('localIp').lean();
      deviceLocalIp = sessionDevice?.localIp || null;
    }
    res.json({ session: session || null, deviceLocalIp });
  } catch (error) {
    console.error("Active session error:", error);
    res.status(500).json({ error: "Failed to fetch active session" });
  }
};

exports.getSession = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid session ID" });
    }

    const getFilter = { _id: id, ...req.companyFilter };
    if (req.user.role === "lecturer") {
      getFilter.createdBy = req.user._id;
    }

    const session = await AttendanceSession.findOne(getFilter)
      .populate("company", "name")
      .populate("createdBy", "name email")
      .populate("stoppedBy", "name email")
      .populate("course", "title code");

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const records = await AttendanceRecord.find({ session: id })
      .populate("user", "name email indexNumber role")
      .sort({ checkInTime: 1 });

    res.json({ session, records });
  } catch (error) {
    console.error("Get session error:", error);
    res.status(500).json({ error: "Failed to fetch attendance session" });
  }
};

// GET /api/attendance-sessions/:id/current-code
// Returns the current rotating 6-digit code for a session. Used by the
// lecturer dashboard to verify what the ESP32 OLED should be showing, and
// to double-check the ESP32 firmware is in sync with the server. Students
// should NOT call this endpoint (they must read the code off the OLED).
exports.getCurrentCode = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid session ID" });
    }

    // Only the creator of the session (or admin/superadmin) can view the code.
    // Students must be blocked at the route layer.
    const filter = { _id: id, ...req.companyFilter };
    if (req.user.role === "lecturer") filter.createdBy = req.user._id;

    const session = await AttendanceSession.findOne(filter)
      .select("esp32Seed status startedAt durationSeconds")
      .lean();
    if (!session) return res.status(404).json({ error: "Session not found" });

    if (session.status !== "active") {
      return res.status(400).json({ error: "Session is not active." });
    }
    if (!session.esp32Seed) {
      return res.status(400).json({
        error: "This session has no rotating code configured. Start it from the ESP32 classroom device.",
      });
    }

    const { currentCodeForSession } = require("../services/attendanceCodeService");
    const codeInfo = currentCodeForSession(session);
    return res.json({
      sessionId: id,
      ...codeInfo,
    });
  } catch (error) {
    console.error("Get current code error:", error);
    res.status(500).json({ error: "Failed to get current code" });
  }
};


exports.getSessionRecords = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid session ID" });
    }

    const sessionFilter = { _id: id, ...req.companyFilter };
    if (req.user.role === "lecturer") sessionFilter.createdBy = req.user._id;

    const session = await AttendanceSession.findOne(sessionFilter);
    if (!session) return res.status(404).json({ error: "Session not found" });

    const records = await AttendanceRecord.find({ session: id })
      .populate("user", "name email indexNumber role")
      .sort({ checkInTime: 1 });

    // Normalize: expose as 'student' field for frontend compatibility
    const normalized = records.map(r => ({
      ...r.toObject(),
      student: r.user || null,
    }));

    res.json({ session, records: normalized });
  } catch (error) {
    console.error("Get session records error:", error);
    res.status(500).json({ error: "Failed to fetch attendance records" });
  }
};
exports.markAttendance = async (req, res) => {
  try {
    const { sessionId, qrToken, code, method, meetingId } = req.body;
    const clientDeviceId = req.body.deviceId || req.headers["x-device-id"] || null;

    const methodMap = {
      qr:             "qr_mark",
      manual:         "manual",
      code:           "code_mark",
      ble:            "ble_mark",
      esp32_hotspot:  "esp32_ap",
    };

    // ── ESP32 liveness + same-network enforcement ─────────────────────────
    // The session that the student is marking against is bound to a specific
    // ESP32 (session.deviceId set at startSession time). For attendance to be
    // accepted:
    //   1. The ESP32 must be sending heartbeats (within 15s).
    //   2. The student's public IP must match one of the IPs the ESP32 has
    //      reached the server from in the last 10 min. Both phones and the
    //      ESP32 share the school's router NAT IP — a mismatch means the
    //      student is on a different network (mobile data / off-campus).
    //
    // We resolve enforcement once we have the active session below — see the
    // `enforceDeviceProximity` block.
    // ─────────────────────────────────────────────────────────────────────────

    // sessionId is optional — auto-detect the active session if not supplied
    let session;
    let resolvedSessionId = sessionId;

    if (resolvedSessionId && mongoose.Types.ObjectId.isValid(resolvedSessionId)) {
      session = await AttendanceSession.findOne({
        _id: resolvedSessionId,
        company: req.user.company,
        status: "active",
      });
    } else {
      // Auto-detect: find the most recent active session for courses the student is enrolled in.
      const Course = require('../models/Course');
      const enrolledCourses = await Course.find({
        companyId: req.user.company,
        enrolledStudents: req.user._id,
      }).select("_id").lean();
      const enrolledCourseIds = enrolledCourses.map(c => c._id);

      session = await AttendanceSession.findOne({
        company: req.user.company,
        status: "active",
        course: { $in: enrolledCourseIds },
      }).sort({ startedAt: -1 });
      if (session) {
        resolvedSessionId = session._id.toString();
      }
    }

    if (!session) {
      return res.status(404).json({ error: "No active session found. The manager needs to start a session first." });
    }

    // ── Strict device proximity enforcement ──────────────────────────────────
    // Physical presence is required. All three conditions must pass:
    //   1. Session must be bound to a paired device (set at startSession).
    //   2. That device must be online (heartbeat within 15 s).
    //   3. Student's IP must exactly match one of the IPs the ESP32 has
    //      reached the server from in the last 10 minutes.
    // No exceptions — empty deviceIps means the device hasn't reported yet,
    // which is also a hard block.
    if (!session.deviceId) {
      return res.status(403).json({
        error: 'This session has no classroom device. Ask your lecturer to start a new session from a paired device.',
        esp32Required: true,
      });
    }

    const sessionDevice = await Device.findOne({ deviceId: session.deviceId, companyId: req.user.company });

    if (!sessionDevice) {
      return res.status(503).json({
        error: 'The classroom device for this session is no longer paired.',
        esp32Required: true,
      });
    }

    const fresh = _deviceFreshness(sessionDevice, DEVICE_MARK_WINDOW_MS);
    if (!fresh.online) {
      return res.status(503).json({
        error: 'The classroom device is offline. Ask your lecturer to power it on.',
        esp32Required: true,
        esp32Offline: true,
        secondsAgo:    fresh.secondsAgo,
      });
    }

    // ── Proximity proof — three paths, highest-trust first ────────────────────
    //
    //  1. BLE token   — student was within BLE range (device broadcasts slot HMAC).
    //                   No verbal code required; BLE proximity IS the proof.
    //  2. Hotspot token — student connected to device AP and got a signed token.
    //                   Verbal code still required as second factor.
    //  3. IP match    — legacy same-network check (backward compat only).
    //                   Verbal code still required.
    //
    // Only one path runs. First match wins.
    // ─────────────────────────────────────────────────────────────────────────
    const bleToken        = req.body.bleToken;
    const connectionToken = req.body.connectionToken;

    let skipCodeCheck = false;

    if (bleToken && typeof bleToken === 'object') {
      // ── BLE + hotspot path (maximum strictness) ──────────────────────────────
      // Both proofs are required together:
      //   Factor 1 — BLE token   : proves student was within Bluetooth range (~10 m)
      //   Factor 2 — Hotspot token: proves student connected to device AP (student-specific)
      //
      // Combining them closes the relay attack: forwarding the BLE slot+HMAC is
      // useless without a hotspot token, and the hotspot token is bound to the
      // student's own ID so it cannot be shared without giving away credentials.

      if (!connectionToken || typeof connectionToken !== 'object') {
        return res.status(400).json({
          error: 'BLE attendance requires connecting to the classroom hotspot first. Connect to the Dikly hotspot, then try again.',
          hotspotRequired: true,
        });
      }

      if (!session.esp32Seed) {
        return res.status(403).json({ error: 'Session has no device seed for BLE verification.' });
      }

      // ── Factor 1: BLE slot HMAC ──────────────────────────────────────────────
      const slotNum = parseInt(bleToken.slot, 10);
      if (isNaN(slotNum) || slotNum < 0) {
        return res.status(400).json({ error: 'Invalid BLE token: missing or bad slot.' });
      }

      // Allow current slot + 1 previous (≤ 60 s grace for network latency)
      const currentSlot = Math.floor(Date.now() / 30000);
      if (Math.abs(currentSlot - slotNum) > 1) {
        return res.status(403).json({
          error: 'BLE token expired. Move closer to the classroom device and try again.',
          bleTokenExpired: true,
        });
      }

      const expectedBleHmac = crypto
        .createHmac('sha256', session.esp32Seed)
        .update(`ble:${slotNum}`)
        .digest('hex')
        .slice(0, 16);

      const bleHmacClean = String(bleToken.hmac || '').toLowerCase().replace(/[^0-9a-f]/g, '');
      if (bleHmacClean.length !== 16 ||
          !crypto.timingSafeEqual(Buffer.from(bleHmacClean), Buffer.from(expectedBleHmac))) {
        console.warn(`[MARK] Invalid BLE hmac from ${req.user.name}`);
        return res.status(403).json({
          error: 'Invalid BLE token. Make sure you are within range of the classroom device.',
          networkMismatch: true,
        });
      }

      // ── Factor 2: hotspot connection token (student-specific) ────────────────
      const { sessionId: tokenSession, studentId: tokenStudent, issuedAt, sig } = connectionToken;

      const tokenAgeMs = Date.now() - (Number(issuedAt) * 1000);
      if (!issuedAt || tokenAgeMs < 0 || tokenAgeMs > 10 * 60 * 1000) {
        return res.status(403).json({
          error: 'Hotspot token expired. Reconnect to the classroom hotspot and try again.',
          tokenExpired: true,
        });
      }

      if (String(tokenStudent) !== req.user._id.toString()) {
        return res.status(403).json({
          error: 'Hotspot token was issued for a different account.',
          networkMismatch: true,
        });
      }

      if (String(tokenSession) !== resolvedSessionId) {
        return res.status(403).json({
          error: 'Hotspot token is for a different session.',
          networkMismatch: true,
        });
      }

      const expectedConnSig = crypto
        .createHmac('sha256', session.esp32Seed)
        .update(`conn:${tokenSession}:${tokenStudent}:${issuedAt}`)
        .digest('hex')
        .slice(0, 32);

      const connSigClean = String(sig || '').toLowerCase().replace(/[^0-9a-f]/g, '');
      if (connSigClean.length !== 32 ||
          !crypto.timingSafeEqual(Buffer.from(connSigClean), Buffer.from(expectedConnSig))) {
        console.warn(`[MARK] Invalid hotspot sig (BLE+hotspot path) for ${req.user.name}`);
        return res.status(403).json({
          error: 'Invalid hotspot token. Connect to the classroom hotspot and try again.',
          networkMismatch: true,
        });
      }

      // Both factors verified — no verbal code needed
      skipCodeCheck = true;

    } else if (connectionToken && typeof connectionToken === 'object') {
      // ── Hotspot token path ──────────────────────────────────────────────────
      const { sessionId: tokenSession, studentId: tokenStudent, issuedAt, sig } = connectionToken;

      if (!session.esp32Seed) {
        return res.status(403).json({ error: 'Session has no device seed. Cannot verify hotspot token.' });
      }

      const tokenAgeMs = Date.now() - (Number(issuedAt) * 1000);
      if (!issuedAt || tokenAgeMs < 0 || tokenAgeMs > 10 * 60 * 1000) {
        return res.status(403).json({
          error: 'Hotspot token expired. Reconnect to the classroom hotspot and try again.',
          tokenExpired: true,
        });
      }

      if (String(tokenStudent) !== req.user._id.toString()) {
        return res.status(403).json({
          error: 'Hotspot token was issued for a different account.',
          networkMismatch: true,
        });
      }

      if (String(tokenSession) !== resolvedSessionId) {
        return res.status(403).json({
          error: 'Hotspot token is for a different session.',
          networkMismatch: true,
        });
      }

      const expectedSig = crypto
        .createHmac('sha256', session.esp32Seed)
        .update(`conn:${tokenSession}:${tokenStudent}:${issuedAt}`)
        .digest('hex')
        .slice(0, 32);

      const sigClean = String(sig || '').toLowerCase().replace(/[^0-9a-f]/g, '');
      if (sigClean.length !== 32) {
        return res.status(403).json({
          error: 'Invalid hotspot token. Make sure you are connected to the classroom hotspot.',
          networkMismatch: true,
        });
      }

      if (!crypto.timingSafeEqual(Buffer.from(sigClean), Buffer.from(expectedSig))) {
        console.warn(`[MARK] Invalid hotspot token sig for ${req.user.name}`);
        return res.status(403).json({
          error: 'Invalid hotspot token. Make sure you are connected to the classroom hotspot.',
          networkMismatch: true,
        });
      }

    } else {
      // ── Legacy IP path ──────────────────────────────────────────────────────
      const studentIp = (req.ip || '').replace(/^::ffff:/, '');

      const TEN_MIN_AGO = Date.now() - 10 * 60 * 1000;
      const deviceIps = (sessionDevice.recentPublicIps || [])
        .filter(e => e.seenAt && new Date(e.seenAt).getTime() > TEN_MIN_AGO)
        .map(e => e.ip);

      if (deviceIps.length === 0) {
        return res.status(503).json({
          error: 'The classroom device has not reported its network yet. Wait a few seconds and try again.',
          esp32Required: true,
          networkNotReady: true,
        });
      }

      if (!deviceIps.includes(studentIp)) {
        console.warn(`[MARK] Blocked ${req.user.name}: IP ${studentIp} not in device IPs [${deviceIps.join(', ')}]`);
        return res.status(403).json({
          error: 'You must be connected to the classroom WiFi to mark attendance.',
          networkMismatch: true,
        });
      }
    }

    // Anyone marking against a course-linked session must be enrolled in that course.
    if (session.course) {
      const Course = require('../models/Course');
      const enrolled = await Course.findOne({
        _id: session.course,
        companyId: req.user.company,
        enrolledStudents: req.user._id,
      }).select('_id').lean();

      if (!enrolled) {
        return res.status(403).json({
          error: 'You are not enrolled in this course. This session belongs to a different class.',
        });
      }
    }

    // ── Attendance time window ─────────────────────────────────────────────
    // If the session has a durationSeconds (set when the lecturer starts it),
    // mark-attendance requests after (startedAt + durationSeconds) are rejected.
    // This prevents a session from staying open indefinitely and lets students
    // know the window closed rather than silently accepting late marks.
    if (session.durationSeconds && session.startedAt) {
      const closeAt = new Date(session.startedAt).getTime() + (session.durationSeconds * 1000);
      if (Date.now() > closeAt) {
        return res.status(410).json({
          error: "The attendance window for this session has closed.",
          attendanceWindowClosed: true,
          closedAt: new Date(closeAt).toISOString(),
        });
      }
    }

    // ── Rotating code verification ─────────────────────────────────────────
    // Required for hotspot-token and IP paths. Skipped for BLE — the slot HMAC
    // already proves physical proximity; a second code would be redundant.
    if (!skipCodeCheck && session.esp32Seed) {
      const { verifyCodeForSession } = require('../services/attendanceCodeService');
      const result = verifyCodeForSession(session, code);
      if (!result.ok) {
        return res.status(400).json({
          error: result.reason,
          codeRequired: true,
        });
      }
    }

    // ── Device lock enforcement ────────────────────────────────────────────
    // deviceId is mandatory — cannot be omitted to bypass this check.
    // If another user marked attendance from this same device in the last 6
    // hours, block this user to prevent account switching on shared devices.
    if (!clientDeviceId) {
      return res.status(400).json({
        error: 'Device identifier is required to mark attendance.',
        deviceIdRequired: true,
      });
    }

    const DEVICE_LOCK_WINDOW_MS = 6 * 60 * 60 * 1000;
    const recentByOther = await AttendanceRecord.findOne({
      company: req.user.company,
      deviceId: clientDeviceId,
      user: { $ne: req.user._id },
      checkInTime: { $gt: new Date(Date.now() - DEVICE_LOCK_WINDOW_MS) },
    })
      .sort({ checkInTime: -1 })
      .select("checkInTime user")
      .lean();
    if (recentByOther) {
      const unlockAt = new Date(recentByOther.checkInTime).getTime() + DEVICE_LOCK_WINDOW_MS;
      const remainingMs = unlockAt - Date.now();
      const remainingMinutes = Math.ceil(remainingMs / 60000);
      return res.status(403).json({
        error: `This device was recently used by another user. Try again in ${remainingMinutes} minute(s).`,
        deviceLocked: true,
        remainingMinutes,
        unlockAt: new Date(unlockAt).toISOString(),
      });
    }

    const existingRecord = await AttendanceRecord.findOne({
      session: resolvedSessionId,
      user: req.user._id,
    });

    if (existingRecord) {
      return res.status(409).json({ error: "Attendance already marked for this session" });
    }

    let attendanceMethod = method ? (methodMap[method] || method) : "manual";
    let qrTokenRef = null;

    if (attendanceMethod === "qr_mark") {
      if (!qrToken) {
        return res.status(400).json({ error: "QR token is required for qr_mark method" });
      }
      const tokenDoc = await QrToken.findOne({
        token: qrToken,
        company: req.user.company,
        session: resolvedSessionId,
      });
      if (!tokenDoc) {
        return res.status(404).json({ error: "Invalid QR code. Please scan again." });
      }
      if (tokenDoc.isExpired()) {
        return res.status(410).json({ error: "QR code has expired. Please scan the latest QR code on screen." });
      }
      qrTokenRef = tokenDoc._id;
    } else if (qrToken || code) {
      const query = {
        company: req.user.company,
        session: resolvedSessionId,
      };
      if (qrToken) {
        query.token = qrToken;
      } else {
        query.code = code;
      }

      const tokenDoc = await QrToken.findOne(query);
      if (!tokenDoc) {
        return res.status(404).json({ error: "Invalid code. Please check the code and try again." });
      }
      if (tokenDoc.isExpired()) {
        return res.status(410).json({ error: "Code has expired. Please ask your manager for the latest code." });
      }
      if (!method) {
        attendanceMethod = "code_mark";
      }
      qrTokenRef = tokenDoc._id;
    } else if (attendanceMethod === "jitsi_join") {
      if (!meetingId) {
        return res.status(400).json({ error: "Meeting ID is required for jitsi_join method" });
      }
      const ZoomMeeting = require("../models/ZoomMeeting");
      const meeting = await ZoomMeeting.findById(meetingId);
      if (!meeting) {
        return res.status(404).json({ error: "Meeting not found" });
      }
    }

    const timeSinceStart = Date.now() - new Date(session.startedAt).getTime();
    const lateThreshold = 15 * 60 * 1000;
    const status = timeSinceStart > lateThreshold ? "late" : "present";

    const record = await AttendanceRecord.create({
      session: resolvedSessionId,
      user: req.user._id,
      company: req.user.company,
      status,
      method: attendanceMethod,
      deviceId: clientDeviceId,
      qrToken: qrTokenRef,
    });

    const populated = await record.populate([
      { path: "user", select: "name email indexNumber role" },
      { path: "session", select: "title startedAt" },
    ]);

    res.status(201).json({ record: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Attendance already marked for this session" });
    }
    console.error("Mark attendance error:", error);
    res.status(500).json({ error: "Failed to mark attendance" });
  }
};

exports.getMyAttendance = async (req, res) => {
  try {
    const { page = 1, limit = 20, userId } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // HOD can only view attendance for users in their own department.
    let targetUserId = req.user._id;
    if (userId && req.user.role === "hod") {
      const targetUser = await User.findOne({
        _id: userId,
        company: req.user.company,
        department: req.user.department,
      }).select('_id').lean();
      if (!targetUser) {
        return res.status(403).json({ error: 'You can only view attendance for users in your department.' });
      }
      targetUserId = userId;
    }
    const filter = { user: targetUserId, company: req.user.company };

    const [records, total] = await Promise.all([
      AttendanceRecord.find(filter)
        .sort({ checkInTime: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("session", "title startedAt stoppedAt status")
        .populate("company", "name"),
      AttendanceRecord.countDocuments(filter),
    ]);

    res.json({
      records,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("My attendance error:", error);
    res.status(500).json({ error: "Failed to fetch attendance records" });
  }
};

// ─── Corporate Employee Sign In / Sign Out ─────────────────────────
exports.employeeSignIn = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company);
    if (!company || !company.isActive) {
      return res.status(404).json({ error: "Company not found or inactive" });
    }

    if (company.mode !== "corporate") {
      return res.status(403).json({ error: "Sign in/out is only available for corporate accounts" });
    }

    // Auto-detect the current active session for the company
    let session = await AttendanceSession.findOne({
      company: req.user.company,
      status: "active",
    }).sort({ startedAt: -1 });

    // If no session exists, create an automatic one for the day
    if (!session) {
      const today = new Date();
      const dayTitle = `${today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })} — Auto Session`;
      session = await AttendanceSession.create({
        company: req.user.company,
        createdBy: req.user._id,
        title: dayTitle,
        status: "active",
        startedAt: new Date(),
      });
    }

    // Check if already signed in
    const existingRecord = await AttendanceRecord.findOne({
      session: session._id,
      user: req.user._id,
    });

    if (existingRecord && existingRecord.checkInTime && !existingRecord.checkOutTime) {
      return res.status(409).json({ error: "Already signed in. Please sign out first.", signedIn: true, record: existingRecord });
    }

    if (existingRecord && existingRecord.checkOutTime) {
      return res.status(409).json({ error: "You have already completed your sign in/out for this session." });
    }

    const timeSinceStart = Date.now() - new Date(session.startedAt).getTime();
    const lateThreshold = 15 * 60 * 1000;
    const status = timeSinceStart > lateThreshold ? "late" : "present";

    const record = await AttendanceRecord.create({
      session: session._id,
      user: req.user._id,
      company: req.user.company,
      status,
      method: "manual",
      checkInTime: new Date(),
    });

    const populated = await record.populate([
      { path: "user", select: "name email role" },
      { path: "session", select: "title startedAt" },
    ]);

    res.status(201).json({
      message: "Signed in successfully",
      signedIn: true,
      record: populated,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: "Already signed in for this session" });
    }
    console.error("Employee sign in error:", error);
    res.status(500).json({ error: "Sign in failed" });
  }
};

exports.employeeSignOut = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company);
    if (!company || !company.isActive) {
      return res.status(404).json({ error: "Company not found or inactive" });
    }

    if (company.mode !== "corporate") {
      return res.status(403).json({ error: "Sign in/out is only available for corporate accounts" });
    }

    // Find today's active sign-in record (no checkout yet)
    const record = await AttendanceRecord.findOne({
      user: req.user._id,
      company: req.user.company,
      checkOutTime: null,
    }).sort({ checkInTime: -1 });

    if (!record) {
      return res.status(404).json({ error: "No active sign-in found. Please sign in first.", signedIn: false });
    }

    record.checkOutTime = new Date();
    await record.save();

    const populated = await record.populate([
      { path: "user", select: "name email role" },
      { path: "session", select: "title startedAt" },
    ]);

    const duration = Math.round((record.checkOutTime - record.checkInTime) / 60000);

    res.json({
      message: "Signed out successfully",
      signedIn: false,
      duration: `${Math.floor(duration / 60)}h ${duration % 60}m`,
      record: populated,
    });
  } catch (error) {
    console.error("Employee sign out error:", error);
    res.status(500).json({ error: "Sign out failed" });
  }
};

exports.getSignInStatus = async (req, res) => {
  try {
    // Find the most recent record with no checkout
    const record = await AttendanceRecord.findOne({
      user: req.user._id,
      company: req.user.company,
      checkOutTime: null,
    })
      .sort({ checkInTime: -1 })
      .populate("session", "title startedAt");

    res.json({
      signedIn: !!record,
      record: record || null,
    });
  } catch (error) {
    console.error("Sign-in status error:", error);
    res.status(500).json({ error: "Failed to get sign-in status" });
  }
};

// Legacy `exports.esp32Sync` removed. Offline sync now lives at
// POST /api/devices/sync (deviceController.syncOfflineRecords) with
// proper device-JWT authentication.

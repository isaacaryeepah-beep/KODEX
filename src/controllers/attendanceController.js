const mongoose = require("mongoose");
const crypto = require("crypto");
const User = require("../models/User");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord = require("../models/AttendanceRecord");
const QrToken = require("../models/QrToken");
const Company = require("../models/Company");
const Device  = require("../models/Device");
const { isValidObjectId, validateObjectId, handleControllerError } = require("../utils/controllerHelpers");

// Heartbeat freshness windows.
const DEVICE_ONLINE_WINDOW_MS = 20_000;   // session start gate
const DEVICE_MARK_WINDOW_MS   = 15_000;   // mark-attendance gate

// One-time nonce tracking for esp32Proof replay prevention.
// Key: "sessionId:nonce", Value: expiry timestamp. Cleaned every 60 s.
const _usedNonces = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of _usedNonces) if (now > exp) _usedNonces.delete(k);
}, 60_000);

// Finds the device that should handle a session for the given user + course.
// Priority:
//   1. Device assigned to the group enrolled in this course (new group model)
//   2. Shared device currently connected to this lecturer by a class rep
//   3. Any online company device (fallback for admins or unassigned devices)
async function _resolveSessionDevice(user, courseId, explicitDeviceId) {
  const companyId = user.company;

  // If the caller explicitly picked a device, use it directly
  if (explicitDeviceId) {
    return Device.findOne({ deviceId: explicitDeviceId, companyId })
      .populate('assignedLecturers.lecturerId', 'name email')
      .populate('assignedLecturers.courseId',   'title code');
  }

  // Check if a class rep has connected a shared device to this lecturer
  if (user.role === 'lecturer') {
    const classRepDevice = await Device.findOne({
      companyId,
      ownershipType: 'shared',
      activeLecturerId: user._id,
    })
      .populate('assignedLecturers.lecturerId', 'name email')
      .populate('assignedLecturers.courseId',   'title code');
    if (classRepDevice) return classRepDevice;
  }

  // Check if this lecturer is directly assigned to a device for this course
  // (admin-set via assignedLecturers). This allows lecturers to self-start
  // sessions without needing the class rep to connect them first.
  if (user.role === 'lecturer' && courseId) {
    const assignedDevice = await Device.findOne({
      companyId,
      isActive: true,
      assignedLecturers: { $elemMatch: { lecturerId: user._id, courseId } },
    })
      .populate('assignedLecturers.lecturerId', 'name email')
      .populate('assignedLecturers.courseId',   'title code');
    if (assignedDevice) return assignedDevice;
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
      })
        .populate('assignedLecturers.lecturerId', 'name email')
        .populate('assignedLecturers.courseId',   'title code');
      if (grouped) return grouped;
    }
  }

  // Fallback — return freshest device in the company
  return Device.findOne({ companyId }).sort({ lastHeartbeat: -1 })
    .populate('assignedLecturers.lecturerId', 'name email')
    .populate('assignedLecturers.courseId',   'title code');
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

    // ── GPS geofence mode (hardware-free backup) ─────────────────────────────
    // Lecturer-selectable alternative to the ESP32 flow: the session is
    // anchored to a lat/lng + radius and students mark by submitting their own
    // GPS position (validated server-side in markAttendance). Deliberately
    // skips every device check below — this mode exists precisely for when no
    // classroom device is available. Course authorization is intentionally
    // duplicated from the device path below so neither path depends on the
    // other's control flow.
    if (req.body.gpsGeofence) {
      const { latitude, longitude, radiusMeters } = req.body.gpsGeofence || {};
      const lat = Number(latitude);
      const lng = Number(longitude);
      const radius = Math.round(Number(radiusMeters) || 100);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: "A valid latitude/longitude is required for GPS geofence sessions." });
      }
      if (radius < 20 || radius > 1000) {
        return res.status(400).json({ error: "Geofence radius must be between 20 and 1000 meters." });
      }

      if (!req.body.courseId) {
        return res.status(400).json({ error: "Please select a course to start attendance for" });
      }
      const Course = require("../models/Course");
      const CourseLecturerAssignment = require("../models/CourseLecturerAssignment");
      const course = await Course.findOne({ _id: req.body.courseId, companyId });
      if (!course) {
        return res.status(400).json({ error: "Course not found." });
      }
      if (req.user.role === "lecturer") {
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
      if (course.needsApproval && course.approvalStatus !== "approved") {
        const label = course.approvalStatus === "pending" ? "pending HOD approval" : "rejected";
        return res.status(403).json({
          error: `This course is ${label} and cannot have active sessions until it is approved.`,
        });
      }

      const session = await AttendanceSession.create({
        company: companyId,
        createdBy: req.user._id,
        title: req.body.title || "",
        course: course._id,
        deviceId: null,
        esp32Seed: null,
        durationSeconds: Number(req.body.durationSeconds) || 300,
        status: "active",
        startedAt: new Date(),
        mode: "online",
        requiresDeviceOnline: false,
        targetGroup: req.body.targetGroup || null,
        geoLat: lat,
        geoLng: lng,
        geoRadiusMeters: radius,
      });

      const populated = await session.populate([
        { path: "company", select: "name" },
        { path: "createdBy", select: "name email" },
        { path: "course", select: "title code" },
      ]);

      console.log(`[SESSION START] ✓ GPS geofence session for ${company.name} — center=(${lat.toFixed(5)},${lng.toFixed(5)}) radius=${radius}m, no device required`);
      return res.status(201).json({ session: populated, gpsMode: true });
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

    let deviceOfflineWarning = null;
    if (!freshness.online) {
      // Device is paired but has no internet WiFi — heartbeats can't reach the server.
      // Accept the hotspot key as proof the device is physically powered on:
      // when the lecturer is connected to DIKLY-CLASSROOM the device provides its
      // token, which the frontend stores and sends as x-esp32-hotspot-key.
      const inboundHotspotKey = (req.headers['x-esp32-hotspot-key'] || '').trim();
      const hotspotKeyValid   = inboundHotspotKey.length > 0 &&
                                device.token && device.token.length > 0 &&
                                inboundHotspotKey === device.token;

      if (!hotspotKeyValid) {
        const lastSeenMsg = freshness.lastSeenAt
          ? `last seen ${freshness.secondsAgo}s ago`
          : 'never sent a heartbeat';
        return res.status(503).json({
          error: 'Classroom device is not responding',
          message: 'The classroom device is powered off or out of range. Power it on, then connect your phone to the DIKLY-CLASSROOM WiFi and try again.',
          deviceStatus: { online: false, registered: true, lastSeenMsg },
        });
      }

      const lastSeenMsg = freshness.lastSeenAt
        ? `last seen ${freshness.secondsAgo}s ago`
        : 'never sent a heartbeat';
      deviceOfflineWarning = `Device is not responding (${lastSeenMsg}). Session started in offline mode — the device will sync codes when it reconnects.`;
      console.warn(`[SESSION START] Device ${device?.deviceId} offline but hotspot key valid (${lastSeenMsg}) — starting offline session for ${company.name}`);
    } else {
      console.log(`[SESSION START] ✓ Device ${device.deviceId} online (${freshness.secondsAgo}s ago) — allowing start for ${company.name}`);
    }
    // ── End device check ──────────────────────────────────

    // ── Device-lecturer assignment check ──────────────────────────────────────
    // Lecturers must be explicitly assigned to this device for the selected course,
    // OR a class rep must have temporarily connected them via activeLecturerId.
    // Admin/HOD/superadmin are exempt.
    if (req.user.role === 'lecturer' && req.body.courseId) {
      const classRepConnected = device.activeLecturerId &&
        device.activeLecturerId.toString() === req.user._id.toString();

      if (!classRepConnected) {
        const assignment = (device.assignedLecturers || []).find(a => {
          const assignedLecId  = a.lecturerId?._id ? a.lecturerId._id.toString() : a.lecturerId?.toString();
          const assignedCrsId  = a.courseId?._id   ? a.courseId._id.toString()   : a.courseId?.toString();
          return assignedLecId === req.user._id.toString() &&
                 assignedCrsId === req.body.courseId.toString();
        });
        if (!assignment) {
          return res.status(403).json({
            error: 'Not assigned to this device',
            message: 'You are not assigned to this attendance device. Please contact your Group Representative, HOD, or use your assigned departmental device.',
            deviceAssigned: false,
          });
        }
      }
    }
    // ── End device-lecturer assignment check ──────────────────────────────────

    // Auto-link: lecturer is in assignedLecturers but no class rep has connected
    // them yet — set activeLecturerId now so the device shows the right state
    // and the class rep connect step is skipped entirely.
    if (req.user.role === 'lecturer' && !device.activeLecturerId) {
      const isDirectlyAssigned = (device.assignedLecturers || []).some(a => {
        const lecId = a.lecturerId?._id ? a.lecturerId._id.toString() : a.lecturerId?.toString();
        const crsId = a.courseId?._id   ? a.courseId._id.toString()   : a.courseId?.toString();
        return lecId === req.user._id.toString() &&
               req.body.courseId && crsId === req.body.courseId.toString();
      });
      if (isDirectlyAssigned) {
        await Device.findByIdAndUpdate(device._id, {
          activeLecturerId: req.user._id,
          activeCourseId:   req.body.courseId,
          connectedAt:      new Date(),
        });
        device.activeLecturerId = req.user._id;
      }
    }

    // ── Timetable time-window check ───────────────────────────────────────────
    // Enforced only for lecturers, and only when timetable entries exist for
    // this lecturer+course. If no entries exist the check is skipped so new
    // deployments work before the timetable is configured.
    if (req.user.role === 'lecturer' && req.body.courseId) {
      const Timetable = require('../models/Timetable');
      const BUFFER_MINUTES = 30; // allow 30 min early start / 30 min late end

      const anyEntry = await Timetable.findOne({
        company:  companyId,
        lecturer: req.user._id,
        course:   req.body.courseId,
        isActive: true,
      }).lean();

      if (anyEntry) {
        const now = new Date();
        const dayOfWeek      = now.getDay(); // 0 = Sunday
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        const DAY_NAMES      = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

        const todayEntry = await Timetable.findOne({
          company:  companyId,
          lecturer: req.user._id,
          course:   req.body.courseId,
          dayOfWeek,
          isActive: true,
        }).lean();

        if (!todayEntry) {
          return res.status(403).json({
            error: 'Not scheduled today',
            message: `This course is not scheduled for today (${DAY_NAMES[dayOfWeek]}). Check your timetable or contact your admin.`,
            timetableBlocked: true,
          });
        }

        const [startH, startM] = todayEntry.startTime.split(':').map(Number);
        const [endH,   endM]   = todayEntry.endTime.split(':').map(Number);
        const windowStart = startH * 60 + startM - BUFFER_MINUTES;
        const windowEnd   = endH   * 60 + endM   + BUFFER_MINUTES;
        const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

        if (currentMinutes < windowStart || currentMinutes > windowEnd) {
          return res.status(403).json({
            error:  'Outside scheduled time window',
            message: `Your scheduled class runs ${todayEntry.startTime}–${todayEntry.endTime}. Attendance can be started from ${fmt(windowStart)} to ${fmt(windowEnd)}.`,
            timetableBlocked: true,
            scheduledTime:    { start: todayEntry.startTime, end: todayEntry.endTime },
          });
        }
      }
    }
    // ── End timetable check ───────────────────────────────────────────────────
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
      mode: deviceOfflineWarning ? "offline-ready" : "online",
      requiresDeviceOnline: !deviceOfflineWarning,
      targetGroup: req.body.targetGroup || null,
    };

    if (company.qrSeed)        sessionData.qrSeed        = company.qrSeed;
    if (company.bleLocationId) sessionData.bleLocationId = company.bleLocationId;

    const session = await AttendanceSession.create(sessionData);

    const populated = await session.populate([
      { path: "company", select: "name" },
      { path: "createdBy", select: "name email" },
      { path: "course", select: "title code" },
    ]);

    const warnings = [courseWarning, deviceOfflineWarning].filter(Boolean);
    res.status(201).json({
      session: populated,
      ...(warnings.length > 0 && { warning: warnings.join(" ") }),
      ...(deviceOfflineWarning && { offlineMode: true }),
    });
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
    if (!validateObjectId(res, id, "session ID")) return;

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

    // Auto-release device when session stops — clears activeLecturerId whether the
    // connection was set by the class rep or auto-linked at session start.
    // Only clears if the device is still linked to the lecturer who ended the session.
    await Device.findOneAndUpdate(
      { deviceId: session.deviceId, companyId: session.company, activeLecturerId: session.createdBy },
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

      if (courseId && isValidObjectId(courseId)) {
        const isEnrolled = enrolledIds.some(id => id.toString() === courseId);
        if (!isEnrolled) {
          return res.status(403).json({ error: "You are not enrolled in that course" });
        }
        filter.course = courseId;
      } else {
        filter.course = { $in: enrolledIds };
      }
    } else if (courseId && isValidObjectId(courseId)) {
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

    // Students: return the most recent active session for this company.
    // Enrollment/group isolation is enforced at mark time — not at display time.
    // Showing the session to a student who can't mark it is harmless; blocking
    // display causes confusing "No Active Session" errors when the session exists.
    if (req.user.role === "student") {
      const session = await AttendanceSession.findOne(activeFilter)
        .populate({ path: 'course', select: 'title code level group sessionType semester qualificationType' })
        .populate('company', 'name')
        .populate('createdBy', 'name email')
        .sort({ startedAt: -1 })
        .lean();

      let deviceLocalIp = null;
      if (session?.deviceId) {
        const dev = await Device.findOne({ deviceId: session.deviceId, companyId: req.user.company }).select('localIp').lean();
        deviceLocalIp = dev?.localIp || null;
      }
      return res.json({ session: session || null, deviceLocalIp });
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
    if (!validateObjectId(res, id, "session ID")) return;

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
    if (!validateObjectId(res, id, "session ID")) return;

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
    if (!validateObjectId(res, id, "session ID")) return;

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
      gps:            "gps_mark",
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

    if (resolvedSessionId && isValidObjectId(resolvedSessionId)) {
      session = await AttendanceSession.findOne({
        _id: resolvedSessionId,
        company: req.user.company,
        status: { $in: ["active", "live"] },
      });
    } else {
      // Auto-detect: find the most recent active session for this company.
      // Enrollment/group isolation is enforced below after we have the session —
      // filtering here caused "No active session" when the student wasn't enrolled
      // in the course yet or enrollment data was stale.
      session = await AttendanceSession.findOne({
        company: req.user.company,
        status: { $in: ["active", "live", "paused", "locked"] },
      }).sort({ startedAt: -1 });
      if (session) {
        resolvedSessionId = session._id.toString();
      }
    }

    if (!session) {
      return res.status(404).json({ error: "No active session found. The manager needs to start a session first." });
    }

    // Resolve method early — needed to decide which proximity checks apply.
    // (Full attendanceMethod is re-used below for record creation.)
    const resolvedMethod = method ? (methodMap[method] || method) : "manual";

    // QR scans, manual marks, and meeting-join marks carry their own proof and
    // do not require device-hotspot proximity. All other paths (code, BLE) must
    // go through the device.
    // gps_mark carries its own proof — the server-side geofence distance
    // check below — so it needs no device-hotspot proximity.
    const proximityExempt = ['qr_mark', 'manual', 'jitsi_join', 'gps_mark'].includes(resolvedMethod);

    // Students cannot self-declare a proximity-exempt method other than QR or
    // GPS — manual and jitsi marks are lecturer/admin-initiated actions only.
    if (proximityExempt && req.user.role === 'student' && !['qr_mark', 'gps_mark'].includes(resolvedMethod)) {
      return res.status(403).json({
        error: 'Connect to the classroom device WiFi hotspot to mark attendance.',
        requiresHotspot: true,
      });
    }

    // ── Device required ───────────────────────────────────────────────────────
    if (!proximityExempt) {
      if (!session.deviceId) {
        return res.status(403).json({
          error: 'This session has no classroom device. Ask your lecturer to start a new session from a paired device.',
          esp32Required: true,
        });
      }
    }

    const sessionDevice = session.deviceId
      ? await Device.findOne({ deviceId: session.deviceId, companyId: req.user.company })
      : null;

    if (!proximityExempt) {
      if (!sessionDevice) {
        return res.status(503).json({
          error: 'The classroom device for this session is no longer paired.',
          esp32Required: true,
        });
      }

      const fresh = _deviceFreshness(sessionDevice, DEVICE_MARK_WINDOW_MS);
      if (!fresh.online && session.requiresDeviceOnline !== false && session.mode !== 'offline-ready') {
        return res.status(503).json({
          error: 'The classroom device is offline. Ask your lecturer to power it on.',
          esp32Required: true,
          esp32Offline: true,
          secondsAgo:    fresh.secondsAgo,
        });
      }
    }

    // ── Proximity proof (only for non-exempt methods) ─────────────────────────
    //
    //  1. BLE token    — student within BLE range. No code needed; proximity proven.
    //  2. Hotspot token — student connected to device WiFi AP. Code required as
    //                    second factor.
    //
    //  The legacy IP-match path has been removed. Students MUST connect to the
    //  classroom device's WiFi hotspot — no bypass via same-network IP is allowed.
    // ─────────────────────────────────────────────────────────────────────────
    const bleToken        = req.body.bleToken;
    const connectionToken = req.body.connectionToken;
    const esp32Proof      = req.body.esp32Proof;

    let skipCodeCheck = false;

    // ── Hard gate: device-backed sessions require physical proximity proof ────
    // If the session has an ESP32 device (esp32Seed present), a student MUST
    // supply either a BLE token or a connectionToken (both are only obtainable
    // by being physically in the classroom). Code alone is not enough — it can
    // be shared over a chat message from outside the room.
    if (!proximityExempt && session.esp32Seed) {
      const hasProximityProof = (bleToken && typeof bleToken === 'object') ||
                                (connectionToken && typeof connectionToken === 'object');
      if (!hasProximityProof) {
        return res.status(403).json({
          error: 'Connect to the classroom device WiFi hotspot to mark attendance.',
          hotspotRequired: true,
        });
      }
    }

    if (!proximityExempt) if (bleToken && typeof bleToken === 'object') {
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
      const { sessionId: tokenSession, studentId: tokenStudent, issuedAt, sig, nonce } = connectionToken;

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

      if (!nonce) {
        return res.status(403).json({
          error: 'Hotspot token missing nonce. Please update device firmware.',
          networkMismatch: true,
        });
      }
      const bleConnNonceKey = `${resolvedSessionId}:${nonce}`;
      if (_usedNonces.has(bleConnNonceKey)) {
        return res.status(403).json({
          error: 'This attendance token has already been used. Please reconnect to the classroom hotspot.',
          replayAttack: true,
        });
      }
      _usedNonces.set(bleConnNonceKey, Date.now() + 600_000);

      const expectedConnSig = crypto
        .createHmac('sha256', session.esp32Seed)
        .update(`conn:${tokenSession}:${tokenStudent}:${issuedAt}:${nonce}`)
        .digest('hex')
        .slice(0, 64);

      const connSigClean = String(sig || '').toLowerCase().replace(/[^0-9a-f]/g, '');
      if (connSigClean.length !== 64 ||
          !crypto.timingSafeEqual(Buffer.from(connSigClean), Buffer.from(expectedConnSig))) {
        console.warn(`[MARK] Invalid hotspot sig (BLE+hotspot path) for ${req.user.name}`);
        return res.status(403).json({
          error: 'Invalid hotspot token. Connect to the classroom hotspot and try again.',
          networkMismatch: true,
        });
      }

      // Both factors verified — no verbal code needed
      skipCodeCheck = true;

    } else if (esp32Proof && typeof esp32Proof === 'object') {
      // ── ESP32 one-time proof path (no code needed) ────────────────────────────
      // The ESP32 generates a unique per-student, per-request proof with a random
      // nonce. Expires in 15 s. One-time-use prevents replay attacks.
      const { sessionId: proofSession, studentId: proofStudent, timestamp, nonce, sig } = esp32Proof;

      if (!session.esp32Seed) {
        return res.status(403).json({ error: 'Session has no device seed. Cannot verify proof.' });
      }

      // 1. Timestamp — 10-minute window (allows offline queue + reconnect)
      const proofAgeMs = Date.now() - (Number(timestamp) * 1000);
      if (!timestamp || proofAgeMs < 0 || proofAgeMs > 600_000) {
        return res.status(403).json({
          error: 'Proof expired. Please try again.',
          proofExpired: true,
        });
      }

      // 2. Nonce uniqueness — prevents replay within the TTL window
      const nonceKey = `${resolvedSessionId}:${nonce}`;
      if (_usedNonces.has(nonceKey)) {
        console.warn(`[MARK] Replay attack detected — nonce reuse by ${req.user.name}`);
        return res.status(403).json({
          error: 'This proof has already been used. Please tap Mark Attendance again.',
          replayAttack: true,
        });
      }
      _usedNonces.set(nonceKey, Date.now() + 600_000); // retain for 10 min

      // 3. Student ID binding
      if (String(proofStudent) !== req.user._id.toString()) {
        return res.status(403).json({
          error: 'Proof was issued for a different account.',
          networkMismatch: true,
        });
      }

      // 4. Session binding
      if (String(proofSession) !== resolvedSessionId) {
        return res.status(403).json({
          error: 'Proof is for a different session.',
          networkMismatch: true,
        });
      }

      // 5. HMAC signature — new firmware outputs 64 hex chars (32 bytes), old outputs 32
      const proofSigClean = String(sig || '').toLowerCase().replace(/[^0-9a-f]/g, '');
      const proofSigLen = proofSigClean.length === 64 ? 64 : 32;
      const expectedProofSig = crypto
        .createHmac('sha256', session.esp32Seed)
        .update(`proof:${proofSession}:${proofStudent}:${timestamp}:${nonce}`)
        .digest('hex')
        .slice(0, proofSigLen);

      if (proofSigClean.length !== proofSigLen ||
          !crypto.timingSafeEqual(Buffer.from(proofSigClean), Buffer.from(expectedProofSig))) {
        console.warn(`[MARK] Invalid proof sig from ${req.user.name}`);
        return res.status(403).json({
          error: 'Invalid proof signature. Make sure you are connected to the classroom device WiFi.',
          networkMismatch: true,
        });
      }

      // Proof verified — proximity confirmed. No code needed.
      skipCodeCheck = true;

    } else if (connectionToken && typeof connectionToken === 'object') {
      // ── Hotspot token path ──────────────────────────────────────────────────
      // Supports both:
      //   Old firmware (32-char sig, no nonce): conn:session:student:issuedAt
      //   New firmware (64-char sig, with nonce): conn:session:student:issuedAt:nonce
      const { sessionId: tokenSession, studentId: tokenStudent, issuedAt, sig, nonce } = connectionToken;

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

      // Nonce dedup — required; prevents URL replay if token is intercepted
      if (!nonce) {
        return res.status(403).json({
          error: 'Hotspot token missing nonce. Please update device firmware.',
          networkMismatch: true,
        });
      }
      const nonceKey = `${resolvedSessionId}:${nonce}`;
      if (_usedNonces.has(nonceKey)) {
        console.warn(`[MARK] Hotspot token replay attempt by ${req.user.name}`);
        return res.status(403).json({
          error: 'This attendance token has already been used. Please connect to the classroom hotspot again.',
          replayAttack: true,
        });
      }
      _usedNonces.set(nonceKey, Date.now() + 600_000);

      // HMAC — always 64-char now (nonce always present)
      const sigLen = 64;
      const hmacMsg = nonce
        ? `conn:${tokenSession}:${tokenStudent}:${issuedAt}:${nonce}`
        : `conn:${tokenSession}:${tokenStudent}:${issuedAt}`;
      const expectedSig = crypto
        .createHmac('sha256', session.esp32Seed)
        .update(hmacMsg)
        .digest('hex')
        .slice(0, sigLen);

      const sigClean = String(sig || '').toLowerCase().replace(/[^0-9a-f]/g, '');
      if (sigClean.length !== sigLen) {
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

      // Hotspot token verified — student was physically on the classroom AP
      skipCodeCheck = true;

    }
    // No proximity token — fall through to TOTP code validation below.
    // The 2-minute rotating code visible only on the physical device screen
    // is the proof of presence for the code-only path.

    // Anyone marking against a course-linked session must be enrolled in that course.
    if (session.course && req.user.role === 'student') {
      const Course = require('../models/Course');
      const StudentCourseEnrollment = require('../models/StudentCourseEnrollment');
      const student = req.user;
      const hasProfile = !!(student.studentLevel || student.studentGroup ||
                            student.sessionType  || student.semester     || student.programme);

      // Students with no profile attributes are unconfigured — allow them through
      // rather than blocking them with a false "wrong class" error.
      if (hasProfile) {
        const inLegacy = await Course.exists({
          _id: session.course,
          companyId: req.user.company,
          enrolledStudents: req.user._id,
        });
        const inSCE = !inLegacy && await StudentCourseEnrollment.exists({
          course: session.course,
          student: req.user._id,
          status: 'active',
        });

        if (!inLegacy && !inSCE) {
          return res.status(403).json({
            error: 'You are not enrolled in this course. This session belongs to a different class.',
          });
        }
      }

      // If the session is group-restricted, only students in that group can mark
      if (session.targetGroup && req.user.studentGroup && req.user.studentGroup !== session.targetGroup) {
        return res.status(403).json({
          error: `This attendance session is for Group ${session.targetGroup} only.`,
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
    let codeAlreadyVerified = false;
    if (!skipCodeCheck && session.esp32Seed) {
      const { verifyCodeForSession } = require('../services/attendanceCodeService');
      const result = verifyCodeForSession(session, code);
      if (!result.ok) {
        return res.status(400).json({
          error: result.reason,
          codeRequired: true,
        });
      }
      codeAlreadyVerified = true;
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

    let attendanceMethod = resolvedMethod;
    let qrTokenRef = null;
    let gpsDistanceMeters = null;
    let gpsAccuracy = null;

    if (attendanceMethod === "gps_mark") {
      // ── GPS geofence check ─────────────────────────────────────────────
      // The session must have been started in GPS mode, and the student's
      // submitted position must fall inside the geofence.
      if (session.geoLat == null || session.geoLng == null || !session.geoRadiusMeters) {
        return res.status(400).json({
          error: "This session does not accept GPS check-in. Use the method your lecturer selected.",
        });
      }
      const lat = Number(req.body.latitude);
      const lng = Number(req.body.longitude);
      const accuracy = req.body.accuracy != null ? Number(req.body.accuracy) : null;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: "A valid GPS position (latitude/longitude) is required." });
      }
      // A reading whose uncertainty dwarfs the geofence proves nothing —
      // ask the student to move to open sky rather than guessing.
      const maxAccuracy = Math.max(200, session.geoRadiusMeters * 2);
      if (accuracy != null && Number.isFinite(accuracy) && accuracy > maxAccuracy) {
        return res.status(422).json({
          error: `GPS reading too imprecise (±${Math.round(accuracy)}m). Move outdoors or near a window and try again.`,
          gpsAccuracyMeters: Math.round(accuracy),
        });
      }
      const { haversineMeters } = require("../utils/attendanceAntiCheat");
      const distance = haversineMeters(session.geoLat, session.geoLng, lat, lng);
      if (distance > session.geoRadiusMeters) {
        return res.status(403).json({
          error: `You appear to be ${Math.round(distance)}m from the class location — attendance requires being within ${session.geoRadiusMeters}m.`,
          outsideGeofence: true,
          distanceMeters: Math.round(distance),
          radiusMeters: session.geoRadiusMeters,
        });
      }
      gpsDistanceMeters = Math.round(distance);
      gpsAccuracy = accuracy != null && Number.isFinite(accuracy) ? Math.round(accuracy) : null;
    } else if (attendanceMethod === "qr_mark") {
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
    } else if (!codeAlreadyVerified && (qrToken || code)) {
      // QrToken lookup for verbal/QR codes (QFTK-style tokens in the QrToken collection).
      // Skipped when the rotating ESP32 code was already verified above — the 6-digit
      // rotating code is NOT stored in QrToken and would falsely return "Invalid code".
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
      ...(attendanceMethod === 'code_mark' && code ? { codeUsed: String(code) } : {}),
      ...(attendanceMethod === 'gps_mark' ? { gpsDistanceMeters, gpsAccuracy } : {}),
    });

    const populated = await record.populate([
      { path: "user", select: "name email indexNumber role" },
      { path: "session", select: "title startedAt" },
    ]);

    // ── New-device detection ────────────────────────────────────────────────
    // The auth system (authController) already:
    //   • locks the account for 6 hours when a new login device is seen, and
    //   • requireNoDeviceLock middleware blocks this route while locked.
    //
    // So credential sharing is already stopped at login. What we add here is
    // a secondary check: if the clientDeviceId sent with the mark request is
    // NOT in the student's trustedDevices list (maintained by the auth system),
    // it means the app device fingerprint diverges from the login fingerprint —
    // which is unusual and worth flagging for the lecturer to review.
    if (clientDeviceId && session.course) {
      const userRecord = await User.findById(req.user._id)
        .select('trustedDevices indexNumber name')
        .lean();

      const isKnownDevice = (userRecord?.trustedDevices || [])
        .some(d => d.deviceId === clientDeviceId);

      if (!isKnownDevice) {
        await AttendanceRecord.findByIdAndUpdate(record._id, {
          $set: {
            newDeviceFlag: true,
            flagged:  true,
            flagNote: `Device fingerprint not in student's trusted-devices list (index: ${req.user.IndexNumber || 'N/A'}) — auto-flagged for review`,
          },
        });

        const SuspiciousEvent = require('../models/SuspiciousEvent');
        await SuspiciousEvent.create({
          sessionId:   session._id,
          courseId:    session.course,
          companyId:   req.user.company,
          userId:      req.user._id,
          deviceId:    clientDeviceId,
          eventType:   'new_device_for_user',
          reason:      `${req.user.name} (index: ${req.user.IndexNumber || req.user._id}) marked attendance from a device not in their trusted-devices list.`,
          actionTaken: 'flagged',
        });

        console.log(`[MARK] Untrusted device flagged for ${req.user.name} (${req.user.IndexNumber}), device=${clientDeviceId}`);
        populated.newDeviceFlag = true;
        populated.flagged = true;
      }
    }

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

// GET /api/attendance-sessions/flagged/new-devices
// Returns all attendance records where the student used a device for the first
// time, grouped by session. Used by lecturers to audit potential credential sharing.
exports.getFlaggedNewDevices = async (req, res) => {
  try {
    const { sessionId, limit = 50, page = 1 } = req.query;
    const filter = { company: req.user.company, newDeviceFlag: true };

    if (sessionId && isValidObjectId(sessionId)) {
      filter.session = sessionId;
    }

    // Lecturers only see flags from their own sessions
    if (req.user.role === 'lecturer') {
      const sessions = await AttendanceSession.find({
        company:   req.user.company,
        createdBy: req.user._id,
      }).select('_id').lean();
      filter.session = { $in: sessions.map(s => s._id) };
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [records, total] = await Promise.all([
      AttendanceRecord.find(filter)
        .sort({ checkInTime: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('user',    'name email indexNumber')
        .populate('session', 'title startedAt course')
        .lean(),
      AttendanceRecord.countDocuments(filter),
    ]);

    return res.json({
      total,
      page:    parseInt(page),
      records: records.map(r => ({
        ...r,
        warning: `${r.user?.name} (${r.user?.indexNumber || 'N/A'}) marked from a device never seen before on their account`,
      })),
    });
  } catch (err) {
    console.error('getFlaggedNewDevices error:', err);
    return res.status(500).json({ error: 'Failed to fetch flagged records' });
  }
};

// POST /api/attendance-sessions/flagged/:recordId/resolve
// Dismiss a new-device flag without trusting the device.
// The attendance record stays; the flag is cleared.
exports.resolveFlaggedRecord = async (req, res) => {
  try {
    const { recordId } = req.params;
    if (!validateObjectId(res, recordId, "record ID")) return;

    const record = await AttendanceRecord.findOne({
      _id:     recordId,
      company: req.user.company,
    });
    if (!record) return res.status(404).json({ error: 'Record not found' });

    // Lecturers can only resolve flags from their own sessions
    if (req.user.role === 'lecturer') {
      const session = await AttendanceSession.findOne({
        _id:       record.session,
        createdBy: req.user._id,
        company:   req.user.company,
      }).lean();
      if (!session) return res.status(403).json({ error: 'Not your session' });
    }

    await AttendanceRecord.updateOne(
      { _id: record._id },
      { $set: { newDeviceFlag: false, flagged: false, flagNote: 'Reviewed and dismissed by ' + req.user.name } }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[resolveFlaggedRecord]', err);
    return res.status(500).json({ error: 'Failed to resolve flag' });
  }
};

// POST /api/attendance-sessions/flagged/:recordId/trust
// Trust the device: add it to the student's trustedDevices list and clear the flag.
exports.trustFlaggedDevice = async (req, res) => {
  try {
    const { recordId } = req.params;
    if (!validateObjectId(res, recordId, "record ID")) return;

    const record = await AttendanceRecord.findOne({
      _id:     recordId,
      company: req.user.company,
    }).populate('user', 'name').lean();
    if (!record) return res.status(404).json({ error: 'Record not found' });

    if (req.user.role === 'lecturer') {
      const session = await AttendanceSession.findOne({
        _id:       record.session,
        createdBy: req.user._id,
        company:   req.user.company,
      }).lean();
      if (!session) return res.status(403).json({ error: 'Not your session' });
    }

    if (!record.user) {
      return res.status(410).json({ error: 'Student account no longer exists' });
    }

    if (!record.deviceId) {
      return res.status(400).json({ error: 'No device fingerprint on this record' });
    }

    const userId = record.user._id || record.user;

    // Add to student's trustedDevices (skip if already there)
    await User.updateOne(
      {
        _id:                       userId,
        'trustedDevices.deviceId': { $ne: record.deviceId },
      },
      {
        $push: {
          trustedDevices: {
            deviceId:   record.deviceId,
            firstSeenAt: record.checkInTime || new Date(),
            lastSeenAt:  record.checkInTime || new Date(),
          },
        },
      }
    );

    // Clear the flag on this record
    await AttendanceRecord.updateOne(
      { _id: record._id },
      { $set: { newDeviceFlag: false, flagged: false, flagNote: 'Device trusted by ' + req.user.name } }
    );

    // Also clear flags on all other records for the same student + device
    await AttendanceRecord.updateMany(
      {
        company:       req.user.company,
        user:          userId,
        deviceId:      record.deviceId,
        newDeviceFlag: true,
      },
      { $set: { newDeviceFlag: false, flagged: false, flagNote: 'Device trusted by ' + req.user.name } }
    );

    return res.json({ ok: true, studentName: record.user?.name || 'Student' });
  } catch (err) {
    console.error('[trustFlaggedDevice]', err);
    return res.status(500).json({ error: 'Failed to trust device' });
  }
};

// Legacy `exports.esp32Sync` removed. Offline sync now lives at
// POST /api/devices/sync (deviceController.syncOfflineRecords) with
// proper device-JWT authentication.

// ─── Offline sync — called by ESP32 after offline attendance session ──────────
// Auth: device Bearer JWT (same token issued at pairing time)
// Body: { deviceId, course, title, startedAt (unix), records: [{name, indexNumber, ts}] }
exports.offlineSync = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Device token required" });

    // Validate device JWT (stored as `token` in Device model)
    const device = await Device.findOne({ token });
    if (!device) return res.status(401).json({ error: "Unknown device" });

    const { course, title, startedAt, records, lecturerId, courseId } = req.body;
    if (!title || !Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ error: "title and records[] required" });
    }

    // ── Lecturer assignment validation ────────────────────────────────────────
    // If the offline session was started with a lecturer + course from the bundle,
    // verify the lecturer is actually assigned to that course before accepting records.
    if (lecturerId && courseId) {
      const Course = require('../models/Course');
      const courseDoc = await Course.findOne({
        _id: courseId,
        companyId: device.companyId,
        isActive: true,
      }).select('lecturerId').lean();

      let isAssigned = courseDoc?.lecturerId?.toString() === lecturerId;

      if (!isAssigned) {
        try {
          const CLA = require('../models/CourseLecturerAssignment');
          isAssigned = await CLA.exists({
            course:   courseId,
            lecturer: lecturerId,
            isActive: { $ne: false },
          });
        } catch (_) {}
      }

      if (!isAssigned) {
        console.warn(`[offlineSync] Rejected: lecturer ${lecturerId} not assigned to course ${courseId} on device ${device.deviceId}`);
        return res.status(403).json({
          error: 'Offline session rejected: the lecturer is not assigned to this course. Contact your HOD or admin.',
          code: 'LECTURER_NOT_ASSIGNED',
        });
      }
    }

    // Create the session
    const session = await AttendanceSession.create({
      company:     device.companyId,
      title:       title || "Offline Session",
      courseTitle: course || "",
      course:      courseId || undefined,
      lecturer:    lecturerId || undefined,
      device:      device._id,
      status:      "closed",
      startedAt:   startedAt ? new Date(startedAt * 1000) : new Date(),
      closedAt:    new Date(),
    });

    // Match records to users by indexNumber where possible, else store as-is
    const created = [];
    for (const rec of records) {
      const user = await User.findOne({
        $or: [
          { indexNumber: rec.indexNumber },
          { IndexNumber: rec.indexNumber },
        ],
        company: device.companyId,
      }).lean();

      await AttendanceRecord.create({
        session:     session._id,
        company:     device.companyId,
        user:        user?._id || null,
        name:        rec.name || user?.name || "Unknown",
        indexNumber: rec.indexNumber || "",
        status:      "present",
        checkInTime: rec.ts ? new Date(rec.ts * 1000) : new Date(),
        method:      "offline-esp32",
      });
      created.push(rec.indexNumber);
    }

    // Apply end-of-class confirmations
    const confirmedRecords = req.body.confirmedRecords || [];
    if (confirmedRecords.length > 0) {
      const AttendanceRecord = require('../models/AttendanceRecord');
      for (const cr of confirmedRecords) {
        const confirmedAt = cr.confirmedAt ? new Date(cr.confirmedAt * 1000) : new Date();
        if (cr.indexNumber) {
          // More reliable: find the user by indexNumber first
          const confirmedUser = await User.findOne({
            company: device.companyId,
            IndexNumber: { $regex: new RegExp(`^${cr.indexNumber}$`, 'i') },
          }).select('_id').lean();
          if (confirmedUser) {
            await AttendanceRecord.findOneAndUpdate(
              { session: session._id, user: confirmedUser._id },
              { $set: { confirmedAt } }
            ).catch(() => {});
          }
        } else if (cr.userId) {
          await AttendanceRecord.findOneAndUpdate(
            { session: session._id, user: cr.userId },
            { $set: { confirmedAt } }
          ).catch(() => {});
        }
      }
    }

    res.json({ ok: true, sessionId: session._id, synced: created.length });
  } catch (e) {
    console.error("offlineSync error:", e);
    res.status(500).json({ error: e.message });
  }
};

// ── Academic GPS attendance settings ─────────────────────────────────────
// The academic counterpart of the corporate clock-in geofence: a campus
// center + default check-in radius that the hardware-free GPS session flow
// pre-fills. Admin/superadmin only; academic ("academic"/"both") mode only —
// corporate companies use /api/corporate-attendance/settings instead.
exports.getCampusSettings = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company)
      .select("mode academicSettings")
      .lean();
    if (!company) return res.status(404).json({ error: "Company not found" });
    if (company.mode === "corporate") {
      return res.status(400).json({ error: "Campus settings apply to academic institutions only." });
    }
    const a = company.academicSettings || {};
    res.json({
      campusLatitude:  a.campusLatitude  ?? null,
      campusLongitude: a.campusLongitude ?? null,
      defaultGeofenceRadiusMeters: a.defaultGeofenceRadiusMeters ?? 100,
      requireEsp32Attendance: !!a.requireEsp32Attendance,
    });
  } catch (e) {
    console.error("[getCampusSettings]", e);
    res.status(500).json({ error: "Failed to load campus settings" });
  }
};

exports.updateCampusSettings = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company).select("mode");
    if (!company) return res.status(404).json({ error: "Company not found" });
    if (company.mode === "corporate") {
      return res.status(400).json({ error: "Campus settings apply to academic institutions only." });
    }

    const { campusLatitude, campusLongitude, defaultGeofenceRadiusMeters, requireEsp32Attendance } = req.body;
    const update = {};

    if (campusLatitude !== undefined) {
      const lat = campusLatitude === null || campusLatitude === "" ? null : Number(campusLatitude);
      if (lat !== null && (!isFinite(lat) || Math.abs(lat) > 90)) {
        return res.status(400).json({ error: "Latitude must be between -90 and 90." });
      }
      update["academicSettings.campusLatitude"] = lat;
    }
    if (campusLongitude !== undefined) {
      const lng = campusLongitude === null || campusLongitude === "" ? null : Number(campusLongitude);
      if (lng !== null && (!isFinite(lng) || Math.abs(lng) > 180)) {
        return res.status(400).json({ error: "Longitude must be between -180 and 180." });
      }
      update["academicSettings.campusLongitude"] = lng;
    }
    if (defaultGeofenceRadiusMeters !== undefined) {
      const r = Math.round(Number(defaultGeofenceRadiusMeters) || 100);
      if (r < 20 || r > 1000) {
        return res.status(400).json({ error: "Default radius must be between 20 and 1000 meters." });
      }
      update["academicSettings.defaultGeofenceRadiusMeters"] = r;
    }
    if (requireEsp32Attendance !== undefined) {
      update["academicSettings.requireEsp32Attendance"] = !!requireEsp32Attendance;
    }

    await Company.findByIdAndUpdate(req.user.company, { $set: update });
    res.json({ message: "Campus settings saved" });
  } catch (e) {
    console.error("[updateCampusSettings]", e);
    res.status(500).json({ error: "Failed to save campus settings" });
  }
};

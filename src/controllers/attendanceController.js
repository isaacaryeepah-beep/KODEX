const mongoose = require("mongoose");
const User = require("../models/User");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord = require("../models/AttendanceRecord");
const QrToken = require("../models/QrToken");
const Company = require("../models/Company");

exports.startSession = async (req, res) => {
  try {
    const companyId = req.user.company;

    const company = await Company.findById(companyId);
    if (!company || !company.isActive) {
      return res.status(404).json({ error: "Company not found or inactive" });
    }

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

    let courseRef = null;
    if (req.body.courseId) {
      const Course = require("../models/Course");
      const courseQuery = { _id: req.body.courseId, company: companyId };
      if (req.user.role === "lecturer") {
        courseQuery.lecturer = req.user._id;
      }
      const course = await Course.findOne(courseQuery);
      if (!course) {
        return res.status(400).json({ error: "Course not found or you don't have access to it" });
      }
      courseRef = course._id;
    }

    const sessionData = {
      company: companyId,
      createdBy: req.user._id,
      title: req.body.title || "",
      course: courseRef,
      status: "active",
      startedAt: new Date(),
    };

    if (company.qrSeed) {
      sessionData.qrSeed = company.qrSeed;
    }
    if (company.bleLocationId) {
      sessionData.bleLocationId = company.bleLocationId;
    }

    const session = await AttendanceSession.create(sessionData);

    const populated = await session.populate([
      { path: "company", select: "name" },
      { path: "createdBy", select: "name email" },
      { path: "course", select: "title code" },
    ]);

    res.status(201).json({ session: populated });
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
    await session.save();

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
    const { status, page = 1, limit = 20 } = req.query;
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

    if (status && ["active", "stopped"].includes(status)) {
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
    const activeFilter = { ...req.companyFilter, status: "active" };
    if (req.user.role === "lecturer") {
      activeFilter.createdBy = req.user._id;
    }
    const session = await AttendanceSession.findOne(activeFilter)
      .populate("company", "name")
      .populate("createdBy", "name email")
      .populate("course", "title code");

    res.json({ session: session || null });
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
      .populate("user", "name email IndexNumber role")
      .sort({ checkInTime: 1 });

    res.json({ session, records });
  } catch (error) {
    console.error("Get session error:", error);
    res.status(500).json({ error: "Failed to fetch attendance session" });
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
      .populate("user", "name email IndexNumber role")
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

    const methodMap = {
      qr: "qr_mark",
      ble: "ble_mark",
      manual: "manual",
      zoom: "jitsi_join",
    };

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
      // Auto-detect: find the most recent active session for this company
      session = await AttendanceSession.findOne({
        company: req.user.company,
        status: "active",
      }).sort({ startedAt: -1 });
      if (session) {
        resolvedSessionId = session._id.toString();
      }
    }

    if (!session) {
      return res.status(404).json({ error: "No active session found. The manager needs to start a session first." });
    }

    // For students: verify they are enrolled in the course this session belongs to
    if (req.user.role === 'student' && session.course) {
      const Course = require('../models/Course');
      const enrolled = await Course.findOne({
        _id: session.course,
        company: req.user.company,
        enrolledStudents: req.user._id,
      }).select('_id title level group').lean();

      if (!enrolled) {
        return res.status(403).json({
          error: `You are not enrolled in this course. This session belongs to a different class.`,
        });
      }
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
      const tokenDoc = await QrToken.findOne({ token: qrToken });
      if (!tokenDoc) {
        return res.status(404).json({ error: "Invalid QR code. Please scan again." });
      }
      if (tokenDoc.isExpired()) {
        return res.status(410).json({ error: "QR code has expired. Please scan the latest QR code on screen." });
      }
      // QR is time-gated (15s window) — all students/employees can scan within the window
      qrTokenRef = tokenDoc._id;
    } else if (qrToken || code) {
      const query = {};
      if (qrToken) {
        query.token = qrToken;
      } else {
        query.code = code;
        query.session = resolvedSessionId;
      }

      const tokenDoc = await QrToken.findOne(query);
      if (!tokenDoc) {
        return res.status(404).json({ error: "Invalid code. Please check the code and try again." });
      }
      if (tokenDoc.isExpired()) {
        return res.status(410).json({ error: "Code has expired. Please ask your manager for the latest code." });
      }
      // QR is time-gated (15s window) — all students/employees can scan within the window
      if (!method) {
        attendanceMethod = tokenDoc.codeType === "verbal" ? "code_mark" : "code_mark";
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
      deviceId: req.body.deviceId || req.headers["x-device-id"] || null,
      qrToken: qrTokenRef,
    });

    const populated = await record.populate([
      { path: "user", select: "name email IndexNumber role" },
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

    // HOD can view any student's attendance in their company
    let targetUserId = req.user._id;
    if (userId && req.user.role === "hod") {
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

// ── ESP32 offline sync endpoint ────────────────────────────────────────────────
exports.esp32Sync = async (req, res) => {
  try {
    // Validate ESP32 secret
    const secret = req.headers['x-esp32-secret'];
    if (!secret || secret !== process.env.ESP32_SECRET) {
      return res.status(401).json({ error: 'Unauthorized ESP32 request' });
    }

    const { records, offlineSession, institutionCode } = req.body;

    // Find company by institution code
    const company = await Company.findOne({ institutionCode: institutionCode?.toUpperCase() });
    if (!company) {
      return res.status(404).json({ error: 'Institution not found: ' + institutionCode });
    }

    let session = null;

    // If session was started offline on ESP32, create it in DB if not exists
    if (offlineSession) {
      session = await AttendanceSession.findOne({ _id: offlineSession.id }).catch(() => null);
      if (!session) {
        try {
          session = await AttendanceSession.create({
            _id: offlineSession.id.startsWith('esp32_') ? undefined : offlineSession.id,
            title: offlineSession.title || 'Offline Session',
            company: company._id,
            status: 'active',
            startedAt: new Date(offlineSession.startedAt),
            source: 'esp32_offline',
          });
          console.log('[ESP32 Sync] Created offline session:', session._id);
        } catch (e) {
          // Session may already exist
          session = await AttendanceSession.findOne({ company: company._id, status: 'active' }).sort({ startedAt: -1 });
        }
      }
    }

    if (!session) {
      // Find the most recent active or recently stopped session for this company
      session = await AttendanceSession.findOne({ company: company._id })
        .sort({ startedAt: -1 });
    }

    if (!session) {
      return res.status(404).json({ error: 'No session found to sync records into' });
    }

    let synced = 0;
    let skipped = 0;
    const errors = [];

    for (const record of (records || [])) {
      try {
        // Find user
        let user = null;
        if (record.userId) {
          user = await User.findOne({ _id: record.userId, company: company._id });
        }
        if (!user && record.IndexNumber) {
          user = await User.findOne({ IndexNumber: record.IndexNumber.toUpperCase(), company: company._id });
        }
        if (!user) {
          errors.push({ ref: record.IndexNumber || record.userId, error: 'User not found' });
          continue;
        }

        // Corporate sign-in/out records
        if (record.type === 'sign_in' || record.type === 'sign_out') {
          const SignInRecord = require('../models/SignInRecord').default || require('../models/SignInRecord');
          const time = new Date(record.time || Date.now());
          if (record.type === 'sign_in') {
            const exists = await SignInRecord.findOne({ user: user._id, checkInTime: { $gte: new Date(time - 60000) } });
            if (exists) { skipped++; continue; }
            await SignInRecord.create({ user: user._id, company: company._id, checkInTime: time, source: 'esp32' });
          } else {
            const last = await SignInRecord.findOne({ user: user._id, checkOutTime: null }).sort({ checkInTime: -1 });
            if (last) { last.checkOutTime = time; await last.save(); }
          }
          synced++;
          continue;
        }

        // Academic attendance records
        if (!session) { errors.push({ ref: record.IndexNumber, error: 'No session' }); continue; }
        const existing = await AttendanceRecord.findOne({ session: session._id, user: user._id });
        if (existing) { skipped++; continue; }

        const markedAt = new Date(record.markedAt || Date.now());
        const timeSinceStart = markedAt - new Date(session.startedAt);
        const status = timeSinceStart > 15 * 60 * 1000 ? 'late' : 'present';

        await AttendanceRecord.create({
          session: session._id,
          user: user._id,
          company: company._id,
          status,
          method: record.method || 'ble_mark',
          markedAt,
        });
        synced++;
      } catch (e) {
        errors.push({ ref: record.IndexNumber || record.userId, error: e.message });
      }
    }

    console.log(`[ESP32 Sync] institution=${institutionCode} synced=${synced} skipped=${skipped} errors=${errors.length}`);
    res.json({ ok: true, synced, skipped, errors });
  } catch (error) {
    console.error('[ESP32 Sync] Error:', error);
    res.status(500).json({ error: 'Sync failed: ' + error.message });
  }
};

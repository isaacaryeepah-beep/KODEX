const Meeting          = require('../models/Meeting');
const MeetingAttendance = require('../models/MeetingAttendance');
const { generateRoomName } = require('../utils/generateRoomName');
const { generateMeetingToken, verifyMeetingToken } = require('../utils/jwt');

const JITSI_DOMAIN    = process.env.JITSI_DOMAIN || 'meet.jit.si';
const APP_BASE_URL    = process.env.APP_BASE_URL || 'https://dikly.com';

// ─── CREATE ───────────────────────────────────────────────────────────────────
exports.createMeeting = async (req, res) => {
  try {
    const {
      title, description,
      scheduledStart, scheduledEnd,
      linkedCourseId, linkedDepartmentId, linkedSessionId, linkedTeam,
      allowedUsers, allowedDepartments, allowedCourses, allowedTeams,
      openToCompany,
      settings
    } = req.body;

    const company    = req.user.company;
    const creatorId  = req.user._id;
    const creatorRole = req.user.role;
    const mode       = req.meetingMode;

    // Generate unique room name
    const roomName = generateRoomName(company, creatorId);

    // Room password if enabled
    const roomPassword = settings?.enablePassword
      ? Math.random().toString(36).slice(2, 10).toUpperCase()
      : null;

    const meeting = await Meeting.create({
      title, description,
      company, mode, creatorId, creatorRole,
      linkedCourseId, linkedDepartmentId, linkedSessionId, linkedTeam,
      allowedUsers:       allowedUsers       || [],
      allowedDepartments: allowedDepartments || [],
      allowedCourses:     allowedCourses     || [],
      allowedTeams:       allowedTeams       || [],
      openToCompany:      openToCompany      || false,
      scheduledStart: new Date(scheduledStart),
      scheduledEnd:   new Date(scheduledEnd),
      roomName,
      roomPassword,
      settings: {
        enableChat:      settings?.enableChat      ?? true,
        enableRecording: settings?.enableRecording ?? false,
        enableLobby:     settings?.enableLobby     ?? false,
        enablePassword:  settings?.enablePassword  ?? false,
        muteOnJoin:      settings?.muteOnJoin      ?? true,
        waitingRoom:     settings?.waitingRoom      ?? false,
      }
    });

    res.status(201).json({
      success: true,
      message: 'Meeting created',
      data: {
        ...meeting.toObject(),
        joinUrl: `https://${JITSI_DOMAIN}/${roomName}`
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── LIST MEETINGS ────────────────────────────────────────────────────────────
exports.listMeetings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const role = req.user.role?.toLowerCase();

    let query = { company: req.user.company, isActive: true };
    if (status) query.status = status;

    // Lecturers see only their own meetings
    if (role === 'lecturer') {
      query.creatorId = req.user._id;
    }
    // Students/Employees see only assigned meetings
    else if (['student', 'employee'].includes(role)) {
      query.$or = [
        { allowedUsers: req.user._id },
        { openToCompany: true },
        { allowedCourses: { $in: req.user.enrolledCourses || [] } },
        { allowedDepartments: req.user.department },
        { allowedTeams: req.user.team }
      ];
    }
    // Manager sees all company meetings
    // Admin/HOD sees all company meetings (no extra filter)

    const [meetings, total] = await Promise.all([
      Meeting.find(query)
        .sort({ scheduledStart: -1 })
        .skip(skip).limit(Number(limit))
        .populate('creatorId', 'name email role')
        .populate('linkedCourseId', 'name code')
        .lean(),
      Meeting.countDocuments(query)
    ]);

    // Strip room password from list response
    const safe = meetings.map(m => { delete m.roomPassword; return m; });

    res.json({
      success: true,
      data: safe,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
exports.getMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, company: req.user.company })
      .populate('creatorId', 'name email role')
      .populate('linkedCourseId', 'name code')
      .populate('allowedUsers', 'name email role')
      .lean();

    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

    // Hide password unless owner
    const isOwner = meeting.creatorId._id.toString() === req.user._id.toString();
    if (!isOwner) delete meeting.roomPassword;

    res.json({ success: true, data: meeting });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
exports.updateMeeting = async (req, res) => {
  try {
    const meeting = req.meeting; // loaded by middleware
    if (meeting.status !== 'scheduled') {
      return res.status(400).json({ message: 'Only scheduled meetings can be updated.' });
    }

    const allowed = ['title','description','scheduledStart','scheduledEnd',
      'allowedUsers','allowedDepartments','allowedCourses','allowedTeams',
      'openToCompany','settings'];
    allowed.forEach(f => { if (req.body[f] !== undefined) meeting[f] = req.body[f]; });

    await meeting.save();
    res.json({ success: true, message: 'Meeting updated', data: meeting });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── START ────────────────────────────────────────────────────────────────────
exports.startMeeting = async (req, res) => {
  try {
    const meeting = req.meeting;
    if (meeting.status === 'ended') return res.status(400).json({ message: 'Meeting already ended.' });
    if (meeting.status === 'cancelled') return res.status(400).json({ message: 'Meeting was cancelled.' });

    meeting.status      = 'live';
    meeting.actualStart = new Date();
    await meeting.save();

    res.json({
      success: true,
      message: 'Meeting started',
      data: {
        roomName:  meeting.roomName,
        joinUrl:   `https://${JITSI_DOMAIN}/${meeting.roomName}`,
        password:  meeting.roomPassword,
        settings:  meeting.settings
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── END ──────────────────────────────────────────────────────────────────────
exports.endMeeting = async (req, res) => {
  try {
    const meeting = req.meeting;
    if (meeting.status === 'ended') return res.status(400).json({ message: 'Meeting already ended.' });

    meeting.status    = 'ended';
    meeting.actualEnd = new Date();
    await meeting.save();

    // Finalize all open attendance sessions
    const openRecords = await MeetingAttendance.find({ meeting: meeting._id, lastAction: 'joined' });
    for (const rec of openRecords) {
      const now = new Date();
      const lastSession = rec.sessions[rec.sessions.length - 1];
      if (lastSession && !lastSession.leftAt) {
        lastSession.leftAt = now;
        lastSession.minutes = Math.floor((now - lastSession.joinedAt) / 60000);
      }
      rec.leftAt       = now;
      rec.lastAction   = 'left';
      rec.totalMinutes = rec.sessions.reduce((t, s) => t + (s.minutes || 0), 0);

      const { calculateStatus } = require('../utils/attendanceCalculator');
      rec.attendanceStatus = calculateStatus(rec.totalMinutes, meeting.scheduledStart, meeting.scheduledEnd);
      await rec.save();
    }

    res.json({ success: true, message: 'Meeting ended', data: meeting });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── CANCEL ───────────────────────────────────────────────────────────────────
exports.cancelMeeting = async (req, res) => {
  try {
    const meeting = req.meeting;
    if (['ended', 'cancelled'].includes(meeting.status)) {
      return res.status(400).json({ message: `Meeting is already ${meeting.status}.` });
    }
    meeting.status   = 'cancelled';
    meeting.isActive = false;
    await meeting.save();
    res.json({ success: true, message: 'Meeting cancelled' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── JOIN (returns Jitsi config for frontend) ─────────────────────────────────
exports.joinMeeting = async (req, res) => {
  try {
    const meeting = req.meeting;
    const user    = req.user;

    // LIVE-only gate: meeting must be actively running
    if (meeting.status === 'scheduled') {
      return res.status(403).json({
        message: 'Meeting has not started yet. You can only join when the host starts the meeting.',
        status: 'scheduled',
        scheduledStart: meeting.scheduledStart,
      });
    }
    if (meeting.status === 'ended') {
      return res.status(403).json({ message: 'This meeting has already ended.', status: 'ended' });
    }
    if (meeting.status === 'cancelled') {
      return res.status(403).json({ message: 'This meeting was cancelled.', status: 'cancelled' });
    }
    if (meeting.status !== 'live') {
      return res.status(403).json({ message: 'Meeting is not currently live.', status: meeting.status });
    }

    // Issue a short-lived meeting access token (30 min)
    const deviceId = req.user.deviceId || req.headers['x-device-id'] || null;
    const meetingToken = generateMeetingToken(user._id.toString(), meeting._id.toString(), deviceId);

    // Build Jitsi embed config
    const isCreator = meeting.creatorId?.toString() === user._id.toString();
    const isModerator = isCreator || ['lecturer', 'admin', 'superadmin'].includes(user.role);

    const config = {
      roomName:    meeting.roomName,
      domain:      JITSI_DOMAIN,
      displayName: user.name || user.email,
      email:       user.email,
      subject:     meeting.title,
      password:    meeting.settings.enablePassword ? meeting.roomPassword : undefined,
      isModerator,
      configOverwrite: {
        startWithAudioMuted:     meeting.settings.muteOnJoin,
        startWithVideoMuted:     false,
        enableLobbyChat:         meeting.settings.enableLobby,
        enableNoisyMicDetection: true,
        disableDeepLinking:      true,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK:      false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        TOOLBAR_BUTTONS: [
          'microphone','camera','closedcaptions','desktop',
          'chat','raisehand','tileview','select-background',
          'hangup'
        ]
      }
    };

    // Secure join URL — passes token instead of exposing raw room name
    const secureJoinUrl = `${APP_BASE_URL}/meet/${meeting._id}?token=${meetingToken}`;

    res.json({
      success: true,
      data: {
        meeting,
        jitsiConfig: config,
        meetingToken,
        secureJoinUrl,
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── VALIDATE MEETING TOKEN (for Jitsi embed page) ────────────────────────────
exports.validateMeetingToken = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token' });

    let decoded;
    try {
      decoded = verifyMeetingToken(token);
    } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired meeting token' });
    }

    // Confirm the meeting is still live
    const meeting = await Meeting.findById(decoded.meetingId);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.status !== 'live') {
      return res.status(403).json({ error: 'Meeting is no longer live', status: meeting.status });
    }

    // Verify caller is the same user as the token
    if (decoded.id !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Token user mismatch' });
    }

    res.json({
      valid: true,
      meeting: {
        id: meeting._id,
        title: meeting.title,
        roomName: meeting.roomName,
        status: meeting.status,
        settings: meeting.settings,
        roomPassword: meeting.settings.enablePassword ? meeting.roomPassword : undefined,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteMeeting = async (req, res) => {
  try {
    const meeting = req.meeting;
    if (meeting.status === 'live') {
      return res.status(400).json({ message: 'Cannot delete a live meeting. End it first.' });
    }
    meeting.isActive = false;
    await meeting.save();
    res.json({ success: true, message: 'Meeting deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── UPCOMING / LIVE / MY MEETINGS ───────────────────────────────────────────
exports.upcomingMeetings = async (req, res) => {
  try {
    const role  = req.user.role?.toLowerCase();
    const query = {
      company:      req.user.company,
      isActive:     true,
      status:       'scheduled',
      scheduledStart: { $gte: new Date() }
    };
    if (role === 'lecturer') query.creatorId = req.user._id;
    else if (['student','employee'].includes(role)) {
      query.$or = [
        { allowedUsers: req.user._id },
        { openToCompany: true },
        { allowedCourses: { $in: req.user.enrolledCourses || [] } }
      ];
    }
    const meetings = await Meeting.find(query).sort({ scheduledStart: 1 }).limit(10)
      .populate('creatorId', 'name').lean();
    res.json({ success: true, data: meetings });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.liveMeetings = async (req, res) => {
  try {
    const query = { company: req.user.company, isActive: true, status: 'live' };
    const role  = req.user.role?.toLowerCase();
    if (role === 'lecturer') query.creatorId = req.user._id;
    const meetings = await Meeting.find(query).populate('creatorId', 'name').lean();
    res.json({ success: true, data: meetings });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

exports.myMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find({
      company:   req.user.company,
      creatorId: req.user._id,
      isActive:  true
    }).sort({ scheduledStart: -1 }).limit(50).lean();
    res.json({ success: true, data: meetings });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

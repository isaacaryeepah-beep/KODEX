'use strict';
const crypto             = require('crypto');
const Meeting            = require('../models/Meeting');
const MeetingAttendance  = require('../models/MeetingAttendance');
const MeetingParticipant = require('../models/MeetingParticipant');
const User               = require('../models/User');
const { generateRoomName }                             = require('../utils/generateRoomName');
const { generateMeetingToken, verifyMeetingToken }     = require('../utils/jwt');
const { generateJitsiToken, JITSI_DOMAIN, JITSI_APP_ID, jitsiConfigured } = require('../services/jitsiTokenService');
const { configured: streamConfigured, generateLiveKitToken, buildLiveKitRoomUrl, muteAllInRoom, muteParticipantInRoom } = require('../services/livekitService');
const { broadcastMonitor }                             = require('./meetingMonitorController');
const { runPreflight, handleReconnect }                 = require('../services/sessionPreflight');

const APP_BASE_URL     = process.env.APP_BASE_URL     || 'https://app.dikly.sbs';
const MONITOR_BASE_URL = process.env.MONITOR_BASE_URL || 'https://monitor.dikly.sbs';
const MODERATOR_ROLES  = ['lecturer', 'manager', 'admin', 'superadmin', 'hod'];

function isModeratorRole(role) {
  return MODERATOR_ROLES.includes((role || '').toLowerCase());
}

function isMeetingModerator(meeting, user) {
  const uid = user._id.toString();
  return (
    String(meeting.creatorId) === uid ||
    isModeratorRole(user.role) ||
    (meeting.invigilators || []).some(i => String(i) === uid)
  );
}

function buildJitsiConfig(meeting, user, isMod) {
  const isLecture = meeting.meetingType === 'lecture';

  const moderatorButtons = [
    'microphone','camera','closedcaptions','desktop','chat','raisehand',
    'tileview','select-background','mute-everyone','kick-participant',
    'participants-pane','security','settings','hangup',
  ];
  const participantButtons = [
    'microphone','camera','chat','raisehand','tileview','select-background','hangup',
  ];
  if (meeting.settings?.screenShareEnabled && !isMod) {
    participantButtons.splice(3, 0, 'desktop');
  }

  // Lecture-mode bandwidth constraints — students mostly watch/listen
  const lectureConstraints = isLecture && !isMod ? {
    constraints: {
      video: { height: { ideal: 180, max: 360 } },
    },
    startBitrate: 200,
    disableSimulcast: false,
    enableLayerSuspension: true,
  } : {};

  const lecturerConstraints = isLecture && isMod ? {
    constraints: {
      video: { height: { ideal: 720, max: 1080 } },
    },
    startBitrate: 800,
    disableSimulcast: false,
  } : {};

  return {
    roomName:    meeting.roomName,
    domain:      JITSI_DOMAIN,
    displayName: user.name || user.email,
    email:       user.email,
    subject:     meeting.title,
    isModerator: isMod,
    configOverwrite: {
      // Moderators join with audio+video on; students muted by default
      startWithAudioMuted: isMod ? false : (meeting.settings?.muteOnJoin ?? true),
      startWithVideoMuted: isLecture ? !isMod : false,
      enableLobbyChat:           meeting.settings?.enableLobby ?? false,
      enableNoisyMicDetection:   true,
      disableDeepLinking:        true,
      enableWelcomePage:         false,
      // Prejoin is always disabled — moderators use lecturer-meeting.html,
      // students use session-preflight.html which calls our own checks first.
      prejoinPageEnabled:        false,
      prejoinConfig:             { enabled: false },
      // Kills popup-based XMPP auth fallback; JWT passed directly is the only auth method.
      tokenAuthUrl:              false,
      // Force all media through JVB so proctoring sees every stream.
      p2p:                       { enabled: false },
      disableThirdPartyRequests: true,
      applicationName:           'DIKLY',
      // Adaptive bitrate for low-bandwidth educational environments
      channelLastN:    isLecture ? 4 : -1,
      adaptiveLastN:   true,
      ...lectureConstraints,
      ...lecturerConstraints,
      // Jitsi 9584+: toolbar config moved from interfaceConfigOverwrite to configOverwrite
      toolbarButtons: isMod ? moderatorButtons : participantButtons,
      // Hide Jitsi watermark via configOverwrite (interfaceConfigOverwrite ignored in 9584)
      disableWatermark: true,
    },
    interfaceConfigOverwrite: {
      // ── White-label: remove all Jitsi branding ──────────────────────────
      SHOW_JITSI_WATERMARK:      false,
      SHOW_WATERMARK_FOR_GUESTS: false,
      SHOW_BRAND_WATERMARK:      false,
      SHOW_POWERED_BY:           false,
      DISPLAY_WELCOME_PAGE_CONTENT: false,
      DISPLAY_WELCOME_PAGE_TOOLBAR_ADDITIONAL_CONTENT: false,
      JITSI_WATERMARK_LINK:      '',
      BRAND_WATERMARK_LINK:      '',
      DEFAULT_LOGO_URL:          '',
      MOBILE_APP_PROMO:          false,
      // ── DIKLY branding ──────────────────────────────────────────────────
      NATIVE_APP_NAME:           'DIKLY',
      PROVIDER_NAME:             'DIKLY',
      APP_NAME:                  'DIKLY Classes',
      DEFAULT_BACKGROUND:        '#0a0c10',
      HIDE_INVITE_MORE_HEADER:   true,
      AUTHENTICATION_ENABLE:     false,
      SETTINGS_SECTIONS:         ['devices', 'language'],
      TOOLBAR_TIMEOUT:           isMod ? 4000 : 3000,
      INITIAL_TOOLBAR_TIMEOUT:   20000,
      TOOLBAR_BUTTONS:           isMod ? moderatorButtons : participantButtons,
    },
  };
}

// ─── BUILD JITSI MEETING URL ──────────────────────────────────────────────────
// Returns https://meet.../room?jwt=...#config.* URL.
// TURN/ICE config is intentionally NOT included in the hash — embedding large
// JSON in the fragment produces URLs that iOS Safari and carrier NAT proxies
// silently truncate, stripping TURN credentials. custom-config.js on the Jitsi
// server handles TURN and relay-only policy for mobile via UA detection.
function buildJitsiMeetingUrl(meeting, user, isMod) {
  const token = generateJitsiToken(user, meeting.roomName, isMod);

  const moderatorToolbar = [
    'microphone','camera','desktop','chat','raisehand',
    'tileview','select-background','mute-everyone',
    'kick-participant','participants-pane','hangup',
  ];
  const participantToolbar = ['microphone','camera','chat','raisehand','tileview','hangup'];
  if (meeting.settings?.screenShareEnabled && !isMod) {
    participantToolbar.splice(2, 0, 'desktop');
  }

  const startAudioMuted = isMod ? false : (meeting.settings?.muteOnJoin ?? true);
  const startVideoMuted = (meeting.meetingType === 'lecture') ? !isMod : false;

  const hashParts = [
    'config.prejoinPageEnabled=false',
    'config.disableDeepLinking=true',
    'config.p2p.enabled=false',
    'config.enableIceRestart=true',
    'config.disableThirdPartyRequests=true',
    `config.startWithAudioMuted=${startAudioMuted}`,
    `config.startWithVideoMuted=${startVideoMuted}`,
    `config.toolbarButtons=${encodeURIComponent(JSON.stringify(isMod ? moderatorToolbar : participantToolbar))}`,
  ];

  return `https://${JITSI_DOMAIN}/${meeting.roomName}?jwt=${token}#${hashParts.join('&')}`;
}

// ─── CREATE ───────────────────────────────────────────────────────────────────
exports.createMeeting = async (req, res) => {
  try {
    const {
      title, description, meetingType,
      scheduledStart, scheduledEnd,
      linkedCourseId, linkedDepartmentId, linkedSessionId, linkedTeam, linkedSnapQuizId,
      allowedUsers, allowedDepartments, allowedCourses, allowedTeams,
      openToCompany, invigilators, settings,
    } = req.body;

    if (!title?.trim()) return res.status(400).json({ error: 'Meeting title is required' });

    const start = new Date(scheduledStart);
    const end   = new Date(scheduledEnd);
    if (isNaN(start) || isNaN(end)) return res.status(400).json({ error: 'Invalid date values' });
    if (end <= start)               return res.status(400).json({ error: 'End time must be after start time' });

    // Validate invigilators belong to the same company
    let resolvedInvigilators = [];
    if (Array.isArray(invigilators) && invigilators.length) {
      const found = await User.find({ _id: { $in: invigilators }, company: req.user.company }).select('_id').lean();
      resolvedInvigilators = found.map(u => u._id);
    }

    const roomPassword = settings?.enablePassword
      ? crypto.randomBytes(8).toString('hex').toUpperCase()
      : null;

    const meeting = await Meeting.create({
      title:       title.trim(),
      description: description?.trim() || '',
      meetingType: meetingType || 'meeting',
      company:     req.user.company,
      mode:        req.meetingMode,
      creatorId:   req.user._id,
      creatorRole: req.user.role,
      invigilators: resolvedInvigilators,
      linkedCourseId:     linkedCourseId     || null,
      linkedDepartmentId: linkedDepartmentId || null,
      linkedSessionId:    linkedSessionId    || null,
      linkedTeam:         linkedTeam         || null,
      linkedSnapQuizId:   linkedSnapQuizId   || null,
      allowedUsers:       Array.isArray(allowedUsers)       ? allowedUsers       : [],
      allowedDepartments: Array.isArray(allowedDepartments) ? allowedDepartments : [],
      allowedCourses:     Array.isArray(allowedCourses)     ? allowedCourses     : [],
      allowedTeams:       Array.isArray(allowedTeams)       ? allowedTeams       : [],
      openToCompany:      openToCompany || false,
      scheduledStart:     start,
      scheduledEnd:       end,
      roomName:           generateRoomName(req.user.company, req.user._id),
      roomPassword,
      settings: {
        enableChat:           settings?.enableChat           ?? true,
        enableRecording:      settings?.enableRecording      ?? false,
        enableLobby:          settings?.enableLobby          ?? false,
        enablePassword:       settings?.enablePassword       ?? false,
        muteOnJoin:           settings?.muteOnJoin           ?? true,
        waitingRoom:          settings?.waitingRoom          ?? false,
        screenShareEnabled:   settings?.screenShareEnabled   ?? true,
        allowParticipantChat: settings?.allowParticipantChat ?? true,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Meeting created',
      data: { ...meeting.toObject(), joinUrl: `https://${JITSI_DOMAIN}/${meeting.roomName}` },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── LIST ─────────────────────────────────────────────────────────────────────
exports.listMeetings = async (req, res) => {
  try {
    const { status, meetingType, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const role = (req.user.role || '').toLowerCase();

    const query = { company: req.user.company, isActive: true };
    if (status)      query.status      = status;
    if (meetingType) query.meetingType = meetingType;

    if (role === 'lecturer') {
      query.$or = [{ creatorId: req.user._id }, { invigilators: req.user._id }];
    } else if (['student', 'employee'].includes(role)) {
      query.$or = [
        { allowedUsers: req.user._id },
        { openToCompany: true },
        { allowedCourses: { $in: req.user.enrolledCourses || [] } },
        { allowedDepartments: req.user.department },
        { allowedTeams: req.user.team },
      ];
    }

    const [meetings, total] = await Promise.all([
      Meeting.find(query)
        .sort({ scheduledStart: -1 }).skip(skip).limit(Number(limit))
        .populate('creatorId',      'name email role')
        .populate('linkedCourseId', 'name code')
        .populate('invigilators',   'name role')
        .lean(),
      Meeting.countDocuments(query),
    ]);

    const safe = meetings.map(m => { const c = { ...m }; delete c.roomPassword; return c; });
    res.json({
      success: true, data: safe,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
exports.getMeeting = async (req, res) => {
  try {
    const meeting = await Meeting.findOne({ _id: req.params.id, company: req.user.company })
      .populate('creatorId',     'name email role')
      .populate('linkedCourseId','name code')
      .populate('allowedUsers',  'name email role')
      .populate('invigilators',  'name email role')
      .lean();
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (!isMeetingModerator(meeting, req.user)) delete meeting.roomPassword;
    res.json({ success: true, data: meeting });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
exports.updateMeeting = async (req, res) => {
  try {
    const meeting = req.meeting;
    if (meeting.status !== 'scheduled') return res.status(400).json({ error: 'Only scheduled meetings can be updated' });
    const allowed = [
      'title','description','meetingType','scheduledStart','scheduledEnd',
      'allowedUsers','allowedDepartments','allowedCourses','allowedTeams',
      'openToCompany','settings',
    ];
    allowed.forEach(f => { if (req.body[f] !== undefined) meeting[f] = req.body[f]; });
    await meeting.save();
    res.json({ success: true, message: 'Meeting updated', data: meeting });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── START ────────────────────────────────────────────────────────────────────
exports.startMeeting = async (req, res) => {
  try {
    const meeting = req.meeting;
    if (meeting.status === 'ended')     return res.status(400).json({ error: 'Meeting already ended' });
    if (meeting.status === 'cancelled') return res.status(400).json({ error: 'Meeting was cancelled' });

    meeting.status      = 'live';
    meeting.actualStart = new Date();
    await meeting.save();

    console.log(`[Meeting:start] id=${meeting._id} room=${meeting.roomName} host=${req.user.email || req.user._id} role=${req.user.role}`);

    const meetingToken = generateMeetingToken(req.user._id.toString(), meeting._id.toString(), req.user.deviceId || null);

    let meetingUrl, jitsiToken;
    if (streamConfigured) {
      const lkToken = await generateLiveKitToken(req.user._id, req.user.name || req.user.email, meeting.roomName, true);
      meetingUrl = buildLiveKitRoomUrl(meeting, req.user, lkToken, true);
    } else {
      jitsiToken = generateJitsiToken(req.user, meeting.roomName, true);
      meetingUrl = buildJitsiMeetingUrl(meeting, req.user, true);
    }

    res.json({
      success: true, message: 'Meeting started',
      data: {
        roomName:    meeting.roomName,
        meetingUrl,
        password:    meeting.roomPassword,
        settings:    meeting.settings,
        jitsiToken:  jitsiToken || null,
        meetingToken,
        jitsiConfig: streamConfigured ? null : buildJitsiConfig(meeting, req.user, true),
        monitorUrl:  `${APP_BASE_URL}/meeting-monitor.html?meeting=${meeting._id}`,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── END ──────────────────────────────────────────────────────────────────────
exports.endMeeting = async (req, res) => {
  try {
    const meeting = req.meeting;
    if (meeting.status === 'ended') return res.status(400).json({ error: 'Meeting already ended' });

    meeting.status    = 'ended';
    meeting.actualEnd = new Date();
    await meeting.save();

    const now = new Date();

    // Finalise MeetingAttendance open sessions
    const openAttendance = await MeetingAttendance.find({ meeting: meeting._id, lastAction: 'joined' });
    for (const rec of openAttendance) {
      const last = rec.sessions[rec.sessions.length - 1];
      if (last && !last.leftAt) {
        last.leftAt  = now;
        last.minutes = Math.floor((now - last.joinedAt) / 60000);
      }
      rec.leftAt       = now;
      rec.lastAction   = 'left';
      rec.totalMinutes = rec.sessions.reduce((t, s) => t + (s.minutes || 0), 0);
      try {
        const { calculateStatus } = require('../utils/attendanceCalculator');
        rec.attendanceStatus = calculateStatus(rec.totalMinutes, meeting.scheduledStart, meeting.scheduledEnd);
      } catch (_) {}
      await rec.save();
    }

    // Finalise MeetingParticipant open sessions
    await MeetingParticipant.updateMany(
      { meeting: meeting._id, status: 'connected', leftAt: null },
      { $set: { status: 'disconnected', leftAt: now } }
    );

    // Notify all monitor dashboards
    broadcastMonitor(meeting._id.toString(), 'meeting_ended', { meetingId: meeting._id });

    res.json({ success: true, message: 'Meeting ended', data: meeting });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── CANCEL ───────────────────────────────────────────────────────────────────
exports.cancelMeeting = async (req, res) => {
  try {
    const meeting = req.meeting;
    if (['ended','cancelled'].includes(meeting.status))
      return res.status(400).json({ error: `Meeting is already ${meeting.status}` });
    meeting.status   = 'cancelled';
    meeting.isActive = false;
    await meeting.save();
    res.json({ success: true, message: 'Meeting cancelled' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── LOCK / UNLOCK ROOM ───────────────────────────────────────────────────────
exports.lockRoom = async (req, res) => {
  try {
    req.meeting.isLocked = true;
    await req.meeting.save();
    broadcastMonitor(String(req.params.id), 'room_locked', { isLocked: true });
    res.json({ success: true, message: 'Room locked — no new participants can join' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.unlockRoom = async (req, res) => {
  try {
    req.meeting.isLocked = false;
    await req.meeting.save();
    broadcastMonitor(String(req.params.id), 'room_locked', { isLocked: false });
    res.json({ success: true, message: 'Room unlocked' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── ADD / REMOVE INVIGILATOR ─────────────────────────────────────────────────
exports.addInvigilator = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const user = await User.findOne({ _id: userId, company: req.user.company }).select('name').lean();
    if (!user) return res.status(404).json({ error: 'User not found in your institution' });
    const meeting = req.meeting;
    if (!meeting.invigilators.map(String).includes(String(userId))) {
      meeting.invigilators.push(userId);
      await meeting.save();
    }
    res.json({ success: true, message: `${user.name} added as invigilator` });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.removeInvigilator = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    req.meeting.invigilators = req.meeting.invigilators.filter(i => String(i) !== String(userId));
    await req.meeting.save();
    res.json({ success: true, message: 'Invigilator removed' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── JOIN (returns Jitsi config + JWT) ───────────────────────────────────────
exports.joinMeeting = async (req, res) => {
  try {
    const meeting = req.meeting;
    const user    = req.user;

    const isMod = isMeetingModerator(meeting, user);

    if (meeting.status === 'scheduled') {
      if (isMod) {
        // Moderators implicitly start the meeting on first join — no separate /start call needed.
        meeting.status      = 'live';
        meeting.actualStart = new Date();
        await meeting.save();
        console.log(`[Meeting:join] auto-started id=${meeting._id} by moderator=${user.email || user._id}`);
      } else {
        return res.status(403).json({
          error: 'Meeting has not started yet.',
          status: 'scheduled',
          scheduledStart: meeting.scheduledStart,
        });
      }
    }
    if (meeting.status !== 'live') {
      return res.status(403).json({ error: `Meeting is ${meeting.status}.`, status: meeting.status });
    }

    console.log(`[Meeting:join] id=${meeting._id} room=${meeting.roomName} user=${user.email || user._id} role=${user.role} moderator=${isMod} locked=${meeting.isLocked}`);

    // Locked rooms: only moderators can still enter
    if (meeting.isLocked && !isMod) {
      console.log(`[Meeting:join] BLOCKED — room locked, user=${user.email || user._id}`);
      return res.status(403).json({ error: 'The room is locked. No new participants can join at this time.' });
    }

    // Participation check: verify user is actually allowed to join this meeting
    if (!isMod && !meeting.openToCompany) {
      const uid = user._id.toString();
      const allowed =
        (meeting.allowedUsers || []).some(u => String(u) === uid) ||
        (meeting.allowedCourses || []).some(c =>
          (user.enrolledCourses || []).map(String).includes(String(c))) ||
        (meeting.allowedDepartments || []).includes(String(user.department)) ||
        (meeting.allowedTeams || []).includes(String(user.team));
      if (!allowed) {
        console.log(`[Meeting:join] BLOCKED — not a participant, user=${user.email || user._id}`);
        return res.status(403).json({ error: 'You are not authorised to join this meeting.' });
      }
    }

    const meetingToken = generateMeetingToken(user._id.toString(), meeting._id.toString(), user.deviceId || null);

    let meetingUrl, jitsiToken, jitsiConfig;

    if (streamConfigured) {
      // ── LiveKit path ────────────────────────────────────────────────────
      const lkToken = await generateLiveKitToken(user._id, user.name || user.email, meeting.roomName, isMod);
      meetingUrl = buildLiveKitRoomUrl(meeting, user, lkToken, isMod);
    } else {
      // ── Jitsi fallback ──────────────────────────────────────────────────
      jitsiToken  = generateJitsiToken(user, meeting.roomName, isMod);
      jitsiConfig = buildJitsiConfig(meeting, user, isMod);
      meetingUrl  = buildJitsiMeetingUrl(meeting, user, isMod);
    }

    const meetingData = meeting.toObject ? meeting.toObject() : { ...meeting };
    if (!isMod) delete meetingData.roomPassword;

    res.json({
      success: true,
      data: {
        meeting: meetingData,
        meetingUrl,
        isModerator: isMod,
        meetingToken,
        // Jitsi fields (null when using GetStream)
        jitsiConfig: jitsiConfig || null,
        jitsiToken:  jitsiToken  || null,
        monitorUrl:  isMod ? `${MONITOR_BASE_URL}/monitor?meeting=${meeting._id}` : null,
        embedUrl: isMod
          ? `${APP_BASE_URL}/lecturer-meeting?meeting=${meeting._id}`
          : `${APP_BASE_URL}/session-preflight?meeting=${meeting._id}`,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── PREFLIGHT ────────────────────────────────────────────────────────────────
// POST /api/meetings/:id/preflight
// Initialises monitoring and device validation before the student enters Jitsi.
exports.preflightMeeting = async (req, res) => {
  try {
    const result = await runPreflight(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── RECONNECT ────────────────────────────────────────────────────────────────
// POST /api/meetings/:id/reconnect
// Called by the client when Jitsi reconnects so monitoring can be restored.
exports.reconnectMeeting = async (req, res) => {
  try {
    const result = await handleReconnect(req.params.id, req.user);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

// ─── VALIDATE TOKEN ───────────────────────────────────────────────────────────
exports.validateMeetingToken = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Missing token' });
    let decoded;
    try { decoded = verifyMeetingToken(token); } catch (e) {
      return res.status(401).json({ error: 'Invalid or expired meeting token' });
    }
    if (decoded.id !== req.user._id.toString()) return res.status(403).json({ error: 'Token mismatch' });
    const meeting = await Meeting.findById(decoded.meetingId);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.status !== 'live') return res.status(403).json({ error: 'Meeting is no longer live', status: meeting.status });
    res.json({
      valid: true,
      meeting: {
        id: meeting._id, title: meeting.title, roomName: meeting.roomName,
        status: meeting.status, settings: meeting.settings, meetingType: meeting.meetingType,
        isLocked: meeting.isLocked,
        roomPassword: meeting.settings?.enablePassword ? meeting.roomPassword : undefined,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── JITSI HEALTH ────────────────────────────────────────────────────────────
// GET /api/meetings/jitsi/health — verifies JWT generation and Jitsi reachability.
// Requires authentication so only logged-in users can probe this.
exports.jitsiHealth = async (req, res) => {
  const https = require('https');
  const result = {
    domain:    JITSI_DOMAIN,
    app_id:    JITSI_APP_ID,
    token_ok:  false,
    jitsi_reachable: false,
    xmpp_bosh_ok:    false,
    token_payload: null,
    error: null,
  };

  // 1. Verify token generation works
  try {
    const tok = generateJitsiToken(req.user, 'dikly_health_probe', false, 1);
    const decoded = require('jsonwebtoken').decode(tok);
    result.token_ok = true;
    result.token_payload = {
      iss:  decoded.iss,
      sub:  decoded.sub,
      aud:  decoded.aud,
      room: decoded.room,
      moderator: decoded.context?.user?.moderator,
      exp: new Date(decoded.exp * 1000).toISOString(),
    };
  } catch (e) {
    result.error = 'JWT generation failed: ' + e.message;
    console.error('[Jitsi:health] JWT error:', e.message);
    return res.status(500).json(result);
  }

  // 2. Check Jitsi web is reachable (BOSH endpoint returns 200 or 400 — both mean it's up)
  await new Promise(resolve => {
    const req2 = https.get(`https://${JITSI_DOMAIN}/http-bind`, r => {
      result.jitsi_reachable = true;
      result.xmpp_bosh_ok    = r.statusCode < 500;
      console.log(`[Jitsi:health] BOSH status=${r.statusCode}`);
      r.resume();
      resolve();
    });
    req2.on('error', e => {
      result.error = `Jitsi unreachable: ${e.message}`;
      console.error('[Jitsi:health] BOSH error:', e.message);
      resolve();
    });
    req2.setTimeout(5000, () => { req2.destroy(); resolve(); });
  });

  const ok = result.token_ok && result.jitsi_reachable;
  console.log(`[Jitsi:health] ${ok ? '✓ OK' : '✗ FAILED'} — domain=${JITSI_DOMAIN} bosh=${result.xmpp_bosh_ok}`);
  res.status(ok ? 200 : 502).json(result);
};

// ─── MUTE ALL (LiveKit) ───────────────────────────────────────────────────────
exports.muteAll = async (req, res) => {
  try {
    if (!streamConfigured) return res.status(503).json({ error: 'LiveKit not configured' });
    await muteAllInRoom(req.meeting.roomName);
    res.json({ success: true, message: 'All participants muted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── MUTE PARTICIPANT (LiveKit) ───────────────────────────────────────────────
exports.muteParticipant = async (req, res) => {
  try {
    if (!streamConfigured) return res.status(503).json({ error: 'LiveKit not configured' });
    await muteParticipantInRoom(req.meeting.roomName, req.params.uid);
    res.json({ success: true, message: 'Participant muted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteMeeting = async (req, res) => {
  try {
    if (req.meeting.status === 'live') return res.status(400).json({ error: 'End the meeting before deleting it' });
    req.meeting.isActive = false;
    await req.meeting.save();
    res.json({ success: true, message: 'Meeting deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── UPCOMING / LIVE / MY MEETINGS ───────────────────────────────────────────
exports.upcomingMeetings = async (req, res) => {
  try {
    const role  = (req.user.role || '').toLowerCase();
    const query = {
      company: req.user.company, isActive: true,
      status: 'scheduled', scheduledStart: { $gte: new Date() },
    };
    if (role === 'lecturer')
      query.$or = [{ creatorId: req.user._id }, { invigilators: req.user._id }];
    else if (['student','employee'].includes(role))
      query.$or = [{ allowedUsers: req.user._id }, { openToCompany: true },
        { allowedCourses: { $in: req.user.enrolledCourses || [] } }];
    const meetings = await Meeting.find(query).sort({ scheduledStart: 1 }).limit(10)
      .populate('creatorId','name').lean();
    res.json({ success: true, data: meetings });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.liveMeetings = async (req, res) => {
  try {
    const role  = (req.user.role || '').toLowerCase();
    const query = { company: req.user.company, isActive: true, status: 'live' };
    if (role === 'lecturer')
      query.$or = [{ creatorId: req.user._id }, { invigilators: req.user._id }];
    const meetings = await Meeting.find(query).populate('creatorId','name').lean();
    res.json({ success: true, data: meetings });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.myMeetings = async (req, res) => {
  try {
    const meetings = await Meeting.find({
      company: req.user.company, isActive: true,
      $or: [{ creatorId: req.user._id }, { invigilators: req.user._id }],
    }).sort({ scheduledStart: -1 }).limit(50).lean();
    res.json({ success: true, data: meetings });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

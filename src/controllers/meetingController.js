'use strict';
const Meeting            = require('../models/Meeting');
const MeetingAttendance  = require('../models/MeetingAttendance');
const MeetingParticipant = require('../models/MeetingParticipant');
const User               = require('../models/User');
const { generateRoomName }                             = require('../utils/generateRoomName');
const { generateMeetingToken, verifyMeetingToken }     = require('../utils/jwt');
const { generateJitsiToken, isSelfHosted, JITSI_DOMAIN, JITSI_APP_ID } = require('../services/jitsiTokenService');
const { configured: streamConfigured, muteAllInRoom, muteParticipantInRoom } = require('../services/livekitService');
const { broadcastMonitor }                             = require('./meetingMonitorController');

const APP_BASE_URL     = process.env.APP_BASE_URL     || 'https://dikly.live';
const MONITOR_BASE_URL = process.env.APP_SUBDOMAIN_MONITOR || `${APP_BASE_URL}`;
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

  // In lecture mode most students have cameras/mics OFF — optimise accordingly.
  // Lecturer (moderator) gets higher video quality; students get low-res receive.
  const lectureConfigOverwrite = isLecture ? {
    // Adaptive bitrate: send high quality from lecturer, receive low from students
    constraints: {
      video: {
        aspectRatio: 16 / 9,
        height: { ideal: 720, max: 1080, min: isMod ? 360 : 180 },
      },
    },
    // Reduce bandwidth for student receivers (lecture = mostly listen/watch)
    maxBitratesVideo: {
      low:    isMod ? 200000  : 100000,
      standard: isMod ? 500000 : 200000,
      high:   isMod ? 1500000 : 500000,
    },
    // Keep lecturer's video pinned by default for all participants
    defaultRemoteDisplayMode: 'tile',
    // Disable AV auto-mute prompts for students watching only
    enableNoisyMicDetection: true,
    // Simulcast: send 3 spatial layers from lecturer for adaptive quality
    enableLayerSuspension: true,
    enableUnifiedOnChrome: true,
    // Reduce CPU on student devices (mostly passive)
    p2p: { enabled: false },
    // Use VP8 with simulcast for better low-bandwidth compatibility
    preferH264: false,
    disableH264: false,
  } : {};

  return {
    roomName:    meeting.roomName,
    domain:      JITSI_DOMAIN,
    displayName: user.name || user.email,
    email:       user.email,
    subject:     meeting.title,
    isModerator: isMod,
    meetingType: meeting.meetingType,
    configOverwrite: {
      startWithAudioMuted:       meeting.settings?.muteOnJoin ?? true,
      // In lecture mode students start with video OFF to save bandwidth
      startWithVideoMuted:       isLecture && !isMod ? true : false,
      enableLobbyChat:           meeting.settings?.enableLobby ?? false,
      enableNoisyMicDetection:   true,
      disableDeepLinking:        true,
      enableWelcomePage:         false,
      prejoinPageEnabled:        false,
      disableThirdPartyRequests: true,
      // Reconnect handling
      enableReconnectingScreen:  true,
      connectionIndicators: { disabled: false, inactiveHidden: true },
      ...lectureConfigOverwrite,
    },
    interfaceConfigOverwrite: {
      SHOW_JITSI_WATERMARK:      false,
      SHOW_WATERMARK_FOR_GUESTS: false,
      MOBILE_APP_PROMO:          false,
      // In lecture mode hide irrelevant controls for students
      TOOLBAR_BUTTONS: isMod ? moderatorButtons : participantButtons,
      FILM_STRIP_MAX_HEIGHT: isLecture ? 60 : 120,
    },
  };
}

// ─── CREATE ───────────────────────────────────────────────────────────────────
exports.createMeeting = async (req, res, next) => {
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
      ? Math.random().toString(36).slice(2, 10).toUpperCase()
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
exports.listMeetings = async (req, res, next) => {
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
  } catch (err) { next(err); }
};

// ─── GET ONE ──────────────────────────────────────────────────────────────────
exports.getMeeting = async (req, res, next) => {
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
  } catch (err) { next(err); }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
exports.updateMeeting = async (req, res, next) => {
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
  } catch (err) { next(err); }
};

// ─── START ────────────────────────────────────────────────────────────────────
exports.startMeeting = async (req, res, next) => {
  try {
    const meeting = req.meeting;
    if (meeting.status === 'ended')     return res.status(400).json({ error: 'Meeting already ended' });
    if (meeting.status === 'cancelled') return res.status(400).json({ error: 'Meeting was cancelled' });

    meeting.status      = 'live';
    meeting.actualStart = new Date();
    await meeting.save();

    const jitsiToken  = generateJitsiToken(req.user, meeting.roomName, true);
    const meetingToken = generateMeetingToken(req.user._id.toString(), meeting._id.toString(), req.user.deviceId || null);

    res.json({
      success: true, message: 'Meeting started',
      data: {
        roomName:    meeting.roomName,
        joinUrl:     `https://${JITSI_DOMAIN}/${meeting.roomName}`,
        password:    meeting.roomPassword,
        settings:    meeting.settings,
        jitsiToken,
        meetingToken,
        selfHosted:  isSelfHosted(),
        jitsiConfig: buildJitsiConfig(meeting, req.user, true),
        monitorUrl:  `${MONITOR_BASE_URL}/monitor?meeting=${meeting._id}`,
      },
    });
  } catch (err) { next(err); }
};

// ─── END ──────────────────────────────────────────────────────────────────────
exports.endMeeting = async (req, res, next) => {
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
      } catch (err) {
        console.warn('[meeting:end] Failed to calculate attendance status:', err.message);
      }
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
  } catch (err) { next(err); }
};

// ─── CANCEL ───────────────────────────────────────────────────────────────────
exports.cancelMeeting = async (req, res, next) => {
  try {
    const meeting = req.meeting;
    if (['ended','cancelled'].includes(meeting.status))
      return res.status(400).json({ error: `Meeting is already ${meeting.status}` });
    meeting.status   = 'cancelled';
    meeting.isActive = false;
    await meeting.save();
    res.json({ success: true, message: 'Meeting cancelled' });
  } catch (err) { next(err); }
};

// ─── LOCK / UNLOCK ROOM ───────────────────────────────────────────────────────
exports.lockRoom = async (req, res, next) => {
  try {
    req.meeting.isLocked = true;
    await req.meeting.save();
    broadcastMonitor(String(req.params.id), 'room_locked', { isLocked: true });
    res.json({ success: true, message: 'Room locked — no new participants can join' });
  } catch (err) { next(err); }
};

exports.unlockRoom = async (req, res, next) => {
  try {
    req.meeting.isLocked = false;
    await req.meeting.save();
    broadcastMonitor(String(req.params.id), 'room_locked', { isLocked: false });
    res.json({ success: true, message: 'Room unlocked' });
  } catch (err) { next(err); }
};

// ─── ADD / REMOVE INVIGILATOR ─────────────────────────────────────────────────
exports.addInvigilator = async (req, res, next) => {
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
  } catch (err) { next(err); }
};

exports.removeInvigilator = async (req, res, next) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    req.meeting.invigilators = req.meeting.invigilators.filter(i => String(i) !== String(userId));
    await req.meeting.save();
    res.json({ success: true, message: 'Invigilator removed' });
  } catch (err) { next(err); }
};

// ─── JOIN (returns Jitsi config + JWT) ───────────────────────────────────────
exports.joinMeeting = async (req, res, next) => {
  try {
    const meeting = req.meeting;
    const user    = req.user;

    if (meeting.status === 'scheduled') {
      return res.status(403).json({
        error: 'Meeting has not started yet.',
        status: 'scheduled',
        scheduledStart: meeting.scheduledStart,
      });
    }
    if (meeting.status !== 'live') {
      return res.status(403).json({ error: `Meeting is ${meeting.status}.`, status: meeting.status });
    }

    const isMod = isMeetingModerator(meeting, user);

    // Locked rooms: only moderators can still enter
    if (meeting.isLocked && !isMod) {
      return res.status(403).json({ error: 'The room is locked. No new participants can join at this time.' });
    }

    const jitsiToken  = generateJitsiToken(user, meeting.roomName, isMod);
    const meetingToken = generateMeetingToken(user._id.toString(), meeting._id.toString(), user.deviceId || null);

    res.json({
      success: true,
      data: {
        meeting,
        jitsiConfig:  buildJitsiConfig(meeting, user, isMod),
        jitsiToken,
        meetingToken,
        selfHosted:   isSelfHosted(),
        isModerator:  isMod,
        monitorUrl:   isMod
          ? `${MONITOR_BASE_URL}/monitor?meeting=${meeting._id}`
          : null,
      },
    });
  } catch (err) { next(err); }
};

// ─── VALIDATE TOKEN ───────────────────────────────────────────────────────────
exports.validateMeetingToken = async (req, res, next) => {
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
        roomPassword: meeting.settings.enablePassword ? meeting.roomPassword : undefined,
      },
    });
  } catch (err) { next(err); }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteMeeting = async (req, res, next) => {
  try {
    if (req.meeting.status === 'live') return res.status(400).json({ error: 'End the meeting before deleting it' });
    req.meeting.isActive = false;
    await req.meeting.save();
    res.json({ success: true, message: 'Meeting deleted' });
  } catch (err) { next(err); }
};

// ─── UPCOMING / LIVE / MY MEETINGS ───────────────────────────────────────────
exports.upcomingMeetings = async (req, res, next) => {
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
  } catch (err) { next(err); }
};

exports.liveMeetings = async (req, res, next) => {
  try {
    const role  = (req.user.role || '').toLowerCase();
    const query = { company: req.user.company, isActive: true, status: 'live' };
    if (role === 'lecturer')
      query.$or = [{ creatorId: req.user._id }, { invigilators: req.user._id }];
    const meetings = await Meeting.find(query).populate('creatorId','name').lean();
    res.json({ success: true, data: meetings });
  } catch (err) { next(err); }
};

exports.myMeetings = async (req, res, next) => {
  try {
    const meetings = await Meeting.find({
      company: req.user.company, isActive: true,
      $or: [{ creatorId: req.user._id }, { invigilators: req.user._id }],
    }).sort({ scheduledStart: -1 }).limit(50).lean();
    res.json({ success: true, data: meetings });
  } catch (err) { next(err); }
};

// ─── JITSI HEALTH CHECK ───────────────────────────────────────────────────────
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
    return res.status(500).json(result);
  }

  await new Promise(resolve => {
    const req2 = https.get(`https://${JITSI_DOMAIN}/http-bind`, r => {
      result.jitsi_reachable = true;
      result.xmpp_bosh_ok    = r.statusCode < 500;
      r.resume();
      resolve();
    });
    req2.on('error', e => {
      result.error = `Jitsi unreachable: ${e.message}`;
      resolve();
    });
    req2.setTimeout(5000, () => { req2.destroy(); resolve(); });
  });

  const ok = result.token_ok && result.jitsi_reachable;
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

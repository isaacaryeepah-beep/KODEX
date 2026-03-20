const mongoose = require("mongoose");
const JitsiMeeting = require("../models/JitsiMeeting");
const JitsiAttendance = require("../models/JitsiAttendance");
const Company = require("../models/Company");

const JITSI_DOMAIN = "meet.jit.si";

exports.createMeeting = async (req, res) => {
  try {
    const { companyId, sessionId } = req.body;

    if (!companyId || !sessionId) {
      return res.status(400).json({ error: "companyId and sessionId are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(companyId) || !mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ error: "Invalid companyId or sessionId" });
    }

    if (req.user.company.toString() !== companyId.toString()) {
      return res.status(403).json({ error: "Cross-company access denied" });
    }

    const company = await Company.findById(companyId);
    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    if (!company.subscriptionActive && !company.isTrialActive) {
      return res.status(403).json({
        error: "Subscription inactive. Upgrade required.",
      });
    }

    const roomName = JitsiMeeting.generateRoomName(companyId, sessionId);
    const joinUrl = `https://${JITSI_DOMAIN}/${roomName}`;

    const meeting = await JitsiMeeting.create({
      roomName,
      companyId,
      sessionId,
      createdBy: req.user._id,
      startTime: new Date(),
    });

    res.status(201).json({
      meetingId: meeting._id,
      roomName: meeting.roomName,
      joinUrl,
    });
  } catch (error) {
    console.error("Jitsi create meeting error:", error);
    res.status(500).json({ error: "Failed to create meeting" });
  }
};

exports.endMeeting = async (req, res) => {
  try {
    const { meetingId } = req.body;

    if (!meetingId || !mongoose.Types.ObjectId.isValid(meetingId)) {
      return res.status(400).json({ error: "Valid meetingId is required" });
    }

    const meeting = await JitsiMeeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    if (meeting.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Only the meeting creator can end this meeting" });
    }

    if (meeting.endTime) {
      return res.status(400).json({ error: "Meeting has already ended" });
    }

    meeting.endTime = new Date();
    await meeting.save();

    res.json({
      message: "Meeting ended successfully",
      meetingId: meeting._id,
      endTime: meeting.endTime,
    });
  } catch (error) {
    console.error("Jitsi end meeting error:", error);
    res.status(500).json({ error: "Failed to end meeting" });
  }
};

exports.joinMeeting = async (req, res) => {
  try {
    const { roomName } = req.params;

    if (!roomName) {
      return res.status(400).json({ error: "roomName is required" });
    }

    const meeting = await JitsiMeeting.findOne({ roomName });

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    if (req.user.company.toString() !== meeting.companyId.toString()) {
      return res.status(403).json({ error: "Cross-company meeting access denied" });
    }

    if (meeting.endTime) {
      return res.status(400).json({ error: "Meeting has already ended" });
    }

    const joinUrl = `https://${JITSI_DOMAIN}/${roomName}`;

    res.json({ joinUrl });
  } catch (error) {
    console.error("Jitsi join meeting error:", error);
    res.status(500).json({ error: "Failed to join meeting" });
  }
};

exports.trackAttendance = async (req, res) => {
  try {
    const { meetingId, action } = req.body;

    if (!meetingId || !action) {
      return res.status(400).json({ error: "meetingId and action are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      return res.status(400).json({ error: "Invalid meetingId" });
    }

    if (!["join", "leave"].includes(action)) {
      return res.status(400).json({ error: "action must be 'join' or 'leave'" });
    }

    const meeting = await JitsiMeeting.findById(meetingId);

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    if (req.user.company.toString() !== meeting.companyId.toString()) {
      return res.status(403).json({ error: "Cross-company access denied" });
    }

    const record = await JitsiAttendance.create({
      userId: req.user._id,
      meetingId,
      action,
      timestamp: new Date(),
    });

    res.status(201).json({
      message: `Attendance ${action} recorded`,
      attendance: {
        userId: record.userId,
        meetingId: record.meetingId,
        action: record.action,
        timestamp: record.timestamp,
      },
    });
  } catch (error) {
    console.error("Jitsi attendance tracking error:", error);
    res.status(500).json({ error: "Failed to record attendance" });
  }
};

// ── Get meeting attendance list ───────────────────────────────────────────────
exports.getMeetingAttendance = async (req, res) => {
  try {
    const { meetingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      return res.status(400).json({ error: 'Invalid meetingId' });
    }

    const meeting = await JitsiMeeting.findById(meetingId);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (req.user.company.toString() !== meeting.companyId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const records = await JitsiAttendance.find({ meetingId })
      .populate('userId', 'name email indexNumber role')
      .sort({ timestamp: 1 });

    // Build per-user summary: join time, leave time, duration
    const userMap = {};
    for (const r of records) {
      const uid = r.userId?._id?.toString();
      if (!uid) continue;
      if (!userMap[uid]) {
        userMap[uid] = { user: r.userId, joinTime: null, leaveTime: null };
      }
      if (r.action === 'join' && !userMap[uid].joinTime) userMap[uid].joinTime = r.timestamp;
      if (r.action === 'leave') userMap[uid].leaveTime = r.timestamp;
    }

    const attendance = Object.values(userMap).map(u => {
      const join = u.joinTime;
      const leave = u.leaveTime || meeting.endTime || new Date();
      const durationMs = join ? (leave - join) : 0;
      const durationMin = Math.round(durationMs / 60000);
      return {
        user: u.user,
        joinTime: join,
        leaveTime: u.leaveTime,
        durationMinutes: durationMin,
        status: durationMin >= 30 ? 'present' : durationMin > 0 ? 'partial' : 'absent',
      };
    });

    res.json({ meeting, attendance, total: attendance.length });
  } catch (error) {
    console.error('Get meeting attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
};

// ── Download meeting attendance as CSV (PDF generated client-side) ────────────
exports.getMeetingAttendanceCSV = async (req, res) => {
  try {
    const { meetingId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(meetingId)) {
      return res.status(400).json({ error: 'Invalid meetingId' });
    }

    const meeting = await JitsiMeeting.findById(meetingId).populate('sessionId', 'title');
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (req.user.company.toString() !== meeting.companyId.toString()) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const records = await JitsiAttendance.find({ meetingId })
      .populate('userId', 'name email indexNumber role')
      .sort({ timestamp: 1 });

    const userMap = {};
    for (const r of records) {
      const uid = r.userId?._id?.toString();
      if (!uid) continue;
      if (!userMap[uid]) userMap[uid] = { user: r.userId, joinTime: null, leaveTime: null };
      if (r.action === 'join' && !userMap[uid].joinTime) userMap[uid].joinTime = r.timestamp;
      if (r.action === 'leave') userMap[uid].leaveTime = r.timestamp;
    }

    const rows = [['Name', 'Email / Index', 'Role', 'Join Time', 'Leave Time', 'Duration (mins)', 'Status']];
    for (const u of Object.values(userMap)) {
      const join = u.joinTime;
      const leave = u.leaveTime || meeting.endTime || new Date();
      const dur = join ? Math.round((leave - join) / 60000) : 0;
      const status = dur >= 30 ? 'Present' : dur > 0 ? 'Partial' : 'Absent';
      rows.push([
        u.user?.name || '',
        u.user?.email || u.user?.indexNumber || '',
        u.user?.role || '',
        join ? new Date(join).toLocaleString() : '',
        u.leaveTime ? new Date(u.leaveTime).toLocaleString() : 'Still in meeting',
        dur,
        status,
      ]);
    }

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const title = meeting.sessionId?.title || 'Meeting';
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${title}_attendance.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Meeting attendance CSV error:', error);
    res.status(500).json({ error: 'Failed to generate CSV' });
  }
};

const mongoose = require("mongoose");
const ZoomMeeting = require("../models/ZoomMeeting");
const User = require("../models/User");
const AttendanceSession = require("../models/AttendanceSession");
const AttendanceRecord = require("../models/AttendanceRecord");

const JITSI_DOMAIN = "meet.jit.si";

exports.createMeeting = async (req, res) => {
  try {
    const { title, scheduledStart, scheduledEnd, duration, participants, sessionId, courseId, isRecurring, recurringPattern } = req.body;

    if (!title || !scheduledStart || !scheduledEnd) {
      return res.status(400).json({ error: "Title, scheduledStart, and scheduledEnd are required" });
    }

    const start = new Date(scheduledStart);
    const end = new Date(scheduledEnd);
    if (end <= start) {
      return res.status(400).json({ error: "End time must be after start time" });
    }

    const calcDuration = duration || Math.round((end - start) / 60000);

    let validParticipants = [];
    if (participants && Array.isArray(participants) && participants.length > 0) {
      const users = await User.find({
        _id: { $in: participants },
        company: req.user.company,
        isActive: true,
      });
      validParticipants = users.map((u) => u._id);
    }

    if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
      const session = await AttendanceSession.findOne({ _id: sessionId, company: req.user.company });
      if (!session) {
        return res.status(404).json({ error: "Attendance session not found" });
      }
    }

    const roomName = ZoomMeeting.generateRoomName(req.user.company);
    const joinUrl = `https://${JITSI_DOMAIN}/${roomName}`;

    const meeting = await ZoomMeeting.create({
      title,
      company: req.user.company,
      createdBy: req.user._id,
      session: sessionId || null,
      course: courseId || null,
      roomName,
      joinUrl,
      scheduledStart: start,
      scheduledEnd: end,
      duration: calcDuration,
      participants: validParticipants,
      isRecurring: isRecurring || false,
      recurringPattern: recurringPattern || null,
      status: "scheduled",
    });

    const populated = await meeting.populate([
      { path: "createdBy", select: "name email" },
      { path: "company", select: "name" },
      { path: "participants", select: "name email indexNumber role" },
      { path: "course", select: "title code" },
    ]);

    res.status(201).json({ meeting: populated });
  } catch (error) {
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ error: messages.join(", ") });
    }
    console.error("Create meeting error:", error);
    res.status(500).json({ error: "Failed to create meeting" });
  }
};

exports.listMeetings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = { company: req.user.company };

    if (status) filter.status = status;

    // Lecturers can only see meetings they created — no cross-lecturer visibility
    if (req.user.role === "lecturer") {
      filter.createdBy = req.user._id;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [meetings, total] = await Promise.all([
      ZoomMeeting.find(filter)
        .sort({ scheduledStart: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate("createdBy", "name email")
        .populate("company", "name")
        .populate("participants", "name email indexNumber role")
        .populate("course", "title code"),
      ZoomMeeting.countDocuments(filter),
    ]);

    res.json({
      meetings,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("List meetings error:", error);
    res.status(500).json({ error: "Failed to fetch meetings" });
  }
};

exports.getMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid meeting ID" });
    }

    // Lecturers can only fetch their own meetings
    const meetingFilter = { _id: id, company: req.user.company };
    if (req.user.role === "lecturer") {
      meetingFilter.createdBy = req.user._id;
    }

    const meeting = await ZoomMeeting.findOne(meetingFilter)
      .populate("createdBy", "name email")
      .populate("company", "name")
      .populate("participants", "name email indexNumber role")
      .populate("course", "title code")
      .populate("attendees.user", "name email indexNumber role");

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    res.json({ meeting });
  } catch (error) {
    console.error("Get meeting error:", error);
    res.status(500).json({ error: "Failed to fetch meeting" });
  }
};

exports.startMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid meeting ID" });
    }

    const filter = { _id: id, company: req.user.company };
    if (!["admin", "superadmin"].includes(req.user.role)) {
      filter.createdBy = req.user._id;
    }

    const meeting = await ZoomMeeting.findOne(filter);

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found or access denied" });
    }

    if (meeting.status === "completed" || meeting.status === "cancelled") {
      return res.status(400).json({ error: `Meeting is already ${meeting.status}` });
    }

    meeting.status = "active";
    await meeting.save();

    res.json({ meeting, joinUrl: meeting.joinUrl });
  } catch (error) {
    console.error("Start meeting error:", error);
    res.status(500).json({ error: "Failed to start meeting" });
  }
};

exports.joinMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid meeting ID" });
    }

    const joinFilter = { _id: id, company: req.user.company };
    // Lecturers can only join their own meetings — not other lecturers'
    if (req.user.role === 'lecturer') {
      joinFilter.createdBy = req.user._id;
    }

    const meeting = await ZoomMeeting.findOne(joinFilter);

    if (!meeting) {
      return res.status(404).json({ error: 'Meeting not found or access denied' });
    }

    if (meeting.status === 'completed' || meeting.status === 'cancelled') {
      return res.status(400).json({ error: `Meeting is ${meeting.status} and cannot be joined` });
    }

    if (meeting.status === "scheduled") {
      meeting.status = "active";
    }

    const existingAttendee = meeting.attendees.find(
      (a) => a.user.toString() === req.user._id.toString()
    );

    if (!existingAttendee) {
      const now = new Date();
      const isLate = now > new Date(meeting.scheduledStart);

      meeting.attendees.push({
        user: req.user._id,
        joinedAt: now,
        status: isLate ? "late" : "joined",
      });
    }

    await meeting.save();

    if (meeting.session) {
      try {
        const session = await AttendanceSession.findOne({
          _id: meeting.session,
          company: req.user.company,
          status: "active",
        });

        if (session) {
          const existingRecord = await AttendanceRecord.findOne({
            session: session._id,
            user: req.user._id,
          });

          if (!existingRecord) {
            await AttendanceRecord.create({
              session: session._id,
              user: req.user._id,
              company: req.user.company,
              checkInTime: new Date(),
              status: new Date() > new Date(meeting.scheduledStart) ? "late" : "present",
              method: "jitsi_join",
            });
          }
        }
      } catch (attErr) {
        console.error("Attendance record via jitsi join error:", attErr);
      }
    }

    res.json({
      message: existingAttendee ? "Already joined" : "Joined meeting successfully",
      joinUrl: meeting.joinUrl,
      roomName: meeting.roomName,
      status: existingAttendee ? existingAttendee.status : (new Date() > new Date(meeting.scheduledStart) ? "late" : "joined"),
    });
  } catch (error) {
    console.error("Join meeting error:", error);
    res.status(500).json({ error: "Failed to join meeting" });
  }
};

exports.endMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid meeting ID" });
    }

    const filter = { _id: id, company: req.user.company };
    if (!["admin", "superadmin"].includes(req.user.role)) {
      filter.createdBy = req.user._id;
    }

    const meeting = await ZoomMeeting.findOne(filter);

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found or access denied" });
    }

    if (meeting.status === "completed") {
      return res.status(400).json({ error: "Meeting is already ended" });
    }

    if (meeting.status === "cancelled") {
      return res.status(400).json({ error: "Meeting was cancelled" });
    }

    const now = new Date();
    meeting.attendees.forEach((a) => {
      if (!a.leftAt) {
        a.leftAt = now;
      }
    });

    meeting.status = "completed";
    await meeting.save();

    const populated = await ZoomMeeting.findById(meeting._id)
      .populate("attendees.user", "name email indexNumber role")
      .populate("createdBy", "name email");

    res.json({
      message: "Meeting ended successfully",
      meeting: populated,
      attendeesCount: meeting.attendees.length,
    });
  } catch (error) {
    console.error("End meeting error:", error);
    res.status(500).json({ error: "Failed to end meeting" });
  }
};

exports.cancelMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid meeting ID" });
    }

    const filter = { _id: id, company: req.user.company };
    if (!["admin", "superadmin"].includes(req.user.role)) {
      filter.createdBy = req.user._id;
    }

    const meeting = await ZoomMeeting.findOne(filter);

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found or access denied" });
    }

    if (meeting.status === "completed") {
      return res.status(400).json({ error: "Cannot cancel a completed meeting" });
    }

    meeting.status = "cancelled";
    await meeting.save();

    res.json({ message: "Meeting cancelled", meeting });
  } catch (error) {
    console.error("Cancel meeting error:", error);
    res.status(500).json({ error: "Failed to cancel meeting" });
  }
};

exports.getMeetingAttendees = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid meeting ID" });
    }

    const attendeesFilter = { _id: id, company: req.user.company };
    if (req.user.role === 'lecturer') {
      attendeesFilter.createdBy = req.user._id;
    }

    const meeting = await ZoomMeeting.findOne(attendeesFilter)
      .populate('attendees.user', 'name email indexNumber role')
      .select('title status attendees scheduledStart scheduledEnd');

    if (!meeting) {
      return res.status(404).json({ error: "Meeting not found" });
    }

    res.json({
      title: meeting.title,
      status: meeting.status,
      attendees: meeting.attendees,
      totalAttendees: meeting.attendees.length,
    });
  } catch (error) {
    console.error("Get meeting attendees error:", error);
    res.status(500).json({ error: "Failed to fetch attendees" });
  }
};

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

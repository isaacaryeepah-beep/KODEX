const mongoose = require("mongoose");
const crypto = require("crypto");

const jitsiMeetingSchema = new mongoose.Schema(
  {
    roomName: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceSession",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    startTime: {
      type: Date,
      default: Date.now,
    },
    endTime: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: false,
  }
);

jitsiMeetingSchema.index({ companyId: 1, sessionId: 1 });

jitsiMeetingSchema.statics.generateRoomName = function (companyId, sessionId) {
  const hash = crypto.randomBytes(3).toString("hex");
  return `${companyId}_${sessionId}_${hash}`;
};

module.exports = mongoose.model("JitsiMeeting", jitsiMeetingSchema);

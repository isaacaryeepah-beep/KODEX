const mongoose = require("mongoose");

const jitsiAttendanceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    meetingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "JitsiMeeting",
      required: true,
    },
    action: {
      type: String,
      enum: ["join", "leave"],
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

jitsiAttendanceSchema.index({ meetingId: 1, userId: 1 });
jitsiAttendanceSchema.index({ userId: 1, action: 1 });

module.exports = mongoose.model("JitsiAttendance", jitsiAttendanceSchema);

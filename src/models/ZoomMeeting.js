const mongoose = require("mongoose");
const crypto = require("crypto");

const meetingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Meeting title is required"],
      trim: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceSession",
      default: null,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },
    roomName: {
      type: String,
      required: true,
      unique: true,
    },
    joinUrl: {
      type: String,
      required: true,
    },
    scheduledStart: {
      type: Date,
      required: [true, "Scheduled start time is required"],
    },
    scheduledEnd: {
      type: Date,
      required: [true, "Scheduled end time is required"],
    },
    duration: {
      type: Number,
      required: true,
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
    recurringPattern: {
      type: String,
      enum: ["daily", "weekly", "biweekly", "monthly", null],
      default: null,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    attendees: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        joinedAt: Date,
        leftAt: Date,
        status: {
          type: String,
          enum: ["joined", "late", "absent"],
          default: "absent",
        },
      },
    ],
    status: {
      type: String,
      enum: ["scheduled", "active", "completed", "cancelled"],
      default: "scheduled",
    },
  },
  {
    timestamps: true,
  }
);

meetingSchema.index({ company: 1, scheduledStart: -1 });
meetingSchema.index({ company: 1, status: 1 });

meetingSchema.statics.generateRoomName = function (companyId) {
  const hash = crypto.randomBytes(8).toString("hex");
  return `sa-${companyId.toString().slice(-6)}-${hash}`;
};

module.exports = mongoose.model("ZoomMeeting", meetingSchema);

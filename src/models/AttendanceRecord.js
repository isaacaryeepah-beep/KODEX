const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceSession",
      required: [true, "Session is required"],
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },
    checkInTime: {
      type: Date,
      default: Date.now,
    },
    checkOutTime: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: ["present", "late", "absent", "excused"],
      default: "present",
    },
    method: {
      type: String,
      enum: ["qr_mark", "code_mark", "ble_mark", "jitsi_join", "manual"],
      default: "manual",
    },
    deviceId: {
      type: String,
      default: null,
    },
    qrToken: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QrToken",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

attendanceRecordSchema.index({ session: 1, user: 1 }, { unique: true });
attendanceRecordSchema.index({ company: 1, user: 1, checkInTime: -1 });

module.exports = mongoose.model("AttendanceRecord", attendanceRecordSchema);

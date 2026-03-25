const mongoose = require("mongoose");

const attendanceSessionSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
    title: {
      type: String,
      trim: true,
      default: "",
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "stopped"],
      default: "active",
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    stoppedAt: {
      type: Date,
      default: null,
    },
    stoppedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    qrSeed: {
      type: String,
      default: null,
    },
    // ESP32 V2: shared HMAC seed for rotating code derivation
    // Both ESP32 and server derive the same 6-digit code from seed + time slot
    esp32Seed: {
      type: String,
      default: null,
    },
    // Session window duration in seconds (used by ESP32 to auto-close)
    durationSeconds: {
      type: Number,
      default: 300,
    },
    bleLocationId: {
      type: String,
      default: null,
    },
    // Single-use BLE token tracking — prevents token sharing/replay attacks
    usedBleTokens: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

attendanceSessionSchema.index({ company: 1, status: 1 });
attendanceSessionSchema.index({ company: 1, startedAt: -1 });

module.exports = mongoose.model("AttendanceSession", attendanceSessionSchema);

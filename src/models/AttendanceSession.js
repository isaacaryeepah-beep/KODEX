const mongoose = require("mongoose");

const attendanceSessionSchema = new mongoose.Schema(
  {
    // ── EXISTING FIELDS (unchanged) ──────────────────────────────────────────
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
      enum: ["active", "stopped", "device_disconnected"],
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
    // How the session ended: 'manual' | 'esp32_offline' | 'duration_expired' | 'heartbeat_timeout'
    stoppedReason: {
      type: String,
      default: null,
    },
    qrSeed: {
      type: String,
      default: null,
    },
    esp32Seed: {
      type: String,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: 300,
    },
    bleLocationId: {
      type: String,
      default: null,
    },
    usedBleTokens: {
      type: [String],
      default: [],
    },

    // ── NEW FIELDS (added for multi-dept + device ownership) ─────────────────
    // Device bound to this session
    deviceId: {
      type: String,
      default: null,
    },
    // Department this session is for
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    // Class level e.g. "Level 200", "Year 2"
    classLevel: {
      type: String,
      default: null,
    },
    // Room if applicable
    room: {
      type: String,
      default: null,
    },
    // Rotating code (current)
    currentCode: {
      type: String,
      default: null,
    },
    lastCodeRotation: {
      type: Date,
      default: null,
    },
    // Block attendance if device goes offline
    requiresDeviceOnline: {
      type: Boolean,
      default: true,
    },
    // online | offline-ready
    mode: {
      type: String,
      enum: ["online", "offline-ready"],
      default: "online",
    },
    // Total students marked
    totalMarked: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// ── INDEXES ──────────────────────────────────────────────────────────────────
attendanceSessionSchema.index({ company: 1, status: 1 });
attendanceSessionSchema.index({ company: 1, startedAt: -1 });
attendanceSessionSchema.index({ deviceId: 1, status: 1 });
attendanceSessionSchema.index({ createdBy: 1, status: 1 });

module.exports = mongoose.model("AttendanceSession", attendanceSessionSchema);

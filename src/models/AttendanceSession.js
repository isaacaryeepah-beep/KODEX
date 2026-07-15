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
      enum: [
        "scheduled",        // pre-created, not yet started (dashboard flow)
        "active",           // started via legacy flow (equivalent to "live")
        "live",             // started via dashboard flow
        "paused",           // temporarily paused by lecturer
        "locked",           // no new marks accepted
        "stopped",          // stopped via legacy flow
        "ended",            // ended via dashboard flow
        "device_disconnected",
      ],
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
    // Restrict session to a specific student group (e.g. "A", "B", "C").
    // null means all enrolled students in the course can mark attendance.
    targetGroup: {
      type: String,
      default: null,
      trim: true,
    },
    // Room if applicable
    room: {
      type: String,
      default: null,
    },
    // ── GPS geofence mode (hardware-free backup) ─────────────────────────────
    // When all three are set the session accepts gps_mark: students submit
    // their own position and the server checks distance-from-center. Used as
    // the lecturer-selectable fallback when no ESP32 is available.
    geoLat: {
      type: Number,
      default: null,
    },
    geoLng: {
      type: Number,
      default: null,
    },
    geoRadiusMeters: {
      type: Number,
      default: null,
      min: 20,
      max: 1000,
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
    // Original local ID assigned by the device (e.g. "local_AABB_1234567").
    // Set when a device-initiated session is synced to the server so we can
    // deduplicate re-syncs of the same session.
    deviceLocalId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },

    // ── Session Dashboard fields ──────────────────────────────────────────────
    // Timestamp when session was paused (dashboard flow)
    pausedAt: { type: Date, default: null },
    // Timestamp when session was locked (dashboard flow)
    lockedAt: { type: Date, default: null },
    // Physical venue / room name
    venue: { type: String, default: null },
    // Whether to enforce network proximity check
    networkEnforcement: { type: Boolean, default: false },
    // How often the QR code rotates (seconds)
    codeRotationSeconds: { type: Number, default: 30, min: 15, max: 120 },
    // When current QR code was last generated
    currentCodeGeneratedAt: { type: Date, default: null },
    // Linked meeting session (optional)
    linkedMeetingId: { type: mongoose.Schema.Types.ObjectId, ref: "Meeting", default: null },
    // Lecturer notes visible on dashboard
    notes: { type: String, default: null },
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

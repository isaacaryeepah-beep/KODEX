const mongoose = require("mongoose");

const attendanceRecordSchema = new mongoose.Schema(
  {
    // ── EXISTING FIELDS (unchanged) ──────────────────────────────────────────
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
      enum: ["qr_mark", "code_mark", "ble_mark", "jitsi_join", "manual", "esp32_ap", "gps_mark"],
      default: "manual",
    },
    deviceId: {
      type: String,
      default: null,
    },
    // GPS geofence marking (gps_mark) audit trail. Only the computed
    // distance-from-center and the device-reported accuracy are stored —
    // never the student's raw coordinates.
    gpsDistanceMeters: {
      type: Number,
      default: null,
    },
    gpsAccuracy: {
      type: Number,
      default: null,
    },
    qrToken: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QrToken",
      default: null,
    },

    // ── NEW FIELDS (added for offline sync + anti-cheat) ─────────────────────
    // The 6-digit HMAC code the student submitted
    codeUsed: {
      type: String,
      default: null,
    },
    // synced = came in online, pending = saved on SD card and synced later
    syncStatus: {
      type: String,
      enum: ["synced", "pending"],
      default: "synced",
    },
    syncedAt: {
      type: Date,
      default: null,
    },

    // ── Anti-cheat flags ──────────────────────────────────────────────────────
    // Set automatically when deviceId has never been seen before for this student.
    // Lecturers can see these on the session dashboard and resolve them.
    newDeviceFlag: { type: Boolean, default: false },
    flagged:       { type: Boolean, default: false },
    flagNote:      { type: String,  default: null },
    confirmedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
  }
);

// ── INDEXES ──────────────────────────────────────────────────────────────────
attendanceRecordSchema.index({ session: 1, user: 1 }, { unique: true });
attendanceRecordSchema.index({ company: 1, user: 1, checkInTime: -1 });
attendanceRecordSchema.index({ syncStatus: 1 });
attendanceRecordSchema.index({ company: 1, newDeviceFlag: 1 });
attendanceRecordSchema.index({ company: 1, flagged: 1 });
// `deviceId` had no index anywhere -- the per-mark device-lock check
// ({company, deviceId, user:$ne, checkInTime range}, sorted checkInTime)
// runs on every single attendance mark and previously only had `company`
// to narrow on.
attendanceRecordSchema.index({ company: 1, deviceId: 1, checkInTime: -1 });
// Covers the admin dashboard's 30-day attendance trend aggregate
// ({company, checkInTime range}) -- the only prior compound needing
// checkInTime also required an exact `user` match first.
attendanceRecordSchema.index({ company: 1, checkInTime: 1 });

module.exports = mongoose.model("AttendanceRecord", attendanceRecordSchema);

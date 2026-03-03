const mongoose = require("mongoose");

const proctorLogSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuizSession",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    // Event classification
    eventType: {
      type: String,
      enum: [
        "tab_switch",
        "app_background",
        "app_foreground",
        "orientation_change",
        "camera_disabled",
        "camera_enabled",
        "face_missing",
        "face_detected",
        "multiple_faces",
        "face_off_center",
        "device_lock",
        "session_conflict",
        "identity_mismatch",
        "rapid_switching",
        "exam_started",
        "exam_submitted",
        "exam_terminated",
        "warning_issued",
        "heartbeat",
        "copy_attempt",
        "screenshot_attempt",
      ],
      required: true,
    },

    // Severity
    severity: {
      type: String,
      enum: ["info", "warning", "critical"],
      default: "info",
    },

    // Violation level this event triggered (0 = none, 1 = log, 2 = warn, 3 = terminate)
    violationLevel: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },

    // Duration for background events (in seconds)
    duration: {
      type: Number,
      default: null,
    },

    // Additional metadata
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

proctorLogSchema.index({ session: 1, timestamp: -1 });
proctorLogSchema.index({ quiz: 1, student: 1 });

module.exports = mongoose.model("ProctorLog", proctorLogSchema);

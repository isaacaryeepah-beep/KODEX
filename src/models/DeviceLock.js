const mongoose = require("mongoose");

const deviceLockSchema = new mongoose.Schema(
  {
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
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "QuizSession",
      required: true,
    },
    sessionToken: {
      type: String,
      required: true,
    },
    deviceFingerprint: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    platform: {
      type: String,
      default: "unknown",
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lockedAt: {
      type: Date,
      default: Date.now,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
    releaseReason: {
      type: String,
      enum: ["submitted", "terminated", "expired", "manual"],
      default: null,
    },
  },
  { timestamps: true }
);

// Only one active lock per student+quiz
deviceLockSchema.index(
  { student: 1, quiz: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model("DeviceLock", deviceLockSchema);

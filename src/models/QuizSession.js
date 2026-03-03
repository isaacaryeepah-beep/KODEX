const mongoose = require("mongoose");

const quizSessionSchema = new mongoose.Schema(
  {
    quiz: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Quiz",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    attempt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attempt",
      required: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },

    // Device lock fields
    sessionToken: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    deviceFingerprint: {
      type: String,
      required: true,
    },
    ipAddress: {
      type: String,
      default: null,
    },
    userAgent: {
      type: String,
      default: null,
    },
    platform: {
      type: String,
      enum: ["mobile", "tablet", "desktop", "unknown"],
      default: "unknown",
    },
    os: {
      type: String,
      default: null,
    },
    browser: {
      type: String,
      default: null,
    },

    // Proctoring state
    status: {
      type: String,
      enum: ["active", "terminated", "completed", "expired"],
      default: "active",
    },
    terminationReason: {
      type: String,
      default: null,
    },

    // Violation tracking
    violationLevel: {
      type: Number,
      default: 0,
      min: 0,
      max: 3,
    },
    totalViolations: {
      type: Number,
      default: 0,
    },
    warningsIssued: {
      type: Number,
      default: 0,
    },

    // Identity verification
    identityVerified: {
      type: Boolean,
      default: false,
    },
    startSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Snapshot",
      default: null,
    },
    endSnapshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Snapshot",
      default: null,
    },
    faceSimilarityScore: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
    },

    // Integrity scoring (0–100)
    integrityScore: {
      type: Number,
      default: 100,
      min: 0,
      max: 100,
    },

    startedAt: {
      type: Date,
      default: Date.now,
    },
    lastHeartbeat: {
      type: Date,
      default: Date.now,
    },
    endedAt: {
      type: Date,
      default: null,
    },

    // Consent
    consentGiven: {
      type: Boolean,
      default: false,
    },
    consentTimestamp: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

quizSessionSchema.index({ quiz: 1, student: 1 });

module.exports = mongoose.model("QuizSession", quizSessionSchema);

const mongoose = require("mongoose");

const snapshotSchema = new mongoose.Schema(
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

    // Type of snapshot
    type: {
      type: String,
      enum: ["start", "periodic", "end", "violation"],
      required: true,
    },

    // Base64 encoded image data (encrypted in production, stored in DB for demo)
    imageData: {
      type: String,
      required: true,
    },

    // Face detection results
    faceDetected: {
      type: Boolean,
      default: false,
    },
    faceCount: {
      type: Number,
      default: 0,
    },
    faceCentered: {
      type: Boolean,
      default: false,
    },
    faceScore: {
      // detection confidence 0-1
      type: Number,
      default: null,
    },

    // Similarity to start snapshot
    similarityToStart: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
    },

    capturedAt: {
      type: Date,
      default: Date.now,
    },

    // Flags
    flagged: {
      type: Boolean,
      default: false,
    },
    flagReason: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Snapshot", snapshotSchema);

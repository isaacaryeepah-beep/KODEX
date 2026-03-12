const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      maxlength: 200,
    },
    body: {
      type: String,
      required: [true, "Body is required"],
      trim: true,
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ["info", "warning", "success", "urgent"],
      default: "info",
    },
    // Who can see this: "all" (everyone), "students", "lecturers", "employees"
    audience: {
      type: String,
      enum: ["all", "students", "lecturers", "employees"],
      default: "all",
    },
    // Optional: pin to top
    pinned: {
      type: Boolean,
      default: false,
    },
    // Optional expiry — auto-hide after this date
    expiresAt: {
      type: Date,
      default: null,
    },
    // Track who has read this (for unread badges)
    readBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

announcementSchema.index({ company: 1, createdAt: -1 });
announcementSchema.index({ company: 1, pinned: -1, createdAt: -1 });

module.exports = mongoose.model("Announcement", announcementSchema);

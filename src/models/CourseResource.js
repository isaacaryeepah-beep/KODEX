"use strict";

/**
 * CourseResource.js
 *
 * A piece of learning material attached to a course.
 * Lecturers create resources; enrolled students can view visible ones.
 *
 * Resource types:
 *   link       — external URL (website, article, Google Doc, etc.)
 *   file_ref   — reference to a stored file (URL to cloud storage)
 *   video_link — YouTube, Vimeo, or any video URL
 *   note       — inline Markdown text written by the lecturer
 *
 * Resources are ordered (ascending `order` field) so lecturers can
 * arrange them logically per week/topic.
 */

const mongoose = require("mongoose");

const RESOURCE_TYPES = Object.freeze(["link", "file_ref", "video_link", "note"]);

const courseResourceSchema = new mongoose.Schema(
  {
    // ── Tenant & ownership ────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },
    course: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Course",
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref:  "User",
    },
    updatedBy: {
      type:    mongoose.Schema.Types.ObjectId,
      ref:     "User",
      default: null,
    },

    // ── Content ───────────────────────────────────────────────────────────
    title:       { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: "", trim: true, maxlength: 1000 },
    type:        { type: String, enum: RESOURCE_TYPES, required: true },

    // URL — used for link, file_ref, video_link
    url: { type: String, default: "", trim: true },
    // Inline Markdown — used for note
    content: { type: String, default: "" },

    // ── Visibility & ordering ────────────────────────────────────────────
    isVisibleToStudents: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    tags:  { type: [String], default: [] },
  },
  { timestamps: true }
);

// Primary query: all resources for a course, sorted
courseResourceSchema.index({ company: 1, course: 1, order: 1 });
// Fast lookup by course alone (used for count, cascade deletes, etc.)
courseResourceSchema.index({ company: 1, course: 1 });

const CourseResource = mongoose.model("CourseResource", courseResourceSchema);
module.exports = CourseResource;
module.exports.RESOURCE_TYPES = RESOURCE_TYPES;

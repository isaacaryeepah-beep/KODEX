"use strict";

/**
 * ResourceView.js
 *
 * Tracks each time an enrolled student opens / views a CourseResource.
 * One document is created (or its `viewCount` incremented) per
 * (company, resource, student) combination.
 *
 * The `lastViewedAt` timestamp is always updated on re-view so staff can
 * see recency without storing unbounded per-view rows.
 *
 * Staff-facing analytics queries:
 *   - Per-resource: how many unique students viewed it
 *   - Per-course:   which resources were viewed most / least
 *   - Per-student:  which resources a particular student has engaged with
 *
 * Tenant field: `company` (ObjectId).
 */

const mongoose = require("mongoose");

const resourceViewSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────
    company: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Company",
      required: true,
      index:    true,
    },

    // ── What was viewed ───────────────────────────────────────────────────
    resource: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "CourseResource",
      required: true,
    },
    course: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "Course",
      required: true,
    },

    // ── Who viewed it ─────────────────────────────────────────────────────
    student: {
      type:     mongoose.Schema.Types.ObjectId,
      ref:      "User",
      required: true,
    },

    // ── Engagement counters ───────────────────────────────────────────────
    viewCount:    { type: Number, default: 1, min: 1 },
    firstViewedAt: { type: Date, default: Date.now },
    lastViewedAt:  { type: Date, default: Date.now },
  },
  { timestamps: false }
);

// ── Indexes ────────────────────────────────────────────────────────────────
// One row per (company, resource, student) — enforces the upsert key
resourceViewSchema.index({ company: 1, resource: 1, student: 1 }, { unique: true });
// Analytics: all views for a course (staff overview)
resourceViewSchema.index({ company: 1, course: 1 });
// Analytics: all resources a student has viewed in a course
resourceViewSchema.index({ company: 1, course: 1, student: 1 });
// Analytics: all resources a student has viewed (cross-course)
resourceViewSchema.index({ company: 1, student: 1 });

const ResourceView = mongoose.model("ResourceView", resourceViewSchema);
module.exports = ResourceView;

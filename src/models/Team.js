"use strict";

/**
 * Team
 *
 * A group of employees within (optionally) a department.
 * Members array is stored here; the route layer keeps it in sync.
 *
 * Corporate mode only.
 */

const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema(
  {
    // ── Tenant ────────────────────────────────────────────────────────────────
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },

    // ── Identity ──────────────────────────────────────────────────────────────
    name: {
      type: String,
      required: [true, "Team name is required"],
      trim: true,
    },
    description: { type: String, default: "" },

    // ── Org placement ─────────────────────────────────────────────────────────
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
      index: true,
    },

    // ── Leadership ────────────────────────────────────────────────────────────
    lead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Membership ────────────────────────────────────────────────────────────
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // ── Lifecycle ─────────────────────────────────────────────────────────────
    isActive: { type: Boolean, default: true, index: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// ── Indexes ──────────────────────────────────────────────────────────────────

teamSchema.index({ company: 1, name: 1 });
teamSchema.index({ company: 1, department: 1 });
teamSchema.index({ company: 1, members: 1 }); // fast lookup: "which team is employee X in?"

// ── Model ────────────────────────────────────────────────────────────────────

module.exports = mongoose.model("Team", teamSchema);

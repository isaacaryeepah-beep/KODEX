"use strict";

/**
 * HRAssignment
 *
 * Grants an existing user (any base role -- employee or manager) HR
 * capability, without changing their role or requiring a separate account.
 * Mirrors the Class Rep pattern: the person keeps logging in through their
 * normal portal, and this capability just unlocks extra scope on top of it.
 *
 * scope: 'company'   -> sees/manages across every department, unscoped
 *        'department' -> sees/manages only within one department
 *
 * At most one ACTIVE assignment per user (a user can be re-assigned, but
 * not hold two simultaneous grants). History is preserved via revokedAt
 * rather than deletion, so "who had HR access and when" stays auditable.
 *
 * Corporate mode only.
 */

const mongoose = require("mongoose");

const hrAssignmentSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    scope: {
      type: String,
      enum: ["company", "department"],
      default: "company",
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null, // required when scope === 'department'
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

hrAssignmentSchema.index({ company: 1, user: 1, revokedAt: 1 });

module.exports = mongoose.model("HRAssignment", hrAssignmentSchema);

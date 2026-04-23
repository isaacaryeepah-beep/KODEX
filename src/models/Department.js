"use strict";

/**
 * Department
 *
 * Formal organizational unit within a company (corporate mode).
 * Departments can nest via parentDepartment for org-chart trees.
 *
 * Existing code that stored department as a plain string on User / Shift /
 * TrainingModule continues to work — this model adds structure on top.
 * The User.department field can be migrated to an ObjectId over time.
 */

const mongoose = require("mongoose");

const departmentSchema = new mongoose.Schema(
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
      required: [true, "Department name is required"],
      trim: true,
    },
    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: "",
    },
    description: { type: String, default: "" },

    // ── Org chart ─────────────────────────────────────────────────────────────
    // null = top-level department
    parentDepartment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },

    // ── Leadership ────────────────────────────────────────────────────────────
    head: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // ── Finance ───────────────────────────────────────────────────────────────
    costCenter: { type: String, trim: true, default: "" },

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

// Unique code per company (sparse so empty codes don't collide)
departmentSchema.index(
  { company: 1, code: 1 },
  { unique: true, sparse: true, name: "dept_company_code_unique" }
);

departmentSchema.index({ company: 1, name: 1 });
departmentSchema.index({ company: 1, parentDepartment: 1 });

// ── Model ────────────────────────────────────────────────────────────────────

module.exports = mongoose.model("Department", departmentSchema);

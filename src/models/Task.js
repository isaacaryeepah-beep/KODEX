"use strict";

/**
 * Task
 *
 * Corporate work items assigned by managers/admins to employees.
 * Status flow: pending → in_progress → completed.
 */

const mongoose = require("mongoose");

const TASK_STATUSES = Object.freeze(["pending", "in_progress", "completed"]);
const TASK_PRIORITIES = Object.freeze(["low", "medium", "high"]);

const taskSchema = new mongoose.Schema(
  {
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: [true, "Task title is required"],
      trim: true,
      maxlength: 200,
    },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Assignee is required"],
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: TASK_STATUSES,
      default: "pending",
      index: true,
    },
    priority: {
      type: String,
      enum: TASK_PRIORITIES,
      default: "medium",
    },
    dueDate:     { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

taskSchema.index({ company: 1, assignedTo: 1, status: 1 });
taskSchema.index({ company: 1, status: 1, dueDate: 1 });

module.exports = mongoose.model("Task", taskSchema);
module.exports.TASK_STATUSES = TASK_STATUSES;

"use strict";

/**
 * Tasks routes — mounted at /api/tasks
 *
 * GET    /            list tasks (admin/manager: all company tasks; employee: own)
 * POST   /            create + assign a task            (admin/manager)
 * PATCH  /:id/status  update status                     (assignee, or admin/manager)
 * DELETE /:id         delete a task                     (admin/manager)
 */

const express = require("express");
const router  = express.Router();

const authenticate    = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const Task            = require("../models/Task");

const MANAGER_ROLES = ["admin", "superadmin", "manager"];
const STATUSES      = ["pending", "in_progress", "completed"];

router.use(authenticate);

router.get("/", async (req, res) => {
  try {
    const isManager = MANAGER_ROLES.includes(req.user.role);
    const filter = { company: req.user.company };
    if (!isManager) filter.assignedTo = req.user._id;
    if (req.query.status && STATUSES.includes(req.query.status)) filter.status = req.query.status;
    if (isManager && req.query.assignedTo) filter.assignedTo = req.query.assignedTo;

    const tasks = await Task.find(filter)
      .populate("assignedTo", "name department")
      .populate("assignedBy", "name")
      .sort({ status: 1, dueDate: 1, createdAt: -1 })
      .limit(300)
      .lean();
    return res.json({ tasks });
  } catch (err) {
    console.error("[tasks list]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireRole(...MANAGER_ROLES), async (req, res) => {
  try {
    const { title, description, assignedTo, dueDate, priority } = req.body;
    if (!title || !assignedTo) {
      return res.status(400).json({ error: "Title and assignee are required" });
    }
    const task = await Task.create({
      company:     req.user.company,
      title,
      description: description || "",
      assignedTo,
      assignedBy:  req.user._id,
      dueDate:     dueDate ? new Date(dueDate) : null,
      priority:    ["low", "medium", "high"].includes(priority) ? priority : "medium",
    });
    const populated = await Task.findById(task._id)
      .populate("assignedTo", "name department")
      .populate("assignedBy", "name")
      .lean();
    return res.status(201).json({ task: populated });
  } catch (err) {
    console.error("[tasks create]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUSES.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const task = await Task.findOne({ _id: req.params.id, company: req.user.company });
    if (!task) return res.status(404).json({ error: "Task not found" });

    const isManager = MANAGER_ROLES.includes(req.user.role);
    if (!isManager && String(task.assignedTo) !== String(req.user._id)) {
      return res.status(403).json({ error: "You can only update your own tasks" });
    }

    task.status      = status;
    task.completedAt = status === "completed" ? new Date() : null;
    await task.save();
    return res.json({ task });
  } catch (err) {
    console.error("[tasks status]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/:id", requireRole(...MANAGER_ROLES), async (req, res) => {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, company: req.user.company });
    if (!task) return res.status(404).json({ error: "Task not found" });
    return res.json({ message: "Task deleted" });
  } catch (err) {
    console.error("[tasks delete]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;

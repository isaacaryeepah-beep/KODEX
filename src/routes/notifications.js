"use strict";

/**
 * notifications.js
 * Mounted at: /api/notifications   (registered in server.js)
 *
 * Route summary
 * -------------
 * GET    /                      list my notifications (paginated)
 * GET    /unread-count          count of unread notifications
 * PATCH  /read-all              mark all my notifications as read
 * PATCH  /:id/read              mark a single notification as read
 * DELETE /:id                   dismiss (delete) a notification
 *
 * Admin-only:
 * POST   /                      create a notification for a specific user
 * DELETE /user/:userId          clear all notifications for a user   [admin]
 *
 * All routes require authentication + company isolation.
 * No corporate/academic mode restriction — notifications are cross-mode.
 */

const express = require("express");
const router  = express.Router();
const authenticate              = require("../middleware/auth");
const { companyIsolation }      = require("../middleware/companyIsolation");
const { requireRole }           = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const Notification = require("../models/Notification");
const { NOTIFICATION_TYPES } = Notification;

const mw        = [authenticate, requireActiveSubscription, companyIsolation];
const adminOnly = requireRole("admin", "superadmin");

// ── GET /unread-count  — must come before / to avoid route conflict ──────────
router.get("/unread-count", ...mw, async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      company:   req.user.company,
      recipient: req.user._id,
      isRead:    false,
    });
    res.json({ unreadCount: count });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch unread count" });
  }
});

// ── GET /  — list my notifications (paginated) ───────────────────────────────
router.get("/", ...mw, async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)  || 1);
    const limit    = Math.min(50, parseInt(req.query.limit) || 20);
    const skip     = (page - 1) * limit;
    const unreadOnly = req.query.unreadOnly === "true";

    const filter = {
      company:   req.user.company,
      recipient: req.user._id,
    };
    if (unreadOnly) filter.isRead = false;
    if (req.query.type) filter.type = req.query.type;

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments(filter),
    ]);

    res.json({
      notifications,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ── PATCH /read-all  — mark all as read ──────────────────────────────────────
router.patch("/read-all", ...mw, async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { company: req.user.company, recipient: req.user._id, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    res.json({ updated: result.modifiedCount });
  } catch (e) {
    res.status(500).json({ error: "Failed to mark all as read" });
  }
});

// ── PATCH /:id/read  — mark single notification as read ─────────────────────
router.patch("/:id/read", ...mw, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      {
        _id:       req.params.id,
        company:   req.user.company,
        recipient: req.user._id,
      },
      { $set: { isRead: true, readAt: new Date() } },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: "Notification not found" });
    res.json({ notification });
  } catch (e) {
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// ── DELETE /:id  — dismiss (delete) a notification ───────────────────────────
router.delete("/:id", ...mw, async (req, res) => {
  try {
    const result = await Notification.deleteOne({
      _id:       req.params.id,
      company:   req.user.company,
      recipient: req.user._id,
    });
    if (result.deletedCount === 0) return res.status(404).json({ error: "Notification not found" });
    res.json({ message: "Notification dismissed" });
  } catch (e) {
    res.status(500).json({ error: "Failed to dismiss notification" });
  }
});

// ── POST /  — create a targeted notification (admin only) ────────────────────
router.post("/", ...mw, adminOnly, async (req, res) => {
  try {
    const { recipientId, type, title, body, link, data } = req.body;
    if (!recipientId) return res.status(400).json({ error: "recipientId is required" });
    if (!type)        return res.status(400).json({ error: "type is required" });
    if (!title)       return res.status(400).json({ error: "title is required" });
    if (!Object.values(NOTIFICATION_TYPES).includes(type)) {
      return res.status(400).json({ error: "Invalid notification type" });
    }

    const notification = await Notification.create({
      company:   req.user.company,
      recipient: recipientId,
      type,
      title,
      body:  body  || "",
      link:  link  || null,
      data:  data  || null,
    });

    res.status(201).json({ notification });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to create notification" });
  }
});

// ── DELETE /user/:userId  — clear all notifications for a user (admin) ───────
router.delete("/user/:userId", ...mw, adminOnly, async (req, res) => {
  try {
    const result = await Notification.deleteMany({
      company:   req.user.company,
      recipient: req.params.userId,
    });
    res.json({ deleted: result.deletedCount });
  } catch (e) {
    res.status(500).json({ error: "Failed to clear notifications" });
  }
});

module.exports = router;

"use strict";

/**
 * staffNotes.js
 * Mounted at: /api/staff-notes   (registered in server.js)
 *
 * Private staff notes about students or employees.
 * The note subject never has read access to notes about themselves.
 * Confidential notes are readable only by the author + admin/superadmin.
 *
 * Route summary
 * -------------
 * GET    /subject/:userId          list notes about a user   [staff]
 * POST   /subject/:userId          create a note             [staff]
 * PATCH  /subject/:userId/:noteId  edit note body/category/tags/followUpDate  [author]
 * DELETE /subject/:userId/:noteId  soft-delete  [author or admin]
 * PATCH  /subject/:userId/:noteId/follow-up  toggle followUpCompleted  [author or admin]
 *
 * GET    /my-authored              notes I have written (across all subjects)  [staff]
 * GET    /follow-ups               my upcoming (non-completed) follow-up notes [staff]
 *
 * No requireMode() — serves both academic (pastoral) and corporate (HR) contexts.
 */

const express  = require("express");
const router   = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole }               = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const StaffNote = require("../models/StaffNote");
const { NOTE_CATEGORIES } = StaffNote;
const User = require("../models/User");

// ── Middleware ───────────────────────────────────────────────────────────────
const mw    = [authenticate, requireActiveSubscription, companyIsolation];
const STAFF = ["lecturer", "hod", "manager", "admin", "superadmin"];
const ADMIN = ["admin", "superadmin"];

function canSeeConfidential(role, authorId, userId) {
  return ADMIN.includes(role) || authorId.toString() === userId.toString();
}

function parsePage(q) {
  const page  = Math.max(1, parseInt(q.page,  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// ════════════════════════════════════════════════════════════════════════════
// Sub-resource routes: /my-authored and /follow-ups
// Declared BEFORE /subject/:userId to prevent shadowing.
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// GET /my-authored  — notes I have written
// ---------------------------------------------------------------------------
router.get("/my-authored", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company = req.user.company;
    const { page, limit, skip } = parsePage(req.query);

    const filter = { company, author: req.user._id, isDeleted: false };
    if (req.query.category) filter.category = req.query.category;

    const [notes, total] = await Promise.all([
      StaffNote.find(filter)
        .populate("subject", "name role IndexNumber employeeId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StaffNote.countDocuments(filter),
    ]);

    res.json({ notes, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error("my-authored notes:", err);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// ---------------------------------------------------------------------------
// GET /follow-ups  — upcoming non-completed follow-up notes authored by me
// ---------------------------------------------------------------------------
router.get("/follow-ups", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company = req.user.company;

    const notes = await StaffNote.find({
      company,
      author:            req.user._id,
      isDeleted:         false,
      followUpDate:      { $ne: null },
      followUpCompleted: false,
    })
      .populate("subject", "name role IndexNumber employeeId")
      .sort({ followUpDate: 1 })
      .lean();

    res.json({ notes, count: notes.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch follow-ups" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// Subject-scoped routes: /subject/:userId/...
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// GET /subject/:userId  — list notes about a user
// ---------------------------------------------------------------------------
router.get("/subject/:userId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company = req.user.company;
    const { page, limit, skip } = parsePage(req.query);

    const subject = await User.findOne({ _id: req.params.userId, company })
      .select("name role IndexNumber employeeId department").lean();
    if (!subject) return res.status(404).json({ error: "User not found" });

    const filter = { company, subject: req.params.userId, isDeleted: false };
    if (req.query.category) filter.category = req.query.category;

    // Non-admin non-author users cannot see confidential notes
    if (!ADMIN.includes(req.user.role)) {
      filter.$or = [
        { isConfidential: false },
        { isConfidential: true, author: req.user._id },
      ];
    }

    const [notes, total] = await Promise.all([
      StaffNote.find(filter)
        .populate("author", "name role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      StaffNote.countDocuments(filter),
    ]);

    res.json({ subject, notes, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error("list staff notes:", err);
    res.status(500).json({ error: "Failed to fetch notes" });
  }
});

// ---------------------------------------------------------------------------
// POST /subject/:userId  — create a note
// ---------------------------------------------------------------------------
router.post("/subject/:userId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company = req.user.company;

    const subject = await User.findOne({ _id: req.params.userId, company })
      .select("_id name").lean();
    if (!subject) return res.status(404).json({ error: "User not found" });

    // Staff cannot write notes about themselves
    if (req.params.userId === req.user._id.toString()) {
      return res.status(400).json({ error: "You cannot write a note about yourself" });
    }

    const { body, category, tags, isConfidential, followUpDate } = req.body;
    if (!body?.trim()) return res.status(400).json({ error: "body is required" });

    if (category && !NOTE_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${NOTE_CATEGORIES.join(", ")}` });
    }

    const note = await StaffNote.create({
      company,
      subject:        req.params.userId,
      author:         req.user._id,
      body:           body.trim(),
      category:       category || "general",
      tags:           Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean) : [],
      isConfidential: !!isConfidential,
      followUpDate:   followUpDate ? new Date(followUpDate) : null,
    });

    await note.populate("author", "name role");
    res.status(201).json({ note });
  } catch (err) {
    console.error("create staff note:", err);
    res.status(500).json({ error: "Failed to create note" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /subject/:userId/:noteId/follow-up  — toggle followUpCompleted
// Declared BEFORE /:noteId to prevent shadowing.
// ---------------------------------------------------------------------------
router.patch("/subject/:userId/:noteId/follow-up", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company = req.user.company;
    const note    = await StaffNote.findOne({
      _id: req.params.noteId, company, subject: req.params.userId, isDeleted: false,
    });
    if (!note) return res.status(404).json({ error: "Note not found" });

    const isAuthor = note.author.toString() === req.user._id.toString();
    if (!isAuthor && !ADMIN.includes(req.user.role)) {
      return res.status(403).json({ error: "Only the note author or an admin can update follow-up status" });
    }

    note.followUpCompleted = !note.followUpCompleted;
    await note.save();

    res.json({ followUpCompleted: note.followUpCompleted });
  } catch (err) {
    res.status(500).json({ error: "Failed to update follow-up" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /subject/:userId/:noteId  — edit note
// ---------------------------------------------------------------------------
router.patch("/subject/:userId/:noteId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company = req.user.company;
    const note    = await StaffNote.findOne({
      _id: req.params.noteId, company, subject: req.params.userId, isDeleted: false,
    });
    if (!note) return res.status(404).json({ error: "Note not found" });

    if (note.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "You can only edit your own notes" });
    }

    const { body, category, tags, isConfidential, followUpDate } = req.body;
    if (body      !== undefined) note.body           = body.trim();
    if (category  !== undefined) note.category       = category;
    if (Array.isArray(tags))     note.tags           = tags.map(t => String(t).trim()).filter(Boolean);
    if (isConfidential !== undefined) note.isConfidential = !!isConfidential;
    if (followUpDate !== undefined)   note.followUpDate   = followUpDate ? new Date(followUpDate) : null;
    note.editedAt = new Date();

    await note.save();
    await note.populate("author", "name role");
    res.json({ note });
  } catch (err) {
    res.status(500).json({ error: "Failed to update note" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /subject/:userId/:noteId  — soft-delete
// ---------------------------------------------------------------------------
router.delete("/subject/:userId/:noteId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const company = req.user.company;
    const note    = await StaffNote.findOne({
      _id: req.params.noteId, company, subject: req.params.userId, isDeleted: false,
    });
    if (!note) return res.status(404).json({ error: "Note not found" });

    const isAuthor = note.author.toString() === req.user._id.toString();
    if (!isAuthor && !ADMIN.includes(req.user.role)) {
      return res.status(403).json({ error: "You can only delete your own notes" });
    }

    note.isDeleted = true;
    note.deletedBy = req.user._id;
    note.deletedAt = new Date();
    await note.save();

    res.json({ message: "Note deleted" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete note" });
  }
});

module.exports = router;

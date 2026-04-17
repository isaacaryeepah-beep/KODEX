"use strict";

/**
 * messages.js
 * Mounted at: /api/messages   (registered in server.js)
 *
 * Internal inbox — direct (1:1) and group messaging between users
 * within the same company.  Available to all roles and both modes.
 *
 * Route summary
 * -------------
 * GET    /conversations                   list my conversations (most recent first)
 * POST   /conversations                   start a conversation or return existing 1:1
 * GET    /conversations/:id               get conversation + paginated messages (oldest first)
 * POST   /conversations/:id/messages      send a message
 * PATCH  /conversations/:id/read          mark conversation as read (resets unreadCount)
 * PATCH  /conversations/:id/messages/:msgId   edit a message (sender only, within 15 min)
 * DELETE /conversations/:id/messages/:msgId   soft-delete a message (sender only)
 *
 * All routes require authentication + active subscription.
 * No requireMode() — messaging spans academic and corporate contexts.
 */

const express  = require("express");
const router   = express.Router();
const mongoose = require("mongoose");
const fs       = require("fs");
const path     = require("path");
const authenticate                  = require("../middleware/auth");
const { requireActiveSubscription } = require("../middleware/subscription");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { uploadMessage, handleUploadError, UPLOAD_DIR } = require("../middleware/messageUpload");
const Conversation = require("../models/Conversation");
const Message      = require("../models/Message");
const User         = require("../models/User");

// ── Shared middleware ────────────────────────────────────────────────────────
const mw = [authenticate, requireActiveSubscription, companyIsolation];

// How long (ms) a sender may edit their own message
const EDIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ── Helpers ──────────────────────────────────────────────────────────────────

function parsePage(query, defaultLimit = 30) {
  const page  = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Verify that the requesting user is an active (non-left) participant
 * of the conversation and that the conversation belongs to their company.
 */
async function resolveConversation(req, res, conversationId) {
  const convo = await Conversation.findOne({
    _id:     conversationId,
    company: req.user.company,
  });
  if (!convo) {
    res.status(404).json({ error: "Conversation not found" });
    return null;
  }
  const participation = convo.participants.find(
    p => p.user.toString() === req.user._id.toString() && !p.leftAt
  );
  if (!participation) {
    res.status(403).json({ error: "You are not a participant in this conversation" });
    return null;
  }
  return convo;
}

/** Mask a soft-deleted message body. */
function maskDeleted(msg) {
  if (msg.isDeleted) {
    return { ...msg, body: "[deleted]" };
  }
  return msg;
}

// ════════════════════════════════════════════════════════════════════════════
// CONVERSATION ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// GET /conversations  — list my conversations
// ---------------------------------------------------------------------------
router.get("/conversations", ...mw, async (req, res) => {
  try {
    const company = req.user.company;
    const userId  = req.user._id;

    const { page, limit, skip } = parsePage(req.query, 20);

    const filter = {
      company,
      "participants.user":   userId,
      "participants.leftAt": null,  // only active participations
    };

    const [conversations, total] = await Promise.all([
      Conversation.find(filter)
        .populate("participants.user", "name role")
        .populate("lastMessage.sender", "name")
        .sort({ "lastMessage.sentAt": -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Conversation.countDocuments(filter),
    ]);

    // Attach my unreadCount to each conversation for convenience
    const myId = userId.toString();
    const enriched = conversations.map(c => {
      const myParticipant = c.participants.find(p => p.user?._id?.toString() === myId || p.user?.toString() === myId);
      return { ...c, myUnreadCount: myParticipant?.unreadCount ?? 0 };
    });

    res.json({ conversations: enriched, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error("list conversations:", err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// ---------------------------------------------------------------------------
// POST /conversations  — start a conversation (or return existing 1:1)
// Body: { recipientIds: [userId, ...], message: string, title?: string }
//   recipientIds must be within the same company.
//   For a 1:1 (single recipient), if an active conversation already exists
//   it is returned instead of creating a duplicate.
// ---------------------------------------------------------------------------
router.post("/conversations", ...mw, async (req, res) => {
  try {
    const company = req.user.company;
    const myId    = req.user._id;

    const { recipientIds, message, title } = req.body;

    if (!Array.isArray(recipientIds) || recipientIds.length === 0) {
      return res.status(400).json({ error: "recipientIds must be a non-empty array" });
    }
    if (!message?.trim()) {
      return res.status(400).json({ error: "message is required to start a conversation" });
    }
    if (recipientIds.length > 19) {
      return res.status(400).json({ error: "A conversation may have at most 20 participants" });
    }

    // Validate all recipients belong to the same company
    const recipients = await User.find({
      _id:     { $in: recipientIds },
      company,
      isActive: true,
    }).select("_id name").lean();

    if (recipients.length !== recipientIds.length) {
      return res.status(400).json({ error: "One or more recipients not found in your company" });
    }

    // Prevent messaging yourself
    if (recipientIds.some(id => id.toString() === myId.toString())) {
      return res.status(400).json({ error: "You cannot start a conversation with yourself" });
    }

    const isGroup   = recipientIds.length > 1;
    const allUserIds = [myId, ...recipients.map(r => r._id)];

    // For 1:1 conversations, reuse an existing active conversation
    if (!isGroup) {
      const existing = await Conversation.findOne({
        company,
        isGroup: false,
        "participants": {
          $size: 2,
          $all: allUserIds.map(uid => ({
            $elemMatch: { user: new mongoose.Types.ObjectId(uid), leftAt: null },
          })),
        },
      });
      if (existing) {
        // Send the initial message into the existing conversation
        const msg = await Message.create({
          company,
          conversation: existing._id,
          sender:       myId,
          body:         message.trim(),
        });
        // Update conversation counters
        await Conversation.updateOne(
          { _id: existing._id },
          {
            $set: { lastMessage: { body: message.trim(), sender: myId, sentAt: msg.createdAt } },
            $inc: { messageCount: 1 },
          }
        );
        // Increment unread for recipient
        await Conversation.updateOne(
          { _id: existing._id, "participants.user": { $ne: myId } },
          { $inc: { "participants.$.unreadCount": 1 } }
        );
        await msg.populate("sender", "name role");
        const populated = await Conversation.findById(existing._id)
          .populate("participants.user", "name role")
          .lean();
        return res.status(200).json({ conversation: populated, message: msg, existing: true });
      }
    }

    // Build participant sub-docs
    const participantDocs = allUserIds.map(uid => ({
      user:        uid,
      unreadCount: uid.toString() === myId.toString() ? 0 : 1, // recipient starts with 1 unread
      lastReadAt:  null,
      leftAt:      null,
    }));

    const now = new Date();
    const convo = await Conversation.create({
      company,
      participants:   participantDocs,
      isGroup,
      title:          (isGroup && title) ? title.trim() : "",
      createdBy:      myId,
      lastMessage:    { body: message.trim(), sender: myId, sentAt: now },
      messageCount:   1,
    });

    const msg = await Message.create({
      company,
      conversation: convo._id,
      sender:       myId,
      body:         message.trim(),
    });

    await msg.populate("sender", "name role");
    await convo.populate("participants.user", "name role");

    res.status(201).json({ conversation: convo, message: msg, existing: false });
  } catch (err) {
    console.error("create conversation:", err);
    res.status(500).json({ error: "Failed to start conversation" });
  }
});

// ---------------------------------------------------------------------------
// GET /conversations/:id  — view conversation + messages (paginated, oldest first)
// ---------------------------------------------------------------------------
router.get("/conversations/:id", ...mw, async (req, res) => {
  try {
    const convo = await resolveConversation(req, res, req.params.id);
    if (!convo) return;

    const { page, limit, skip } = parsePage(req.query, 30);

    const filter = { company: req.user.company, conversation: req.params.id };

    const [messages, total] = await Promise.all([
      Message.find(filter)
        .populate("sender", "name role")
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Message.countDocuments(filter),
    ]);

    await convo.populate("participants.user", "name role");

    const safeMsgs = messages.map(maskDeleted);

    res.json({
      conversation: convo,
      messages:     safeMsgs,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error("view conversation:", err);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// ---------------------------------------------------------------------------
// POST /conversations/:id/messages  — send a message (text and/or file)
// Accepts multipart/form-data (for file uploads) or JSON (text only).
// ---------------------------------------------------------------------------
router.post("/conversations/:id/messages", ...mw, uploadMessage, handleUploadError, async (req, res) => {
  try {
    const convo = await resolveConversation(req, res, req.params.id);
    if (!convo) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return;
    }

    const bodyText = (req.body.body || "").trim();
    const hasFile  = !!req.file;

    if (!bodyText && !hasFile) {
      return res.status(400).json({ error: "body or a file attachment is required" });
    }

    // Roles allowed to send file attachments: admin, lecturer, manager (+ superadmin)
    const FILE_ROLES = ["admin", "superadmin", "lecturer", "manager"];
    if (hasFile && !FILE_ROLES.includes(req.user.role)) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: "Your role is not allowed to send file attachments." });
    }

    const company = req.user.company;
    const myId    = req.user._id;
    const now     = new Date();

    let attachment = null;
    if (hasFile) {
      const baseUrl = process.env.SERVER_URL || "https://kodex.it.com";
      attachment = {
        fileName:     req.file.filename,
        originalName: req.file.originalname,
        fileUrl:      `${baseUrl}/api/messages/attachment/${req.file.filename}`,
        mimeType:     req.file.mimetype,
        fileSize:     req.file.size,
      };
    }

    const displayBody = bodyText || `📎 ${req.file.originalname}`;

    const msg = await Message.create({
      company,
      conversation: convo._id,
      sender:       myId,
      body:         displayBody,
      attachment,
    });

    // Update lastMessage snapshot + messageCount; increment unread for others
    await Conversation.updateOne(
      { _id: convo._id },
      {
        $set: {
          "lastMessage.body":   displayBody,
          "lastMessage.sender": myId,
          "lastMessage.sentAt": now,
        },
        $inc: { messageCount: 1 },
      }
    );

    // Increment unreadCount for every active participant except the sender
    const otherParticipants = convo.participants.filter(
      p => p.user.toString() !== myId.toString() && !p.leftAt
    );
    if (otherParticipants.length > 0) {
      await Conversation.updateMany(
        {
          _id: convo._id,
          "participants.user": { $in: otherParticipants.map(p => p.user) },
        },
        { $inc: { "participants.$[p].unreadCount": 1 } },
        { arrayFilters: [{ "p.user": { $in: otherParticipants.map(p => p.user) } }] }
      );
    }

    await msg.populate("sender", "name role");

    res.status(201).json({ message: msg });
  } catch (err) {
    console.error("send message:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /conversations/:id/read  — mark conversation as read
// Resets current user's unreadCount to 0 and updates lastReadAt.
// ---------------------------------------------------------------------------
router.patch("/conversations/:id/read", ...mw, async (req, res) => {
  try {
    const convo = await resolveConversation(req, res, req.params.id);
    if (!convo) return;

    const myId = req.user._id.toString();

    await Conversation.updateOne(
      { _id: convo._id, "participants.user": req.user._id },
      {
        $set: {
          "participants.$.unreadCount": 0,
          "participants.$.lastReadAt":  new Date(),
        },
      }
    );

    res.json({ message: "Marked as read" });
  } catch (err) {
    console.error("mark read:", err);
    res.status(500).json({ error: "Failed to mark as read" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /conversations/:id/messages/:msgId  — edit a message
// Sender only; within 15-minute edit window.
// Must be declared BEFORE DELETE to avoid shadowing (not actually an issue
// here, but keeping consistent pattern across routes).
// ---------------------------------------------------------------------------
router.patch("/conversations/:id/messages/:msgId", ...mw, async (req, res) => {
  try {
    const convo = await resolveConversation(req, res, req.params.id);
    if (!convo) return;

    const { body } = req.body;
    if (!body?.trim()) {
      return res.status(400).json({ error: "body is required" });
    }

    const msg = await Message.findOne({
      _id:          req.params.msgId,
      company:      req.user.company,
      conversation: req.params.id,
      isDeleted:    false,
    });
    if (!msg) return res.status(404).json({ error: "Message not found" });

    if (msg.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "You can only edit your own messages" });
    }

    const age = Date.now() - msg.createdAt.getTime();
    if (age > EDIT_WINDOW_MS) {
      return res.status(400).json({ error: "Messages can only be edited within 15 minutes of sending" });
    }

    msg.body     = body.trim();
    msg.editedAt = new Date();
    await msg.save();

    await msg.populate("sender", "name role");
    res.json({ message: msg });
  } catch (err) {
    console.error("edit message:", err);
    res.status(500).json({ error: "Failed to edit message" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /conversations/:id/messages/:msgId  — soft-delete a message
// Sender only.
// ---------------------------------------------------------------------------
router.delete("/conversations/:id/messages/:msgId", ...mw, async (req, res) => {
  try {
    const convo = await resolveConversation(req, res, req.params.id);
    if (!convo) return;

    const msg = await Message.findOne({
      _id:          req.params.msgId,
      company:      req.user.company,
      conversation: req.params.id,
      isDeleted:    false,
    });
    if (!msg) return res.status(404).json({ error: "Message not found" });

    if (msg.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "You can only delete your own messages" });
    }

    msg.isDeleted = true;
    msg.deletedBy = req.user._id;
    msg.deletedAt = new Date();
    await msg.save();

    res.json({ message: "Message deleted" });
  } catch (err) {
    console.error("delete message:", err);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

// ---------------------------------------------------------------------------
// GET /attachment/:filename  — serve message attachment inline (authenticated)
// ---------------------------------------------------------------------------
router.get("/attachment/:filename", ...mw, async (req, res) => {
  try {
    const { filename } = req.params;
    const msg = await Message.findOne({
      company:               req.user.company,
      "attachment.fileName": filename,
      isDeleted:             false,
    }).lean();
    if (!msg) return res.status(404).json({ error: "File not found." });

    const filePath = path.join(process.cwd(), UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on disk." });
    }

    res.setHeader("Content-Type", msg.attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${msg.attachment.originalName}"`);
    return res.sendFile(filePath);
  } catch (err) {
    console.error("serve message attachment:", err);
    res.status(500).json({ error: "Failed to serve attachment." });
  }
});

// ---------------------------------------------------------------------------
// GET /attachment/:filename/download  — force download
// ---------------------------------------------------------------------------
router.get("/attachment/:filename/download", ...mw, async (req, res) => {
  try {
    const { filename } = req.params;
    const msg = await Message.findOne({
      company:               req.user.company,
      "attachment.fileName": filename,
      isDeleted:             false,
    }).lean();
    if (!msg) return res.status(404).json({ error: "File not found." });

    const filePath = path.join(process.cwd(), UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "File not found on disk." });
    }

    return res.download(filePath, msg.attachment.originalName);
  } catch (err) {
    console.error("download message attachment:", err);
    res.status(500).json({ error: "Failed to download attachment." });
  }
});

module.exports = router;

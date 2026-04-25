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
const Company      = require("../models/Company");
const Course       = require("../models/Course");

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

/**
 * Check whether `sender` (full user doc) may directly message `recipientId`
 * inside `company`.  Returns { allowed, reason?, code? }.
 *
 * Academic rules
 *   student  → lecturers of enrolled courses only
 *   student  → HOD: BLOCKED — must use /hod-request
 *   lecturer → enrolled students + HOD + admin
 *   hod      → anyone in company
 *   admin    → anyone
 *
 * Corporate rules
 *   employee → reporting manager + same-team members + admin
 *   manager  → direct reports + same-team + admin
 *   admin    → anyone
 */
async function canSendMessage(sender, recipientId, company) {
  const sRole = sender.role;

  // Superadmin / admin bypass all restrictions
  if (["admin", "superadmin"].includes(sRole)) return { allowed: true };

  const recipientObjId = new mongoose.Types.ObjectId(recipientId);

  const recipient = await User.findOne({
    _id:      recipientObjId,
    company,
    isActive: true,
  }).select("role corporateTeamRef reportingManager").lean();

  if (!recipient) return { allowed: false, reason: "Recipient not found or inactive." };

  const rRole = recipient.role;

  // ── Determine mode ────────────────────────────────────────────────────────
  const companyDoc = await Company.findById(company).select("mode").lean();
  const mode       = companyDoc?.mode || "academic";

  const academicRoles  = ["lecturer", "student", "hod"];
  const corporateRoles = ["manager", "employee"];
  const isAcademic = mode === "academic" || (mode === "both" && academicRoles.includes(sRole));
  const isCorporate = mode === "corporate" || (mode === "both" && corporateRoles.includes(sRole));

  // ── Academic ──────────────────────────────────────────────────────────────
  if (isAcademic) {
    if (sRole === "hod") return { allowed: true };

    if (sRole === "lecturer") {
      if (["hod", "admin", "superadmin", "lecturer"].includes(rRole)) return { allowed: true };
      if (rRole === "student") {
        const enrolled = await Course.findOne({
          companyId:        company,
          lecturerId:       sender._id,
          enrolledStudents: recipientObjId,
          isActive:         true,
        }).select("_id").lean();
        if (!enrolled) return { allowed: false, reason: "This student is not enrolled in any of your courses." };
        return { allowed: true };
      }
      return { allowed: false, reason: "Lecturers may only message their enrolled students, HOD, or admin." };
    }

    if (sRole === "student") {
      if (["admin", "superadmin"].includes(rRole)) return { allowed: true };
      if (rRole === "hod") {
        return { allowed: false, reason: "To contact the HOD, please use the HOD Request form.", code: "USE_HOD_REQUEST" };
      }
      if (rRole === "lecturer") {
        const enrolled = await Course.findOne({
          companyId:        company,
          lecturerId:       recipientObjId,
          enrolledStudents: sender._id,
          isActive:         true,
        }).select("_id").lean();
        if (!enrolled) return { allowed: false, reason: "You are not enrolled in any of this lecturer's courses." };
        return { allowed: true };
      }
      return { allowed: false, reason: "Students may only message their enrolled lecturers, or submit a HOD Request." };
    }
  }

  // ── Corporate ─────────────────────────────────────────────────────────────
  if (isCorporate) {
    if (sRole === "manager") {
      if (["admin", "superadmin", "manager"].includes(rRole)) return { allowed: true };
      const isDirectReport = recipient.reportingManager &&
        recipient.reportingManager.toString() === sender._id.toString();
      const sameTeam =
        sender.corporateTeamRef && recipient.corporateTeamRef &&
        sender.corporateTeamRef.toString() === recipient.corporateTeamRef.toString();
      if (isDirectReport || sameTeam) return { allowed: true };
      return { allowed: false, reason: "Managers may only message their direct reports, team members, or admin." };
    }

    if (sRole === "employee") {
      if (["admin", "superadmin"].includes(rRole)) return { allowed: true };
      const isMyManager = sender.reportingManager &&
        sender.reportingManager.toString() === recipientId.toString();
      const sameTeam =
        sender.corporateTeamRef && recipient.corporateTeamRef &&
        sender.corporateTeamRef.toString() === recipient.corporateTeamRef.toString();
      if (isMyManager || sameTeam) return { allowed: true };
      return { allowed: false, reason: "Employees may only message their manager, team members, or admin." };
    }
  }

  return { allowed: false, reason: "Messaging not permitted between these roles." };
}

// ════════════════════════════════════════════════════════════════════════════
// GET /users/messageable  — list users the current user may contact
// ════════════════════════════════════════════════════════════════════════════
router.get("/users/messageable", ...mw, async (req, res) => {
  try {
    const company = req.user.company;
    const myId    = req.user._id;
    const sRole   = req.user.role;

    // Admins/HODs see everyone
    if (["admin", "superadmin", "hod"].includes(sRole)) {
      const users = await User.find({
        company,
        isActive: true,
        _id:      { $ne: myId },
      }).select("_id name role department").sort({ name: 1 }).lean();
      return res.json({ users, hodUsers: [], canDirectMessageHod: true });
    }

    const companyDoc = await Company.findById(company).select("mode").lean();
    const mode       = companyDoc?.mode || "academic";

    let users    = [];
    let hodUsers = []; // shown separately for students (require request form)

    const academicRoles  = ["lecturer", "student"];
    const corporateRoles = ["manager", "employee"];

    if (mode === "academic" || (mode === "both" && academicRoles.includes(sRole))) {
      if (sRole === "student") {
        const courses = await Course.find({
          companyId:        company,
          enrolledStudents: myId,
          isActive:         true,
        }).select("lecturerId").lean();
        const lecturerIds = [...new Set(courses.map(c => c.lecturerId?.toString()).filter(Boolean))];
        users = await User.find({
          _id:      { $in: lecturerIds },
          isActive: true,
        }).select("_id name role department").lean();
        hodUsers = await User.find({
          company,
          role:     "hod",
          isActive: true,
        }).select("_id name role department").lean();
        // also include admin
        const admins = await User.find({
          company,
          role:     { $in: ["admin", "superadmin"] },
          isActive: true,
        }).select("_id name role").lean();
        users = [...users, ...admins];
      } else if (sRole === "lecturer") {
        const courses = await Course.find({
          companyId:  company,
          lecturerId: myId,
          isActive:   true,
        }).select("enrolledStudents").lean();
        const studentIds = [...new Set(courses.flatMap(c => (c.enrolledStudents || []).map(s => s.toString())))];
        const students = await User.find({
          _id:      { $in: studentIds },
          isActive: true,
        }).select("_id name role department").lean();
        const staff = await User.find({
          company,
          role:     { $in: ["hod", "admin", "superadmin", "lecturer"] },
          isActive: true,
          _id:      { $ne: myId },
        }).select("_id name role department").lean();
        users = [...students, ...staff];
      }
    }

    if (mode === "corporate" || (mode === "both" && corporateRoles.includes(sRole))) {
      if (sRole === "employee") {
        const managerUser = req.user.reportingManager
          ? await User.findById(req.user.reportingManager).select("_id name role").lean()
          : null;
        let teammates = [];
        if (req.user.corporateTeamRef) {
          teammates = await User.find({
            company,
            corporateTeamRef: req.user.corporateTeamRef,
            isActive:         true,
            _id:              { $ne: myId },
          }).select("_id name role").lean();
        }
        const admins = await User.find({
          company,
          role:     { $in: ["admin", "superadmin"] },
          isActive: true,
        }).select("_id name role").lean();
        users = [...(managerUser ? [managerUser] : []), ...teammates, ...admins];
      } else if (sRole === "manager") {
        const directReports = await User.find({
          company,
          reportingManager: myId,
          isActive:         true,
        }).select("_id name role designation").lean();
        let teammates = [];
        if (req.user.corporateTeamRef) {
          teammates = await User.find({
            company,
            corporateTeamRef: req.user.corporateTeamRef,
            isActive:         true,
            _id:              { $ne: myId },
          }).select("_id name role").lean();
        }
        const admins = await User.find({
          company,
          role:     { $in: ["admin", "superadmin"] },
          isActive: true,
        }).select("_id name role").lean();
        users = [...directReports, ...teammates, ...admins];
      }
    }

    // Deduplicate
    const seen   = new Set();
    const unique = users.filter(u => {
      const id = u._id.toString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    res.json({ users: unique, hodUsers, canDirectMessageHod: sRole !== "student" });
  } catch (err) {
    console.error("messageable:", err);
    res.status(500).json({ error: "Failed to fetch messageable users" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /hod-request  — student submits a structured request to HOD
// Body: { hodId, category: "complaint"|"academic_issue"|"emergency",
//         subject: string, description: string }
// ════════════════════════════════════════════════════════════════════════════
router.post("/hod-request", ...mw, async (req, res) => {
  try {
    const company = req.user.company;
    const myId    = req.user._id;

    if (req.user.role !== "student") {
      return res.status(403).json({ error: "Only students may submit HOD requests." });
    }

    const { hodId, category, subject, description } = req.body;

    const VALID = ["complaint", "academic_issue", "emergency"];
    if (!VALID.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${VALID.join(", ")}` });
    }
    if (!subject?.trim())      return res.status(400).json({ error: "subject is required" });
    if (!description?.trim())  return res.status(400).json({ error: "description is required" });

    const hod = await User.findOne({ _id: hodId, company, role: "hod", isActive: true })
      .select("_id name").lean();
    if (!hod) return res.status(400).json({ error: "HOD not found" });

    const categoryLabel = { complaint: "COMPLAINT", academic_issue: "ACADEMIC ISSUE", emergency: "EMERGENCY" }[category];
    const bodyText = `[${categoryLabel}] ${subject.trim()}\n\n${description.trim()}`;

    // Reuse existing open hod_request thread between this student and this HOD
    const existing = await Conversation.findOne({
      company,
      type:                  "hod_request",
      "participants.user":   { $all: [myId, hod._id] },
      "participants.leftAt": null,
    });

    if (existing) {
      const msg = await Message.create({ company, conversation: existing._id, sender: myId, body: bodyText });
      await Conversation.updateOne(
        { _id: existing._id },
        {
          $set: { "lastMessage.body": bodyText, "lastMessage.sender": myId, "lastMessage.sentAt": msg.createdAt },
          $inc: { messageCount: 1 },
        }
      );
      await Conversation.updateOne(
        { _id: existing._id, "participants.user": hod._id },
        { $inc: { "participants.$.unreadCount": 1 } }
      );
      await msg.populate("sender", "name role");
      const populated = await Conversation.findById(existing._id)
        .populate("participants.user", "name role").lean();
      return res.status(200).json({ conversation: populated, message: msg, existing: true });
    }

    const convo = await Conversation.create({
      company,
      participants: [
        { user: myId,    unreadCount: 0 },
        { user: hod._id, unreadCount: 1 },
      ],
      isGroup:        false,
      type:           "hod_request",
      createdBy:      myId,
      hodRequestMeta: { category, subject: subject.trim() },
      lastMessage:    { body: bodyText, sender: myId, sentAt: new Date() },
      messageCount:   1,
    });

    const msg = await Message.create({ company, conversation: convo._id, sender: myId, body: bodyText });
    await msg.populate("sender", "name role");
    await convo.populate("participants.user", "name role");

    res.status(201).json({ conversation: convo, message: msg, existing: false });
  } catch (err) {
    console.error("hod-request:", err);
    res.status(500).json({ error: "Failed to submit HOD request" });
  }
});

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

    // ── Role-based permission check ────────────────────────────────────────
    for (const recipient of recipients) {
      const check = await canSendMessage(req.user, recipient._id, company);
      if (!check.allowed) {
        if (check.code === "USE_HOD_REQUEST") {
          return res.status(403).json({
            error: `To contact ${recipient.name} (HOD), please use the HOD Request form.`,
            code:  "USE_HOD_REQUEST",
          });
        }
        return res.status(403).json({ error: check.reason || "You are not allowed to message this person." });
      }
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

    // Roles allowed to send file attachments
    const FILE_ROLES = ["admin", "superadmin", "lecturer", "manager", "hod", "employee"];
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

"use strict";

/**
 * support.js
 * Mounted at: /api/support   (registered in server.js)
 *
 * Internal help-desk ticketing system.  Any authenticated user can raise a
 * ticket; staff (lecturer, manager, admin, superadmin) can manage and reply.
 * Works in both academic and corporate modes — no requireMode() gate.
 *
 * Route summary
 * -------------
 * GET    /                list tickets  (own tickets for end-users; all for staff)
 * POST   /                create a ticket
 * GET    /stats           aggregate stats  [admin, superadmin, manager]
 * GET    /:id             view ticket + replies (isInternal replies hidden from creator)
 * POST   /:id/replies     add a reply or internal note
 * PATCH  /:id/status      change status   [staff]
 * PATCH  /:id/assign      assign / re-assign to a staff member  [admin, manager, superadmin]
 * PATCH  /:id/priority    change priority [staff]
 */

const express  = require("express");
const router   = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole }               = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const SupportTicket = require("../models/SupportTicket");
const { TICKET_STATUSES, TICKET_CATEGORIES, TICKET_PRIORITIES } = SupportTicket;
const User = require("../models/User");

// ── Shared middleware ────────────────────────────────────────────────────────
const mw = [authenticate, requireActiveSubscription, companyIsolation];

const STAFF_ROLES = ["lecturer", "hod", "manager", "admin", "superadmin"];
function isStaff(role) { return STAFF_ROLES.includes(role); }

// ── Helpers ──────────────────────────────────────────────────────────────────

function parsePage(query) {
  const page  = Math.max(1, parseInt(query.page,  10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

/** Strip internal replies for non-staff callers. */
function sanitiseReplies(ticket, userId, userRole) {
  if (isStaff(userRole)) return ticket;
  const obj = ticket.toObject ? ticket.toObject() : { ...ticket };
  obj.replies = (obj.replies || []).filter(r => !r.isInternal);
  return obj;
}

/** Generate a human-readable ticket number: TK-00042 */
async function nextTicketNumber(company) {
  const count = await SupportTicket.countDocuments({ company });
  return `TK-${String(count + 1).padStart(5, "0")}`;
}

// ════════════════════════════════════════════════════════════════════════════
// GET /stats  — aggregate stats  [admin, superadmin, manager]
// Declared BEFORE /:id to prevent Express shadowing.
// ════════════════════════════════════════════════════════════════════════════
router.get("/stats", ...mw, requireRole("admin", "superadmin", "manager"), async (req, res) => {
  try {
    const company = req.user.company;

    const [byStatus, byCategory, byPriority, avgResolutionMs] = await Promise.all([
      SupportTicket.aggregate([
        { $match: { company } },
        { $group: { _id: "$status",   count: { $sum: 1 } } },
      ]),
      SupportTicket.aggregate([
        { $match: { company } },
        { $group: { _id: "$category", count: { $sum: 1 } } },
      ]),
      SupportTicket.aggregate([
        { $match: { company } },
        { $group: { _id: "$priority", count: { $sum: 1 } } },
      ]),
      SupportTicket.aggregate([
        { $match: { company, resolvedAt: { $ne: null } } },
        {
          $group: {
            _id: null,
            avgMs: { $avg: { $subtract: ["$resolvedAt", "$createdAt"] } },
          },
        },
      ]),
    ]);

    const avgResolutionHours = avgResolutionMs[0]
      ? parseFloat((avgResolutionMs[0].avgMs / 3600000).toFixed(1))
      : null;

    res.json({ byStatus, byCategory, byPriority, avgResolutionHours });
  } catch (err) {
    console.error("ticket stats:", err);
    res.status(500).json({ error: "Failed to fetch ticket stats" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /  — list tickets
// ════════════════════════════════════════════════════════════════════════════
router.get("/", ...mw, async (req, res) => {
  try {
    const company = req.user.company;
    const { page, limit, skip } = parsePage(req.query);

    const filter = { company };

    if (!isStaff(req.user.role)) {
      // End-users see only their own tickets
      filter.createdBy = req.user._id;
    } else {
      // Staff can filter by assignee
      if (req.query.assignedTo)  filter.assignedTo  = req.query.assignedTo;
      if (req.query.assignedToMe === "true") filter.assignedTo = req.user._id;
    }

    if (req.query.status)   filter.status   = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.priority) filter.priority = req.query.priority;

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .populate("createdBy",  "name role")
        .populate("assignedTo", "name role")
        .select("-replies")          // replies loaded separately via GET /:id
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(filter),
    ]);

    res.json({ tickets, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    console.error("list tickets:", err);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /  — create a ticket
// ════════════════════════════════════════════════════════════════════════════
router.post("/", ...mw, async (req, res) => {
  try {
    const company = req.user.company;
    const { subject, description, category, priority } = req.body;

    if (!subject?.trim())      return res.status(400).json({ error: "subject is required" });
    if (!description?.trim())  return res.status(400).json({ error: "description is required" });

    if (category && !TICKET_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: `category must be one of: ${TICKET_CATEGORIES.join(", ")}` });
    }
    if (priority && !TICKET_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `priority must be one of: ${TICKET_PRIORITIES.join(", ")}` });
    }

    const ticketNumber = await nextTicketNumber(company);

    const ticket = await SupportTicket.create({
      company,
      ticketNumber,
      createdBy:   req.user._id,
      subject:     subject.trim(),
      description: description.trim(),
      category:    category  || "general",
      priority:    priority  || "medium",
    });

    await ticket.populate("createdBy", "name role");
    res.status(201).json({ ticket });
  } catch (err) {
    console.error("create ticket:", err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /:id  — view ticket + replies
// ════════════════════════════════════════════════════════════════════════════
router.get("/:id", ...mw, async (req, res) => {
  try {
    const company = req.user.company;

    const ticket = await SupportTicket.findOne({ _id: req.params.id, company })
      .populate("createdBy",  "name role")
      .populate("assignedTo", "name role")
      .populate("resolvedBy", "name")
      .populate("closedBy",   "name")
      .populate("replies.author", "name role");

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    // Non-staff may only view their own ticket
    if (!isStaff(req.user.role) && ticket.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    const safe = sanitiseReplies(ticket, req.user._id, req.user.role);
    res.json({ ticket: safe });
  } catch (err) {
    console.error("view ticket:", err);
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /:id/replies  — add a reply or internal note
// ════════════════════════════════════════════════════════════════════════════
router.post("/:id/replies", ...mw, async (req, res) => {
  try {
    const company = req.user.company;
    const { body, isInternal } = req.body;

    if (!body?.trim()) return res.status(400).json({ error: "body is required" });

    // Only staff may post internal notes
    if (isInternal && !isStaff(req.user.role)) {
      return res.status(403).json({ error: "Only staff may post internal notes" });
    }

    const ticket = await SupportTicket.findOne({ _id: req.params.id, company });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    // Non-staff may only reply on their own ticket
    if (!isStaff(req.user.role) && ticket.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (ticket.status === "closed") {
      return res.status(400).json({ error: "Cannot reply on a closed ticket" });
    }

    // Auto-advance status when parties reply
    if (!isInternal) {
      if (isStaff(req.user.role) && ticket.status === "open") {
        ticket.status = "in_progress";
      } else if (!isStaff(req.user.role) && ticket.status === "waiting_response") {
        ticket.status = "in_progress";
      }
    }

    ticket.replies.push({
      author:     req.user._id,
      body:       body.trim(),
      isInternal: !!isInternal,
    });

    await ticket.save();
    await ticket.populate("replies.author", "name role");

    const reply = ticket.replies[ticket.replies.length - 1];
    res.status(201).json({ reply, ticketStatus: ticket.status });
  } catch (err) {
    console.error("add reply:", err);
    res.status(500).json({ error: "Failed to add reply" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /:id/status  — change status  [staff]
// Body: { status }
// ════════════════════════════════════════════════════════════════════════════
router.patch("/:id/status", ...mw, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    const company = req.user.company;
    const { status } = req.body;

    if (!TICKET_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${TICKET_STATUSES.join(", ")}` });
    }

    const ticket = await SupportTicket.findOne({ _id: req.params.id, company });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    const now = new Date();
    ticket.status = status;

    if (status === "resolved" && !ticket.resolvedAt) {
      ticket.resolvedBy = req.user._id;
      ticket.resolvedAt = now;
    }
    if (status === "closed") {
      ticket.closedBy = req.user._id;
      ticket.closedAt = now;
      if (!ticket.resolvedAt) {
        ticket.resolvedBy = req.user._id;
        ticket.resolvedAt = now;
      }
    }

    await ticket.save();
    res.json({ ticketNumber: ticket.ticketNumber, status: ticket.status });
  } catch (err) {
    console.error("update ticket status:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /:id/assign  — assign / re-assign  [admin, manager, superadmin]
// Body: { assigneeId }  (null to unassign)
// ════════════════════════════════════════════════════════════════════════════
router.patch("/:id/assign", ...mw, requireRole("admin", "manager", "superadmin"), async (req, res) => {
  try {
    const company = req.user.company;
    const { assigneeId } = req.body;

    const ticket = await SupportTicket.findOne({ _id: req.params.id, company });
    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    if (assigneeId) {
      // Verify assignee is staff in same company
      const assignee = await User.findOne({
        _id: assigneeId,
        company,
        role: { $in: STAFF_ROLES },
        isActive: true,
      }).select("_id name role").lean();
      if (!assignee) return res.status(404).json({ error: "Staff member not found" });

      ticket.assignedTo = assigneeId;
      if (ticket.status === "open") ticket.status = "in_progress";
    } else {
      ticket.assignedTo = null;
    }

    await ticket.save();
    await ticket.populate("assignedTo", "name role");

    res.json({ ticketNumber: ticket.ticketNumber, assignedTo: ticket.assignedTo, status: ticket.status });
  } catch (err) {
    console.error("assign ticket:", err);
    res.status(500).json({ error: "Failed to assign ticket" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /:id/priority  — change priority  [staff]
// Body: { priority }
// ════════════════════════════════════════════════════════════════════════════
router.patch("/:id/priority", ...mw, requireRole(...STAFF_ROLES), async (req, res) => {
  try {
    const company = req.user.company;
    const { priority } = req.body;

    if (!TICKET_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: `priority must be one of: ${TICKET_PRIORITIES.join(", ")}` });
    }

    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: req.params.id, company },
      { $set: { priority } },
      { new: true }
    ).select("ticketNumber priority");

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    res.json({ ticketNumber: ticket.ticketNumber, priority: ticket.priority });
  } catch (err) {
    res.status(500).json({ error: "Failed to update priority" });
  }
});

module.exports = router;

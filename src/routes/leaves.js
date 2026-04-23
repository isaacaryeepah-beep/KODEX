const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const LeaveRequest = require("../models/LeaveRequest");
const AuditLog = require("../models/AuditLog");
const { AUDIT_ACTIONS } = AuditLog;
const notificationService = require("../services/notificationService");

const mw = [authenticate, requireMode("corporate"), requireActiveSubscription];

// Helper: count working days between two dates
function workingDays(start, end) {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return Math.max(1, count);
}

// ── Employee: submit leave request ─────────────────────────────────────────
router.post("/", ...mw, requireRole("employee", "manager", "admin", "superadmin"), async (req, res) => {
  try {
    const { type, startDate, endDate, reason } = req.body;
    if (!type || !startDate || !endDate) {
      return res.status(400).json({ error: "Type, start date and end date are required" });
    }
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end < start) return res.status(400).json({ error: "End date must be after start date" });

    const leave = await LeaveRequest.create({
      company: req.user.company,
      employee: req.user._id,
      type, reason: reason || "",
      startDate: start,
      endDate: end,
      days: workingDays(start, end),
    });
    res.status(201).json({ leave });
  } catch (e) {
    res.status(500).json({ error: "Failed to submit leave request" });
  }
});

// ── Employee: my leave requests ─────────────────────────────────────────────
router.get("/my", ...mw, async (req, res) => {
  try {
    const leaves = await LeaveRequest.find({
      company: req.user.company,
      employee: req.user._id,
    }).sort({ createdAt: -1 }).limit(50);
    res.json({ leaves });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch leave requests" });
  }
});

// ── Employee: cancel own pending request ───────────────────────────────────
router.patch("/:id/cancel", ...mw, async (req, res) => {
  try {
    const leave = await LeaveRequest.findOneAndUpdate(
      { _id: req.params.id, employee: req.user._id, status: "pending" },
      { status: "cancelled" },
      { new: true }
    );
    if (!leave) return res.status(404).json({ error: "Leave request not found or cannot be cancelled" });

    // Audit + notify (fire-and-forget)
    AuditLog.record({
      company:       leave.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.ARCHIVE,
      resource:      "LeaveRequest",
      resourceId:    leave._id,
      resourceLabel: `${leave.type} leave`,
      metadata:      { status: "cancelled" },
      mode:          "corporate",
      req,
    });

    res.json({ leave });
  } catch (e) {
    res.status(500).json({ error: "Failed to cancel leave request" });
  }
});

// ── Manager/Admin: list all pending requests ───────────────────────────────
router.get("/pending", ...mw, requireRole("admin", "manager", "superadmin"), async (req, res) => {
  try {
    const filter = { company: req.user.company, status: "pending" };
    const leaves = await LeaveRequest.find(filter)
      .populate("employee", "name employeeId department")
      .sort({ createdAt: 1 });
    res.json({ leaves });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch pending requests" });
  }
});

// ── Manager/Admin: list all requests (with optional filters) ───────────────
router.get("/", ...mw, requireRole("admin", "manager", "superadmin"), async (req, res) => {
  try {
    const filter = { company: req.user.company };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.employeeId) filter.employee = req.query.employeeId;
    const leaves = await LeaveRequest.find(filter)
      .populate("employee", "name employeeId department")
      .populate("reviewedBy", "name")
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ leaves });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch leave requests" });
  }
});

// ── Manager/Admin: approve or reject ──────────────────────────────────────
router.patch("/:id/review", ...mw, requireRole("admin", "manager", "superadmin"), async (req, res) => {
  try {
    const { action, note } = req.body; // action: 'approved' | 'rejected'
    if (!["approved", "rejected"].includes(action)) {
      return res.status(400).json({ error: "Action must be approved or rejected" });
    }
    const leave = await LeaveRequest.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company, status: "pending" },
      {
        status: action,
        reviewedBy: req.user._id,
        reviewedAt: new Date(),
        reviewNote: note || "",
      },
      { new: true }
    ).populate("employee", "name employeeId department");
    if (!leave) return res.status(404).json({ error: "Leave request not found or already reviewed" });

    // Audit log (fire-and-forget)
    AuditLog.record({
      company:       leave.company,
      actor:         req.user,
      action:        action === "approved" ? AUDIT_ACTIONS.LEAVE_APPROVED : AUDIT_ACTIONS.LEAVE_REJECTED,
      resource:      "LeaveRequest",
      resourceId:    leave._id,
      resourceLabel: `${leave.type} leave (${leave.employee?.name || leave.employee})`,
      changes:       { before: { status: "pending" }, after: { status: action } },
      metadata:      { note: note || null, days: leave.days },
      mode:          "corporate",
      req,
    });

    // Notify employee (fire-and-forget)
    if (action === "approved") {
      notificationService.notifyLeaveApproved(leave);
    } else {
      notificationService.notifyLeaveRejected(leave, note);
    }

    res.json({ leave });
  } catch (e) {
    res.status(500).json({ error: "Failed to review leave request" });
  }
});

module.exports = router;

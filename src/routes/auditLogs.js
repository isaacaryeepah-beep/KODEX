"use strict";

/**
 * auditLogs.js
 * Mounted at: /api/audit-logs   (registered in server.js)
 *
 * Admin-only viewer for the AuditLog collection.
 * All routes require admin/superadmin role.
 *
 * Route summary
 * -------------
 * GET  /                list logs (filterable, paginated)
 * GET  /stats           aggregate counts by action / severity (dashboard widget)
 * GET  /export          CSV export of filtered results
 * GET  /:id             single log entry detail
 */

const express = require("express");
const router  = express.Router();
const authenticate              = require("../middleware/auth");
const { companyIsolation }      = require("../middleware/companyIsolation");
const { requireRole }           = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const AuditLog = require("../models/AuditLog");
const { AUDIT_ACTIONS, SEVERITY } = AuditLog;

// All audit log routes are admin-only
router.use(authenticate);
router.use(requireActiveSubscription);
router.use(requireRole("admin", "superadmin"));
router.use(companyIsolation);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildFilter(query, companyId) {
  const filter = { company: companyId };

  if (query.action)   filter.action   = query.action;
  if (query.severity) filter.severity = query.severity;
  if (query.resource) filter.resource = query.resource;
  if (query.actorId)  filter.actor    = query.actorId;
  if (query.mode)     filter.mode     = query.mode;

  // resourceId exact match
  if (query.resourceId) filter.resourceId = query.resourceId;

  // Date range
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      to.setUTCHours(23, 59, 59, 999);
      filter.createdAt.$lte = to;
    }
  }

  // Full-text search on actorName / resourceLabel (simple regex)
  if (query.search) {
    const re = new RegExp(query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [
      { actorName:     re },
      { actorEmail:    re },
      { resourceLabel: re },
      { requestPath:   re },
    ];
  }

  return filter;
}

// ---------------------------------------------------------------------------
// GET /stats  — must come before /:id
// ---------------------------------------------------------------------------
router.get("/stats", async (req, res) => {
  try {
    const days  = Math.min(90, parseInt(req.query.days) || 30);
    const since = new Date(Date.now() - days * 86_400_000);

    const [bySeverity, byAction, byDay, criticalRecent] = await Promise.all([
      // Counts by severity
      AuditLog.aggregate([
        { $match: { company: req.user.company, createdAt: { $gte: since } } },
        { $group: { _id: "$severity", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      // Top 10 actions
      AuditLog.aggregate([
        { $match: { company: req.user.company, createdAt: { $gte: since } } },
        { $group: { _id: "$action", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),

      // Daily activity (last N days)
      AuditLog.aggregate([
        { $match: { company: req.user.company, createdAt: { $gte: since } } },
        {
          $group: {
            _id:   { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),

      // Last 5 critical / high events
      AuditLog.find({
        company:  req.user.company,
        severity: { $in: [SEVERITY.CRITICAL, SEVERITY.HIGH] },
      })
        .sort({ createdAt: -1 })
        .limit(5)
        .select("action resource resourceLabel actorName actorEmail severity createdAt"),
    ]);

    res.json({
      period: { days, since },
      bySeverity,
      byAction,
      byDay,
      criticalRecent,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch audit stats" });
  }
});

// ---------------------------------------------------------------------------
// GET /export  — CSV download (max 5000 rows)
// ---------------------------------------------------------------------------
router.get("/export", async (req, res) => {
  try {
    const filter = buildFilter(req.query, req.user.company);
    const rows = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    const headers = [
      "Timestamp", "Actor", "Actor Email", "Actor Role",
      "Action", "Severity", "Resource", "Resource Label",
      "Mode", "IP Address", "Request Path",
    ];
    const csv = [
      headers.map((h) => `"${h}"`).join(","),
      ...rows.map((r) => [
        new Date(r.createdAt).toISOString(),
        r.actorName    || "",
        r.actorEmail   || "",
        r.actorRole    || "",
        r.action       || "",
        r.severity     || "",
        r.resource     || "",
        r.resourceLabel|| "",
        r.mode         || "",
        r.ipAddress    || "",
        r.requestPath  || "",
      ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const ts = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${ts}.csv"`);
    res.send(csv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to export audit log" });
  }
});

// ---------------------------------------------------------------------------
// GET /  — list (filterable, paginated)
// ---------------------------------------------------------------------------
router.get("/", async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;

    const filter = buildFilter(req.query, req.user.company);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      filters: {
        actions:    Object.values(AUDIT_ACTIONS),
        severities: Object.values(SEVERITY),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ---------------------------------------------------------------------------
// GET /:id  — single entry
// ---------------------------------------------------------------------------
router.get("/:id", async (req, res) => {
  try {
    const log = await AuditLog.findOne({
      _id:     req.params.id,
      company: req.user.company,
    });
    if (!log) return res.status(404).json({ error: "Log entry not found" });
    res.json({ log });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch log entry" });
  }
});

module.exports = router;

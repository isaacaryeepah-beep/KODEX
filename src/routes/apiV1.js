"use strict";

/**
 * apiV1.js
 * Mounted at: /api/v1   (registered in server.js)
 *
 * Dikly's PUBLIC API — consumed by customer integrations (HR tools,
 * reporting systems, custom dashboards) with an X-API-Key header, never by the web
 * app itself. Deliberately a curated, versioned, read-only subset rather
 * than a re-export of the internal /api routes: everything under /v1 is a
 * compatibility promise to external developers, so nothing lands here
 * unless its response shape is meant to stay stable.
 *
 * Route summary (all GET, all JSON, all company-scoped by the key):
 *   /ping        key/scope sanity check — no scope required
 *   /employees   employee directory                 scope: read:employees
 *   /attendance  daily clock-in/out records         scope: read:attendance   (corporate)
 *   /leaves      leave requests                     scope: read:leaves       (corporate)
 *   /shifts      shift definitions                  scope: read:shifts       (corporate)
 *   /students    student directory                  scope: read:students     (academic)
 *   /courses     course catalogue                   scope: read:courses      (academic)
 *
 * Pagination: ?limit= (default 50, max 200) & ?offset=. Every list response
 * is { data: [...], pagination: { total, limit, offset } }.
 */

const express = require("express");
const router = express.Router();
const { apiKeyAuth, requireScope, requireCorporate, requireAcademic } = require("../middleware/apiKeyAuth");
const User = require("../models/User");
const CorporateAttendance = require("../models/CorporateAttendance");
const LeaveRequest = require("../models/LeaveRequest");
const Shift = require("../models/Shift");
const Course = require("../models/Course");

router.use(apiKeyAuth);

function paging(req) {
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
  return { limit, offset };
}

function dayRange(req) {
  // from/to are inclusive calendar dates (YYYY-MM-DD); invalid values are
  // rejected rather than silently ignored so integrations fail loudly.
  const parse = (s, endOfDay) => {
    if (!s) return null;
    const d = new Date(s);
    if (isNaN(d)) throw new Error(`Invalid date "${s}" — use YYYY-MM-DD.`);
    if (endOfDay) d.setUTCHours(23, 59, 59, 999);
    else d.setUTCHours(0, 0, 0, 0);
    return d;
  };
  return { from: parse(req.query.from, false), to: parse(req.query.to, true) };
}

// ── GET /ping — verify a key works and see what it can do ──────────────────
router.get("/ping", (req, res) => {
  res.json({
    ok: true,
    company: req.apiCompany.name,
    mode: req.apiCompany.mode,
    keyName: req.apiKey.name,
    scopes: req.apiKey.scopes,
  });
});

// ── GET /employees ──────────────────────────────────────────────────────────
router.get("/employees", requireScope("read:employees"), async (req, res) => {
  try {
    const { limit, offset } = paging(req);
    const filter = { company: req.apiCompany._id };
    if (req.query.role) filter.role = req.query.role;
    if (req.query.active !== undefined) filter.isActive = req.query.active !== "false";

    const [total, users] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("name email employeeId department role isActive createdAt")
        .sort({ name: 1 })
        .skip(offset)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      data: users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        employeeId: u.employeeId || null,
        department: u.department || null,
        role: u.role,
        active: !!u.isActive,
        createdAt: u.createdAt,
      })),
      pagination: { total, limit, offset },
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: "Failed to list employees." });
  }
});

// ── GET /attendance ─────────────────────────────────────────────────────────
router.get("/attendance", requireScope("read:attendance"), requireCorporate, async (req, res) => {
  try {
    const { limit, offset } = paging(req);
    let from, to;
    try { ({ from, to } = dayRange(req)); }
    catch (e) { return res.status(400).json({ error: "bad_request", message: e.message }); }

    const filter = { company: req.apiCompany._id };
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = from;
      if (to)   filter.date.$lte = to;
    }
    if (req.query.employeeId) filter.employee = req.query.employeeId;

    const [total, records] = await Promise.all([
      CorporateAttendance.countDocuments(filter),
      CorporateAttendance.find(filter)
        .populate("employee", "name employeeId email")
        .populate("shift", "name startTime endTime")
        .sort({ date: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      data: records.map((r) => ({
        id: r._id,
        date: r.date ? new Date(r.date).toISOString().slice(0, 10) : null,
        employee: r.employee
          ? { id: r.employee._id, name: r.employee.name, employeeId: r.employee.employeeId || null, email: r.employee.email }
          : null,
        shift: r.shift ? { name: r.shift.name, startTime: r.shift.startTime, endTime: r.shift.endTime } : null,
        status: r.status,
        clockIn: r.clockIn?.time
          ? { time: r.clockIn.time, method: r.clockIn.method, late: !!r.clockIn.isLate, lateMinutes: r.clockIn.lateMinutes || 0, note: r.clockIn.reason || null }
          : null,
        clockOut: r.clockOut?.time
          ? { time: r.clockOut.time, method: r.clockOut.method, earlyLeaveMinutes: r.clockOut.earlyLeaveMinutes || 0, note: r.clockOut.reason || null }
          : null,
        hoursWorked: r.hoursWorked ?? null,
        overtimeHours: r.overtimeHours || 0,
      })),
      pagination: { total, limit, offset },
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: "Failed to list attendance records." });
  }
});

// ── GET /leaves ─────────────────────────────────────────────────────────────
router.get("/leaves", requireScope("read:leaves"), requireCorporate, async (req, res) => {
  try {
    const { limit, offset } = paging(req);
    const filter = { company: req.apiCompany._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.employeeId) filter.employee = req.query.employeeId;

    const [total, leaves] = await Promise.all([
      LeaveRequest.countDocuments(filter),
      LeaveRequest.find(filter)
        .populate("employee", "name employeeId email")
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      data: leaves.map((l) => ({
        id: l._id,
        employee: l.employee
          ? { id: l.employee._id, name: l.employee.name, employeeId: l.employee.employeeId || null, email: l.employee.email }
          : null,
        type: l.type,
        startDate: l.startDate,
        endDate: l.endDate,
        days: l.days,
        status: l.status,
        requestedAt: l.createdAt,
      })),
      pagination: { total, limit, offset },
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: "Failed to list leave requests." });
  }
});

// ── GET /shifts ─────────────────────────────────────────────────────────────
router.get("/shifts", requireScope("read:shifts"), requireCorporate, async (req, res) => {
  try {
    const shifts = await Shift.find({ company: req.apiCompany._id })
      .select("name startTime endTime gracePeriodMinutes days")
      .sort({ name: 1 })
      .lean();
    res.json({
      data: shifts.map((s) => ({
        id: s._id,
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        gracePeriodMinutes: s.gracePeriodMinutes,
        days: s.days || [],
      })),
      pagination: { total: shifts.length, limit: shifts.length, offset: 0 },
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: "Failed to list shifts." });
  }
});

// ── GET /students ────────────────────────────────────────────────────────
router.get("/students", requireScope("read:students"), requireAcademic, async (req, res) => {
  try {
    const { limit, offset } = paging(req);
    const filter = { company: req.apiCompany._id, role: "student" };
    if (req.query.programme) filter.programme = req.query.programme;
    if (req.query.department) filter.department = req.query.department;
    if (req.query.level) filter.studentLevel = req.query.level;
    if (req.query.active !== undefined) filter.isActive = req.query.active !== "false";

    const [total, students] = await Promise.all([
      User.countDocuments(filter),
      User.find(filter)
        .select("name email IndexNumber programme department studentLevel isActive createdAt")
        .sort({ name: 1 })
        .skip(offset)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      data: students.map((s) => ({
        id: s._id,
        name: s.name,
        email: s.email,
        indexNumber: s.IndexNumber || null,
        programme: s.programme || null,
        department: s.department || null,
        level: s.studentLevel || null,
        active: !!s.isActive,
        createdAt: s.createdAt,
      })),
      pagination: { total, limit, offset },
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: "Failed to list students." });
  }
});

// ── GET /courses ─────────────────────────────────────────────────────────
router.get("/courses", requireScope("read:courses"), requireAcademic, async (req, res) => {
  try {
    const { limit, offset } = paging(req);
    const filter = { companyId: req.apiCompany._id };
    if (req.query.academicYear) filter.academicYear = req.query.academicYear;
    if (req.query.semester) filter.semester = req.query.semester;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.active !== undefined) filter.isActive = req.query.active !== "false";

    const [total, courses] = await Promise.all([
      Course.countDocuments(filter),
      Course.find(filter)
        .populate("lecturerId", "name email")
        .select("title code academicYear semester level group status isActive isPublished enrolledStudents lecturerId createdAt")
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      data: courses.map((c) => ({
        id: c._id,
        code: c.code,
        title: c.title,
        academicYear: c.academicYear || null,
        semester: c.semester || null,
        level: c.level || null,
        group: c.group || null,
        lecturer: c.lecturerId ? { id: c.lecturerId._id, name: c.lecturerId.name, email: c.lecturerId.email } : null,
        enrolledCount: (c.enrolledStudents || []).length,
        status: c.status,
        active: !!c.isActive,
        published: !!c.isPublished,
        createdAt: c.createdAt,
      })),
      pagination: { total, limit, offset },
    });
  } catch (e) {
    res.status(500).json({ error: "server_error", message: "Failed to list courses." });
  }
});

module.exports = router;

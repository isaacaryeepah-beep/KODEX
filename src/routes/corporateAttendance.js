"use strict";

/**
 * corporateAttendance.js
 * Mounted at: /api/corporate-attendance   (registered in server.js)
 *
 * Route summary
 * -------------
 * POST   /clock-in              employee clocks in for today
 * POST   /clock-out             employee clocks out for today
 * GET    /my                    employee: my records (date range)
 * GET    /today                 admin/manager: today's summary
 * GET    /                      admin/manager: records (employee + date range)
 * GET    /summary               admin/manager: daily/weekly/monthly stats
 * PATCH  /:id/override          admin: manual status/time override
 *
 * Corporate mode only.
 */

const express = require("express");
const router  = express.Router();
const authenticate              = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const CorporateAttendance = require("../models/CorporateAttendance");
const ShiftAssignment     = require("../models/ShiftAssignment");
const Shift               = require("../models/Shift");
const AuditLog            = require("../models/AuditLog");
const { AUDIT_ACTIONS }   = AuditLog;
const notificationService = require("../services/notificationService");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const canManage = requireRole("admin", "manager", "superadmin");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a date to midnight UTC (start of day).
 */
function toDay(raw) {
  const d = raw instanceof Date ? new Date(raw) : new Date(raw || Date.now());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Determine attendance status from clock times vs shift schedule.
 * Returns "present" | "late" | "half_day".
 * If no shift data is available, returns "present".
 */
function computeStatus(clockIn, clockOut, shift) {
  if (!clockIn?.time) return "absent";

  let status = "present";

  if (shift) {
    // Parse shift startTime "HH:MM"
    const [sh, sm] = shift.startTime.split(":").map(Number);
    const shiftStartToday = new Date(clockIn.time);
    shiftStartToday.setHours(sh, sm, 0, 0);

    const gracePeriod = (shift.gracePeriodMinutes || 15) * 60 * 1000;
    const lateMs = clockIn.time - shiftStartToday;

    if (lateMs > gracePeriod) {
      status = "late";
    }
  }

  return status;
}

/**
 * Compute hours worked between two Date objects.
 */
function hoursWorked(clockInTime, clockOutTime) {
  if (!clockInTime || !clockOutTime) return null;
  const ms = new Date(clockOutTime) - new Date(clockInTime);
  return Math.max(0, Math.round((ms / 3_600_000) * 100) / 100); // 2 decimal places
}

// ---------------------------------------------------------------------------
// GET /my  — employee's own records
// ---------------------------------------------------------------------------
router.get("/my", ...mw, async (req, res) => {
  try {
    const startDate = req.query.from ? toDay(req.query.from) : toDay(new Date(Date.now() - 30 * 86_400_000));
    const endDate   = req.query.to   ? toDay(req.query.to)   : toDay(new Date());
    endDate.setUTCHours(23, 59, 59, 999);

    const records = await CorporateAttendance.find({
      company:  req.user.company,
      employee: req.user._id,
      date:     { $gte: startDate, $lte: endDate },
    })
      .populate("shift", "name startTime endTime")
      .sort({ date: -1 });

    res.json({ records, count: records.length });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch your attendance records" });
  }
});

// ---------------------------------------------------------------------------
// POST /clock-in  — employee clocks in for today
// ---------------------------------------------------------------------------
router.post("/clock-in", ...mw, async (req, res) => {
  try {
    const now     = new Date();
    const today   = toDay(now);
    const { method, latitude, longitude, address } = req.body;
    const ipAddr  = req.ip || null;

    // Find active shift assignment
    const assignment = await ShiftAssignment.findOne({
      company:  req.user.company,
      employee: req.user._id,
      isActive: true,
    }).populate("shift");

    const shift = assignment?.shift || null;

    // Compute late minutes
    let lateMinutes = 0;
    let isLate      = false;
    if (shift) {
      const [sh, sm] = shift.startTime.split(":").map(Number);
      const shiftStart = new Date(now);
      shiftStart.setHours(sh, sm, 0, 0);
      const gracePeriod = (shift.gracePeriodMinutes || 15) * 60_000;
      const diff = now - shiftStart;
      if (diff > gracePeriod) {
        isLate      = true;
        lateMinutes = Math.floor(diff / 60_000);
      }
    }

    // Upsert — creates today's record or updates clockIn
    const record = await CorporateAttendance.findOneAndUpdate(
      { company: req.user.company, employee: req.user._id, date: today },
      {
        $setOnInsert: {
          company:  req.user.company,
          employee: req.user._id,
          date:     today,
          shift:    shift ? shift._id : null,
        },
        $set: {
          "clockIn.time":           now,
          "clockIn.method":         method   || "web",
          "clockIn.ipAddress":      ipAddr,
          "clockIn.location.latitude":  latitude  ?? null,
          "clockIn.location.longitude": longitude ?? null,
          "clockIn.location.address":   address   || "",
          "clockIn.isLate":         isLate,
          "clockIn.lateMinutes":    lateMinutes,
          lateMinutes,
          status: isLate ? "late" : "present",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate("shift", "name startTime endTime");

    res.json({ record, message: isLate ? "Clocked in (late)" : "Clocked in" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to clock in" });
  }
});

// ---------------------------------------------------------------------------
// POST /clock-out  — employee clocks out
// ---------------------------------------------------------------------------
router.post("/clock-out", ...mw, async (req, res) => {
  try {
    const now     = new Date();
    const today   = toDay(now);
    const { method, latitude, longitude, address } = req.body;
    const ipAddr  = req.ip || null;

    const existing = await CorporateAttendance.findOne({
      company:  req.user.company,
      employee: req.user._id,
      date:     today,
    }).populate("shift");

    if (!existing || !existing.clockIn?.time) {
      return res.status(400).json({ error: "No clock-in record found for today" });
    }
    if (existing.clockOut?.time) {
      return res.status(400).json({ error: "Already clocked out today" });
    }

    const worked = hoursWorked(existing.clockIn.time, now);
    const shift  = existing.shift;

    // Compute early leave
    let earlyLeaveMinutes = 0;
    if (shift) {
      const [eh, em] = shift.endTime.split(":").map(Number);
      const shiftEnd = new Date(now);
      shiftEnd.setHours(eh, em, 0, 0);
      const diff = shiftEnd - now;
      if (diff > 0) earlyLeaveMinutes = Math.floor(diff / 60_000);
    }

    // Overtime: worked > shift hours
    let overtimeHours = 0;
    if (shift && worked != null) {
      const [sh, sm] = shift.startTime.split(":").map(Number);
      const [eh, em] = shift.endTime.split(":").map(Number);
      const scheduledHours = (eh * 60 + em - sh * 60 - sm) / 60;
      if (worked > scheduledHours) {
        overtimeHours = Math.round((worked - scheduledHours) * 100) / 100;
      }
    }

    // Determine final status
    let finalStatus = existing.status;
    if (worked != null && worked < 4 && finalStatus !== "on_leave") {
      finalStatus = "half_day";
    }

    const record = await CorporateAttendance.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          "clockOut.time":                now,
          "clockOut.method":              method   || "web",
          "clockOut.ipAddress":           ipAddr,
          "clockOut.location.latitude":   latitude  ?? null,
          "clockOut.location.longitude":  longitude ?? null,
          "clockOut.location.address":    address   || "",
          "clockOut.earlyLeaveMinutes":   earlyLeaveMinutes,
          hoursWorked:      worked,
          overtimeHours,
          earlyLeaveMinutes,
          status:           finalStatus,
        },
      },
      { new: true }
    ).populate("shift", "name startTime endTime");

    res.json({ record, message: "Clocked out", hoursWorked: worked });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to clock out" });
  }
});

// ---------------------------------------------------------------------------
// GET /today  — today's attendance summary (admin/manager)
// ---------------------------------------------------------------------------
router.get("/today", ...mw, canManage, async (req, res) => {
  try {
    const today = toDay(new Date());
    const end   = new Date(today);
    end.setUTCHours(23, 59, 59, 999);

    const records = await CorporateAttendance.find({
      company: req.user.company,
      date:    { $gte: today, $lte: end },
    })
      .populate("employee", "name employeeId department role")
      .populate("shift",    "name startTime endTime")
      .sort({ "employee.name": 1 });

    const summary = {
      present:       records.filter((r) => r.status === "present").length,
      late:          records.filter((r) => r.status === "late").length,
      absent:        records.filter((r) => r.status === "absent").length,
      on_leave:      records.filter((r) => r.status === "on_leave").length,
      half_day:      records.filter((r) => r.status === "half_day").length,
      remote:        records.filter((r) => r.status === "remote").length,
      total_clocked: records.filter((r) => r.clockIn?.time).length,
    };

    res.json({ records, summary, date: today });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch today's attendance" });
  }
});

// ---------------------------------------------------------------------------
// GET /  — all records with optional filters (admin/manager)
// ---------------------------------------------------------------------------
router.get("/", ...mw, canManage, async (req, res) => {
  try {
    const filter = { company: req.user.company };
    if (req.query.employeeId) filter.employee = req.query.employeeId;
    if (req.query.status)     filter.status   = req.query.status;

    const startDate = req.query.from ? toDay(req.query.from) : toDay(new Date(Date.now() - 30 * 86_400_000));
    const endDate   = req.query.to   ? toDay(req.query.to)   : toDay(new Date());
    endDate.setUTCHours(23, 59, 59, 999);
    filter.date = { $gte: startDate, $lte: endDate };

    const records = await CorporateAttendance.find(filter)
      .populate("employee", "name employeeId department role")
      .populate("shift",    "name startTime endTime")
      .sort({ date: -1, "employee.name": 1 })
      .limit(500);

    res.json({ records, count: records.length });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch attendance records" });
  }
});

// ---------------------------------------------------------------------------
// GET /summary  — aggregate stats (admin/manager)
// ---------------------------------------------------------------------------
router.get("/summary", ...mw, canManage, async (req, res) => {
  try {
    const year  = parseInt(req.query.year)  || new Date().getFullYear();
    const month = parseInt(req.query.month) || new Date().getMonth() + 1;

    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate   = new Date(Date.UTC(year, month, 0, 23, 59, 59));

    const agg = await CorporateAttendance.aggregate([
      {
        $match: {
          company: req.user.company,
          date:    { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id:            "$status",
          count:          { $sum: 1 },
          avgHoursWorked: { $avg: "$hoursWorked" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const totalDays  = await CorporateAttendance.countDocuments({
      company: req.user.company,
      date:    { $gte: startDate, $lte: endDate },
    });

    const totalHours = await CorporateAttendance.aggregate([
      {
        $match: {
          company:     req.user.company,
          date:        { $gte: startDate, $lte: endDate },
          hoursWorked: { $ne: null },
        },
      },
      { $group: { _id: null, total: { $sum: "$hoursWorked" } } },
    ]);

    res.json({
      period:     { year, month },
      byStatus:   agg,
      totalDays,
      totalHours: totalHours[0]?.total || 0,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch attendance summary" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /:id/override  — manual correction (admin only)
// ---------------------------------------------------------------------------
router.patch("/:id/override", ...mw, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const {
      status, clockInTime, clockOutTime,
      notes, reason,
    } = req.body;

    if (!status && !clockInTime && !clockOutTime) {
      return res.status(400).json({ error: "Provide at least one field to override" });
    }

    // Fetch before-state first — needed for audit trail and hours recomputation
    const existing = await CorporateAttendance.findOne({
      _id: req.params.id,
      company: req.user.company,
    });
    if (!existing) return res.status(404).json({ error: "Attendance record not found" });

    const existingStatus = existing.status;

    const update = {
      isManualOverride: true,
      overrideBy:       req.user._id,
      overrideAt:       new Date(),
      overrideReason:   reason || "",
    };
    if (status)       update.status             = status;
    if (notes)        update.notes              = notes;
    if (clockInTime)  update["clockIn.time"]    = new Date(clockInTime);
    if (clockOutTime) update["clockOut.time"]   = new Date(clockOutTime);

    // Recompute hours worked when either clock time is being updated
    if (clockInTime || clockOutTime) {
      const ciTime = clockInTime  ? new Date(clockInTime)  : existing.clockIn?.time;
      const coTime = clockOutTime ? new Date(clockOutTime) : existing.clockOut?.time;
      const worked = hoursWorked(ciTime, coTime);
      if (worked !== null) update.hoursWorked = worked;
    }

    const record = await CorporateAttendance.findByIdAndUpdate(
      existing._id,
      { $set: update },
      { new: true }
    ).populate("employee", "name employeeId");

    // Audit + notify employee (fire-and-forget)
    const dateLabel = new Date(record.date).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", year: "numeric",
    });
    AuditLog.record({
      company:       record.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.ATTENDANCE_EDITED,
      resource:      "CorporateAttendance",
      resourceId:    record._id,
      resourceLabel: `Attendance ${dateLabel} — ${record.employee?.name || record.employee}`,
      changes:       { before: { status: existingStatus }, after: { status: record.status } },
      metadata:      { reason: reason || null },
      mode:          "corporate",
      req,
    });
    notificationService.notifyAttendanceOverridden(record, req.user.name);

    res.json({ record });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to override attendance record" });
  }
});

module.exports = router;

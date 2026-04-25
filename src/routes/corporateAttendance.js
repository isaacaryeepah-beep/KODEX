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
const Company             = require("../models/Company");
const User                = require("../models/User");
const antiCheat           = require("../utils/attendanceAntiCheat");
const { AUDIT_ACTIONS }   = AuditLog;
const notificationService = require("../services/notificationService");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const canManage = requireRole("admin", "manager", "superadmin");
const adminOnly = requireRole("admin", "superadmin");

// ---------------------------------------------------------------------------
// Strict attendance helpers
// ---------------------------------------------------------------------------

function extractClientIp(req) {
  const fwd = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const raw  = fwd || req.headers["x-real-ip"] || req.ip || "";
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function detectProxy(req) {
  if (req.headers["via"] || req.headers["proxy-connection"]) return true;
  // Multiple hops in x-forwarded-for beyond what the server's own proxy adds
  const fwd = (req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean);
  return fwd.length > 1;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function validateStrictAttendance(req, companyId) {
  const company = await Company.findById(companyId).select("corporateSettings").lean();
  const s = company?.corporateSettings || {};
  if (!s.strictAttendance) return { ok: true, verified: null };

  const clientIp   = extractClientIp(req);
  const isLocalDev = clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "";

  // 1. VPN / proxy check
  if (!isLocalDev && detectProxy(req)) {
    return { ok: false, reason: "vpn_detected",
      message: "You must be on company WiFi and at office to clock in." };
  }

  // 2. WiFi IP check
  const allowed = s.allowedWifiIPs || [];
  if (allowed.length > 0 && !isLocalDev && !allowed.includes(clientIp)) {
    return { ok: false, reason: "wifi_mismatch",
      message: "You must be on company WiFi and at office to clock in." };
  }

  // 3. Geofence check
  if (s.officeLatitude != null && s.officeLongitude != null) {
    const { latitude, longitude } = req.body;
    if (latitude == null || longitude == null) {
      return { ok: false, reason: "location_missing",
        message: "Location is required. Please enable GPS and try again." };
    }
    const dist   = haversineMeters(s.officeLatitude, s.officeLongitude, latitude, longitude);
    const radius = s.geofenceRadiusMeters || 150;
    if (dist > radius) {
      return { ok: false, reason: "outside_geofence",
        message: `You must be at the office to clock in. You are ${Math.round(dist)}m away (limit: ${radius}m).` };
    }
  }

  return { ok: true, verified: true };
}

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
// POST /clock-in  — employee clocks in for today (strict anti-cheat)
// ---------------------------------------------------------------------------
router.post("/clock-in", ...mw, async (req, res) => {
  try {
    const now   = new Date();
    const today = toDay(now);
    const { method, latitude, longitude, accuracy, address } = req.body;
    const userAgent = req.headers["user-agent"] || null;

    // Block double clock-in
    const existingToday = await CorporateAttendance.findOne({
      company: req.user.company, employee: req.user._id, date: today,
    });
    if (existingToday?.clockIn?.time && !existingToday?.clockOut?.time) {
      return res.status(400).json({ error: "Already clocked in. Clock out first." });
    }

    // Load user fresh for anti-cheat state
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    // Settings (used for geofence + WiFi + time windows)
    const company  = await Company.findById(req.user.company).select("corporateSettings").lean();
    const settings = company?.corporateSettings || {};

    // Anti-cheat evaluation
    const evalResult = antiCheat.evaluateAttempt({
      req, user, body: req.body, settings, lastEvent: user.lastClockEvent,
      eventType: "clock_in",
    });

    const { before, after } = await antiCheat.applyTrustOutcome(
      user, evalResult,
      evalResult.ok ? { latitude, longitude } : null
    );
    await user.save();

    if (!evalResult.ok) {
      // Log failed attempt on today's record
      await CorporateAttendance.findOneAndUpdate(
        { company: req.user.company, employee: req.user._id, date: today },
        {
          $setOnInsert: { company: req.user.company, employee: req.user._id, date: today },
          $push: { failedAttempts: {
            attemptedAt: now,
            reason:      evalResult.reason,
            ipAddress:   evalResult.clientIp,
            latitude:    latitude ?? null,
            longitude:   longitude ?? null,
          }},
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      return res.status(403).json({
        error: evalResult.message, reason: evalResult.reason, blocked: true,
        flags: evalResult.flags, trustScore: after,
      });
    }

    // ── Passed anti-cheat — proceed with clock-in ────────────────────────────
    const assignment = await ShiftAssignment.findOne({
      company:  req.user.company,
      employee: req.user._id,
      isActive: true,
    }).populate("shift");
    const shift = assignment?.shift || null;

    let lateMinutes = 0, isLate = false;
    if (shift) {
      const [sh, sm] = shift.startTime.split(":").map(Number);
      const shiftStart = new Date(now);
      shiftStart.setHours(sh, sm, 0, 0);
      const gracePeriod = (shift.gracePeriodMinutes || 15) * 60_000;
      const diff = now - shiftStart;
      if (diff > gracePeriod) { isLate = true; lateMinutes = Math.floor(diff / 60_000); }
    }

    const record = await CorporateAttendance.findOneAndUpdate(
      { company: req.user.company, employee: req.user._id, date: today },
      {
        $setOnInsert: {
          company: req.user.company, employee: req.user._id, date: today,
          shift: shift ? shift._id : null,
        },
        $set: {
          "clockIn.time":            now,
          "clockIn.method":          method || "web",
          "clockIn.ipAddress":       evalResult.clientIp,
          "clockIn.location.latitude":  latitude  ?? null,
          "clockIn.location.longitude": longitude ?? null,
          "clockIn.location.accuracy":  accuracy  ?? null,
          "clockIn.location.address":   address   || "",
          "clockIn.isLate":          isLate,
          "clockIn.lateMinutes":     lateMinutes,
          "clockIn.verified":        true,
          "clockIn.userAgent":       userAgent,
          "clockIn.mockLocationFlag": evalResult.mockLocationFlag,
          "clockIn.impossibleMovement": evalResult.impossibleMovement,
          "clockIn.movementSpeedKmh": evalResult.movementSpeedKmh,
          "clockIn.trustScoreBefore": before,
          "clockIn.trustScoreAfter":  after,
          "clockIn.trustScoreDelta":  evalResult.trustDelta,
          "clockIn.flags":            evalResult.flags,
          lateMinutes,
          status: isLate ? "late" : "present",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).populate("shift", "name startTime endTime");

    res.json({
      record,
      message: isLate ? "Clocked in (late)" : "Clocked in",
      trustScore: after,
      reviewRequired: after < antiCheat.REVIEW_TRUST,
    });
  } catch (e) {
    console.error("[clock-in]", e);
    res.status(500).json({ error: "Failed to clock in" });
  }
});

// ---------------------------------------------------------------------------
// POST /clock-out  — employee clocks out (strict anti-cheat)
// ---------------------------------------------------------------------------
router.post("/clock-out", ...mw, async (req, res) => {
  try {
    const now   = new Date();
    const today = toDay(now);
    const { method, latitude, longitude, accuracy, address } = req.body;
    const userAgent = req.headers["user-agent"] || null;

    const existing = await CorporateAttendance.findOne({
      company: req.user.company, employee: req.user._id, date: today,
    }).populate("shift");

    if (!existing || !existing.clockIn?.time) {
      return res.status(400).json({ error: "No clock-in record found for today" });
    }
    if (existing.clockOut?.time) {
      return res.status(400).json({ error: "Already clocked out today" });
    }

    // Time rule — minimum interval since clock-in
    const elapsedMs = now - new Date(existing.clockIn.time);
    if (elapsedMs < antiCheat.MIN_CLOCK_OUT_INTERVAL_MS) {
      const remaining = Math.ceil((antiCheat.MIN_CLOCK_OUT_INTERVAL_MS - elapsedMs) / 1000);
      return res.status(400).json({
        error: `Too soon to clock out. Wait ${remaining}s (min ${antiCheat.MIN_CLOCK_OUT_INTERVAL_MS / 60000} minutes after clock-in).`,
        reason: "min_interval", blocked: true,
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ error: "User not found" });

    const company  = await Company.findById(req.user.company).select("corporateSettings").lean();
    const settings = company?.corporateSettings || {};

    // Anti-cheat (clock-out is also strict — same rules apply)
    const evalResult = antiCheat.evaluateAttempt({
      req, user, body: req.body, settings, lastEvent: user.lastClockEvent,
      eventType: "clock_out",
    });

    const { before, after } = await antiCheat.applyTrustOutcome(
      user, evalResult,
      evalResult.ok ? { latitude, longitude } : null
    );
    await user.save();

    if (!evalResult.ok) {
      return res.status(403).json({
        error: evalResult.message, reason: evalResult.reason, blocked: true,
        flags: evalResult.flags, trustScore: after,
      });
    }

    // Auto-flag oddly long open shifts
    const exceededMaxOpen = elapsedMs > antiCheat.MAX_CLOCK_OPEN_DURATION_MS;

    const worked = hoursWorked(existing.clockIn.time, now);
    const shift  = existing.shift;

    let earlyLeaveMinutes = 0;
    if (shift) {
      const [eh, em] = shift.endTime.split(":").map(Number);
      const shiftEnd = new Date(now);
      shiftEnd.setHours(eh, em, 0, 0);
      const diff = shiftEnd - now;
      if (diff > 0) earlyLeaveMinutes = Math.floor(diff / 60_000);
    }

    let overtimeHours = 0;
    if (shift && worked != null) {
      const [sh, sm] = shift.startTime.split(":").map(Number);
      const [eh, em] = shift.endTime.split(":").map(Number);
      const scheduledHours = (eh * 60 + em - sh * 60 - sm) / 60;
      if (worked > scheduledHours) overtimeHours = Math.round((worked - scheduledHours) * 100) / 100;
    }

    let finalStatus = existing.status;
    if (worked != null && worked < 4 && finalStatus !== "on_leave") finalStatus = "half_day";

    const flags = [...(evalResult.flags || [])];
    if (exceededMaxOpen) flags.push("excessive_duration");

    const record = await CorporateAttendance.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          "clockOut.time":                now,
          "clockOut.method":              method || "web",
          "clockOut.ipAddress":           evalResult.clientIp,
          "clockOut.location.latitude":   latitude  ?? null,
          "clockOut.location.longitude":  longitude ?? null,
          "clockOut.location.accuracy":   accuracy  ?? null,
          "clockOut.location.address":    address   || "",
          "clockOut.earlyLeaveMinutes":   earlyLeaveMinutes,
          "clockOut.verified":            true,
          "clockOut.userAgent":           userAgent,
          "clockOut.mockLocationFlag":    evalResult.mockLocationFlag,
          "clockOut.impossibleMovement":  evalResult.impossibleMovement,
          "clockOut.movementSpeedKmh":    evalResult.movementSpeedKmh,
          "clockOut.trustScoreBefore":    before,
          "clockOut.trustScoreAfter":     after,
          "clockOut.trustScoreDelta":     evalResult.trustDelta,
          "clockOut.flags":               flags,
          hoursWorked:      worked,
          overtimeHours,
          earlyLeaveMinutes,
          status:           finalStatus,
        },
      },
      { new: true }
    ).populate("shift", "name startTime endTime");

    res.json({ record, message: "Clocked out", hoursWorked: worked, trustScore: after });
  } catch (e) {
    console.error("[clock-out]", e);
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

// ---------------------------------------------------------------------------
// GET /settings  — get strict attendance config (admin/manager read)
// ---------------------------------------------------------------------------
router.get("/settings", ...mw, canManage, async (req, res) => {
  try {
    const company = await Company.findById(req.user.company)
      .select("corporateSettings.strictAttendance corporateSettings.allowedWifiIPs corporateSettings.officeLatitude corporateSettings.officeLongitude corporateSettings.geofenceRadiusMeters")
      .lean();
    const s = company?.corporateSettings || {};
    res.json({
      strictAttendance:     s.strictAttendance     || false,
      allowedWifiIPs:       s.allowedWifiIPs       || [],
      officeLatitude:       s.officeLatitude        ?? null,
      officeLongitude:      s.officeLongitude       ?? null,
      geofenceRadiusMeters: s.geofenceRadiusMeters  || 150,
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch attendance settings" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /settings  — update strict attendance config (admin only)
// ---------------------------------------------------------------------------
router.patch("/settings", ...mw, adminOnly, async (req, res) => {
  try {
    const { strictAttendance, allowedWifiIPs, officeLatitude, officeLongitude, geofenceRadiusMeters } = req.body;
    const update = {};
    if (strictAttendance     !== undefined) update["corporateSettings.strictAttendance"]     = Boolean(strictAttendance);
    if (allowedWifiIPs       !== undefined) update["corporateSettings.allowedWifiIPs"]       = Array.isArray(allowedWifiIPs) ? allowedWifiIPs.map(ip => ip.trim()).filter(Boolean) : [];
    if (officeLatitude       !== undefined) update["corporateSettings.officeLatitude"]       = officeLatitude  != null ? Number(officeLatitude)  : null;
    if (officeLongitude      !== undefined) update["corporateSettings.officeLongitude"]      = officeLongitude != null ? Number(officeLongitude) : null;
    if (geofenceRadiusMeters !== undefined) update["corporateSettings.geofenceRadiusMeters"] = Number(geofenceRadiusMeters) || 150;
    await Company.findByIdAndUpdate(req.user.company, { $set: update });
    res.json({ message: "Attendance settings updated" });
  } catch (e) {
    res.status(500).json({ error: "Failed to update attendance settings" });
  }
});

// ---------------------------------------------------------------------------
// GET /failed-attempts  — blocked clock-in attempts (admin/manager)
// ---------------------------------------------------------------------------
router.get("/failed-attempts", ...mw, canManage, async (req, res) => {
  try {
    const today    = toDay(new Date());
    const weekAgo  = new Date(today);
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

    const records = await CorporateAttendance.find({
      company:          req.user.company,
      date:             { $gte: weekAgo },
      "failedAttempts.0": { $exists: true },
    })
      .populate("employee", "name employeeId department")
      .select("employee date failedAttempts")
      .lean();

    const attempts = [];
    records.forEach(r => {
      (r.failedAttempts || []).forEach(a => {
        attempts.push({
          employee:    r.employee,
          date:        r.date,
          attemptedAt: a.attemptedAt,
          reason:      a.reason,
          ipAddress:   a.ipAddress,
          latitude:    a.latitude,
          longitude:   a.longitude,
        });
      });
    });
    attempts.sort((a, b) => new Date(b.attemptedAt) - new Date(a.attemptedAt));

    res.json({ attempts, count: attempts.length });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch failed attempts" });
  }
});

// ---------------------------------------------------------------------------
// GET /trust  — employee: my trust score
// ---------------------------------------------------------------------------
router.get("/trust", ...mw, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("attendanceTrustScore attendanceLockoutUntil")
      .lean();
    res.json({
      trustScore: user?.attendanceTrustScore ?? 100,
      lockoutUntil: user?.attendanceLockoutUntil || null,
      hardLockTrust: antiCheat.HARD_LOCK_TRUST,
      reviewTrust:   antiCheat.REVIEW_TRUST,
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch trust score" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /trust/:userId/reset  — admin/manager: reset employee trust score
// ---------------------------------------------------------------------------
router.patch("/trust/:userId/reset", ...mw, canManage, async (req, res) => {
  try {
    const user = await User.findOne({ _id: req.params.userId, company: req.user.company });
    if (!user) return res.status(404).json({ error: "User not found" });

    user.attendanceTrustScore = 100;
    user.attendanceLockoutUntil = null;
    user.attendanceFailedAttempts = [];
    await user.save();

    await AuditLog.create({
      company:  req.user.company,
      actor:    req.user._id,
      action:   AUDIT_ACTIONS?.UPDATED || "updated",
      resource: "User",
      resourceId: user._id,
      resourceLabel: `Reset attendance trust for ${user.name}`,
      metadata: { reason: req.body.reason || "manual reset" },
    });

    res.json({ message: "Trust score reset", trustScore: 100 });
  } catch (e) {
    res.status(500).json({ error: "Failed to reset trust score" });
  }
});

// ---------------------------------------------------------------------------
// GET  /clock-window     — admin/manager: read clock-in/out time windows
// PATCH /clock-window    — admin/manager: update clock-in/out time windows
// ---------------------------------------------------------------------------
router.get("/clock-window", ...mw, canManage, async (req, res) => {
  try {
    const company = await Company.findById(req.user.company)
      .select("corporateSettings.clockInStart corporateSettings.clockInEnd corporateSettings.clockOutStart corporateSettings.clockOutEnd")
      .lean();
    const s = company?.corporateSettings || {};
    res.json({
      clockInStart:  s.clockInStart  || "",
      clockInEnd:    s.clockInEnd    || "",
      clockOutStart: s.clockOutStart || "",
      clockOutEnd:   s.clockOutEnd   || "",
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch clock window" });
  }
});

router.patch("/clock-window", ...mw, canManage, async (req, res) => {
  try {
    const { clockInStart, clockInEnd, clockOutStart, clockOutEnd } = req.body;
    const validate = v => v === "" || v == null || /^\d{1,2}:\d{2}$/.test(v);
    if (![clockInStart, clockInEnd, clockOutStart, clockOutEnd].every(validate)) {
      return res.status(400).json({ error: "Times must be HH:MM (24-hour) or empty." });
    }
    // Both start+end must be set together for each pair
    const inSet  = !!clockInStart  !== !!clockInEnd;
    const outSet = !!clockOutStart !== !!clockOutEnd;
    if (inSet || outSet) {
      return res.status(400).json({ error: "Set both start and end (or leave both empty) for each window." });
    }

    const update = {
      "corporateSettings.clockInStart":  clockInStart  || null,
      "corporateSettings.clockInEnd":    clockInEnd    || null,
      "corporateSettings.clockOutStart": clockOutStart || null,
      "corporateSettings.clockOutEnd":   clockOutEnd   || null,
    };
    await Company.findByIdAndUpdate(req.user.company, { $set: update });

    await AuditLog.create({
      company:  req.user.company,
      actor:    req.user._id,
      action:   AUDIT_ACTIONS?.UPDATED || "updated",
      resource: "Company",
      resourceId: req.user.company,
      resourceLabel: "Updated clock-in/out time windows",
      metadata: { clockInStart, clockInEnd, clockOutStart, clockOutEnd },
    }).catch(() => {});

    res.json({ message: "Clock window updated", clockInStart, clockInEnd, clockOutStart, clockOutEnd });
  } catch (e) {
    console.error("[clock-window]", e);
    res.status(500).json({ error: "Failed to update clock window" });
  }
});

module.exports = router;

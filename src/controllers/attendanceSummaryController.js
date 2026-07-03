"use strict";

/**
 * attendanceSummaryController.js
 *
 * Attendance/hours export engine for corporate-mode companies.
 *
 * Dikly is the system of record for TIME and PEOPLE, never MONEY. This
 * module aggregates each employee's attendance, leave, and hours for a
 * period and packages it into an exportable summary -- it computes no pay
 * amounts, stores no compensation data, and never touches currency. The
 * company's own payroll system (or accountant) takes this export and
 * computes actual pay externally.
 *
 * Summary per employee for a given year+month:
 *   daysPresent, daysAbsent, daysOnLeave, lateMinutes, hoursWorked,
 *   overtimeHours
 *
 * The run is non-atomic: a per-employee failure is skipped rather than
 * aborting the whole run, so every batch always completes.
 */

const AttendanceSummaryRun = require("../models/AttendanceSummaryRun");
const AttendanceSummary    = require("../models/AttendanceSummary");
const CorporateAttendance  = require("../models/CorporateAttendance");
const LeaveRequest         = require("../models/LeaveRequest");
const User                 = require("../models/User");
const AuditLog             = require("../models/AuditLog");
const { AUDIT_ACTIONS }    = AuditLog;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Count Mon–Fri working days in a year+month (1-based month). */
function workingDaysInMonth(year, month) {
  const d = new Date(year, month - 1, 1);
  let count = 0;
  while (d.getMonth() === month - 1) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * Compute one employee's attendance summary from raw inputs.
 * Returns a plain object matching the AttendanceSummary schema (excluding ids).
 */
function computeSummary({ attendanceDocs, approvedLeaveDays, workingDays }) {
  let daysPresent   = 0;
  let lateMinutes   = 0;
  let hoursWorked   = 0;
  let overtimeHours = 0;

  for (const rec of attendanceDocs) {
    if (rec.clockIn?.time) {
      daysPresent++;
      lateMinutes   += rec.lateMinutes   || 0;
      hoursWorked   += rec.hoursWorked   || 0;
      overtimeHours += rec.overtimeHours || 0;
    }
  }

  const daysOnLeave = Math.min(approvedLeaveDays, workingDays);
  const daysAbsent  = Math.max(0, workingDays - daysPresent - daysOnLeave);

  return {
    daysPresent,
    daysAbsent,
    daysOnLeave,
    lateMinutes,
    hoursWorked:   Math.round(hoursWorked   * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// POST /api/attendance-summary/run  — compute + create a summary run  [admin]
// ---------------------------------------------------------------------------
exports.runAttendanceSummary = async (req, res) => {
  try {
    const company = req.user.company;
    const year    = parseInt(req.body.year,  10) || new Date().getFullYear();
    const month   = parseInt(req.body.month, 10) || new Date().getMonth() + 1;

    if (month < 1 || month > 12) {
      return res.status(400).json({ error: "Month must be 1–12" });
    }

    // One run per company per period
    const existing = await AttendanceSummaryRun.findOne({ company, year, month });
    if (existing) {
      return res.status(409).json({
        error:  `Attendance summary for ${year}-${String(month).padStart(2, "0")} already exists (status: ${existing.status})`,
        runId:  existing._id,
      });
    }

    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd   = new Date(Date.UTC(year, month,     0, 23, 59, 59, 999));
    const workingDays = workingDaysInMonth(year, month);

    // All active users for this company (employees, managers, admins)
    const employees = await User.find({
      company,
      role:     { $in: ["employee", "manager", "admin"] },
      isActive: true,
    }).select("_id name").lean();

    const employeeIds = employees.map(e => e._id);

    // Batch-fetch all period data in parallel
    const [allAttendance, allLeaves] = await Promise.all([
      CorporateAttendance.find({
        company,
        employee: { $in: employeeIds },
        date:     { $gte: periodStart, $lte: periodEnd },
      }).lean(),
      LeaveRequest.find({
        company,
        employee:  { $in: employeeIds },
        status:    "approved",
        startDate: { $lte: periodEnd },
        endDate:   { $gte: periodStart },
      }).lean(),
    ]);

    // Index by employee id string for O(1) lookups
    const attendanceByEmp = {};
    for (const rec of allAttendance) {
      const key = rec.employee.toString();
      if (!attendanceByEmp[key]) attendanceByEmp[key] = [];
      attendanceByEmp[key].push(rec);
    }

    const leaveDaysByEmp = {};
    for (const lr of allLeaves) {
      const key = lr.employee.toString();
      leaveDaysByEmp[key] = (leaveDaysByEmp[key] || 0) + (lr.days || 0);
    }

    // Create the run document first (draft) so summaries can reference it
    const run = await AttendanceSummaryRun.create({
      company,
      year,
      month,
      status: "draft",
      runBy:  req.user._id,
      notes:  req.body.notes || "",
    });

    // Build attendance summary documents
    const summaryDocs = employees.map(emp => {
      const key     = emp._id.toString();
      const summary = computeSummary({
        attendanceDocs:    attendanceByEmp[key] || [],
        approvedLeaveDays: leaveDaysByEmp[key]  || 0,
        workingDays,
      });
      return { company, employee: emp._id, summaryRun: run._id, year, month, ...summary, status: "draft" };
    });

    // Bulk insert — ordered:false so a single duplicate doesn't abort the batch
    let insertedCount = 0;
    if (summaryDocs.length) {
      try {
        const result = await AttendanceSummary.insertMany(summaryDocs, { ordered: false });
        insertedCount = result.length;
      } catch (bulkErr) {
        // insertedDocs is available on BulkWriteError
        insertedCount = bulkErr.insertedDocs?.length ?? summaryDocs.length;
        console.error("AttendanceSummary bulk insert partial failure:", bulkErr.message);
      }
    }

    await AttendanceSummaryRun.findByIdAndUpdate(run._id, {
      $set: { employeeCount: insertedCount },
    });

    AuditLog.record({
      company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.CREATE,
      resource:      "AttendanceSummaryRun",
      resourceId:    run._id,
      resourceLabel: `Attendance summary ${year}-${String(month).padStart(2, "0")}`,
      mode:          "corporate",
      req,
    });

    const updatedRun = await AttendanceSummaryRun.findById(run._id).lean();
    res.status(201).json({ run: updatedRun, employeeCount: insertedCount });
  } catch (err) {
    console.error("runAttendanceSummary:", err);
    res.status(500).json({ error: "Failed to run attendance summary" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/attendance-summary  — list all runs  [admin]
// ---------------------------------------------------------------------------
exports.listAttendanceSummaryRuns = async (req, res) => {
  try {
    const runs = await AttendanceSummaryRun.find({ company: req.user.company })
      .populate("runBy",       "name")
      .populate("finalizedBy", "name")
      .sort({ year: -1, month: -1 })
      .limit(36); // up to 3 years of monthly runs
    res.json({ runs, count: runs.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to list attendance summary runs" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/attendance-summary/:runId  — full run + per-employee summaries  [admin]
// ---------------------------------------------------------------------------
exports.getAttendanceSummaryRun = async (req, res) => {
  try {
    const run = await AttendanceSummaryRun.findOne({ _id: req.params.runId, company: req.user.company })
      .populate("runBy",       "name")
      .populate("finalizedBy", "name");
    if (!run) return res.status(404).json({ error: "Attendance summary run not found" });

    const summaries = await AttendanceSummary.find({ summaryRun: run._id, company: req.user.company })
      .populate("employee", "name email employeeId")
      .sort({ createdAt: 1 });

    res.json({ run, summaries, count: summaries.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch attendance summary run" });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/attendance-summary/:runId/finalize  — finalize a draft run  [admin]
// ---------------------------------------------------------------------------
exports.finalizeAttendanceSummaryRun = async (req, res) => {
  try {
    const run = await AttendanceSummaryRun.findOne({ _id: req.params.runId, company: req.user.company });
    if (!run) return res.status(404).json({ error: "Attendance summary run not found" });
    if (run.status !== "draft") {
      return res.status(400).json({ error: `Cannot finalize a run with status '${run.status}'` });
    }

    run.status      = "finalized";
    run.finalizedBy = req.user._id;
    run.finalizedAt = new Date();
    await run.save();

    await AttendanceSummary.updateMany({ summaryRun: run._id }, { $set: { status: "finalized" } });

    AuditLog.record({
      company:       run.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.APPROVE,
      resource:      "AttendanceSummaryRun",
      resourceId:    run._id,
      resourceLabel: `Attendance summary ${run.year}-${String(run.month).padStart(2, "0")}`,
      changes:       { before: { status: "draft" }, after: { status: "finalized" } },
      mode:          "corporate",
      req,
    });

    res.json({ run });
  } catch (err) {
    res.status(500).json({ error: "Failed to finalize attendance summary run" });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/attendance-summary/:runId/cancel  — cancel a draft or finalized run  [admin]
// ---------------------------------------------------------------------------
exports.cancelAttendanceSummaryRun = async (req, res) => {
  try {
    const run = await AttendanceSummaryRun.findOne({ _id: req.params.runId, company: req.user.company });
    if (!run) return res.status(404).json({ error: "Attendance summary run not found" });

    const prevStatus = run.status;
    run.status = "cancelled";
    await run.save();

    AuditLog.record({
      company:       run.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.UPDATE,
      resource:      "AttendanceSummaryRun",
      resourceId:    run._id,
      resourceLabel: `Attendance summary ${run.year}-${String(run.month).padStart(2, "0")}`,
      changes:       { before: { status: prevStatus }, after: { status: "cancelled" } },
      mode:          "corporate",
      req,
    });

    res.json({ run });
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel attendance summary run" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/attendance-summary/:runId/export  — CSV download  [admin]
// ---------------------------------------------------------------------------
exports.exportAttendanceSummaryCSV = async (req, res) => {
  try {
    const run = await AttendanceSummaryRun.findOne({ _id: req.params.runId, company: req.user.company }).lean();
    if (!run) return res.status(404).json({ error: "Attendance summary run not found" });

    const summaries = await AttendanceSummary.find({ summaryRun: run._id, company: req.user.company })
      .populate("employee", "name email employeeId")
      .lean();

    const q = s => `"${String(s || "").replace(/"/g, '""')}"`;
    const header = [
      "Name", "Employee ID", "Email",
      "Days Present", "Days Absent", "Days On Leave",
      "Hours Worked", "Overtime Hrs", "Late Mins",
      "Status",
    ].join(",");

    const rows = summaries.map(s => [
      q(s.employee?.name       || ""),
      q(s.employee?.employeeId || ""),
      q(s.employee?.email      || ""),
      s.daysPresent,
      s.daysAbsent,
      s.daysOnLeave,
      s.hoursWorked,
      s.overtimeHours,
      s.lateMinutes,
      q(s.status),
    ].join(","));

    AuditLog.record({
      company:       run.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.ATTENDANCE_SUMMARY_EXPORTED,
      resource:      "AttendanceSummaryRun",
      resourceId:    run._id,
      resourceLabel: `Attendance summary ${run.year}-${String(run.month).padStart(2, "0")}`,
      mode:          "corporate",
      req,
    });

    const csv      = [header, ...rows].join("\n");
    const filename = `attendance_summary_${run.year}_${String(run.month).padStart(2, "0")}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error("exportAttendanceSummaryCSV:", err);
    res.status(500).json({ error: "Failed to export attendance summary" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/attendance-summary/my  — employee: list own attendance summaries
// ---------------------------------------------------------------------------
exports.getMyAttendanceSummaries = async (req, res) => {
  try {
    const summaries = await AttendanceSummary.find({
      company:  req.user.company,
      employee: req.user._id,
    })
      .populate("summaryRun", "year month status finalizedAt")
      .sort({ year: -1, month: -1 })
      .limit(24);
    res.json({ summaries, count: summaries.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your attendance summaries" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/attendance-summary/my/:summaryId  — employee: view one summary
// ---------------------------------------------------------------------------
exports.getMyAttendanceSummary = async (req, res) => {
  try {
    const summary = await AttendanceSummary.findOne({
      _id:      req.params.summaryId,
      company:  req.user.company,
      employee: req.user._id,
    }).populate("summaryRun", "year month status finalizedAt");
    if (!summary) return res.status(404).json({ error: "Attendance summary not found" });
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch attendance summary" });
  }
};

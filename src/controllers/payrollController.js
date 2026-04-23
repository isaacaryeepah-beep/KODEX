"use strict";

/**
 * payrollController.js
 *
 * Payroll engine for corporate-mode companies.
 *
 * Pay computation per employee for a given year+month:
 *
 *   basePay      = monthlySalary            (salaried employees)
 *                  OR hoursWorked × hourlyRate  (hourly employees)
 *                  OR 0 if neither rate is configured
 *
 *   overtimePay  = overtimeHours × effectiveHourlyRate × OVERTIME_RATE (1.5)
 *
 *   grossPay     = basePay + overtimePay + Σallowances
 *
 *   deductions   = late-arrival penalty when cumulative lateMinutes
 *                  exceeds LATE_THRESHOLD_MINUTES (30)
 *                  penalty = penalisable_minutes × (effectiveHourlyRate / 60)
 *
 *   netPay       = max(0, grossPay − Σdeductions)
 *
 * The run is non-atomic: a per-employee failure is skipped rather than
 * aborting the whole run, so every batch always completes.
 */

const PayrollRun          = require("../models/PayrollRun");
const PaySlip             = require("../models/PaySlip");
const EmployeeProfile     = require("../models/EmployeeProfile");
const CorporateAttendance = require("../models/CorporateAttendance");
const LeaveRequest        = require("../models/LeaveRequest");
const User                = require("../models/User");
const AuditLog            = require("../models/AuditLog");
const { AUDIT_ACTIONS }   = AuditLog;

const OVERTIME_RATE          = 1.5;   // overtime pay multiplier
const LATE_THRESHOLD_MINUTES = 30;    // cumulative minutes before financial penalty

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
 * Compute one employee's payslip data from raw inputs.
 * Returns a plain object matching the PaySlip schema (excluding ids).
 */
function computeSlip({ profile, attendanceDocs, approvedLeaveDays, workingDays }) {
  const isSalaried = profile?.monthlySalary != null && profile.monthlySalary > 0;
  const isHourly   = !isSalaried && profile?.hourlyRate != null && profile.hourlyRate > 0;

  // Aggregate attendance for the period
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

  // Effective hourly rate (used for overtime and late-penalty calculations)
  let effectiveHourlyRate = 0;
  let basePay = 0;

  if (isSalaried) {
    // daily rate = monthlySalary / workingDays; hourly = daily / 8
    effectiveHourlyRate = workingDays > 0
      ? profile.monthlySalary / workingDays / 8
      : 0;
    basePay = profile.monthlySalary;
  } else if (isHourly) {
    effectiveHourlyRate = profile.hourlyRate;
    basePay = Math.round(hoursWorked * profile.hourlyRate * 100) / 100;
  }

  // Overtime pay
  const overtimePay = overtimeHours > 0 && effectiveHourlyRate > 0
    ? Math.round(overtimeHours * effectiveHourlyRate * OVERTIME_RATE * 100) / 100
    : 0;

  // Late-arrival penalty (only on minutes exceeding the threshold)
  const deductions = [];
  const penalisableMinutes = Math.max(0, lateMinutes - LATE_THRESHOLD_MINUTES);
  if (penalisableMinutes > 0 && effectiveHourlyRate > 0) {
    const latePenalty = Math.round(penalisableMinutes * (effectiveHourlyRate / 60) * 100) / 100;
    if (latePenalty > 0) {
      deductions.push({ label: "Late arrival penalty", amount: latePenalty });
    }
  }

  const grossPay        = Math.round((basePay + overtimePay) * 100) / 100;
  const totalDeductions = Math.round(deductions.reduce((s, d) => s + d.amount, 0) * 100) / 100;
  const netPay          = Math.round(Math.max(0, grossPay - totalDeductions) * 100) / 100;

  return {
    daysPresent,
    daysAbsent,
    daysOnLeave,
    lateMinutes,
    hoursWorked:   Math.round(hoursWorked   * 100) / 100,
    overtimeHours: Math.round(overtimeHours * 100) / 100,
    basePay,
    overtimePay,
    allowances:   [],
    deductions,
    grossPay,
    totalDeductions,
    netPay,
    currency: profile?.currency || "GHS",
  };
}

// ---------------------------------------------------------------------------
// POST /api/payroll/run  — compute + create a payroll run  [admin]
// ---------------------------------------------------------------------------
exports.runPayroll = async (req, res) => {
  try {
    const company = req.user.company;
    const year    = parseInt(req.body.year,  10) || new Date().getFullYear();
    const month   = parseInt(req.body.month, 10) || new Date().getMonth() + 1;

    if (month < 1 || month > 12) {
      return res.status(400).json({ error: "Month must be 1–12" });
    }

    // One run per company per period
    const existing = await PayrollRun.findOne({ company, year, month });
    if (existing) {
      return res.status(409).json({
        error:  `Payroll for ${year}-${String(month).padStart(2, "0")} already exists (status: ${existing.status})`,
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
    const [allAttendance, allLeaves, allProfiles] = await Promise.all([
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
      EmployeeProfile.find({
        company,
        user: { $in: employeeIds },
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

    const profileByEmp = {};
    for (const p of allProfiles) {
      profileByEmp[p.user.toString()] = p;
    }

    // Create the run document first (draft) so slips can reference it
    const run = await PayrollRun.create({
      company,
      year,
      month,
      status: "draft",
      runBy:  req.user._id,
      notes:  req.body.notes || "",
    });

    // Build payslip documents
    const slipDocs = employees.map(emp => {
      const key  = emp._id.toString();
      const slip = computeSlip({
        profile:           profileByEmp[key]    || null,
        attendanceDocs:    attendanceByEmp[key] || [],
        approvedLeaveDays: leaveDaysByEmp[key]  || 0,
        workingDays,
      });
      return { company, employee: emp._id, payrollRun: run._id, year, month, ...slip, status: "draft" };
    });

    // Bulk insert — ordered:false so a single duplicate doesn't abort the batch
    let insertedCount = 0;
    if (slipDocs.length) {
      try {
        const result = await PaySlip.insertMany(slipDocs, { ordered: false });
        insertedCount = result.length;
      } catch (bulkErr) {
        // insertedDocs is available on BulkWriteError
        insertedCount = bulkErr.insertedDocs?.length ?? slipDocs.length;
        console.error("PaySlip bulk insert partial failure:", bulkErr.message);
      }
    }

    // Update run totals
    const totalGross      = slipDocs.reduce((s, d) => s + d.grossPay,        0);
    const totalDeductions = slipDocs.reduce((s, d) => s + d.totalDeductions, 0);
    const totalNet        = slipDocs.reduce((s, d) => s + d.netPay,          0);

    await PayrollRun.findByIdAndUpdate(run._id, {
      $set: {
        totalGross:      Math.round(totalGross      * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        totalNet:        Math.round(totalNet        * 100) / 100,
        employeeCount:   insertedCount,
      },
    });

    AuditLog.record({
      company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.CREATE,
      resource:      "PayrollRun",
      resourceId:    run._id,
      resourceLabel: `Payroll ${year}-${String(month).padStart(2, "0")}`,
      mode:          "corporate",
      req,
    });

    const updatedRun = await PayrollRun.findById(run._id).lean();
    res.status(201).json({ run: updatedRun, employeeCount: insertedCount });
  } catch (err) {
    console.error("runPayroll:", err);
    res.status(500).json({ error: "Failed to run payroll" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/payroll  — list all runs  [admin]
// ---------------------------------------------------------------------------
exports.listPayrollRuns = async (req, res) => {
  try {
    const runs = await PayrollRun.find({ company: req.user.company })
      .populate("runBy",      "name")
      .populate("approvedBy", "name")
      .sort({ year: -1, month: -1 })
      .limit(36); // up to 3 years of monthly runs
    res.json({ runs, count: runs.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to list payroll runs" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/payroll/:runId  — full run + payslips  [admin]
// ---------------------------------------------------------------------------
exports.getPayrollRun = async (req, res) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.runId, company: req.user.company })
      .populate("runBy",      "name")
      .populate("approvedBy", "name");
    if (!run) return res.status(404).json({ error: "Payroll run not found" });

    const slips = await PaySlip.find({ payrollRun: run._id, company: req.user.company })
      .populate("employee", "name email employeeId")
      .sort({ createdAt: 1 });

    res.json({ run, slips, count: slips.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch payroll run" });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/payroll/:runId/approve  — approve a draft run  [admin]
// ---------------------------------------------------------------------------
exports.approvePayrollRun = async (req, res) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.runId, company: req.user.company });
    if (!run) return res.status(404).json({ error: "Payroll run not found" });
    if (run.status !== "draft") {
      return res.status(400).json({ error: `Cannot approve a run with status '${run.status}'` });
    }

    run.status     = "approved";
    run.approvedBy = req.user._id;
    run.approvedAt = new Date();
    await run.save();

    await PaySlip.updateMany({ payrollRun: run._id }, { $set: { status: "approved" } });

    AuditLog.record({
      company:       run.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.APPROVE,
      resource:      "PayrollRun",
      resourceId:    run._id,
      resourceLabel: `Payroll ${run.year}-${String(run.month).padStart(2, "0")}`,
      changes:       { before: { status: "draft" }, after: { status: "approved" } },
      mode:          "corporate",
      req,
    });

    res.json({ run });
  } catch (err) {
    res.status(500).json({ error: "Failed to approve payroll run" });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/payroll/:runId/mark-paid  — mark approved run as paid  [admin]
// ---------------------------------------------------------------------------
exports.markPaid = async (req, res) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.runId, company: req.user.company });
    if (!run) return res.status(404).json({ error: "Payroll run not found" });
    if (run.status !== "approved") {
      return res.status(400).json({ error: "Only approved runs can be marked as paid" });
    }

    run.status = "paid";
    run.paidAt = new Date();
    await run.save();

    await PaySlip.updateMany({ payrollRun: run._id }, { $set: { status: "paid" } });

    AuditLog.record({
      company:       run.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.UPDATE,
      resource:      "PayrollRun",
      resourceId:    run._id,
      resourceLabel: `Payroll ${run.year}-${String(run.month).padStart(2, "0")}`,
      changes:       { before: { status: "approved" }, after: { status: "paid" } },
      mode:          "corporate",
      req,
    });

    res.json({ run });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark payroll as paid" });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/payroll/:runId/cancel  — cancel a draft or approved run  [admin]
// ---------------------------------------------------------------------------
exports.cancelPayrollRun = async (req, res) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.runId, company: req.user.company });
    if (!run) return res.status(404).json({ error: "Payroll run not found" });
    if (run.status === "paid") {
      return res.status(400).json({ error: "Cannot cancel a run that has already been paid" });
    }

    const prevStatus = run.status;
    run.status = "cancelled";
    await run.save();

    AuditLog.record({
      company:       run.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.UPDATE,
      resource:      "PayrollRun",
      resourceId:    run._id,
      resourceLabel: `Payroll ${run.year}-${String(run.month).padStart(2, "0")}`,
      changes:       { before: { status: prevStatus }, after: { status: "cancelled" } },
      mode:          "corporate",
      req,
    });

    res.json({ run });
  } catch (err) {
    res.status(500).json({ error: "Failed to cancel payroll run" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/payroll/:runId/export  — CSV download  [admin]
// ---------------------------------------------------------------------------
exports.exportPayrollCSV = async (req, res) => {
  try {
    const run = await PayrollRun.findOne({ _id: req.params.runId, company: req.user.company }).lean();
    if (!run) return res.status(404).json({ error: "Payroll run not found" });

    const slips = await PaySlip.find({ payrollRun: run._id, company: req.user.company })
      .populate("employee", "name email employeeId")
      .lean();

    const q = s => `"${String(s || "").replace(/"/g, '""')}"`;
    const header = [
      "Name", "Employee ID", "Email",
      "Days Present", "Days Absent", "Days On Leave",
      "Hours Worked", "Overtime Hrs", "Late Mins",
      "Base Pay", "Overtime Pay", "Gross Pay", "Deductions", "Net Pay",
      "Currency", "Status",
    ].join(",");

    const rows = slips.map(s => [
      q(s.employee?.name       || ""),
      q(s.employee?.employeeId || ""),
      q(s.employee?.email      || ""),
      s.daysPresent,
      s.daysAbsent,
      s.daysOnLeave,
      s.hoursWorked,
      s.overtimeHours,
      s.lateMinutes,
      s.basePay,
      s.overtimePay,
      s.grossPay,
      s.totalDeductions,
      s.netPay,
      q(s.currency || "GHS"),
      q(s.status),
    ].join(","));

    AuditLog.record({
      company:       run.company,
      actor:         req.user,
      action:        AUDIT_ACTIONS.PAYROLL_EXPORTED,
      resource:      "PayrollRun",
      resourceId:    run._id,
      resourceLabel: `Payroll ${run.year}-${String(run.month).padStart(2, "0")}`,
      mode:          "corporate",
      req,
    });

    const csv      = [header, ...rows].join("\n");
    const filename = `payroll_${run.year}_${String(run.month).padStart(2, "0")}.csv`;
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error("exportPayrollCSV:", err);
    res.status(500).json({ error: "Failed to export payroll" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/payroll/my  — employee: list own payslips
// ---------------------------------------------------------------------------
exports.getMyPaySlips = async (req, res) => {
  try {
    const slips = await PaySlip.find({
      company:  req.user.company,
      employee: req.user._id,
    })
      .populate("payrollRun", "year month status paidAt approvedAt")
      .sort({ year: -1, month: -1 })
      .limit(24);
    res.json({ slips, count: slips.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch your payslips" });
  }
};

// ---------------------------------------------------------------------------
// GET /api/payroll/my/:slipId  — employee: view one payslip
// ---------------------------------------------------------------------------
exports.getMyPaySlip = async (req, res) => {
  try {
    const slip = await PaySlip.findOne({
      _id:      req.params.slipId,
      company:  req.user.company,
      employee: req.user._id,
    }).populate("payrollRun", "year month status approvedAt paidAt");
    if (!slip) return res.status(404).json({ error: "Payslip not found" });
    res.json({ slip });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch payslip" });
  }
};

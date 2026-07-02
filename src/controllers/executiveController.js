"use strict";

/**
 * executiveController
 *
 * Aggregated, read-only intelligence for the Executive Dashboard —
 * a single GET that returns today's workforce KPIs, trend series for the
 * charts, and computed executive alerts.
 *
 * All aggregation is done in JS over lean queries scoped to the company
 * (no $lookup pipelines), keeping every query on existing indexes.
 */

const User                = require("../models/User");
const Branch              = require("../models/Branch");
const CorporateAttendance = require("../models/CorporateAttendance");
const LeaveRequest        = require("../models/LeaveRequest");
const Expense             = require("../models/Expense");
const Timesheet           = require("../models/Timesheet");
const Meeting             = require("../models/Meeting");

const PRESENT_STATUSES = new Set(["present", "late", "remote", "half_day"]);

function dayStart(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function dayEnd(d)   { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

exports.dashboard = async (req, res) => {
  try {
    const companyId = req.user.company;
    const now       = new Date();
    const todayS    = dayStart(now);
    const todayE    = dayEnd(now);
    const trendFrom = dayStart(new Date(now.getTime() - 13 * 86400000)); // 14 days incl. today
    const perfFrom  = dayStart(new Date(now.getTime() - 29 * 86400000)); // 30-day window
    const expFrom   = new Date(now.getFullYear(), now.getMonth() - 5, 1); // 6 calendar months
    const leaveFrom = new Date(now.getTime() - 90 * 86400000);

    const [staff, branches, attendance, leaves, expenses, pendingLeave, pendingExpense, pendingTimesheet, meetingsToday] = await Promise.all([
      User.find({ company: companyId, role: { $in: ["employee", "manager"] }, isActive: true })
        .select("name department branch").lean(),
      Branch.find({ company: companyId, isActive: true }).select("name").lean(),
      CorporateAttendance.find({ company: companyId, date: { $gte: perfFrom, $lte: todayE } })
        .select("employee date status isLate").lean(),
      LeaveRequest.find({ company: companyId, createdAt: { $gte: leaveFrom } })
        .select("status").lean(),
      Expense.find({ company: companyId, createdAt: { $gte: expFrom } })
        .select("amount status createdAt").lean(),
      LeaveRequest.countDocuments({ company: companyId, status: "pending" }),
      Expense.countDocuments({ company: companyId, status: "pending" }),
      Timesheet.countDocuments({ company: companyId, status: "submitted" }),
      Meeting.countDocuments({
        company: companyId,
        status: { $in: ["scheduled", "live"] },
        startTime: { $gte: todayS, $lte: todayE },
      }).catch(() => 0),
    ]);

    const staffById   = new Map(staff.map(u => [String(u._id), u]));
    const branchById  = new Map(branches.map(b => [String(b._id), b.name]));
    const activeEmployees = staff.length;

    // ── Today's attendance ────────────────────────────────────────────────
    const todayRecs = attendance.filter(a => a.date >= todayS && a.date <= todayE);
    const presentSet = new Set();
    let lateToday = 0;
    for (const r of todayRecs) {
      if (PRESENT_STATUSES.has(r.status)) presentSet.add(String(r.employee));
      if (r.status === "late" || r.isLate) lateToday++;
    }
    const presentToday = presentSet.size;
    const absentToday  = Math.max(0, activeEmployees - presentToday);
    const todayRate    = activeEmployees ? Math.round((presentToday / activeEmployees) * 100) : 0;

    // ── 14-day attendance trend ───────────────────────────────────────────
    const trend = [];
    for (let i = 13; i >= 0; i--) {
      const dS = dayStart(new Date(now.getTime() - i * 86400000));
      const dE = dayEnd(dS);
      const present = new Set();
      for (const r of attendance) {
        if (r.date >= dS && r.date <= dE && PRESENT_STATUSES.has(r.status)) present.add(String(r.employee));
      }
      trend.push({
        date:  dS.toISOString().slice(0, 10),
        rate:  activeEmployees ? Math.round((present.size / activeEmployees) * 100) : 0,
      });
    }

    // ── Department & branch performance (30-day attendance rate) ─────────
    // Absent employees have NO attendance record, so the denominator must be
    // expected attendance (workdays × headcount), not the record count.
    let workdays = 0;
    for (let t = perfFrom.getTime(); t <= todayE.getTime(); t += 86400000) {
      const dow = new Date(t).getDay();
      if (dow !== 0 && dow !== 6) workdays++;
    }
    const deptHead   = new Map(); // dept → headcount
    const branchHead = new Map();
    for (const u of staff) {
      const dept = (u.department || "Unassigned").trim() || "Unassigned";
      deptHead.set(dept, (deptHead.get(dept) || 0) + 1);
      const brName = branchById.get(String(u.branch));
      if (brName) branchHead.set(brName, (branchHead.get(brName) || 0) + 1);
    }
    const deptPresent   = new Map(); // dept → present records in window
    const branchPresent = new Map();
    for (const r of attendance) {
      if (!PRESENT_STATUSES.has(r.status)) continue;
      const emp = staffById.get(String(r.employee));
      if (!emp) continue;
      const dept = (emp.department || "Unassigned").trim() || "Unassigned";
      deptPresent.set(dept, (deptPresent.get(dept) || 0) + 1);
      const brName = branchById.get(String(emp.branch));
      if (brName) branchPresent.set(brName, (branchPresent.get(brName) || 0) + 1);
    }
    const toPerf = (headMap, presentMap) => [...headMap.entries()]
      .map(([name, headcount]) => {
        const expected = Math.max(1, workdays * headcount);
        return { name, rate: Math.min(100, Math.round(((presentMap.get(name) || 0) / expected) * 100)), headcount };
      })
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 10);
    const departmentPerformance = toPerf(deptHead, deptPresent);
    const branchPerformance     = toPerf(branchHead, branchPresent);

    // ── Monthly expenses (6 months, approved only) ────────────────────────
    const monthly = new Map();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthly.set(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, 0);
    }
    for (const e of expenses) {
      if (e.status !== "approved") continue;
      const d = new Date(e.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (monthly.has(key)) monthly.set(key, monthly.get(key) + (e.amount || 0));
    }
    const monthlyExpenses = [...monthly.entries()].map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }));

    // ── Leave statistics (last 90 days) ───────────────────────────────────
    const leaveStats = { pending: 0, approved: 0, rejected: 0, cancelled: 0 };
    for (const l of leaves) if (leaveStats[l.status] !== undefined) leaveStats[l.status]++;

    // ── Departments ───────────────────────────────────────────────────────
    const totalDepartments = new Set(
      staff.map(u => (u.department || "").trim()).filter(Boolean)
    ).size;

    const pendingApprovals = pendingLeave + pendingExpense + pendingTimesheet;

    // ── Company health score ──────────────────────────────────────────────
    // Weighted composite: today's attendance (55%), punctuality (25%),
    // approvals backlog (20%). Bounded 0–100.
    const onTimeRate = presentToday ? Math.round(((presentToday - Math.min(lateToday, presentToday)) / presentToday) * 100) : 100;
    const approvalScore = Math.max(0, 100 - Math.min(pendingApprovals * 5, 100));
    const healthScore = Math.round(todayRate * 0.55 + onTimeRate * 0.25 + approvalScore * 0.20);

    // ── Executive alerts ──────────────────────────────────────────────────
    const alerts = [];
    const prior7 = trend.slice(6, 13); // the 7 days before today
    const prior7Avg = prior7.length ? Math.round(prior7.reduce((s, t) => s + t.rate, 0) / prior7.length) : 0;
    if (activeEmployees > 0 && prior7Avg > 0 && todayRate < prior7Avg - 10) {
      alerts.push({ level: "serious", text: `Attendance dropped today — ${todayRate}% vs ${prior7Avg}% average over the last 7 days.` });
    }
    if (absentToday > 0 && now.getHours() >= 10) {
      alerts.push({ level: "warning", text: `${absentToday} employee${absentToday === 1 ? " has" : "s have"} not clocked in today.` });
    }
    if (pendingApprovals > 0) {
      alerts.push({ level: "warning", text: `${pendingApprovals} approval${pendingApprovals === 1 ? " is" : "s are"} pending (leave, expenses, timesheets).` });
    }
    // Branch that hit 100% today
    const branchToday = new Map();
    for (const r of todayRecs) {
      const emp = staffById.get(String(r.employee));
      const brName = emp && branchById.get(String(emp.branch));
      if (!brName) continue;
      const b = branchToday.get(brName) || { present: 0 };
      if (PRESENT_STATUSES.has(r.status)) b.present += 1;
      branchToday.set(brName, b);
    }
    const staffPerBranch = new Map();
    for (const u of staff) {
      const brName = branchById.get(String(u.branch));
      if (brName) staffPerBranch.set(brName, (staffPerBranch.get(brName) || 0) + 1);
    }
    for (const [brName, cnt] of staffPerBranch) {
      if (cnt > 0 && (branchToday.get(brName)?.present || 0) >= cnt) {
        alerts.push({ level: "good", text: `${brName} branch achieved 100% attendance today.` });
      }
    }
    if (!alerts.length) alerts.push({ level: "good", text: "All clear — no issues detected today." });

    return res.json({
      generatedAt: now.toISOString(),
      kpis: {
        healthScore,
        presentToday,
        absentToday,
        lateToday,
        activeEmployees,
        activeBranches: branches.length,
        pendingApprovals,
        meetingsToday: meetingsToday || 0,
        totalDepartments,
        attendanceRateToday: todayRate,
      },
      attendanceTrend: trend,
      departmentPerformance,
      branchPerformance,
      monthlyExpenses,
      leaveStats,
      alerts,
    });
  } catch (err) {
    console.error("[executive dashboard]", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

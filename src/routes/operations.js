const express = require("express");
const router  = express.Router();
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const Timesheet = require("../models/Timesheet");
const Expense   = require("../models/Expense");
const Asset     = require("../models/Asset");
const User      = require("../models/User");

const mw        = [authenticate, requireMode("corporate"), requireActiveSubscription];
const canManage = requireRole("admin", "manager", "superadmin");

// ─────────────────────────────────────────────────────────────
// TIMESHEETS
// ─────────────────────────────────────────────────────────────

// GET my timesheet for a period
router.get("/timesheets/my", ...mw, async (req, res) => {
  try {
    const period = req.query.period || new Date().toISOString().slice(0, 7);
    let ts = await Timesheet.findOne({ employee: req.user._id, period });
    if (!ts) {
      ts = await Timesheet.create({
        company: req.user.company, employee: req.user._id, period, entries: [], totalHours: 0,
      });
    }
    res.json({ timesheet: ts });
  } catch (e) { res.status(500).json({ error: "Failed to fetch timesheet" }); }
});

// UPSERT entry on timesheet
router.post("/timesheets/my/entry", ...mw, async (req, res) => {
  try {
    const { period, date, hoursWorked, notes } = req.body;
    if (!date || hoursWorked == null) return res.status(400).json({ error: "Date and hours required" });
    const p = period || new Date().toISOString().slice(0, 7);
    const entryDate = new Date(date);

    let ts = await Timesheet.findOne({ employee: req.user._id, period: p });
    if (!ts) ts = await Timesheet.create({ company: req.user.company, employee: req.user._id, period: p, entries: [] });
    if (ts.status === "submitted" || ts.status === "approved")
      return res.status(400).json({ error: "Cannot edit a submitted timesheet" });

    const idx = ts.entries.findIndex(e => new Date(e.date).toDateString() === entryDate.toDateString());
    if (idx >= 0) { ts.entries[idx].hoursWorked = hoursWorked; ts.entries[idx].notes = notes || ""; }
    else ts.entries.push({ date: entryDate, hoursWorked, notes: notes || "" });

    ts.totalHours = ts.entries.reduce((s, e) => s + e.hoursWorked, 0);
    await ts.save();
    res.json({ timesheet: ts });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to save entry" }); }
});

// SUBMIT timesheet
router.post("/timesheets/my/submit", ...mw, async (req, res) => {
  try {
    const { period } = req.body;
    const p = period || new Date().toISOString().slice(0, 7);
    const ts = await Timesheet.findOneAndUpdate(
      { employee: req.user._id, period: p, status: "draft" },
      { status: "submitted", submittedAt: new Date() },
      { new: true }
    );
    if (!ts) return res.status(404).json({ error: "Timesheet not found or already submitted" });
    res.json({ timesheet: ts });
  } catch (e) { res.status(500).json({ error: "Failed to submit timesheet" }); }
});

// GET all submitted timesheets (manager)
router.get("/timesheets", ...mw, canManage, async (req, res) => {
  try {
    const filter = { company: req.user.company };
    if (req.query.period) filter.period = req.query.period;
    if (req.query.status) filter.status = req.query.status;
    const timesheets = await Timesheet.find(filter)
      .populate("employee", "name employeeId department")
      .sort({ period: -1, createdAt: -1 });
    res.json({ timesheets });
  } catch (e) { res.status(500).json({ error: "Failed to fetch timesheets" }); }
});

// REVIEW timesheet (approve/reject)
router.patch("/timesheets/:id/review", ...mw, canManage, async (req, res) => {
  try {
    const { action, note } = req.body;
    if (!["approved","rejected"].includes(action)) return res.status(400).json({ error: "action must be approved or rejected" });
    const ts = await Timesheet.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { status: action, reviewedBy: req.user._id, reviewedAt: new Date(), reviewNote: note || "" },
      { new: true }
    ).populate("employee", "name employeeId department");
    if (!ts) return res.status(404).json({ error: "Timesheet not found" });
    res.json({ timesheet: ts });
  } catch (e) { res.status(500).json({ error: "Failed to review timesheet" }); }
});

// EXPORT timesheet as CSV data
router.get("/timesheets/:id/export", ...mw, canManage, async (req, res) => {
  try {
    const ts = await Timesheet.findOne({ _id: req.params.id, company: req.user.company })
      .populate("employee", "name employeeId department");
    if (!ts) return res.status(404).json({ error: "Not found" });

    const rows = [["Date","Hours","Notes"]];
    ts.entries.forEach(e => {
      rows.push([new Date(e.date).toLocaleDateString(), e.hoursWorked, e.notes || ""]);
    });
    rows.push(["TOTAL", ts.totalHours, ""]);

    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="timesheet-${ts.employee.name}-${ts.period}.csv"`);
    res.send(csv);
  } catch (e) { res.status(500).json({ error: "Failed to export" }); }
});

// ─────────────────────────────────────────────────────────────
// EXPENSES
// ─────────────────────────────────────────────────────────────

// GET my expenses
router.get("/expenses/my", ...mw, async (req, res) => {
  try {
    const expenses = await Expense.find({ employee: req.user._id, company: req.user.company })
      .sort({ date: -1 });
    res.json({ expenses });
  } catch (e) { res.status(500).json({ error: "Failed to fetch expenses" }); }
});

// SUBMIT expense claim
router.post("/expenses", ...mw, async (req, res) => {
  try {
    const { title, category, amount, currency, date, notes } = req.body;
    if (!title || !amount || !date) return res.status(400).json({ error: "Title, amount and date are required" });
    const expense = await Expense.create({
      company: req.user.company, employee: req.user._id,
      title, category: category || "other",
      amount: parseFloat(amount), currency: currency || "GHS",
      date: new Date(date), notes: notes || "",
    });
    res.status(201).json({ expense });
  } catch (e) { res.status(500).json({ error: "Failed to submit expense" }); }
});

// GET all expenses (manager)
router.get("/expenses", ...mw, canManage, async (req, res) => {
  try {
    const filter = { company: req.user.company };
    if (req.query.status) filter.status = req.query.status;
    const expenses = await Expense.find(filter)
      .populate("employee", "name employeeId department")
      .sort({ date: -1 });
    res.json({ expenses });
  } catch (e) { res.status(500).json({ error: "Failed to fetch expenses" }); }
});

// REVIEW expense
router.patch("/expenses/:id/review", ...mw, canManage, async (req, res) => {
  try {
    const { action, note } = req.body;
    if (!["approved","rejected"].includes(action)) return res.status(400).json({ error: "action must be approved or rejected" });
    const expense = await Expense.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { status: action, reviewedBy: req.user._id, reviewedAt: new Date(), reviewNote: note || "" },
      { new: true }
    ).populate("employee", "name employeeId");
    if (!expense) return res.status(404).json({ error: "Expense not found" });
    res.json({ expense });
  } catch (e) { res.status(500).json({ error: "Failed to review expense" }); }
});

// ─────────────────────────────────────────────────────────────
// ASSETS
// ─────────────────────────────────────────────────────────────

// GET all assets
router.get("/assets", ...mw, async (req, res) => {
  try {
    const filter = { company: req.user.company, isActive: true };
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    const assets = await Asset.find(filter)
      .populate("assignedTo", "name employeeId department")
      .populate("createdBy", "name")
      .sort({ name: 1 });
    res.json({ assets });
  } catch (e) { res.status(500).json({ error: "Failed to fetch assets" }); }
});

// CREATE asset
router.post("/assets", ...mw, canManage, async (req, res) => {
  try {
    const { name, assetTag, category, serialNumber, description, purchaseDate, purchaseValue, condition } = req.body;
    if (!name) return res.status(400).json({ error: "Asset name is required" });
    const asset = await Asset.create({
      company: req.user.company, name, assetTag: assetTag || "",
      category: category || "other", serialNumber: serialNumber || "",
      description: description || "",
      purchaseDate: purchaseDate ? new Date(purchaseDate) : null,
      purchaseValue: purchaseValue || null,
      condition: condition || "good",
      createdBy: req.user._id,
    });
    res.status(201).json({ asset });
  } catch (e) { res.status(500).json({ error: "Failed to create asset" }); }
});

// ASSIGN / UNASSIGN asset
router.patch("/assets/:id/assign", ...mw, canManage, async (req, res) => {
  try {
    const { employeeId } = req.body;
    const update = employeeId
      ? { assignedTo: employeeId, assignedAt: new Date() }
      : { assignedTo: null, assignedAt: null };
    const asset = await Asset.findOneAndUpdate(
      { _id: req.params.id, company: req.user.company },
      { $set: update }, { new: true }
    ).populate("assignedTo", "name employeeId department");
    if (!asset) return res.status(404).json({ error: "Asset not found" });
    res.json({ asset });
  } catch (e) { res.status(500).json({ error: "Failed to update assignment" }); }
});

// DELETE (deactivate) asset
router.delete("/assets/:id", ...mw, canManage, async (req, res) => {
  try {
    await Asset.findOneAndUpdate({ _id: req.params.id, company: req.user.company }, { isActive: false });
    res.json({ message: "Asset removed" });
  } catch (e) { res.status(500).json({ error: "Failed to delete asset" }); }
});

// GET my assigned assets
router.get("/assets/my", ...mw, async (req, res) => {
  try {
    const assets = await Asset.find({ assignedTo: req.user._id, company: req.user.company, isActive: true });
    res.json({ assets });
  } catch (e) { res.status(500).json({ error: "Failed to fetch your assets" }); }
});

module.exports = router;

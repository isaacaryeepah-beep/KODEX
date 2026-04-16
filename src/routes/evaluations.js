"use strict";

/**
 * evaluations.js
 * Mounted at: /api/evaluations   (registered in server.js)
 *
 * Course Evaluation & Feedback system.
 * Students anonymously rate courses; staff view aggregated results.
 *
 * Route summary
 * -------------
 * Forms (staff)
 *   GET    /forms/:courseId             get form (falls back to DEFAULT_CRITERIA)
 *   PUT    /forms/:courseId             create or replace a form (upsert)
 *   PATCH  /forms/:courseId/open        toggle isOpen; optionally set openFrom/openUntil
 *   DELETE /forms/:courseId             delete custom form (course reverts to defaults)
 *
 * Student
 *   GET    /my/:courseId                check submission status for a course
 *   POST   /submit/:courseId            submit (or save draft) an evaluation
 *
 * Results (staff — always anonymous)
 *   GET    /results/:courseId           aggregated stats
 *   GET    /results/:courseId/export    CSV export  [admin, superadmin]
 *
 * Academic mode only.
 */

const express  = require("express");
const router   = express.Router();
const authenticate                  = require("../middleware/auth");
const { requireRole, requireMode }  = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const EvaluationForm     = require("../models/EvaluationForm");
const { DEFAULT_CRITERIA }          = EvaluationForm;
const EvaluationResponse = require("../models/EvaluationResponse");
const Course             = require("../models/Course");

// ── Shared middleware ────────────────────────────────────────────────────────
const mw    = [authenticate, requireMode("academic"), requireActiveSubscription, companyIsolation];
const STAFF = ["lecturer", "hod", "admin", "superadmin"];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Return the effective criteria for a course (custom form or defaults). */
async function effectiveCriteria(courseId, company) {
  const form = await EvaluationForm.findOne({ company, course: courseId }).lean();
  return {
    form,
    criteria: form && form.criteria.length ? form.criteria : [...DEFAULT_CRITERIA],
    isOpen:   form ? form.isOpen : false,
    openFrom: form?.openFrom  || null,
    openUntil:form?.openUntil || null,
  };
}

/** Check whether the evaluation window is currently open. */
function windowOpen(form) {
  if (!form) return false;
  if (!form.isOpen) return false;
  const now = Date.now();
  if (form.openFrom  && now < new Date(form.openFrom).getTime())  return false;
  if (form.openUntil && now > new Date(form.openUntil).getTime()) return false;
  return true;
}

/** Verify course belongs to company. */
async function getCourse(courseId, company, res) {
  const course = await Course.findOne({ _id: courseId, companyId: company })
    .select("title code enrolledStudents").lean();
  if (!course) { res.status(404).json({ error: "Course not found" }); return null; }
  return course;
}

// ════════════════════════════════════════════════════════════════════════════
// FORM MANAGEMENT  (staff)
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// GET /forms/:courseId  — get the form for a course (or show defaults)
// ---------------------------------------------------------------------------
router.get("/forms/:courseId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;

    if (!(await getCourse(courseId, company, res))) return;

    const { form, criteria, isOpen, openFrom, openUntil } = await effectiveCriteria(courseId, company);

    res.json({
      isCustom:  !!form,
      isOpen,
      openFrom,
      openUntil,
      criteria,
    });
  } catch (err) {
    console.error("get eval form:", err);
    res.status(500).json({ error: "Failed to fetch evaluation form" });
  }
});

// ---------------------------------------------------------------------------
// PUT /forms/:courseId  — create or replace the form (upsert)
// Body: { criteria: [{ key, label, type, required?, order? }], openFrom?, openUntil? }
// ---------------------------------------------------------------------------
router.put("/forms/:courseId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;

    if (!(await getCourse(courseId, company, res))) return;

    const { criteria, openFrom, openUntil } = req.body;

    if (!Array.isArray(criteria) || criteria.length === 0) {
      return res.status(400).json({ error: "criteria must be a non-empty array" });
    }

    // Validate criteria
    const VALID_TYPES = ["rating", "text", "yesno"];
    for (const c of criteria) {
      if (!c.key?.trim() || !c.label?.trim()) {
        return res.status(400).json({ error: "Each criterion must have a key and label" });
      }
      if (c.type && !VALID_TYPES.includes(c.type)) {
        return res.status(400).json({ error: `criterion type must be one of: ${VALID_TYPES.join(", ")}` });
      }
    }

    // Deduplicate keys (keep last occurrence)
    const seen   = new Map();
    const deduped = criteria
      .map((c, i) => ({ key: c.key.trim(), label: c.label.trim(), type: c.type || "rating", required: !!c.required, order: c.order ?? i }))
      .filter(c => { seen.set(c.key, c); return true; });
    const uniqueCriteria = [...seen.values()];

    const form = await EvaluationForm.findOneAndUpdate(
      { company, course: courseId },
      {
        $set: {
          criteria:  uniqueCriteria,
          openFrom:  openFrom  ? new Date(openFrom)  : null,
          openUntil: openUntil ? new Date(openUntil) : null,
          updatedBy: req.user._id,
        },
        $setOnInsert: {
          createdBy: req.user._id,
          isOpen:    false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ form });
  } catch (err) {
    console.error("upsert eval form:", err);
    res.status(500).json({ error: "Failed to save evaluation form" });
  }
});

// ---------------------------------------------------------------------------
// PATCH /forms/:courseId/open  — toggle isOpen; optionally set window dates
// Body: { isOpen: boolean, openFrom?, openUntil? }
// Must be declared BEFORE /forms/:courseId to avoid shadowing (no issue here
// since it's a sub-path, but keeping explicit ordering for clarity).
// ---------------------------------------------------------------------------
router.patch("/forms/:courseId/open", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const { courseId }  = req.params;
    const company       = req.user.company;
    const { isOpen, openFrom, openUntil } = req.body;

    if (typeof isOpen !== "boolean") {
      return res.status(400).json({ error: "isOpen (boolean) is required" });
    }

    if (!(await getCourse(courseId, company, res))) return;

    const $set = { isOpen, updatedBy: req.user._id };
    if (openFrom  !== undefined) $set.openFrom  = openFrom  ? new Date(openFrom)  : null;
    if (openUntil !== undefined) $set.openUntil = openUntil ? new Date(openUntil) : null;

    const form = await EvaluationForm.findOneAndUpdate(
      { company, course: courseId },
      { $set, $setOnInsert: { criteria: [], createdBy: req.user._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ isOpen: form.isOpen, openFrom: form.openFrom, openUntil: form.openUntil });
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle evaluation window" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /forms/:courseId  — delete custom form (revert to defaults)
// ---------------------------------------------------------------------------
router.delete("/forms/:courseId", ...mw, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;

    if (!(await getCourse(courseId, company, res))) return;

    await EvaluationForm.deleteOne({ company, course: courseId });
    res.json({ message: "Custom form removed; course will use default criteria" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete evaluation form" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// STUDENT ROUTES
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// GET /my/:courseId  — check submission status
// ---------------------------------------------------------------------------
router.get("/my/:courseId", ...mw, requireRole("student"), async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;

    if (!(await getCourse(courseId, company, res))) return;

    const existing = await EvaluationResponse.findOne({
      company, course: courseId, student: req.user._id,
    }).select("status submittedAt overallRating").lean();

    const { isOpen, openFrom, openUntil } = await effectiveCriteria(courseId, company);

    res.json({
      submitted:     existing?.status === "submitted",
      hasDraft:      existing?.status === "draft",
      submittedAt:   existing?.submittedAt || null,
      overallRating: existing?.overallRating || null,
      windowOpen:    windowOpen({ isOpen, openFrom, openUntil }),
      openFrom,
      openUntil,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to check evaluation status" });
  }
});

// ---------------------------------------------------------------------------
// POST /submit/:courseId  — submit (or save draft) an evaluation
// Body: { overallRating, responses: [{ key, rating?, text?, yesno? }], submit?: boolean }
// ---------------------------------------------------------------------------
router.post("/submit/:courseId", ...mw, requireRole("student"), async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;

    const course = await getCourse(courseId, company, res);
    if (!course) return;

    // Student must be enrolled
    const enrolled = (course.enrolledStudents || []).some(
      id => id.toString() === req.user._id.toString()
    );
    if (!enrolled) {
      return res.status(403).json({ error: "You are not enrolled in this course" });
    }

    const { form, criteria, isOpen, openFrom, openUntil } = await effectiveCriteria(courseId, company);

    // Only enforce window when actually submitting (not saving draft)
    const isSubmit = req.body.submit !== false;
    if (isSubmit && !windowOpen({ isOpen, openFrom, openUntil })) {
      return res.status(403).json({ error: "The evaluation window for this course is not currently open" });
    }

    const { overallRating, responses } = req.body;

    if (!overallRating || overallRating < 1 || overallRating > 5) {
      return res.status(400).json({ error: "overallRating must be between 1 and 5" });
    }
    if (!Array.isArray(responses)) {
      return res.status(400).json({ error: "responses must be an array" });
    }

    // Validate required criteria
    const criteriaMap = Object.fromEntries(criteria.map(c => [c.key, c]));
    for (const c of criteria) {
      if (!c.required) continue;
      const ans = responses.find(r => r.key === c.key);
      if (!ans) return res.status(400).json({ error: `Required criterion '${c.label}' is missing` });
      if (c.type === "rating" && (ans.rating == null || ans.rating < 1 || ans.rating > 5)) {
        return res.status(400).json({ error: `'${c.label}' requires a rating between 1 and 5` });
      }
    }

    // Sanitise responses to only include known criteria keys
    const cleanResponses = responses
      .filter(r => criteriaMap[r.key])
      .map(r => ({
        key:    r.key,
        rating: r.rating != null ? Math.min(5, Math.max(1, Number(r.rating))) : null,
        text:   typeof r.text  === "string" ? r.text.trim()  : null,
        yesno:  typeof r.yesno === "boolean" ? r.yesno : null,
      }));

    // Prevent re-submission of an already-submitted response
    const existing = await EvaluationResponse.findOne({
      company, course: courseId, student: req.user._id,
    });
    if (existing?.status === "submitted") {
      return res.status(409).json({ error: "You have already submitted an evaluation for this course" });
    }

    const now    = new Date();
    const status = isSubmit ? "submitted" : "draft";

    let evalResponse;
    if (existing) {
      // Update draft
      existing.overallRating = overallRating;
      existing.responses     = cleanResponses;
      existing.status        = status;
      if (isSubmit) existing.submittedAt = now;
      await existing.save();
      evalResponse = existing;
    } else {
      evalResponse = await EvaluationResponse.create({
        company,
        course:        courseId,
        student:       req.user._id,
        isAnonymous:   true,
        overallRating,
        responses:     cleanResponses,
        status,
        submittedAt:   isSubmit ? now : null,
      });
    }

    res.status(existing ? 200 : 201).json({
      message:       isSubmit ? "Evaluation submitted successfully" : "Draft saved",
      status,
      overallRating: evalResponse.overallRating,
    });
  } catch (err) {
    console.error("submit evaluation:", err);
    res.status(500).json({ error: "Failed to submit evaluation" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// RESULTS  (staff — always anonymous)
// ════════════════════════════════════════════════════════════════════════════

// ---------------------------------------------------------------------------
// GET /results/:courseId/export  — CSV export  [admin, superadmin]
// Must be declared BEFORE /results/:courseId to prevent shadowing.
// ---------------------------------------------------------------------------
router.get("/results/:courseId/export", ...mw, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;

    const course = await getCourse(courseId, company, res);
    if (!course) return;

    const responses = await EvaluationResponse.find({
      company, course: courseId, status: "submitted",
    }).lean();

    const { criteria } = await effectiveCriteria(courseId, company);

    // Build header row
    const header = ["Response #", "Overall Rating", "Submitted At",
      ...criteria.map(c => c.label)];

    const rows = responses.map((r, i) => {
      const rowData = criteria.map(c => {
        const ans = r.responses.find(a => a.key === c.key);
        if (!ans) return "";
        if (c.type === "rating") return ans.rating ?? "";
        if (c.type === "yesno")  return ans.yesno == null ? "" : (ans.yesno ? "Yes" : "No");
        return (ans.text || "").replace(/"/g, '""');
      });
      return [i + 1, r.overallRating, r.submittedAt?.toISOString() || "", ...rowData];
    });

    const allRows = [header, ...rows];
    const csv     = allRows.map(r => r.map(v => `"${String(v)}"`).join(",")).join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="evaluations_${course.code}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error("export evaluations:", err);
    res.status(500).json({ error: "Failed to export evaluations" });
  }
});

// ---------------------------------------------------------------------------
// GET /results/:courseId  — aggregated anonymous results
// ---------------------------------------------------------------------------
router.get("/results/:courseId", ...mw, requireRole(...STAFF), async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;

    const course = await getCourse(courseId, company, res);
    if (!course) return;

    const [responses, { criteria }] = await Promise.all([
      EvaluationResponse.find({ company, course: courseId, status: "submitted" }).lean(),
      effectiveCriteria(courseId, company),
    ]);

    const totalEnrolled   = (course.enrolledStudents || []).length;
    const totalResponses  = responses.length;
    const responseRate    = totalEnrolled > 0
      ? Math.round((totalResponses / totalEnrolled) * 100)
      : null;

    // Aggregate overall rating
    const overallScores = responses.map(r => r.overallRating).filter(Boolean);
    const overallAvg    = overallScores.length
      ? parseFloat((overallScores.reduce((s, v) => s + v, 0) / overallScores.length).toFixed(2))
      : null;

    const overallDist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    overallScores.forEach(s => { if (overallDist[s] !== undefined) overallDist[s]++; });

    // Aggregate per criterion
    const criteriaStats = criteria.map(c => {
      const answers = responses
        .map(r => r.responses.find(a => a.key === c.key))
        .filter(Boolean);

      if (c.type === "rating") {
        const vals = answers.map(a => a.rating).filter(v => v != null);
        const avg  = vals.length
          ? parseFloat((vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2))
          : null;
        const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        vals.forEach(v => { if (dist[v] !== undefined) dist[v]++; });
        return { key: c.key, label: c.label, type: "rating", avg, distribution: dist, count: vals.length };
      }

      if (c.type === "yesno") {
        const vals   = answers.map(a => a.yesno).filter(v => v != null);
        const yesCount = vals.filter(Boolean).length;
        return {
          key: c.key, label: c.label, type: "yesno",
          yesCount, noCount: vals.length - yesCount, count: vals.length,
          yesPct: vals.length > 0 ? Math.round((yesCount / vals.length) * 100) : null,
        };
      }

      // text — return comments (no student identifiers)
      const texts = answers.map(a => a.text).filter(t => t?.trim());
      return { key: c.key, label: c.label, type: "text", comments: texts, count: texts.length };
    });

    res.json({
      courseId,
      courseName:    course.title,
      courseCode:    course.code,
      totalEnrolled,
      totalResponses,
      responseRate,
      overall: { avg: overallAvg, distribution: overallDist },
      criteria: criteriaStats,
    });
  } catch (err) {
    console.error("evaluation results:", err);
    res.status(500).json({ error: "Failed to fetch evaluation results" });
  }
});

module.exports = router;

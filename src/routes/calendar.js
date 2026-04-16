"use strict";

/**
 * calendar.js
 * Mounted at: /api/calendar   (registered in server.js)
 *
 * Institution calendar — shared events for the whole company or scoped
 * to a course / department / role set.  Works in both academic and
 * corporate modes; no requireMode() gate.
 *
 * Route summary
 * -------------
 * GET    /                        list events in a date range (role-filtered)
 * POST   /                        create an event  [staff / manager / admin]
 * GET    /upcoming                next-30-days events for the current user
 * GET    /course/:courseId        events attached to a specific course
 * PATCH  /:id                     update event  [creator or admin]
 * DELETE /:id                     delete event  [creator or admin]
 *
 * Visibility rules (applied to GET / and GET /upcoming):
 *   - targetRoles = [] → visible to all roles
 *   - targetRoles non-empty → visible only if user.role is in the list
 *   - course set → only visible to enrolled students + staff
 *     (course-scoped events are excluded from the global list unless the
 *      caller is staff or is enrolled in that course)
 *   - department set → visible only to users in that department
 */

const express  = require("express");
const router   = express.Router();
const mongoose = require("mongoose");
const authenticate                  = require("../middleware/auth");
const { requireRole }               = require("../middleware/role");
const { companyIsolation }          = require("../middleware/companyIsolation");
const { requireActiveSubscription } = require("../middleware/subscription");
const CalendarEvent = require("../models/CalendarEvent");
const { EVENT_TYPES, RECURRENCE_PATTERNS } = CalendarEvent;
const Course        = require("../models/Course");

// ── Shared middleware ────────────────────────────────────────────────────────
const mw = [authenticate, requireActiveSubscription, companyIsolation];

const CREATOR_ROLES = ["lecturer", "hod", "admin", "superadmin", "manager"];
const STAFF_ROLES   = ["lecturer", "hod", "admin", "superadmin"];

function isStaff(role) { return STAFF_ROLES.includes(role); }

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a Mongo filter that respects the visibility rules for the caller.
 * Always scoped to the caller's company.
 */
function visibilityFilter(user) {
  const base = { company: user.company };

  // Role filter: event has no role restriction, OR user's role is listed
  base.$or = [
    { targetRoles: { $size: 0 } },
    { targetRoles: user.role },
  ];

  // Department filter: event has no dept restriction, OR matches user's dept
  // (only apply when user has a department)
  if (user.department) {
    base.$and = [
      {
        $or: [
          { department: null },
          { department: user.department },
        ],
      },
    ];
  } else {
    // Include events with no department restriction only
    // (also include events that set department — staff may see everything)
    if (!isStaff(user.role)) {
      base.department = null;
    }
  }

  // Course-scoped events: exclude from general list for non-staff unless
  // we explicitly allow them (they are retrieved via /course/:courseId).
  if (!isStaff(user.role)) {
    base.course = null;
  }

  return base;
}

/**
 * Parse a date query param safely; return null on failure.
 */
function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

// ════════════════════════════════════════════════════════════════════════════
// GET /upcoming  — next-30-days events for the current user
// Must be declared BEFORE /:id to prevent shadowing.
// ════════════════════════════════════════════════════════════════════════════
router.get("/upcoming", ...mw, async (req, res) => {
  try {
    const now   = new Date();
    const until = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const filter = {
      ...visibilityFilter(req.user),
      startDate: { $gte: now, $lte: until },
    };

    const events = await CalendarEvent.find(filter)
      .populate("createdBy", "name")
      .populate("course",    "title code")
      .sort({ startDate: 1 })
      .limit(50)
      .lean();

    res.json({ events, count: events.length });
  } catch (err) {
    console.error("calendar upcoming:", err);
    res.status(500).json({ error: "Failed to fetch upcoming events" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /course/:courseId  — events scoped to a specific course
// Must be declared BEFORE /:id.
// ════════════════════════════════════════════════════════════════════════════
router.get("/course/:courseId", ...mw, async (req, res) => {
  try {
    const { courseId } = req.params;
    const company      = req.user.company;

    // Verify course exists in company
    const course = await Course.findOne({ _id: courseId, companyId: company })
      .select("enrolledStudents").lean();
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Students must be enrolled
    if (req.user.role === "student") {
      const enrolled = (course.enrolledStudents || []).some(
        id => id.toString() === req.user._id.toString()
      );
      if (!enrolled) return res.status(403).json({ error: "You are not enrolled in this course" });
    }

    const filter = { company, course: courseId };
    if (req.query.type) filter.type = req.query.type;

    const start = parseDate(req.query.start);
    const end   = parseDate(req.query.end);
    if (start || end) {
      filter.startDate = {};
      if (start) filter.startDate.$gte = start;
      if (end)   filter.startDate.$lte = end;
    }

    const events = await CalendarEvent.find(filter)
      .populate("createdBy", "name")
      .sort({ startDate: 1 })
      .lean();

    res.json({ events, count: events.length });
  } catch (err) {
    console.error("calendar course events:", err);
    res.status(500).json({ error: "Failed to fetch course events" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// GET /  — list events in a date range
// ════════════════════════════════════════════════════════════════════════════
router.get("/", ...mw, async (req, res) => {
  try {
    const company = req.user.company;

    // Default to current calendar month if no range provided
    const now          = new Date();
    const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    const start = parseDate(req.query.start) || defaultStart;
    const end   = parseDate(req.query.end)   || defaultEnd;

    if (end < start) {
      return res.status(400).json({ error: "end must be after start" });
    }

    const filter = {
      ...visibilityFilter(req.user),
      // Include events that overlap the requested range
      startDate: { $lte: end },
      endDate:   { $gte: start },
    };

    if (req.query.type) {
      if (!EVENT_TYPES.includes(req.query.type)) {
        return res.status(400).json({ error: `type must be one of: ${EVENT_TYPES.join(", ")}` });
      }
      filter.type = req.query.type;
    }

    // Staff can additionally filter by course
    if (req.query.courseId && isStaff(req.user.role)) {
      filter.course = req.query.courseId;
      delete filter["course"]; // remove null restriction from visibilityFilter
      filter.course = req.query.courseId;
    }

    const events = await CalendarEvent.find(filter)
      .populate("createdBy", "name")
      .populate("course",    "title code")
      .sort({ startDate: 1 })
      .lean();

    res.json({ events, count: events.length, rangeStart: start, rangeEnd: end });
  } catch (err) {
    console.error("calendar list:", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// POST /  — create an event
// ════════════════════════════════════════════════════════════════════════════
router.post("/", ...mw, requireRole(...CREATOR_ROLES), async (req, res) => {
  try {
    const company = req.user.company;
    const {
      title, description, type, location, color,
      startDate, endDate, allDay,
      course: courseId, department, targetRoles,
      isRecurring, recurrencePattern, recurrenceEndDate,
    } = req.body;

    // Required fields
    if (!title?.trim()) return res.status(400).json({ error: "title is required" });
    if (!startDate)      return res.status(400).json({ error: "startDate is required" });
    if (!endDate)        return res.status(400).json({ error: "endDate is required" });

    const start = new Date(startDate);
    const end   = new Date(endDate);
    if (isNaN(start.getTime())) return res.status(400).json({ error: "startDate is invalid" });
    if (isNaN(end.getTime()))   return res.status(400).json({ error: "endDate is invalid" });
    if (end < start)            return res.status(400).json({ error: "endDate must be on or after startDate" });

    if (type && !EVENT_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${EVENT_TYPES.join(", ")}` });
    }

    // Validate recurrence
    if (isRecurring) {
      if (!RECURRENCE_PATTERNS.includes(recurrencePattern)) {
        return res.status(400).json({ error: `recurrencePattern must be one of: ${RECURRENCE_PATTERNS.join(", ")}` });
      }
    }

    // Validate course belongs to company if provided
    if (courseId) {
      const course = await Course.findOne({ _id: courseId, companyId: company }).select("_id").lean();
      if (!course) return res.status(404).json({ error: "Course not found" });
    }

    const event = await CalendarEvent.create({
      company,
      title:       title.trim(),
      description: (description || "").trim(),
      type:        type || "other",
      location:    (location  || "").trim(),
      color:       color || "#6366f1",
      startDate:   start,
      endDate:     end,
      allDay:      !!allDay,
      course:      courseId || null,
      department:  department?.trim() || null,
      targetRoles: Array.isArray(targetRoles) ? targetRoles.filter(r => typeof r === "string") : [],
      isRecurring:       !!isRecurring,
      recurrencePattern: isRecurring ? recurrencePattern : null,
      recurrenceEndDate: (isRecurring && recurrenceEndDate) ? new Date(recurrenceEndDate) : null,
      createdBy: req.user._id,
    });

    await event.populate("createdBy", "name");
    if (courseId) await event.populate("course", "title code");

    res.status(201).json({ event });
  } catch (err) {
    console.error("create calendar event:", err);
    res.status(500).json({ error: "Failed to create event" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// PATCH /:id  — update an event (creator or admin)
// ════════════════════════════════════════════════════════════════════════════
router.patch("/:id", ...mw, async (req, res) => {
  try {
    const company = req.user.company;
    const event   = await CalendarEvent.findOne({ _id: req.params.id, company });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const isOwner = event.createdBy?.toString() === req.user._id.toString();
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "You can only edit events you created" });
    }

    const EDITABLE = [
      "title", "description", "type", "location", "color",
      "startDate", "endDate", "allDay", "department", "targetRoles",
      "isRecurring", "recurrencePattern", "recurrenceEndDate",
    ];

    for (const key of EDITABLE) {
      if (req.body[key] === undefined) continue;
      if (key === "startDate" || key === "endDate" || key === "recurrenceEndDate") {
        event[key] = req.body[key] ? new Date(req.body[key]) : null;
      } else {
        event[key] = req.body[key];
      }
    }

    // Handle course update separately (validate ownership)
    if (req.body.course !== undefined) {
      if (req.body.course) {
        const course = await Course.findOne({ _id: req.body.course, companyId: company }).select("_id").lean();
        if (!course) return res.status(404).json({ error: "Course not found" });
      }
      event.course = req.body.course || null;
    }

    // Validate dates after update
    if (event.endDate < event.startDate) {
      return res.status(400).json({ error: "endDate must be on or after startDate" });
    }

    event.updatedBy = req.user._id;
    await event.save();
    await event.populate("createdBy", "name");
    if (event.course) await event.populate("course", "title code");

    res.json({ event });
  } catch (err) {
    console.error("update calendar event:", err);
    res.status(500).json({ error: "Failed to update event" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// DELETE /:id  — delete an event (creator or admin)
// ════════════════════════════════════════════════════════════════════════════
router.delete("/:id", ...mw, async (req, res) => {
  try {
    const company = req.user.company;
    const event   = await CalendarEvent.findOne({ _id: req.params.id, company });
    if (!event) return res.status(404).json({ error: "Event not found" });

    const isOwner = event.createdBy?.toString() === req.user._id.toString();
    const isAdmin = ["admin", "superadmin"].includes(req.user.role);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "You can only delete events you created" });
    }

    await event.deleteOne();
    res.json({ message: "Event deleted" });
  } catch (err) {
    console.error("delete calendar event:", err);
    res.status(500).json({ error: "Failed to delete event" });
  }
});

module.exports = router;

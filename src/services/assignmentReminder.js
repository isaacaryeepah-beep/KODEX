"use strict";

/**
 * assignmentReminder
 *
 * Runs every 6 hours via node-cron. For each published assignment whose
 * due date falls in the 23–25 hour window from now, sends an
 * ASSIGNMENT_DUE_SOON notification to all enrolled students who have
 * not yet submitted.
 *
 * The ±1 hour window around the 24h mark means each assignment triggers
 * at most once regardless of how often the job runs (every 6h).
 */

const cron       = require("node-cron");
const Assignment = require("../models/Assignment");
const AssignmentSubmission = require("../models/AssignmentSubmission");
const Course     = require("../models/Course");
const notif      = require("./notificationService");

async function sendDueReminders() {
  try {
    const now    = new Date();
    const lo     = new Date(now.getTime() + 23 * 60 * 60 * 1000);
    const hi     = new Date(now.getTime() + 25 * 60 * 60 * 1000);

    const assignments = await Assignment.find({
      status:   "published",
      isActive: true,
      dueDate:  { $gte: lo, $lte: hi },
    }).lean();

    if (!assignments.length) return;

    for (const assignment of assignments) {
      const course = await Course.findById(assignment.course)
        .select("enrolledStudents")
        .lean();

      if (!course?.enrolledStudents?.length) continue;

      // Find students who have already submitted (skip them)
      const submitted = await AssignmentSubmission.find({
        assignment:          assignment._id,
        student:             { $in: course.enrolledStudents },
        isCountedSubmission: true,
        status:              { $in: ["submitted", "late", "graded", "returned"] },
      }).select("student").lean();

      const submittedIds = new Set(submitted.map(s => s.student.toString()));
      const pending = course.enrolledStudents
        .map(id => id.toString())
        .filter(id => !submittedIds.has(id));

      if (!pending.length) continue;

      const hoursLeft = Math.round((new Date(assignment.dueDate) - now) / 3600000);
      await notif.notifyAssignmentDueSoon(assignment, pending, hoursLeft);
      console.log(`[AssignmentReminder] Notified ${pending.length} student(s) — "${assignment.title}" due in ~${hoursLeft}h`);
    }
  } catch (err) {
    console.error("[AssignmentReminder] Error:", err.message);
  }
}

function startAssignmentReminder() {
  // Run at minute 0 of every 6th hour: 00:00, 06:00, 12:00, 18:00
  cron.schedule("0 0,6,12,18 * * *", sendDueReminders, { timezone: "UTC" });
  console.log("[AssignmentReminder] Due-date reminder cron scheduled (every 6h)");
}

module.exports = { startAssignmentReminder, sendDueReminders };

"use strict";

/**
 * notificationService.js
 *
 * Central service for creating in-app Notification documents.
 * All writes are fire-and-forget: errors are logged but never thrown,
 * so a notification failure never breaks the primary request.
 *
 * Public API
 * ----------
 *   notify(opts)                         — create a single notification
 *   notifyMany(recipientIds, opts)       — fan-out to multiple recipients
 *   notifyRecipients(announcement, ids)  — backward-compat for announcements
 *
 * Convenience helpers (wraps notify with sensible defaults)
 *   notifyLeaveRequested(leave, managerIds)
 *   notifyLeaveApproved(leave)
 *   notifyLeaveRejected(leave)
 *   notifyLeaveCancelled(leave, managerIds)
 *   notifyAttendanceOverridden(record, employeeId)
 *   notifyAssignmentPublished(assignment, studentIds)
 *   notifyAssignmentSubmitted(submission, lecturerIds)
 *   notifyAssignmentGraded(submission)
 *   notifyAssignmentReturned(submission)
 *   notifyQuizPublished(quiz, studentIds)
 *   notifyQuizResultReleased(result, studentId)
 *   notifyRoleChanged(user, oldRole, newRole)
 */

const Notification = require("../models/Notification");
const { NOTIFICATION_TYPES } = Notification;

// ---------------------------------------------------------------------------
// Core
// ---------------------------------------------------------------------------

/**
 * Create a single in-app notification.
 *
 * @param {Object} opts
 * @param {ObjectId}  opts.company
 * @param {ObjectId}  opts.recipient
 * @param {string}    opts.type         — value from NOTIFICATION_TYPES
 * @param {string}    opts.title
 * @param {string}    [opts.body]
 * @param {string}    [opts.link]       — SPA deep-link path
 * @param {Object}    [opts.data]       — arbitrary extra payload
 * @returns {Promise<void>}             — fire-and-forget
 */
async function notify({ company, recipient, type, title, body = "", link = null, data = null }) {
  if (!company || !recipient || !type || !title) {
    console.warn("[NotificationService] notify() called with missing required fields — skipped");
    return;
  }
  Notification.create({ company, recipient, type, title, body, link, data }).catch((err) => {
    console.error("[NotificationService] Failed to create notification:", err.message);
  });
}

/**
 * Fan-out the same notification to an array of recipients.
 *
 * @param {ObjectId[]} recipientIds
 * @param {Object}     opts  — same shape as notify() without `recipient`
 */
async function notifyMany(recipientIds, { company, type, title, body = "", link = null, data = null }) {
  if (!Array.isArray(recipientIds) || recipientIds.length === 0) return;
  const docs = recipientIds.map((recipient) => ({
    company,
    recipient,
    type,
    title,
    body,
    link,
    data,
  }));
  Notification.insertMany(docs, { ordered: false }).catch((err) => {
    console.error("[NotificationService] insertMany failed:", err.message);
  });
}

// ---------------------------------------------------------------------------
// Backward-compat: announcement broadcast (called by announcementController)
// ---------------------------------------------------------------------------

/**
 * @param {Object}    announcement  — saved Announcement document
 * @param {ObjectId[]} recipientIds
 */
exports.notifyRecipients = async (announcement, recipientIds) => {
  if (!announcement || !Array.isArray(recipientIds)) return;
  await notifyMany(recipientIds, {
    company: announcement.company || announcement.companyId,
    type:    NOTIFICATION_TYPES.ANNOUNCEMENT,
    title:   announcement.title || "New announcement",
    body:    announcement.message
      ? String(announcement.message).slice(0, 160)
      : "",
    link:    `/announcements/${announcement._id}`,
    data:    { announcementId: announcement._id },
  });
};

// ---------------------------------------------------------------------------
// Corporate: leave
// ---------------------------------------------------------------------------

/**
 * Notify manager(s) that an employee submitted a leave request.
 * @param {Object}     leave       — LeaveRequest document (with .employee populated or as ObjectId)
 * @param {ObjectId[]} managerIds
 */
exports.notifyLeaveRequested = async (leave, managerIds) => {
  if (!managerIds || managerIds.length === 0) return;
  await notifyMany(managerIds, {
    company: leave.company,
    type:    NOTIFICATION_TYPES.LEAVE_REQUESTED,
    title:   "New leave request",
    body:    `A leave request has been submitted and is awaiting your review.`,
    link:    `/leaves/${leave._id}`,
    data:    { leaveId: leave._id, leaveType: leave.type },
  });
};

/**
 * Notify the employee that their leave was approved.
 */
exports.notifyLeaveApproved = async (leave) => {
  await notify({
    company:   leave.company,
    recipient: leave.employee,
    type:      NOTIFICATION_TYPES.LEAVE_APPROVED,
    title:     "Leave request approved",
    body:      `Your ${leave.type} leave request has been approved.`,
    link:      `/leaves/${leave._id}`,
    data:      { leaveId: leave._id, leaveType: leave.type, days: leave.days },
  });
};

/**
 * Notify the employee that their leave was rejected.
 */
exports.notifyLeaveRejected = async (leave, note) => {
  await notify({
    company:   leave.company,
    recipient: leave.employee,
    type:      NOTIFICATION_TYPES.LEAVE_REJECTED,
    title:     "Leave request rejected",
    body:      note
      ? `Your ${leave.type} leave request was rejected: ${note}`
      : `Your ${leave.type} leave request has been rejected.`,
    link:      `/leaves/${leave._id}`,
    data:      { leaveId: leave._id, leaveType: leave.type },
  });
};

/**
 * Notify manager(s) that a leave was cancelled by the employee.
 */
exports.notifyLeaveCancelled = async (leave, managerIds) => {
  if (!managerIds || managerIds.length === 0) return;
  await notifyMany(managerIds, {
    company: leave.company,
    type:    NOTIFICATION_TYPES.LEAVE_CANCELLED,
    title:   "Leave request cancelled",
    body:    `A pending leave request has been cancelled by the employee.`,
    link:    `/leaves/${leave._id}`,
    data:    { leaveId: leave._id, leaveType: leave.type },
  });
};

// ---------------------------------------------------------------------------
// Corporate: attendance
// ---------------------------------------------------------------------------

/**
 * Notify the employee that their attendance record was manually overridden.
 */
exports.notifyAttendanceOverridden = async (record, adminName) => {
  await notify({
    company:   record.company,
    recipient: record.employee,
    type:      NOTIFICATION_TYPES.ATTENDANCE_OVERRIDDEN,
    title:     "Attendance record updated",
    body:      adminName
      ? `Your attendance for ${_fmtDate(record.date)} was updated by ${adminName}.`
      : `Your attendance record for ${_fmtDate(record.date)} has been updated.`,
    link:      `/corporate-attendance/my`,
    data:      { attendanceId: record._id, date: record.date },
  });
};

// ---------------------------------------------------------------------------
// Academic: assignments
// ---------------------------------------------------------------------------

/**
 * Notify enrolled students that an assignment was published.
 */
exports.notifyAssignmentPublished = async (assignment, studentIds) => {
  if (!studentIds || studentIds.length === 0) return;
  await notifyMany(studentIds, {
    company: assignment.company,
    type:    NOTIFICATION_TYPES.ASSIGNMENT_PUBLISHED,
    title:   `New assignment: ${assignment.title}`,
    body:    assignment.dueDate
      ? `Due ${_fmtDate(assignment.dueDate)}`
      : "",
    link:    `/assignments/${assignment._id}`,
    data:    {
      assignmentId: assignment._id,
      courseId:     assignment.course,
      dueDate:      assignment.dueDate,
    },
  });
};

/**
 * Notify lecturer(s) that a student submitted an assignment.
 */
exports.notifyAssignmentSubmitted = async (submission, lecturerIds) => {
  if (!lecturerIds || lecturerIds.length === 0) return;
  await notifyMany(lecturerIds, {
    company: submission.company,
    type:    NOTIFICATION_TYPES.ASSIGNMENT_SUBMITTED,
    title:   "New assignment submission",
    body:    `A student has submitted an assignment.`,
    link:    `/lecturer/assignments/${submission.assignment}/submissions/${submission._id}`,
    data:    { submissionId: submission._id, assignmentId: submission.assignment },
  });
};

/**
 * Notify a student that their assignment was graded.
 */
exports.notifyAssignmentGraded = async (submission) => {
  await notify({
    company:   submission.company,
    recipient: submission.student,
    type:      NOTIFICATION_TYPES.ASSIGNMENT_GRADED,
    title:     "Assignment graded",
    body:      `Your assignment has been graded.`,
    link:      `/student/assignments/${submission.assignment}`,
    data:      { submissionId: submission._id, assignmentId: submission.assignment },
  });
};

/**
 * Notify a student that their assignment was returned for revision.
 */
exports.notifyAssignmentReturned = async (submission) => {
  await notify({
    company:   submission.company,
    recipient: submission.student,
    type:      NOTIFICATION_TYPES.ASSIGNMENT_RETURNED,
    title:     "Assignment returned for revision",
    body:      `Your assignment has been returned. Please review the feedback and resubmit.`,
    link:      `/student/assignments/${submission.assignment}`,
    data:      { submissionId: submission._id, assignmentId: submission.assignment },
  });
};

// ---------------------------------------------------------------------------
// Academic: quizzes
// ---------------------------------------------------------------------------

/**
 * Notify enrolled students that a quiz was published.
 */
exports.notifyQuizPublished = async (quiz, studentIds, quizType = "normal") => {
  if (!studentIds || studentIds.length === 0) return;
  const basePath = quizType === "snap" ? "/student/snap-quizzes" : "/student/normal-quizzes";
  await notifyMany(studentIds, {
    company: quiz.company,
    type:    NOTIFICATION_TYPES.QUIZ_PUBLISHED,
    title:   `New quiz available: ${quiz.title}`,
    body:    quiz.startDate
      ? `Opens ${_fmtDate(quiz.startDate)}`
      : "",
    link:    `${basePath}/${quiz._id}`,
    data:    { quizId: quiz._id, quizType, courseId: quiz.course },
  });
};

/**
 * Notify a student that their quiz result has been released.
 */
exports.notifyQuizResultReleased = async (result, studentId, quizType = "normal") => {
  const basePath = quizType === "snap" ? "/student/snap-quizzes" : "/student/normal-quizzes";
  await notify({
    company:   result.company,
    recipient: studentId,
    type:      NOTIFICATION_TYPES.QUIZ_RESULT_RELEASED,
    title:     "Quiz result released",
    body:      `Your quiz result is now available.`,
    link:      `${basePath}/${result.quiz}/result`,
    data:      { resultId: result._id, quizId: result.quiz, quizType },
  });
};

// ---------------------------------------------------------------------------
// System / admin
// ---------------------------------------------------------------------------

/**
 * Notify a user that their role was changed.
 */
exports.notifyRoleChanged = async (user, oldRole, newRole) => {
  await notify({
    company:   user.company,
    recipient: user._id,
    type:      NOTIFICATION_TYPES.ROLE_CHANGED,
    title:     "Your role has been updated",
    body:      `Your account role was changed from ${oldRole} to ${newRole}.`,
    link:      "/profile",
    data:      { oldRole, newRole },
  });
};

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _fmtDate(date) {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
}

// Re-export core functions for direct use
exports.notify     = notify;
exports.notifyMany = notifyMany;

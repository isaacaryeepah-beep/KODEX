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
const sse = require("./sseRegistry");
const pushService = require("./push/pushService");

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
  Notification.create({ company, recipient, type, title, body, link, data })
    .then(doc => sse.push(recipient.toString(), { event: "notification", notification: doc.toObject() }))
    .catch((err) => {
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
  Notification.insertMany(docs, { ordered: false })
    .then(created => {
      for (const doc of created) {
        sse.push(doc.recipient.toString(), { event: "notification", notification: doc.toObject() });
      }
    })
    .catch((err) => {
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
  const bodyText = announcement.body || announcement.message || "";
  await notifyMany(recipientIds, {
    company: announcement.company || announcement.companyId,
    type:    NOTIFICATION_TYPES.ANNOUNCEMENT,
    title:   announcement.title || "New announcement",
    body:    String(bodyText).slice(0, 160),
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
    link:    `/assignments.html?id=${assignment._id}`,
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
    link:    `/assignments.html?id=${submission.assignment}&subId=${submission._id}`,
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
    link:      `/assignments.html?id=${submission.assignment}`,
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
    link:      `/assignments.html?id=${submission.assignment}`,
    data:      { submissionId: submission._id, assignmentId: submission.assignment },
  });
};

/**
 * Remind enrolled students that an assignment deadline is approaching.
 * hoursLeft: approximate hours remaining (for display only).
 */
exports.notifyAssignmentDueSoon = async (assignment, studentIds, hoursLeft) => {
  if (!studentIds || studentIds.length === 0) return;
  const label = hoursLeft <= 1 ? 'less than 1 hour' : `${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`;
  await notifyMany(studentIds, {
    company: assignment.company,
    type:    NOTIFICATION_TYPES.ASSIGNMENT_DUE_SOON,
    title:   `Assignment due soon: ${assignment.title}`,
    body:    `Due in ${label}`,
    link:    `/assignments.html?id=${assignment._id}`,
    data:    { assignmentId: assignment._id, courseId: assignment.course, dueDate: assignment.dueDate },
  });
};

/**
 * Notify enrolled students and the lecturer that a class starts in ~30 min.
 */
exports.notifyClassStartingSoon = async (slot, studentIds) => {
  const label    = slot.title || 'Class';
  const location = slot.room  ? ` · Room ${slot.room}` : '';
  const body     = `Starting at ${slot.startTime}${location}`;

  // Notify students
  if (studentIds && studentIds.length > 0) {
    await notifyMany(studentIds, {
      company: slot.company,
      type:    NOTIFICATION_TYPES.CLASS_STARTING_SOON,
      title:   `${label} starts in 30 minutes`,
      body,
      link:    `/index.html#timetable`,
      data:    { slotId: slot._id, courseId: slot.course },
    });
    for (const studentId of studentIds) {
      pushService.sendToUser(studentId, {
        title: `${label} starts in 30 minutes`,
        body,
        url: "/?view=timetable",
        tag: "class-reminder",
      }).catch((err) => console.error("[NotificationService] Class reminder push failed:", err.message));
    }
  }

  // Notify lecturer
  await notify({
    company:   slot.company,
    recipient: slot.lecturer,
    type:      NOTIFICATION_TYPES.CLASS_STARTING_SOON,
    title:     `Your class starts in 30 minutes`,
    body,
    link:      `/index.html#timetable`,
    data:      { slotId: slot._id, courseId: slot.course },
  });
  if (slot.lecturer) {
    pushService.sendToUser(slot.lecturer, {
      title: `Your class starts in 30 minutes`,
      body,
      url: "/?view=timetable",
      tag: "class-reminder",
    }).catch((err) => console.error("[NotificationService] Class reminder push failed:", err.message));
  }
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

/**
 * Notify a student that a grade/manual score has been saved for them.
 * @param {{ _id, company }} student
 * @param {{ code, title, _id }} course
 * @param {string} entryLabel  — e.g. "Midterm Exam"
 */
exports.notifyGradeSaved = async (student, course, entryLabel) => {
  await notify({
    company:   student.company,
    recipient: student._id,
    type:      NOTIFICATION_TYPES.GRADE_RELEASED,
    title:     "Grade recorded",
    body:      `A score for "${entryLabel}" in ${course.code || course.title} has been entered.`,
    link:      `/student/gradebook/${course._id}`,
    data:      { courseId: course._id, entryLabel },
  });
};

/**
 * Notify the course lecturer that their course was approved by the HOD.
 * @param {{ _id, code, title, lecturerId, company }} course
 * @param {{ name }} approver  — HOD user object
 */
exports.notifyCourseApproved = async (course, approver) => {
  if (!course.lecturerId) return;
  await notify({
    company:   course.company || course.companyId,
    recipient: course.lecturerId,
    type:      NOTIFICATION_TYPES.SYSTEM,
    title:     "Course approved",
    body:      `Your course "${course.code} – ${course.title}" has been approved by ${approver?.name || "HOD"} and is now published.`,
    link:      `/courses/${course._id}`,
    data:      { courseId: course._id },
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

const ROLE_LABELS = {
  student: "Student", employee: "Employee", manager: "Manager",
  lecturer: "Lecturer", hod: "Head of Department",
  admin: "Administrator", superadmin: "Super Administrator",
};

/**
 * Notify admin(s) and HOD(s) of the same company that a user's password
 * was reset (either by an admin or by the user themselves via reset code).
 * Title/wording adapts to the target's actual role -- this is shared by
 * both academic (student) and corporate (employee/manager) resets.
 *
 * @param {{ _id, name, IndexNumber, role, company }} targetUser
 * @param {"admin_reset"|"self_reset"} method
 * @param {string} [resetByName]  — name of admin who did it (admin_reset only)
 */
exports.notifyPasswordReset = async (targetUser, method, resetByName) => {
  try {
    const User = require("../models/User");
    const admins = await User.find({
      company: targetUser.company,
      role: { $in: ["admin", "superadmin", "hod"] },
      _id: { $ne: targetUser._id },
    }).select("_id").lean();

    if (!admins.length) return;
    const recipientIds = admins.map(a => a._id);

    const roleLabel   = ROLE_LABELS[targetUser.role] || "User";
    const targetLabel = targetUser.name || targetUser.IndexNumber || `A ${roleLabel.toLowerCase()}`;
    const body = method === "admin_reset"
      ? `${targetLabel}'s password was reset by ${resetByName || "an admin"}.`
      : `${targetLabel} (${targetUser.IndexNumber || "unknown ID"}) reset their own password using a reset code.`;

    await notifyMany(recipientIds, {
      company: targetUser.company,
      type:    NOTIFICATION_TYPES.PASSWORD_RESET,
      title:   `${roleLabel} password reset`,
      body,
      link:    `/users?highlight=${targetUser._id}`,
      data:    { userId: targetUser._id, method },
    });
  } catch (err) {
    console.error("[NotificationService] notifyPasswordReset failed:", err.message);
  }
};

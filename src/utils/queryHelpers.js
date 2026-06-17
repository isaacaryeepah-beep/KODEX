"use strict";

/**
 * queryHelpers.js
 *
 * Shared database query patterns extracted from controllers.
 * Centralises frequently duplicated queries and filter-building logic.
 */

const Course = require("../models/Course");

// ─── Enrolled Courses ────────────────────────────────────────────────────────

/**
 * Fetch the course IDs a student is currently enrolled in.
 * This pattern is repeated in quizController, studentQuizController,
 * attendanceController, timetableController, announcementController, etc.
 *
 * @param {string|ObjectId} companyId
 * @param {string|ObjectId} studentId
 * @param {object} [options] - { activeOnly: true, select: "_id" }
 * @returns {Promise<ObjectId[]>} array of course _ids
 */
async function getEnrolledCourseIds(companyId, studentId, options = {}) {
  const { activeOnly = true, select = "_id" } = options;
  const filter = {
    companyId,
    enrolledStudents: studentId,
  };
  if (activeOnly) filter.isActive = true;

  const courses = await Course.find(filter).select(select).lean();
  return courses.map((c) => c._id);
}

/**
 * Check if a student is enrolled in a specific course.
 *
 * @param {string|ObjectId} companyId
 * @param {string|ObjectId} studentId
 * @param {string|ObjectId} courseId
 * @returns {Promise<boolean>}
 */
async function isStudentEnrolled(companyId, studentId, courseId) {
  const course = await Course.findOne({
    _id: courseId,
    companyId,
    enrolledStudents: studentId,
  }).select("_id").lean();
  return !!course;
}

// ─── Course Ownership (Lecturer) ─────────────────────────────────────────────

/**
 * Verify a course belongs to a company and (optionally) to a specific lecturer.
 * Returns the course document or null.
 *
 * @param {string|ObjectId} courseId
 * @param {string|ObjectId} companyId
 * @param {string|ObjectId} [lecturerId] - if provided, also matches lecturerId
 * @returns {Promise<object|null>}
 */
async function findOwnedCourse(courseId, companyId, lecturerId) {
  const filter = { _id: courseId, companyId };
  if (lecturerId) filter.lecturerId = lecturerId;
  return Course.findOne(filter);
}

// ─── Lecturer Course IDs ─────────────────────────────────────────────────────

/**
 * Get course IDs owned by a lecturer within a company.
 * Used in lecturerQuizController, reportController, etc.
 *
 * @param {string|ObjectId} companyId
 * @param {string|ObjectId} lecturerId
 * @returns {Promise<ObjectId[]>}
 */
async function getLecturerCourseIds(companyId, lecturerId) {
  const courses = await Course.find({
    companyId,
    lecturerId,
  }).select("_id").lean();
  return courses.map((c) => c._id);
}

// ─── Target Audience Filter ──────────────────────────────────────────────────

/**
 * Build a target-audience $or filter for quizzes/assignments/announcements.
 * Handles the common pattern of showing all-audience + group-specific items.
 *
 * @param {object} user - req.user
 * @returns {Array<object>} array for use in $or
 */
function buildTargetAudienceFilter(user) {
  return [
    { targetAudience: "all" },
    { targetAudience: "group", targetGroup: user.studentGroup || "__none__" },
  ];
}

module.exports = {
  getEnrolledCourseIds,
  isStudentEnrolled,
  findOwnedCourse,
  getLecturerCourseIds,
  buildTargetAudienceFilter,
};

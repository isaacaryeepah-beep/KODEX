/**
 * rosterSync.js
 *
 * Utility to auto-link a newly registered student to any courses
 * where their index number already exists on the StudentRoster.
 *
 * Call this from authController after a successful student registration.
 *
 * Usage:
 *   const { syncStudentToRoster } = require('../utils/rosterSync');
 *   await syncStudentToRoster(newStudent._id, companyId);
 */

const Course        = require('../models/Course');
const StudentRoster = require('../models/StudentRoster');
const User          = require('../models/User');

/**
 * After a student registers, find all roster entries matching
 * their index number in the same company and:
 * 1. Mark the roster entry as registered
 * 2. Add the student to course.enrolledStudents
 */
async function syncStudentToRoster(studentId, companyId) {
  try {
    const student = await User.findById(studentId)
      .select('indexNumber IndexNumber')
      .lean();

    if (!student) return;

    const indexNum = (student.indexNumber || student.IndexNumber || '').trim().toUpperCase();
    if (!indexNum) return;

    // Find roster entries for this index number
    // Roster studentId field stores the index number string
    const rosterEntries = await StudentRoster.find({
      studentId: { $regex: new RegExp(`^${indexNum}$`, 'i') }
    }).lean();

    if (!rosterEntries.length) return;

    const courseIds = rosterEntries.map(r => r.course);

    // Verify courses belong to this company
    const courses = await Course.find({
      _id:       { $in: courseIds },
      companyId,
      isActive:  true,
    }).select('_id').lean();

    const validCourseIds = new Set(courses.map(c => c._id.toString()));

    for (const entry of rosterEntries) {
      if (!validCourseIds.has(entry.course.toString())) continue;

      // Mark roster entry as registered
      await StudentRoster.updateOne(
        { _id: entry._id },
        { $set: { registered: true, userId: studentId } }
      );

      // Add to enrolledStudents (idempotent)
      await Course.updateOne(
        {
          _id:              entry.course,
          enrolledStudents: { $ne: studentId }
        },
        { $push: { enrolledStudents: studentId } }
      );
    }

    console.log(`[RosterSync] Student ${indexNum} linked to ${courses.length} course(s).`);
  } catch (err) {
    console.error('[RosterSync] Error:', err.message);
  }
}

/**
 * When a roster student is deleted:
 * Remove them from course.enrolledStudents as well.
 */
async function removeStudentFromEnrollment(courseId, indexNumber) {
  try {
    const student = await User.findOne({
      $or: [
        { indexNumber: { $regex: new RegExp(`^${indexNumber}$`, 'i') } },
        { IndexNumber: { $regex: new RegExp(`^${indexNumber}$`, 'i') } },
      ]
    }).select('_id').lean();

    if (!student) return;

    await Course.updateOne(
      { _id: courseId },
      { $pull: { enrolledStudents: student._id } }
    );

    console.log(`[RosterSync] Student ${indexNumber} removed from enrolledStudents.`);
  } catch (err) {
    console.error('[RosterSync] removeStudentFromEnrollment error:', err.message);
  }
}

module.exports = { syncStudentToRoster, removeStudentFromEnrollment };

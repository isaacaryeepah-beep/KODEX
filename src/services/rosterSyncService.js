/**
 * rosterSyncService.js
 *
 * Handles synchronization between StudentRoster (authorized list)
 * and Course.enrolledStudents (registered real user accounts).
 *
 * Called:
 *  - after student registration
 *  - after roster upload
 *  - after roster deletion
 */

const Course        = require('../models/Course');
const StudentRoster = require('../models/StudentRoster');
const User          = require('../models/User');

/**
 * After a student registers, find all roster entries matching their
 * index number in the same company and auto-enroll them.
 */
async function syncStudentToRoster(studentId, companyId) {
  try {
    const student = await User.findById(studentId)
      .select('indexNumber IndexNumber')
      .lean();
    if (!student) return { enrolled: 0, skipped: 0 };

    const indexNum = (student.indexNumber || student.IndexNumber || '').trim().toUpperCase();
    if (!indexNum) return { enrolled: 0, skipped: 0 };

    // Find roster entries for this index number
    const rosterEntries = await StudentRoster.find({
      studentId: { $regex: new RegExp(`^${indexNum}$`, 'i') },
    }).lean();

    if (!rosterEntries.length) return { enrolled: 0, skipped: 0 };

    const courseIds = rosterEntries.map(r => r.course).filter(Boolean);
    const courses   = await Course.find({
      _id:      { $in: courseIds },
      companyId,
      isActive: true,
    }).select('_id').lean();

    const validCourseIds = new Set(courses.map(c => c._id.toString()));
    let enrolled = 0, skipped = 0;

    for (const entry of rosterEntries) {
      if (!entry.course || !validCourseIds.has(entry.course.toString())) {
        skipped++;
        continue;
      }

      // Mark roster as registered
      await StudentRoster.updateOne(
        { _id: entry._id },
        { $set: { registered: true, registeredUser: studentId } }
      );

      // Enroll idempotently
      const result = await Course.updateOne(
        { _id: entry.course, enrolledStudents: { $ne: studentId } },
        { $push: { enrolledStudents: studentId } }
      );
      if (result.modifiedCount > 0) enrolled++;
      else skipped++;
    }

    if (enrolled > 0) {
      console.log(`[RosterSync] ${indexNum} enrolled in ${enrolled} course(s), skipped ${skipped}.`);
    }
    return { enrolled, skipped };
  } catch (err) {
    console.error('[RosterSync] syncStudentToRoster error:', err.message);
    return { enrolled: 0, skipped: 0, error: err.message };
  }
}

/**
 * When a roster entry is deleted, also remove that student from
 * Course.enrolledStudents to prevent stale access.
 */
async function removeStudentFromEnrollment(courseId, indexNumber) {
  try {
    const normIndex = (indexNumber || '').trim().toUpperCase();
    if (!normIndex) return;

    const student = await User.findOne({
      $or: [
        { indexNumber: { $regex: new RegExp(`^${normIndex}$`, 'i') } },
        { IndexNumber: { $regex: new RegExp(`^${normIndex}$`, 'i') } },
      ],
    }).select('_id').lean();

    if (!student) return;

    await Course.updateOne(
      { _id: courseId },
      { $pull: { enrolledStudents: student._id } }
    );

    console.log(`[RosterSync] ${normIndex} removed from enrolledStudents in course ${courseId}.`);
  } catch (err) {
    console.error('[RosterSync] removeStudentFromEnrollment error:', err.message);
  }
}

module.exports = { syncStudentToRoster, removeStudentFromEnrollment };

const User = require('../models/User'); // adjust path

const CORPORATE_ROLES = ['manager', 'employee', 'corporate_admin'];
const ACADEMIC_ROLES  = ['lecturer', 'student', 'hod', 'academic_admin'];

/**
 * Resolve recipient user IDs based on targeting rules
 * All recipients must belong to the same company
 */
exports.resolveRecipients = async ({ companyId, mode, targetType, targetRoles, targetDepartments, targetCourses, targetUserIds }) => {
  const baseQuery = { companyId, isActive: true };

  // Restrict by mode
  if (mode === 'corporate') baseQuery.role = { $in: CORPORATE_ROLES };
  else baseQuery.role = { $in: ACADEMIC_ROLES };

  switch (targetType) {

    case 'all': {
      const users = await User.find(baseQuery).select('_id');
      return users.map(u => u._id);
    }

    case 'role': {
      if (!targetRoles?.length) throw new Error('targetRoles required for role targeting');
      const users = await User.find({ ...baseQuery, role: { $in: targetRoles } }).select('_id');
      return users.map(u => u._id);
    }

    case 'department': {
      if (!targetDepartments?.length) throw new Error('targetDepartments required');
      const users = await User.find({ ...baseQuery, department: { $in: targetDepartments } }).select('_id');
      return users.map(u => u._id);
    }

    case 'course': {
      if (!targetCourses?.length) throw new Error('targetCourses required');
      // Students enrolled in the course(s) + the lecturer
      const users = await User.find({
        ...baseQuery,
        $or: [
          { enrolledCourses: { $in: targetCourses } },
          { courses: { $in: targetCourses } }
        ]
      }).select('_id');
      return users.map(u => u._id);
    }

    case 'individual': {
      if (!targetUserIds?.length) throw new Error('targetUserIds required');
      // Validate all belong to same company
      const users = await User.find({
        _id: { $in: targetUserIds },
        companyId
      }).select('_id');

      if (users.length !== targetUserIds.length) {
        throw new Error('You cannot target users outside your company');
      }
      return users.map(u => u._id);
    }

    default:
      throw new Error(`Unknown targetType: ${targetType}`);
  }
};

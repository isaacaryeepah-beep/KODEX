"use strict";

/**
 * corporateScope.js
 *
 * Centralised helpers for corporate-mode people-data scope enforcement.
 *
 * Two independent mechanisms compose here:
 *   1. Manager scope   -- a manager sees only their own direct reports
 *      (User.reportingManager), not the whole company.
 *   2. HR capability    -- an active HRAssignment grants company-wide (or
 *      department-wide) reach on top of whatever base role the holder has,
 *      overriding the manager-scope restriction. It does not grant admin-only
 *      actions (billing, settings, subscription) -- only the people-ops
 *      modules routed through buildPeopleScopeFilter.
 *
 * Usage: call getVisibleUserIds(req.user) once per request; it returns
 * either an array of ids to scope a query to, or null meaning "no
 * restriction." Use getMyActiveHRAssignment() to surface HR status on the
 * login/me responses so the frontend knows whether to show the HR portal.
 */

const getUser          = () => require("../models/User");
const getHRAssignment  = () => require("../models/HRAssignment");

/**
 * Returns the effective people-data scope for a requester.
 *
 * @returns {Promise<{ kind: 'all'|'reports'|'department'|'self', reportIds?: ObjectId[], department?: string }>}
 *   kind 'all'        -- admin/superadmin, or an HR assignment with scope 'company'
 *   kind 'department'  -- HR assignment with scope 'department'
 *   kind 'reports'      -- manager with no HR override -- only direct reports
 *   kind 'self'         -- fallback (employee/other) -- only their own records
 */
async function getPeopleScope(user) {
  if (["admin", "superadmin"].includes(user.role)) {
    return { kind: "all" };
  }

  const HRAssignment = getHRAssignment();
  const hr = await HRAssignment.findOne({
    company: user.company,
    user: user._id,
    revokedAt: null,
  }).populate("department", "name").lean();

  if (hr) {
    if (hr.scope === "company") return { kind: "all" };
    if (hr.scope === "department" && hr.department) {
      return { kind: "department", department: hr.department.name };
    }
  }

  if (user.role === "manager") {
    const User = getUser();
    const reports = await User.find({ company: user.company, reportingManager: user._id })
      .select("_id")
      .lean();
    return { kind: "reports", reportIds: reports.map(r => r._id) };
  }

  return { kind: "self" };
}

/**
 * Returns the array of user ids this requester is allowed to see people-data
 * for, or null to mean "no restriction" (kind 'all' -- admin/superadmin, or
 * company-wide HR). Always includes the requester's own id. This is the
 * single mechanism controllers should use: build a `{ [field]: { $in: ids } }`
 * filter from it, or skip filtering entirely when it returns null.
 */
async function getVisibleUserIds(user) {
  const scope = await getPeopleScope(user);
  if (scope.kind === "all") return null;
  if (scope.kind === "reports") return [...scope.reportIds, user._id];
  if (scope.kind === "department") {
    const User = getUser();
    const users = await User.find({ company: user.company, department: scope.department }).select("_id").lean();
    return users.map(u => u._id);
  }
  return [user._id];
}

/**
 * Returns a small, frontend-friendly summary of a user's active HR
 * assignment (or null), for inclusion in the login/me response so the
 * client knows whether to show the HR portal without a separate round trip.
 */
async function getMyActiveHRAssignment(userId, companyId) {
  const HRAssignment = getHRAssignment();
  const hr = await HRAssignment.findOne({ company: companyId, user: userId, revokedAt: null })
    .populate("department", "name")
    .lean();
  if (!hr) return null;
  return {
    scope: hr.scope,
    department: hr.department ? { id: hr.department._id, name: hr.department.name } : null,
    assignedAt: hr.assignedAt,
  };
}

/**
 * Express middleware: allows admin/manager/superadmin through unconditionally,
 * and allows an 'employee' (or any other base role) through only if they hold
 * an active HR assignment. Use this in place of a bare
 * requireRole("admin","manager","superadmin") on people-ops routes that HR
 * should be able to reach regardless of their base role -- the route handler
 * itself must still call getVisibleUserIds() to scope what they see.
 */
async function requirePeopleOpsAccess(req, res, next) {
  if (["admin", "manager", "superadmin"].includes(req.user.role)) return next();
  try {
    const hr = await getMyActiveHRAssignment(req.user._id, req.user.company);
    if (hr) return next();
  } catch (e) { /* fall through to 403 */ }
  return res.status(403).json({ error: "Forbidden" });
}

module.exports = {
  getPeopleScope,
  getVisibleUserIds,
  getMyActiveHRAssignment,
  requirePeopleOpsAccess,
};

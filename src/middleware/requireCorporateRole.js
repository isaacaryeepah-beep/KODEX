"use strict";

/**
 * requireCorporateRole
 *
 * Guards corporate-only routes by:
 *   1. Verifying the user's coarse `role` is within the corporate role set.
 *   2. Optionally verifying the user's `corporateSubRole` for fine-grained
 *      access control (e.g. "only hr_manager may access this route").
 *   3. Verifying the company operates in corporate (or both) mode.
 *
 * Depends on:
 *   - authenticate      (populates req.user)
 *   - requireCompanyScope (populates req.company, req.tenantMode)
 *
 * Corporate role mapping in KODEX
 * ────────────────────────────────
 * Coarse role (User.role)     → Typical corporateSubRole values
 *   superadmin                → (platform level, always bypassed)
 *   admin                     → company_admin
 *   manager                   → hr_manager | department_manager | branch_manager |
 *                               team_lead | payroll_officer | compliance_officer
 *   employee                  → employee
 *
 * Usage patterns
 * ──────────────
 *   // Allow any corporate role:
 *   router.use(authenticate, requireCompanyScope, requireCorporateRole());
 *
 *   // Allow managers and admins only (coarse check):
 *   router.use(authenticate, requireCompanyScope, requireCorporateRole("manager", "admin"));
 *
 *   // Allow only HR managers (fine-grained sub-role check):
 *   router.use(
 *     authenticate,
 *     requireCompanyScope,
 *     requireCorporateRole("manager"),
 *     requireCorporateSubRole("hr_manager"),
 *   );
 *
 *   // Using pre-built guards:
 *   router.get("/employees", authenticate, requireCompanyScope, hrManagerOrAdmin, handler);
 */

// Coarse roles that are valid in a corporate context.
const CORPORATE_COARSE_ROLES = Object.freeze([
  "admin",
  "manager",
  "employee",
  "superadmin", // always pass-through
]);

// All supported granular corporate sub-roles (mirrors User.corporateSubRole enum).
const CORPORATE_SUB_ROLES = Object.freeze([
  "company_admin",
  "hr_manager",
  "department_manager",
  "team_lead",
  "branch_manager",
  "payroll_officer",
  "compliance_officer",
  "employee",
]);

// ---------------------------------------------------------------------------
// Factory: requireCorporateRole
// ---------------------------------------------------------------------------

/**
 * Returns a middleware that allows only the specified coarse corporate roles.
 * If no roles are passed, any corporate role is accepted.
 *
 * Admin and superadmin are always included as elevated pass-through roles.
 *
 * @param {...string} allowedRoles - Role names from CORPORATE_COARSE_ROLES.
 * @returns {Function} Express middleware.
 */
const requireCorporateRole = (...allowedRoles) => {
  const elevated = ["superadmin", "admin"];

  const allowed =
    allowedRoles.length > 0
      ? [...new Set([...allowedRoles, ...elevated])]
      : [...CORPORATE_COARSE_ROLES];

  // Validate at definition time.
  for (const r of allowedRoles) {
    if (!CORPORATE_COARSE_ROLES.includes(r)) {
      throw new Error(
        `requireCorporateRole: "${r}" is not a recognised corporate role. ` +
        `Valid roles: ${CORPORATE_COARSE_ROLES.join(", ")}`
      );
    }
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // ── Coarse role check ─────────────────────────────────────────────────
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: "Access denied: corporate role required",
        requiredRoles: allowedRoles.length > 0 ? allowedRoles : CORPORATE_COARSE_ROLES,
        yourRole: req.user.role,
      });
    }

    // ── Mode check ────────────────────────────────────────────────────────
    if (req.user.role === "superadmin") return next();

    const mode = req.tenantMode || req.company?.mode;
    if (mode && mode !== "corporate" && mode !== "both") {
      return res.status(403).json({
        error: "This route is only available in corporate mode",
        yourMode: mode,
      });
    }

    next();
  };
};

// ---------------------------------------------------------------------------
// Factory: requireCorporateSubRole
//
// Fine-grained guard that checks User.corporateSubRole.
// Must follow requireCorporateRole (or authenticate + requireCompanyScope).
// Admin and superadmin always bypass the sub-role check.
// ---------------------------------------------------------------------------

/**
 * @param {...string} allowedSubRoles - Sub-role names from CORPORATE_SUB_ROLES.
 * @returns {Function} Express middleware.
 */
const requireCorporateSubRole = (...allowedSubRoles) => {
  // Validate at definition time.
  for (const r of allowedSubRoles) {
    if (!CORPORATE_SUB_ROLES.includes(r)) {
      throw new Error(
        `requireCorporateSubRole: "${r}" is not a recognised sub-role. ` +
        `Valid sub-roles: ${CORPORATE_SUB_ROLES.join(", ")}`
      );
    }
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Elevated bypass.
    if (req.user.role === "superadmin" || req.user.role === "admin") {
      return next();
    }

    const userSubRole = req.user.corporateSubRole;

    if (!userSubRole || !allowedSubRoles.includes(userSubRole)) {
      return res.status(403).json({
        error: "Access denied: insufficient corporate permission level",
        requiredSubRoles: allowedSubRoles,
        yourSubRole: userSubRole || "none",
      });
    }

    next();
  };
};

// ---------------------------------------------------------------------------
// Scope guards: branch / department / team isolation
//
// These verify that the target resource belongs to the user's own
// branch/department/team when the user is not an admin/HR manager.
// They expect the relevant ID to be already loaded on req (by a prior
// middleware or param handler) or passed as a request body/param field.
// ---------------------------------------------------------------------------

/**
 * Ensure the authenticated user can access resources in `targetBranchId`.
 *
 * Rules:
 *   - superadmin / admin / hr_manager / company_admin: full access.
 *   - branch_manager: only their own branch (req.user.branch).
 *   - Others: only their own branch.
 *
 * @param {Function} getBranchId - (req) → ObjectId|string of the target branch.
 */
const requireBranchAccess = (getBranchId) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });

  const elevated = ["superadmin", "admin"];
  const elevatedSubRoles = ["company_admin", "hr_manager"];

  if (
    elevated.includes(req.user.role) ||
    elevatedSubRoles.includes(req.user.corporateSubRole)
  ) {
    return next();
  }

  const targetBranch = getBranchId(req);
  const userBranch   = req.user.branch?.toString() || null;

  if (!userBranch || !targetBranch || userBranch !== targetBranch.toString()) {
    return res.status(403).json({
      error: "Access denied: you do not have permission for this branch",
    });
  }
  next();
};

/**
 * Ensure the authenticated user can access resources in `targetDeptId`.
 *
 * Rules:
 *   - superadmin / admin / hr_manager: full access.
 *   - department_manager: only their own department (req.user.corporateDepartmentRef).
 *   - Others: only their own department.
 *
 * @param {Function} getDeptId - (req) → ObjectId|string of the target department.
 */
const requireDepartmentAccess = (getDeptId) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });

  const elevated = ["superadmin", "admin"];
  const elevatedSubRoles = ["company_admin", "hr_manager"];

  if (
    elevated.includes(req.user.role) ||
    elevatedSubRoles.includes(req.user.corporateSubRole)
  ) {
    return next();
  }

  const targetDept = getDeptId(req);
  const userDept   = req.user.corporateDepartmentRef?.toString() || null;

  if (!userDept || !targetDept || userDept !== targetDept.toString()) {
    return res.status(403).json({
      error: "Access denied: you do not have permission for this department",
    });
  }
  next();
};

// ---------------------------------------------------------------------------
// Convenience pre-built guards
// ---------------------------------------------------------------------------

/** Any authenticated corporate user. */
const anyCorporateUser = requireCorporateRole();

/** Admin or manager (senior staff). */
const managerOrAdmin = requireCorporateRole("manager", "admin");

/** Admin only (company_admin + superadmin). */
const adminOnly = requireCorporateRole("admin");

/** HR manager or admin (for employee/leave management). */
const hrManagerOrAdmin = [
  requireCorporateRole("manager", "admin"),
  requireCorporateSubRole("hr_manager", "company_admin"),
];

/** Department manager or above (for department-scoped operations). */
const departmentManagerOrAbove = [
  requireCorporateRole("manager", "admin"),
  requireCorporateSubRole("department_manager", "hr_manager", "company_admin"),
];

/** Employee self-access helper — used when employees access their own records.
 *  Does NOT restrict role; caller is responsible for checking resource ownership. */
const corporateEmployeeAccess = requireCorporateRole("employee", "manager", "admin");

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = requireCorporateRole;
module.exports.requireCorporateSubRole   = requireCorporateSubRole;
module.exports.requireBranchAccess       = requireBranchAccess;
module.exports.requireDepartmentAccess   = requireDepartmentAccess;
module.exports.CORPORATE_COARSE_ROLES    = CORPORATE_COARSE_ROLES;
module.exports.CORPORATE_SUB_ROLES       = CORPORATE_SUB_ROLES;

// Pre-built guards
module.exports.anyCorporateUser          = anyCorporateUser;
module.exports.managerOrAdmin            = managerOrAdmin;
module.exports.adminOnly                 = adminOnly;
module.exports.hrManagerOrAdmin          = hrManagerOrAdmin;
module.exports.departmentManagerOrAbove  = departmentManagerOrAbove;
module.exports.corporateEmployeeAccess   = corporateEmployeeAccess;

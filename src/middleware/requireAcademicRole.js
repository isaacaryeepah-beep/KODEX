"use strict";

/**
 * requireAcademicRole
 *
 * Guards academic-only routes by:
 *   1. Verifying the user's role is within the academic role set.
 *   2. Verifying the company operates in academic (or both) mode.
 *
 * Depends on:
 *   - authenticate      (populates req.user)
 *   - requireCompanyScope (populates req.company, req.tenantMode)
 *
 * Academic roles in KODEX:
 *   - lecturer   — creates and manages assessments for assigned courses
 *   - student    — views and submits assessments in enrolled courses
 *   - hod        — Head of Department: oversight role, no assessment creation
 *   - admin      — institution admin: can manage all academic entities
 *   - superadmin — platform-wide; always allowed
 *
 * Usage patterns
 * ──────────────
 *   // Allow any academic role:
 *   router.use(authenticate, requireCompanyScope, requireAcademicRole());
 *
 *   // Allow only lecturers (and admins/superadmin):
 *   router.use(authenticate, requireCompanyScope, requireAcademicRole("lecturer"));
 *
 *   // Allow lecturers AND hod:
 *   router.use(authenticate, requireCompanyScope, requireAcademicRole("lecturer", "hod"));
 *
 *   // Allow only students:
 *   router.post("/submit", authenticate, requireCompanyScope, requireAcademicRole("student"), handler);
 */

// All roles that are valid in an academic context.
const ACADEMIC_ROLES = Object.freeze(["lecturer", "student", "hod", "admin", "superadmin"]);

/**
 * Factory: returns a middleware that allows only the specified academic roles.
 * If no roles are passed, any academic role is accepted.
 *
 * Admin and superadmin are always included unless you explicitly restrict them.
 *
 * @param {...string} allowedRoles - Role names from ACADEMIC_ROLES.
 * @returns {Function} Express middleware.
 */
const requireAcademicRole = (...allowedRoles) => {
  // Normalise: always include superadmin/admin as pass-through.
  const elevated = ["superadmin", "admin"];

  // If caller specified roles, use that list; otherwise allow all academic roles.
  const allowed =
    allowedRoles.length > 0
      ? [...new Set([...allowedRoles, ...elevated])]
      : [...ACADEMIC_ROLES];

  // Validate at definition time so misconfigured routes fail loudly on boot.
  for (const r of allowedRoles) {
    if (!ACADEMIC_ROLES.includes(r)) {
      throw new Error(
        `requireAcademicRole: "${r}" is not a recognised academic role. ` +
        `Valid roles: ${ACADEMIC_ROLES.join(", ")}`
      );
    }
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // ── Role check ────────────────────────────────────────────────────────
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({
        error: "Access denied: academic role required",
        requiredRoles: allowedRoles.length > 0 ? allowedRoles : ACADEMIC_ROLES,
        yourRole: req.user.role,
      });
    }

    // ── Mode check ────────────────────────────────────────────────────────
    // Superadmin bypasses mode check.
    if (req.user.role === "superadmin") return next();

    const mode = req.tenantMode || req.company?.mode;
    if (mode && mode !== "academic" && mode !== "both") {
      return res.status(403).json({
        error: "This route is only available in academic mode",
        yourMode: mode,
      });
    }

    next();
  };
};

// ---------------------------------------------------------------------------
// Convenience pre-built guards (DRY shorthand for common route patterns)
// ---------------------------------------------------------------------------

/** Any authenticated academic user (lecturer | student | hod | admin). */
const anyAcademicUser = requireAcademicRole();

/** Lecturer (or admin/superadmin). */
const lecturerOnly = requireAcademicRole("lecturer");

/** Student (or admin/superadmin). */
const studentOnly = requireAcademicRole("student");

/** Lecturer or HOD (or admin/superadmin). */
const lecturerOrHod = requireAcademicRole("lecturer", "hod");

/** HOD or admin only. */
const hodOrAdmin = requireAcademicRole("hod", "admin");

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = requireAcademicRole;
module.exports.ACADEMIC_ROLES = ACADEMIC_ROLES;
module.exports.anyAcademicUser = anyAcademicUser;
module.exports.lecturerOnly    = lecturerOnly;
module.exports.studentOnly     = studentOnly;
module.exports.lecturerOrHod   = lecturerOrHod;
module.exports.hodOrAdmin      = hodOrAdmin;

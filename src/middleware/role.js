const ROLE_HIERARCHY = {
  superadmin: 6,
  admin: 5,
  manager: 4,
  lecturer: 3,
  employee: 2,
  student: 1,
};

const CORPORATE_ROLES = ["manager", "employee"];
const ACADEMIC_ROLES = ["lecturer", "student"];
const ADMIN_ROLES = ["superadmin", "admin"];

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Insufficient permissions",
        required: allowedRoles,
        current: req.user.role,
      });
    }

    next();
  };
};

const requireMinRole = (minRole) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userLevel < requiredLevel) {
      return res.status(403).json({
        error: "Insufficient permissions",
        requiredMinimum: minRole,
        current: req.user.role,
      });
    }

    next();
  };
};

const requireMode = (mode) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (req.user.role === "superadmin" || req.user.role === "admin") {
      return next();
    }

    const Company = require("../models/Company");
    const company = req.company || await Company.findById(req.user.company);

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    if (company.mode !== mode) {
      return res.status(403).json({
        error: `This feature is only available in ${mode} mode`,
      });
    }

    req.company = company;
    next();
  };
};

module.exports = {
  requireRole,
  requireMinRole,
  requireMode,
  ROLE_HIERARCHY,
  CORPORATE_ROLES,
  ACADEMIC_ROLES,
  ADMIN_ROLES,
};

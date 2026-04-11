// ─── CREATOR ROLES ───────────────────────────────────────────────────────────
const CREATOR_ROLES  = ['manager', 'lecturer', 'admin', 'hod', 'superadmin'];
const CORPORATE_ROLES = ['manager', 'employee', 'corporate_admin'];
const ACADEMIC_ROLES  = ['lecturer', 'student', 'hod', 'academic_admin'];

// ─── CAN CREATE ───────────────────────────────────────────────────────────────
exports.canCreate = (req, res, next) => {
  const role = req.user.role?.toLowerCase();
  if (!CREATOR_ROLES.includes(role)) {
    return res.status(403).json({ message: 'You are not authorized to create announcements' });
  }
  next();
};

// ─── MODE VALIDATION ──────────────────────────────────────────────────────────
exports.validateMode = (req, res, next) => {
  const role = req.user.role?.toLowerCase();
  if (CORPORATE_ROLES.includes(role)) req.announcementMode = 'corporate';
  else if (ACADEMIC_ROLES.includes(role)) req.announcementMode = 'academic';
  else req.announcementMode = 'academic';
  next();
};

// ─── VALIDATE TARGET AUDIENCE ─────────────────────────────────────────────────
exports.validateTarget = (req, res, next) => {
  const { targetType, targetRoles } = req.body;
  const mode = req.announcementMode;

  if (!targetType) {
    return res.status(400).json({ message: 'targetType is required' });
  }

  if (targetType === 'role' && targetRoles?.length) {
    for (const role of targetRoles) {
      const r = role.toLowerCase();
      if (mode === 'corporate' && ACADEMIC_ROLES.includes(r)) {
        return res.status(403).json({
          message: `Managers can only target corporate users. "${role}" is an academic role.`
        });
      }
      if (mode === 'academic' && CORPORATE_ROLES.includes(r)) {
        return res.status(403).json({
          message: `Lecturers can only target academic users. "${role}" is a corporate role.`
        });
      }
    }
  }

  next();
};

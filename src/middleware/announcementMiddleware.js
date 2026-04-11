const jwt = require('jsonwebtoken');
const User = require('../../models/User'); // adjust path to your User model

// ─── CREATOR ROLES ───────────────────────────────────────────────────────────
const CREATOR_ROLES = ['manager', 'lecturer', 'admin', 'hod', 'superadmin'];
const CORPORATE_ROLES = ['manager', 'employee', 'corporate_admin'];
const ACADEMIC_ROLES  = ['lecturer', 'student', 'hod', 'academic_admin'];

// ─── AUTH ─────────────────────────────────────────────────────────────────────
exports.protect = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'No token provided' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: 'User not found' });

    req.user = user;
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// ─── COMPANY ISOLATION ────────────────────────────────────────────────────────
exports.companyIsolation = (req, res, next) => {
  if (!req.user.companyId) {
    return res.status(403).json({ message: 'No company associated with this account' });
  }
  req.companyId = req.user.companyId.toString();
  next();
};

// ─── CAN CREATE ───────────────────────────────────────────────────────────────
exports.canCreate = (req, res, next) => {
  const role = req.user.role?.toLowerCase();
  if (!CREATOR_ROLES.includes(role)) {
    return res.status(403).json({ message: 'You are not authorized to create announcements' });
  }
  next();
};

// ─── MODE VALIDATION ─────────────────────────────────────────────────────────
exports.validateMode = (req, res, next) => {
  const role = req.user.role?.toLowerCase();
  const mode = req.user.mode || (CORPORATE_ROLES.includes(role) ? 'corporate' : 'academic');

  if (CORPORATE_ROLES.includes(role)) req.announcementMode = 'corporate';
  else if (ACADEMIC_ROLES.includes(role)) req.announcementMode = 'academic';
  else req.announcementMode = mode;

  next();
};

// ─── VALIDATE TARGET AUDIENCE ────────────────────────────────────────────────
exports.validateTarget = (req, res, next) => {
  const { targetType, targetRoles, targetUserIds } = req.body;
  const mode = req.announcementMode;

  if (!targetType) {
    return res.status(400).json({ message: 'targetType is required' });
  }

  // Role-based targeting validation
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

// ─── OWN OR ADMIN ────────────────────────────────────────────────────────────
exports.ownOrAdmin = (announcement) => (req, res, next) => {
  const role = req.user.role?.toLowerCase();
  const isAdmin = ['admin', 'hod', 'superadmin', 'manager'].includes(role);
  const isOwner = announcement.createdBy.toString() === req.user._id.toString();

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ message: 'You can only modify your own announcements' });
  }
  next();
};

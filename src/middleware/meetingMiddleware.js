const Meeting = require('../models/Meeting');

const CREATOR_ROLES  = ['lecturer', 'manager', 'admin'];
const ACADEMIC_ROLES = ['lecturer', 'student', 'hod', 'academic_admin'];
const CORPORATE_ROLES = ['manager', 'employee', 'corporate_admin'];

// ─── SUBSCRIPTION CHECK ───────────────────────────────────────────────────────
exports.requireActiveSubscription = (req, res, next) => {
  const user = req.user;
  const now  = Date.now();

  const inSub   = user.subscriptionExpiry && new Date(user.subscriptionExpiry) > now;
  const inTrial = user.trialEndDate && new Date(user.trialEndDate) > now;

  if (!inSub && !inTrial) {
    return res.status(403).json({
      message: 'Your trial or subscription has expired. Renew to create or host meetings.'
    });
  }
  next();
};

// ─── CAN CREATE MEETINGS ──────────────────────────────────────────────────────
exports.canCreateMeeting = (req, res, next) => {
  const role = req.user.role?.toLowerCase();
  if (!CREATOR_ROLES.includes(role)) {
    return res.status(403).json({ message: 'Only lecturers and managers can create meetings.' });
  }
  next();
};

// ─── MODE GUARD ───────────────────────────────────────────────────────────────
// Attaches req.meetingMode based on user role
exports.attachMode = (req, res, next) => {
  const role = req.user.role?.toLowerCase();
  if (CORPORATE_ROLES.includes(role)) req.meetingMode = 'corporate';
  else req.meetingMode = 'academic';
  next();
};

// ─── MEETING OWNERSHIP GUARD ─────────────────────────────────────────────────
// Use after fetching meeting and attaching to req.meeting
exports.isOwner = (req, res, next) => {
  const meeting = req.meeting;
  const role    = req.user.role?.toLowerCase();
  const isAdmin = ['admin', 'superadmin'].includes(role);
  const isOwner = meeting.creatorId.toString() === req.user._id.toString();

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ message: 'Only the meeting creator can perform this action.' });
  }
  next();
};

// ─── LOAD MEETING + COMPANY ISOLATION ────────────────────────────────────────
exports.loadMeeting = async (req, res, next) => {
  try {
    const meeting = await Meeting.findOne({
      _id:     req.params.id,
      company: req.user.company,
      isActive: true
    });
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    req.meeting = meeting;
    next();
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── CAN JOIN GUARD ───────────────────────────────────────────────────────────
exports.canJoin = async (req, res, next) => {
  const meeting = req.meeting;
  const user    = req.user;
  const role    = user.role?.toLowerCase();

  // Meeting must be live or scheduled (within join window)
  if (meeting.status === 'ended' || meeting.status === 'cancelled') {
    return res.status(400).json({ message: 'Meeting has ended or been cancelled.' });
  }

  // Creator can always join
  if (meeting.creatorId.toString() === user._id.toString()) return next();

  // Open to whole company
  if (meeting.openToCompany) return next();

  // Check if user is in allowedUsers
  const inAllowedUsers = meeting.allowedUsers.some(u => u.toString() === user._id.toString());
  if (inAllowedUsers) return next();

  // Check allowedCourses vs user's enrolledCourses
  if (meeting.allowedCourses?.length && user.enrolledCourses?.length) {
    const match = meeting.allowedCourses.some(c =>
      user.enrolledCourses.map(String).includes(String(c))
    );
    if (match) return next();
  }

  // Check allowedDepartments
  if (meeting.allowedDepartments?.length && user.department) {
    if (meeting.allowedDepartments.includes(user.department)) return next();
  }

  // Check allowedTeams (corporate)
  if (meeting.allowedTeams?.length && user.team) {
    if (meeting.allowedTeams.includes(user.team)) return next();
  }

  return res.status(403).json({ message: 'You are not assigned to this meeting.' });
};

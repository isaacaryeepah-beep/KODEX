const mongoose = require('mongoose');
const Meeting = require('../models/Meeting');
const Company = require('../models/Company');

const CREATOR_ROLES   = ['lecturer', 'manager', 'admin', 'superadmin', 'hod'];
const CORPORATE_ROLES = ['manager', 'employee', 'corporate_admin'];

// ─── SUBSCRIPTION CHECK ───────────────────────────────────────────────────────
// Mirrors the logic in middleware/subscription.js:
//  - admin / superadmin / student / employee are always exempt
//  - others pass if the company has an active subscription or trial
//  - lecturer / hod / manager also pass if they have a valid personal subscription
exports.requireActiveSubscription = async (req, res, next) => {
  const user = req.user;
  const now  = Date.now();

  // Roles that never need a subscription to access meetings
  const exempt = ['superadmin', 'admin', 'student', 'employee'];
  if (exempt.includes(user.role)) return next();

  try {
    const company = req.company || await Company.findById(user.company);

    if (company && (company.subscriptionActive || company.isTrialActive)) {
      req.company = req.company || company;
      return next();
    }

    // Personal subscription fallback for lecturer / hod / manager
    const selfPayRoles = ['lecturer', 'hod', 'manager'];
    if (selfPayRoles.includes(user.role)) {
      const personalEnd = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
      if (personalEnd && personalEnd > now) return next();

      // Legacy per-user trial (trialEndDate field)
      const trialEnd = user.trialEndDate ? new Date(user.trialEndDate) : null;
      if (trialEnd && trialEnd > now) return next();
    }

    return res.status(403).json({
      subscriptionRequired: true,
      message: 'Your trial or subscription has expired. Renew to create or host meetings.',
    });
  } catch (err) {
    console.error('Meeting subscription check error:', err);
    return res.status(500).json({ message: 'Failed to verify subscription' });
  }
};

// ─── CAN CREATE MEETINGS ──────────────────────────────────────────────────────
exports.canCreateMeeting = (req, res, next) => {
  const role = req.user.role?.toLowerCase();
  if (!CREATOR_ROLES.includes(role)) {
    return res.status(403).json({ message: 'You do not have permission to create meetings.' });
  }
  next();
};

// ─── MODE GUARD ───────────────────────────────────────────────────────────────
// Attaches req.meetingMode — corporate roles get 'corporate', everything else
// gets the company's own mode (DB lookup for admin/hod/superadmin).
exports.attachMode = async (req, res, next) => {
  try {
    const role = req.user.role?.toLowerCase();
    if (CORPORATE_ROLES.includes(role)) {
      req.meetingMode = 'corporate';
      return next();
    }
    // For admin/hod/superadmin, use the company's registered mode
    if (['admin', 'superadmin', 'hod'].includes(role) && req.user.company) {
      const co = await Company.findById(req.user.company).select('mode').lean();
      req.meetingMode = co?.mode || 'academic';
      return next();
    }
    req.meetingMode = 'academic';
    next();
  } catch (_) {
    req.meetingMode = 'academic';
    next();
  }
};

// ─── MEETING OWNERSHIP GUARD ─────────────────────────────────────────────────
// Use after fetching meeting and attaching to req.meeting
exports.isOwner = (req, res, next) => {
  const meeting       = req.meeting;
  const role          = req.user.role?.toLowerCase();
  const isAdmin       = ['admin', 'superadmin', 'hod'].includes(role);
  const creatorId     = meeting.creatorId?._id ?? meeting.creatorId;
  const isCreator     = String(creatorId) === String(req.user._id);
  const isInvigilator = (meeting.invigilators || []).some(i => String(i?._id || i) === String(req.user._id));

  if (!isAdmin && !isCreator && !isInvigilator) {
    return res.status(403).json({ message: 'Only the meeting creator or an invigilator can perform this action.' });
  }
  next();
};

// ─── LOAD MEETING + COMPANY ISOLATION ────────────────────────────────────────
exports.loadMeeting = async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(404).json({ message: 'Meeting not found' });
    }
    const meeting = await Meeting.findOne({
      _id:      req.params.id,
      company:  req.user.company,
      isActive: true,
    }).populate('creatorId', 'name email');
    if (!meeting) {
      // Always return 404 — do not reveal whether a meeting exists in another tenant
      return res.status(404).json({ message: 'Meeting not found' });
    }
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
  const _creatorId = meeting.creatorId?._id ?? meeting.creatorId;
  if (String(_creatorId) === String(user._id)) return next();

  // Lecturers and managers are always hosts — they can join any meeting in their company
  if (['lecturer', 'manager'].includes(role)) return next();

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

  // Invigilators can also join
  const invigilators = (meeting.invigilators || []).map(String);
  if (invigilators.includes(user._id.toString())) return next();

  return res.status(403).json({ message: 'You are not assigned to this meeting.' });
};

// ─── IS MODERATOR GUARD ───────────────────────────────────────────────────────
// Passes for: meeting creator, invigilators, lecturer, manager, admin, superadmin, hod
exports.isModerator = (req, res, next) => {
  const meeting = req.meeting;
  const user    = req.user;
  const role    = (user.role || '').toLowerCase();

  const isModRole     = ['lecturer', 'manager', 'admin', 'superadmin', 'hod'].includes(role);
  const _modCreatorId = meeting.creatorId?._id ?? meeting.creatorId;
  const isCreator     = String(_modCreatorId) === String(user._id);
  const isInvigilator = (meeting.invigilators || []).some(i => i.toString() === user._id.toString());

  if (!isModRole && !isCreator && !isInvigilator) {
    return res.status(403).json({ message: 'Moderator or invigilator access required.' });
  }
  next();
};

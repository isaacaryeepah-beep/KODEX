const crypto       = require('crypto');
const Announcement = require('../models/Announcement');
const { getCompanyId } = require('../utils/controllerHelpers');
const notifSvc     = require('../services/notificationService');

// ---------------------------------------------------------------------------
// Resolve recipient IDs for an announcement based on its audience field.
// Returns an array of ObjectIds (may be empty).  Never throws — errors are
// logged and an empty array is returned so the main request is unaffected.
// ---------------------------------------------------------------------------
async function _resolveRecipientIds(announcement) {
  try {
    const User    = require('../models/User');
    const company = announcement.company;
    const audience = announcement.audience;

    const base = { company, isActive: { $ne: false } };

    switch (audience) {
      case 'all': {
        const users = await User.find(base).select('_id').lean();
        return users.map(u => u._id);
      }
      case 'students': {
        const users = await User.find({ ...base, role: 'student' }).select('_id').lean();
        return users.map(u => u._id);
      }
      case 'lecturers': {
        const users = await User.find({ ...base, role: 'lecturer' }).select('_id').lean();
        return users.map(u => u._id);
      }
      case 'employees': {
        const users = await User.find({ ...base, role: 'employee' }).select('_id').lean();
        return users.map(u => u._id);
      }
      case 'hod': {
        const users = await User.find({ ...base, role: 'hod' }).select('_id').lean();
        return users.map(u => u._id);
      }
      case 'department': {
        if (!announcement.targetDepartment) return [];
        const users = await User.find({ ...base, department: announcement.targetDepartment }).select('_id').lean();
        return users.map(u => u._id);
      }
      case 'programme': {
        if (!announcement.targetProgramme) return [];
        const users = await User.find({ ...base, role: 'student', programme: announcement.targetProgramme }).select('_id').lean();
        return users.map(u => u._id);
      }
      case 'course': {
        if (!announcement.targetCourse) return [];
        const Course = require('../models/Course');
        const course = await Course.findById(announcement.targetCourse).select('enrolledStudents').lean();
        return course?.enrolledStudents || [];
      }
      case 'level': {
        if (!announcement.targetLevel) return [];
        const users = await User.find({ ...base, role: 'student', studentLevel: announcement.targetLevel }).select('_id').lean();
        return users.map(u => u._id);
      }
      case 'group': {
        if (!announcement.targetGroup) return [];
        const users = await User.find({ ...base, role: 'student', studentGroup: announcement.targetGroup }).select('_id').lean();
        return users.map(u => u._id);
      }
      case 'studyType': {
        if (!announcement.targetStudyType) return [];
        const users = await User.find({ ...base, role: 'student', studyType: announcement.targetStudyType }).select('_id').lean();
        return users.map(u => u._id);
      }
      case 'qualificationType': {
        if (!announcement.targetQualificationType) return [];
        const users = await User.find({ ...base, role: 'student', qualificationType: announcement.targetQualificationType }).select('_id').lean();
        return users.map(u => u._id);
      }
      case 'class_group': {
        const cg = announcement.classGroup || {};
        const q = { ...base, role: 'student' };
        if (cg.studentLevel) q.studentLevel = cg.studentLevel;
        if (cg.studentGroup) q.studentGroup = cg.studentGroup;
        if (cg.programme)    q.programme    = cg.programme;
        const users = await User.find(q).select('_id').lean();
        return users.map(u => u._id);
      }
      default:
        return [];
    }
  } catch (err) {
    console.error('[announcement] _resolveRecipientIds error:', err.message);
    return [];
  }
}

// ─── POST /announcements ──────────────────────────────────────────────────────
exports.createAnnouncement = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const {
      title, body, type, audience,
      targetDepartment, targetProgramme, targetCourse,
      targetLevel, targetGroup, targetStudyType, targetQualificationType,
      publishAt, expiresAt, pinned,
      courseId,
      classGroup,
    } = req.body;

    if (!title || !body) {
      return res.status(400).json({ success: false, message: 'Title and body are required.' });
    }

    // Build attachment — file bytes stored in MongoDB, no disk dependency
    let attachment = null;
    if (req.file) {
      const fileName = `ann_${crypto.randomBytes(12).toString('hex')}`;
      attachment = {
        fileName,
        originalName:    req.file.originalname,
        fileUrl:         `/api/announcements/attachment/${fileName}`,
        mimeType:        req.file.mimetype,
        fileSize:        req.file.size,
        storageProvider: 'db',
        data:            req.file.buffer,
      };
    }

    // Class reps can only post to their class group
    const isClassRep = req.user.isClassRep;
    const finalAudience = isClassRep ? 'class_group' : (audience || 'all');
    const finalClassGroup = isClassRep ? {
      studentLevel: req.user.studentLevel  || null,
      studentGroup: req.user.studentGroup  || null,
      sessionType:  req.user.sessionType   || null,
      semester:     req.user.semester      || null,
      programme:    req.user.programme     || null,
    } : (classGroup || null);

    const announcement = await Announcement.create({
      title:                   title.trim(),
      body:                    body.trim(),
      company:                 companyId,
      author:                  req.user._id,
      authorRole:              req.user.role,
      type:                    type        || 'info',
      audience:                finalAudience,
      classGroup:              finalClassGroup,
      targetDepartment:        isClassRep ? null : (targetDepartment || null),
      targetProgramme:         isClassRep ? null : (targetProgramme  || null),
      targetCourse:            isClassRep ? null : (targetCourse || courseId || null),
      targetLevel:             targetLevel             || null,
      targetGroup:             targetGroup             || null,
      targetStudyType:         targetStudyType         || null,
      targetQualificationType: targetQualificationType || null,
      publishAt:               publishAt   ? new Date(publishAt)  : null,
      expiresAt:               expiresAt   ? new Date(expiresAt)  : null,
      pinned:                  pinned === true || pinned === 'true',
      attachment,
    });

    await announcement.populate('author', 'name email role');

    // Fire-and-forget: push popup notification to every recipient via SSE
    const authorId = req.user._id.toString();
    _resolveRecipientIds(announcement)
      .then(ids => {
        // Exclude the author (they just created it — no need to notify themselves)
        const recipients = ids.filter(id => id.toString() !== authorId);
        if (recipients.length > 0) {
          notifSvc.notifyRecipients(announcement, recipients);
        }
      })
      .catch(err => console.error('[announcement notify]', err.message));

    return res.status(201).json({
      success: true,
      message: 'Announcement posted.',
      data:    announcement,
    });
  } catch (err) {
    console.error('[createAnnouncement]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /announcements ───────────────────────────────────────────────────────
exports.listAnnouncements = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const role      = req.user.role;
    const now       = new Date();

    const query = {
      company:  companyId,
      isActive: true,
      $and: [
        { $or: [{ publishAt: null }, { publishAt: { $lte: now } }] },
        { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
      ],
    };

    // Audience scoping — pushed into $and so it doesn't clobber the date filters
    let audienceFilter = null;
    if (role === 'student') {
      // Include course-level announcements for enrolled courses
      const Course = require('../models/Course');
      const enrolledCourses = await Course.find({
        company: companyId,
        enrolledStudents: req.user._id,
      }).select('_id').lean();
      const enrolledIds = enrolledCourses.map(c => c._id);

      audienceFilter = [
        { audience: 'all' },
        { audience: 'students' },
        { audience: 'department', targetDepartment: req.user.department },
        { audience: 'level',     targetLevel:       req.user.studentLevel },
        { audience: 'group',     targetGroup:       req.user.studentGroup },
        { audience: 'studyType', targetStudyType:   req.user.studyType },
        { audience: 'qualificationType', targetQualificationType: req.user.qualificationType },
        { audience: 'course', targetCourse: { $in: enrolledIds } },
        {
          audience: 'class_group',
          'classGroup.studentLevel': req.user.studentLevel || null,
          'classGroup.studentGroup': req.user.studentGroup || null,
          'classGroup.programme':    req.user.programme    || null,
        },
      ];
    } else if (role === 'employee') {
      audienceFilter = [
        { audience: 'all' },
        { audience: 'employees' },
      ];
    } else if (role === 'lecturer') {
      audienceFilter = [
        { audience: 'all' },
        { audience: 'lecturers' },
        { audience: 'students' },
        { audience: 'department', targetDepartment: req.user.department },
      ];
    } else if (role === 'hod') {
      audienceFilter = [
        { audience: 'all' },
        { audience: 'hod' },
        { audience: 'lecturers' },
        { audience: 'students' },
        { audience: 'department', targetDepartment: req.user.department },
      ];
    }
    if (audienceFilter) query.$and.push({ $or: audienceFilter });
    // admin / superadmin: see all

    const announcements = await Announcement.find(query)
      .sort({ pinned: -1, createdAt: -1 })
      .select('-attachment.data')
      .populate('author', 'name email role')
      .lean();

    // Mark which ones the user has read
    const result = announcements.map(a => ({
      ...a,
      isRead:      (a.readBy || []).some(id => id.toString() === req.user._id.toString()),
      readCount:   (a.readBy || []).length,
    }));

    return res.json({ success: true, announcements: result });
  } catch (err) {
    console.error('[listAnnouncements]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /announcements/unread-count ─────────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const now       = new Date();

    const count = await Announcement.countDocuments({
      company:  companyId,
      isActive: true,
      readBy:   { $ne: req.user._id },
      $or: [{ publishAt: null }, { publishAt: { $lte: now } }],
      $and: [{ $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }],
    });

    return res.json({ success: true, count });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /announcements/:id ───────────────────────────────────────────────────
exports.getAnnouncement = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const ann = await Announcement.findOne({ _id: req.params.id, company: companyId })
      .select('-attachment.data')
      .populate('author', 'name email role')
      .lean();

    if (!ann) {
      return res.status(404).json({ success: false, message: 'Announcement not found.' });
    }

    return res.json({ success: true, data: ann });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PATCH /announcements/:id/read ────────────────────────────────────────────
exports.markRead = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    await Announcement.updateOne(
      { _id: req.params.id, company: companyId },
      { $addToSet: { readBy: req.user._id } }
    );
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── PATCH /announcements/:id/pin ─────────────────────────────────────────────
exports.togglePin = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const ann = await Announcement.findOne({ _id: req.params.id, company: companyId });
    if (!ann) return res.status(404).json({ success: false, message: 'Not found.' });
    ann.pinned = !ann.pinned;
    await ann.save();
    return res.json({ success: true, pinned: ann.pinned });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── DELETE /announcements/:id ────────────────────────────────────────────────
exports.deleteAnnouncement = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const ann = await Announcement.findOne({ _id: req.params.id, company: companyId });
    if (!ann) return res.status(404).json({ success: false, message: 'Not found.' });

    // Only the creator, admin, or superadmin can delete
    const isCreator = ann.author.toString() === req.user._id.toString();
    const isAdmin   = ['admin', 'superadmin'].includes(req.user.role);
    if (!isCreator && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'You can only delete your own announcements.',
      });
    }

    await ann.deleteOne();
    return res.json({ success: true, message: 'Announcement deleted.' });
  } catch (err) {
    console.error('[deleteAnnouncement]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /announcements/attachment/:filename ──────────────────────────────────
exports.serveAttachment = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { filename } = req.params;

    const ann = await Announcement.findOne({
      company:               companyId,
      'attachment.fileName': filename,
    });

    if (!ann?.attachment?.data) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    res.setHeader('Content-Type', ann.attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${ann.attachment.originalName}"`);
    return res.send(ann.attachment.data);
  } catch (err) {
    console.error('[serveAttachment]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /announcements/attachment/:filename/download ─────────────────────────
exports.downloadAttachment = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { filename } = req.params;

    const ann = await Announcement.findOne({
      company:               companyId,
      'attachment.fileName': filename,
    });

    if (!ann?.attachment?.data) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    res.setHeader('Content-Type', ann.attachment.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${ann.attachment.originalName}"`);
    return res.send(ann.attachment.data);
  } catch (err) {
    console.error('[downloadAttachment]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

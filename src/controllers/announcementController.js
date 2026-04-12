const fs           = require('fs');
const path         = require('path');
const Announcement = require('../models/Announcement');
const { UPLOAD_DIR } = require('../middleware/announcementUpload');

function getCompanyId(req) {
  return req.user.company || req.user.companyId;
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
    } = req.body;

    if (!title || !body) {
      // Clean up uploaded file if validation fails
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, message: 'Title and body are required.' });
    }

    // Build attachment metadata if file was uploaded
    let attachment = null;
    if (req.file) {
      const baseUrl = process.env.SERVER_URL || 'https://kodex.it.com';
      attachment = {
        fileName:        req.file.filename,
        originalName:    req.file.originalname,
        fileUrl:         `${baseUrl}/api/announcements/attachment/${req.file.filename}`,
        mimeType:        req.file.mimetype,
        fileSize:        req.file.size,
        storageProvider: 'local',
      };
    }

    const announcement = await Announcement.create({
      title:                   title.trim(),
      body:                    body.trim(),
      company:                 companyId,
      author:                  req.user._id,
      authorRole:              req.user.role,
      type:                    type        || 'info',
      audience:                audience    || 'all',
      targetDepartment:        targetDepartment        || null,
      targetProgramme:         targetProgramme         || null,
      targetCourse:            targetCourse            || null,
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

    return res.status(201).json({
      success: true,
      message: 'Announcement posted.',
      data:    announcement,
    });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
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
      $or: [
        { publishAt: null },
        { publishAt: { $lte: now } },
      ],
      $and: [
        {
          $or: [
            { expiresAt: null },
            { expiresAt: { $gt: now } },
          ],
        },
      ],
    };

    // Audience scoping
    if (role === 'student') {
      query.$or = [
        { audience: 'all' },
        { audience: 'students' },
        { audience: 'department', targetDepartment: req.user.department },
        { audience: 'level',     targetLevel:       req.user.studentLevel },
        { audience: 'group',     targetGroup:       req.user.studentGroup },
        { audience: 'studyType', targetStudyType:   req.user.studyType },
        { audience: 'qualificationType', targetQualificationType: req.user.qualificationType },
      ];
    } else if (role === 'employee') {
      query.$or = [
        { audience: 'all' },
        { audience: 'employees' },
      ];
    } else if (role === 'lecturer') {
      query.$or = [
        { audience: 'all' },
        { audience: 'lecturers' },
        { audience: 'department', targetDepartment: req.user.department },
      ];
    } else if (role === 'hod') {
      query.$or = [
        { audience: 'all' },
        { audience: 'hod' },
        { audience: 'lecturers' },
        { audience: 'department', targetDepartment: req.user.department },
      ];
    }
    // admin / superadmin: see all

    const announcements = await Announcement.find(query)
      .sort({ pinned: -1, createdAt: -1 })
      .populate('author', 'name email role')
      .lean();

    // Mark which ones the user has read
    const result = announcements.map(a => ({
      ...a,
      isRead:      (a.readBy || []).some(id => id.toString() === req.user._id.toString()),
      readCount:   (a.readBy || []).length,
    }));

    return res.json({ success: true, data: result });
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

    // Clean up uploaded file if it exists
    if (ann.attachment?.fileName) {
      const filePath = path.join(UPLOAD_DIR, ann.attachment.fileName);
      fs.unlink(filePath, () => {}); // non-fatal
    }

    await ann.deleteOne();
    return res.json({ success: true, message: 'Announcement deleted.' });
  } catch (err) {
    console.error('[deleteAnnouncement]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// ─── GET /announcements/attachment/:filename ──────────────────────────────────
// Secure PDF serving — only authenticated users of same company
exports.serveAttachment = async (req, res) => {
  try {
    const companyId = getCompanyId(req);
    const { filename } = req.params;

    // Find announcement with this attachment in same company
    const ann = await Announcement.findOne({
      company:                 companyId,
      'attachment.fileName':   filename,
      isActive:                true,
    }).lean();

    if (!ann) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    const filePath = path.join(process.cwd(), UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on disk.' });
    }

    res.setHeader('Content-Type', ann.attachment.mimeType || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${ann.attachment.originalName}"`);
    return res.sendFile(filePath);
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
      isActive:              true,
    }).lean();

    if (!ann) {
      return res.status(404).json({ success: false, message: 'File not found.' });
    }

    const filePath = path.join(process.cwd(), UPLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on disk.' });
    }

    return res.download(filePath, ann.attachment.originalName);
  } catch (err) {
    console.error('[downloadAttachment]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

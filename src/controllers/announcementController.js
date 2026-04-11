const Announcement = require('../models/Announcement');
const { resolveRecipients } = require('../services/recipientService');
const { notifyRecipients }  = require('../services/notificationService');

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const isExpired = (ann) => ann.expiresAt && ann.expiresAt < new Date();

function buildListQuery(req) {
  const { companyId, user } = req;
  const { category, priority, pinned, status, unread, from, to, search } = req.query;

  // Base: company-isolated, published, visible to this user
  const q = {
    companyId,
    mode: req.announcementMode,
    status: status || 'published',
    publishAt: { $lte: new Date() },
    recipients: user._id
  };

  if (category)  q.category = category;
  if (priority)  q.priority = priority;
  if (pinned === 'true') q.isPinned = true;
  if (from || to) {
    q.createdAt = {};
    if (from) q.createdAt.$gte = new Date(from);
    if (to)   q.createdAt.$lte = new Date(to);
  }
  if (search) q.$or = [
    { title:   { $regex: search, $options: 'i' } },
    { message: { $regex: search, $options: 'i' } }
  ];
  if (unread === 'true') {
    q['readBy.userId'] = { $ne: user._id };
  }

  return q;
}

// ─── CREATE ──────────────────────────────────────────────────────────────────
exports.createAnnouncement = async (req, res) => {
  try {
    const {
      title, message, category, priority, status,
      targetType, targetRoles, targetDepartments, targetCourses, targetUserIds,
      isPinned, publishAt, expiresAt
    } = req.body;

    // Resolve recipients
    let recipients;
    try {
      recipients = await resolveRecipients({
        companyId: req.companyId,
        mode: req.announcementMode,
        targetType,
        targetRoles,
        targetDepartments,
        targetCourses,
        targetUserIds
      });
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    // Handle attachment
    let attachment;
    if (req.file) {
      attachment = {
        originalName: req.file.originalname,
        fileName:     req.file.filename,
        mimeType:     req.file.mimetype,
        size:         req.file.size,
        url:          `/uploads/announcements/${req.file.filename}`
      };
    }

    const announcement = await Announcement.create({
      title, message, category,
      priority:    priority || 'normal',
      status:      status   || 'published',
      companyId:   req.companyId,
      mode:        req.announcementMode,
      createdBy:   req.user._id,
      creatorRole: req.user.role,
      targetType,
      targetRoles:       targetRoles       || [],
      targetDepartments: targetDepartments || [],
      targetCourses:     targetCourses     || [],
      targetUserIds:     targetUserIds     || [],
      recipients,
      isPinned: isPinned && priority !== 'normal' ? isPinned : false,
      publishAt: publishAt ? new Date(publishAt) : new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : undefined,
      attachment
    });

    // Notify asynchronously — don't block response
    notifyRecipients(announcement, recipients).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Announcement created',
      data: announcement
    });
  } catch (err) {
    console.error('[createAnnouncement]', err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET ALL (for current user) ───────────────────────────────────────────────
exports.getAnnouncements = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const q = buildListQuery(req);

    const [announcements, total] = await Promise.all([
      Announcement.find(q)
        .sort({ isPinned: -1, priority: -1, publishAt: -1 })
        .skip(skip).limit(limit)
        .populate('createdBy', 'name email role')
        .lean({ virtuals: true }),
      Announcement.countDocuments(q)
    ]);

    // Attach per-user read status
    const userId = req.user._id.toString();
    const result = announcements.map(a => ({
      ...a,
      isRead: a.readBy?.some(r => r.userId?.toString() === userId),
      isExpired: a.expiresAt ? a.expiresAt < new Date() : false
    }));

    res.json({
      success: true,
      data: result,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── DASHBOARD (latest 3 + pinned) ───────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const now = new Date();
    const base = {
      companyId: req.companyId,
      mode: req.announcementMode,
      status: 'published',
      publishAt: { $lte: now },
      recipients: req.user._id,
      $or: [{ expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }]
    };

    const [pinned, latest, unreadCount] = await Promise.all([
      Announcement.find({ ...base, isPinned: true })
        .sort({ publishAt: -1 }).limit(5)
        .populate('createdBy', 'name role').lean({ virtuals: true }),

      Announcement.find(base)
        .sort({ priority: -1, publishAt: -1 }).limit(3)
        .populate('createdBy', 'name role').lean({ virtuals: true }),

      Announcement.countDocuments({
        ...base,
        'readBy.userId': { $ne: req.user._id }
      })
    ]);

    const userId = req.user._id.toString();
    const tag = (list) => list.map(a => ({
      ...a,
      isRead: a.readBy?.some(r => r.userId?.toString() === userId)
    }));

    res.json({
      success: true,
      data: {
        pinned:      tag(pinned),
        latest:      tag(latest),
        unreadCount
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── GET ONE ─────────────────────────────────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const ann = await Announcement.findOne({
      _id: req.params.id,
      companyId: req.companyId,
      recipients: req.user._id
    }).populate('createdBy', 'name email role');

    if (!ann) return res.status(404).json({ message: 'Announcement not found' });

    const userId = req.user._id.toString();
    res.json({
      success: true,
      data: {
        ...ann.toJSON(),
        isRead: ann.readBy.some(r => r.userId?.toString() === userId)
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── UPDATE ───────────────────────────────────────────────────────────────────
exports.updateAnnouncement = async (req, res) => {
  try {
    const ann = await Announcement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!ann) return res.status(404).json({ message: 'Announcement not found' });

    const role = req.user.role?.toLowerCase();
    const isAdmin = ['admin', 'hod', 'superadmin', 'manager'].includes(role);
    if (!isAdmin && ann.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only modify your own announcements' });
    }

    const allowed = ['title', 'message', 'category', 'priority', 'status', 'expiresAt', 'publishAt'];
    allowed.forEach(f => { if (req.body[f] !== undefined) ann[f] = req.body[f]; });

    await ann.save();
    res.json({ success: true, message: 'Announcement updated', data: ann });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── DELETE ───────────────────────────────────────────────────────────────────
exports.deleteAnnouncement = async (req, res) => {
  try {
    const ann = await Announcement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!ann) return res.status(404).json({ message: 'Announcement not found' });

    const role = req.user.role?.toLowerCase();
    const isAdmin = ['admin', 'hod', 'superadmin', 'manager'].includes(role);
    if (!isAdmin && ann.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only delete your own announcements' });
    }

    await ann.deleteOne();
    res.json({ success: true, message: 'Announcement deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── PIN ─────────────────────────────────────────────────────────────────────
exports.pinAnnouncement = async (req, res) => {
  try {
    const ann = await Announcement.findOne({ _id: req.params.id, companyId: req.companyId });
    if (!ann) return res.status(404).json({ message: 'Announcement not found' });
    if (isExpired(ann)) return res.status(400).json({ message: 'Expired announcements cannot be pinned' });

    ann.isPinned = true;
    ann.pinnedAt = new Date();
    ann.pinnedBy = req.user._id;
    await ann.save();

    res.json({ success: true, message: 'Announcement pinned' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── UNPIN ───────────────────────────────────────────────────────────────────
exports.unpinAnnouncement = async (req, res) => {
  try {
    const ann = await Announcement.findOneAndUpdate(
      { _id: req.params.id, companyId: req.companyId },
      { isPinned: false, pinnedAt: null, pinnedBy: null },
      { new: true }
    );
    if (!ann) return res.status(404).json({ message: 'Announcement not found' });
    res.json({ success: true, message: 'Announcement unpinned' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── MARK READ ───────────────────────────────────────────────────────────────
exports.markRead = async (req, res) => {
  try {
    const ann = await Announcement.findOne({
      _id: req.params.id,
      companyId: req.companyId,
      recipients: req.user._id
    });
    if (!ann) return res.status(404).json({ message: 'Announcement not found' });

    const alreadyRead = ann.readBy.some(r => r.userId?.toString() === req.user._id.toString());
    if (alreadyRead) return res.json({ success: true, message: 'Already marked as read' });

    ann.readBy.push({ userId: req.user._id, readAt: new Date() });
    await ann.save();

    res.json({ success: true, message: 'Marked as read' });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── READ STATS (creator/admin only) ─────────────────────────────────────────
exports.getReadStats = async (req, res) => {
  try {
    const ann = await Announcement.findOne({ _id: req.params.id, companyId: req.companyId })
      .populate('readBy.userId', 'name email role')
      .populate('recipients', 'name email role');

    if (!ann) return res.status(404).json({ message: 'Announcement not found' });

    const role = req.user.role?.toLowerCase();
    const isAdmin = ['admin', 'hod', 'superadmin', 'manager'].includes(role);
    if (!isAdmin && ann.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Not authorized to view read stats' });
    }

    res.json({
      success: true,
      data: {
        title:          ann.title,
        totalRecipients: ann.recipients.length,
        readCount:       ann.readBy.length,
        unreadCount:     ann.recipients.length - ann.readBy.length,
        readBy:          ann.readBy
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── ARCHIVE ─────────────────────────────────────────────────────────────────
exports.getArchive = async (req, res) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const q = {
      companyId: req.companyId,
      mode: req.announcementMode,
      recipients: req.user._id,
      $or: [
        { status: 'archived' },
        { expiresAt: { $lt: new Date() } }
      ]
    };

    const [data, total] = await Promise.all([
      Announcement.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit)
        .populate('createdBy', 'name role').lean({ virtuals: true }),
      Announcement.countDocuments(q)
    ]);

    res.json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ─── UNREAD COUNT ─────────────────────────────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
  try {
    const now = new Date();
    const count = await Announcement.countDocuments({
      companyId: req.companyId,
      mode: req.announcementMode,
      status: 'published',
      publishAt: { $lte: now },
      recipients: req.user._id,
      $or: [{ expiresAt: { $gt: now } }, { expiresAt: { $exists: false } }],
      'readBy.userId': { $ne: req.user._id }
    });

    res.json({ success: true, unreadCount: count });
  } catch (err) {
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

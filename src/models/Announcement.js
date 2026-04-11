const mongoose = require('mongoose');

const readEntrySchema = new mongoose.Schema({
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  readAt:   { type: Date, default: Date.now }
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
  originalName: String,
  fileName:     String,
  mimeType:     String,
  size:         Number,
  url:          String
}, { _id: false });

const announcementSchema = new mongoose.Schema({
  // Core
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  message:     { type: String, required: true, trim: true },
  category: {
    type: String,
    required: true,
    enum: [
      'General Notice',
      'Attendance Alert',
      'Meeting Announcement',
      'Emergency Alert',
      'Subscription Alert',
      'Academic Update',
      'Corporate Update'
    ]
  },
  priority: {
    type: String,
    enum: ['normal', 'important', 'urgent'],
    default: 'normal'
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'published'
  },

  // Tenant & mode isolation
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  mode:      { type: String, enum: ['academic', 'corporate'], required: true },

  // Creator
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  creatorRole: { type: String, required: true },

  // Targeting
  targetType: {
    type: String,
    enum: ['all', 'role', 'department', 'course', 'individual'],
    required: true
  },
  targetRoles:       [{ type: String }],
  targetDepartments: [{ type: String }],
  targetCourses:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],
  targetUserIds:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Resolved recipients (populated on create)
  recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Read tracking
  readBy: [readEntrySchema],

  // Pinning
  isPinned:  { type: Boolean, default: false },
  pinnedAt:  { type: Date },
  pinnedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Scheduling & expiry
  publishAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },

  // Attachment
  attachment: attachmentSchema

}, { timestamps: true });

// Auto-unpin expired announcements on read
announcementSchema.pre('save', function (next) {
  if (this.isPinned && this.expiresAt && this.expiresAt < new Date()) {
    this.isPinned = false;
  }
  next();
});

// Virtual: total recipients count
announcementSchema.virtual('totalRecipients').get(function () {
  return this.recipients.length;
});

// Virtual: read count
announcementSchema.virtual('readCount').get(function () {
  return this.readBy.length;
});

// Virtual: unread count
announcementSchema.virtual('unreadCount').get(function () {
  return this.recipients.length - this.readBy.length;
});

// Virtual: is expired
announcementSchema.virtual('isExpired').get(function () {
  return this.expiresAt ? this.expiresAt < new Date() : false;
});

announcementSchema.set('toJSON', { virtuals: true });
announcementSchema.set('toObject', { virtuals: true });

// Indexes
announcementSchema.index({ companyId: 1, status: 1, publishAt: -1 });
announcementSchema.index({ companyId: 1, isPinned: 1 });
announcementSchema.index({ recipients: 1 });
announcementSchema.index({ expiresAt: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);

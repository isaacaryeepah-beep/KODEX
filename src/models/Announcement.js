const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  fileName:        { type: String, required: true },
  originalName:    { type: String, required: true },
  fileUrl:         { type: String, required: true },
  mimeType:        { type: String, required: true },
  fileSize:        { type: Number, required: true },
  storageProvider: { type: String, default: 'local' },
  uploadedAt:      { type: Date, default: Date.now },
}, { _id: false });

const announcementSchema = new mongoose.Schema({

  // ── Core ──────────────────────────────────────────────────────────────────
  title:    { type: String, required: true, trim: true, maxlength: 300 },
  body:     { type: String, required: true, trim: true },

  // ── Tenant ────────────────────────────────────────────────────────────────
  company:  { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },

  // ── Creator audit ─────────────────────────────────────────────────────────
  author:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorRole:  { type: String, required: true },
  updatedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ── Audience targeting ────────────────────────────────────────────────────
  audience: {
    type: String,
    enum: [
      'all',
      'students',
      'lecturers',
      'employees',
      'hod',
      'department',
      'programme',
      'course',
      'level',
      'studyType',
      'qualificationType',
      'group',
    ],
    default: 'all',
  },

  // ── Scoping filters (optional — used when audience is specific) ───────────
  targetDepartment:        { type: String, default: null },
  targetProgramme:         { type: String, default: null },
  targetCourse:            { type: mongoose.Schema.Types.ObjectId, ref: 'Course', default: null },
  targetLevel:             { type: String, default: null },
  targetGroup:             { type: String, default: null },
  targetStudyType:         { type: String, default: null },
  targetQualificationType: { type: String, default: null },

  // ── Announcement type ─────────────────────────────────────────────────────
  type: {
    type: String,
    enum: ['info', 'warning', 'success', 'urgent'],
    default: 'info',
  },

  // ── PDF attachment (single for now, array-ready for future) ───────────────
  attachment: { type: attachmentSchema, default: null },

  // ── Scheduling ────────────────────────────────────────────────────────────
  publishAt:  { type: Date, default: null },
  expiresAt:  { type: Date, default: null },

  // ── State ────────────────────────────────────────────────────────────────
  pinned:   { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

  // ── Read tracking (lightweight) ───────────────────────────────────────────
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

}, { timestamps: true });

announcementSchema.index({ company: 1, audience: 1, isActive: 1 });
announcementSchema.index({ company: 1, createdAt: -1 });
announcementSchema.index({ company: 1, pinned: -1, createdAt: -1 });
announcementSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, sparse: true });

module.exports = mongoose.model('Announcement', announcementSchema);

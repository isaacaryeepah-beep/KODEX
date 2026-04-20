const mongoose = require('mongoose');

// ─── Attachment sub-schema (future-ready for multiple) ────────────────────────
const attachmentSchema = new mongoose.Schema({
  fileName:        { type: String },
  originalName:    { type: String },
  fileUrl:         { type: String },
  mimeType:        { type: String },
  fileSize:        { type: Number },
  storageProvider: { type: String, default: 'local' },
  uploadedAt:      { type: Date, default: Date.now },
}, { _id: false });

// ─── Main Course Schema ───────────────────────────────────────────────────────
const courseSchema = new mongoose.Schema({

  // ── Core ──────────────────────────────────────────────────────────────────
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  code:        { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
  description: { type: String, trim: true, default: '' },

  // ── Tenant isolation ──────────────────────────────────────────────────────
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },

  // ── Academic ownership (optional — no HOD/department enforcement) ─────────
  departmentId: { type: String, trim: true, default: null },
  programmeId:  { type: String, trim: true, default: null },

  // ── Qualification & study classification ──────────────────────────────────
  qualificationType: {
    type: String,
    trim: true,
    enum: ['BSc', 'HND', 'Diploma', 'Certificate', 'MSc', 'MPhil', 'PhD', 'Top-Up', 'Other', null],
    default: null,
  },
  customQualificationLabel: { type: String, trim: true, default: null },

  studyType: {
    type: String,
    trim: true,
    enum: ['Regular', 'Evening', 'Weekend', 'Distance', 'Sandwich', 'Part-Time', 'Full-Time', null],
    default: null,
  },

  // ── Lecturer / creator ────────────────────────────────────────────────────
  lecturerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ── Academic calendar ─────────────────────────────────────────────────────
  academicYear: { type: String, trim: true, default: null }, // e.g. "2024/2025"
  semester:     { type: String, trim: true, default: null }, // e.g. "1", "2", "First Semester"

  // ── Student classification ────────────────────────────────────────────────
  level:       { type: String, trim: true, default: null }, // e.g. "100", "200", "300"
  group:       { type: String, trim: true, default: null }, // e.g. "A", "B", "C"
  sessionType: { type: String, trim: true, default: null }, // legacy alias for studyType

  // ── Enrollment ────────────────────────────────────────────────────────────
  enrolledStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // ── Status / lifecycle ────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['active', 'completed', 'archived', 'suspended'],
    default: 'active',
  },
  isArchived: { type: Boolean, default: false },
  isActive:   { type: Boolean, default: true },

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
// Strong academic uniqueness — allows same code across semesters, years, groups
// sparse:true means null fields don't conflict
courseSchema.index(
  { companyId: 1, code: 1, academicYear: 1, semester: 1, level: 1, group: 1, qualificationType: 1, studyType: 1 },
  { unique: true, sparse: true, name: 'academic_unique_compound' }
);
courseSchema.index({ companyId: 1, lecturerId: 1 });
courseSchema.index({ companyId: 1, departmentId: 1 });
courseSchema.index({ companyId: 1, status: 1 });
courseSchema.index({ companyId: 1, isActive: 1 });
courseSchema.index({ enrolledStudents: 1 });
courseSchema.index({ companyId: 1, qualificationType: 1, studyType: 1 });

module.exports = mongoose.model('Course', courseSchema);

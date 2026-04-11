const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  // ── Core ──────────────────────────────────────────────────────────────────
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  code:        { type: String, required: true, trim: true, uppercase: true, maxlength: 30 },
  description: { type: String, trim: true, default: '' },

  // ── Tenant isolation ──────────────────────────────────────────────────────
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },

  // ── Academic ownership ────────────────────────────────────────────────────
  departmentId: { type: String, trim: true, default: null }, // e.g. "Computer Science"
  programmeId:  { type: String, trim: true, default: null }, // e.g. "BSc", "HND"

  // ── Lecturer ──────────────────────────────────────────────────────────────
  lecturerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // ── Academic calendar ─────────────────────────────────────────────────────
  academicYear: { type: String, trim: true, default: null }, // e.g. "2024/2025"
  semester:     { type: String, trim: true, default: null }, // e.g. "1", "2"

  // ── Student classification ────────────────────────────────────────────────
  level:       { type: String, trim: true, default: null }, // e.g. "100", "200"
  group:       { type: String, trim: true, default: null }, // e.g. "A", "B"
  sessionType: { type: String, trim: true, default: null }, // e.g. "Regular", "Evening"

  // ── Enrollment ────────────────────────────────────────────────────────────
  // Real registered user accounts linked to this course
  enrolledStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // ── Status / lifecycle ────────────────────────────────────────────────────
  status: {
    type: String,
    enum: ['active', 'completed', 'archived', 'suspended'],
    default: 'active'
  },
  isArchived: { type: Boolean, default: false },
  isActive:   { type: Boolean, default: true },

}, { timestamps: true });

// ── Indexes ───────────────────────────────────────────────────────────────────
// Strong academic uniqueness: same code can exist across semesters/years/groups
courseSchema.index(
  { companyId: 1, code: 1, academicYear: 1, semester: 1, level: 1, group: 1 },
  { unique: true, sparse: true, name: 'academic_unique' }
);
courseSchema.index({ companyId: 1, lecturerId: 1 });
courseSchema.index({ companyId: 1, departmentId: 1 });
courseSchema.index({ companyId: 1, status: 1 });
courseSchema.index({ companyId: 1, isActive: 1 });
courseSchema.index({ enrolledStudents: 1 });

module.exports = mongoose.model('Course', courseSchema);

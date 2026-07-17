const mongoose = require('mongoose');

const courseVideoSchema = new mongoose.Schema({
  courseId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
  companyId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  addedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  url:         { type: String, required: true, trim: true },
  embedUrl:    { type: String, required: true },
  thumbnail:   { type: String, default: '' },
  platform:    { type: String, enum: ['youtube', 'vimeo', 'googledrive', 'loom', 'other'], default: 'other' },
  order:          { type: Number, default: 0 },
  targetAudience: { type: String, default: 'All Students' },
}, { timestamps: true });

courseVideoSchema.index({ courseId: 1, order: 1 });
// The "my-courses videos" endpoint (courseVideoController.js) filters by
// companyId alone and sorts {courseId, order, createdAt} -- no prior index
// even started with companyId, so it sorted every video in the company
// in memory on each load.
courseVideoSchema.index({ companyId: 1, courseId: 1, order: 1, createdAt: 1 });

module.exports = mongoose.model('CourseVideo', courseVideoSchema);

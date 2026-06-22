const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema({
  trialDays:            { type: Number, default: 30  },
  academicPrice:        { type: Number, default: 300 },
  corporatePrice:       { type: Number, default: 150 },
  currency:             { type: String, default: 'GHS' },
  // Per-user subscription pricing
  studentTrialDays:     { type: Number, default: 45 },
  studentSemesterPrice: { type: Number, default: 20 },
  employeeMonthlyPrice: { type: Number, default: 15 },
}, { timestamps: true });

// PlatformSettings is a singleton collection (no company field).
// Index by createdAt for admin dashboards.
platformSettingsSchema.index({ createdAt: -1 }, { background: true });

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);

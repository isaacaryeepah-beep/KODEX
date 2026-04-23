const mongoose = require('mongoose');

const platformSettingsSchema = new mongoose.Schema({
  trialDays:      { type: Number, default: 30 },
  academicPrice:  { type: Number, default: 300 },
  corporatePrice: { type: Number, default: 150 },
  currency:       { type: String, default: 'GHS' },
}, { timestamps: true });

module.exports = mongoose.model('PlatformSettings', platformSettingsSchema);

const mongoose = require('mongoose');

const signInRecordSchema = new mongoose.Schema({
  user:         { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true, index: true },
  company:      { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  checkInTime:  { type: Date, required: true },
  checkOutTime: { type: Date, default: null },
  source:       { type: String, enum: ['app', 'esp32', 'manual'], default: 'app' },
}, { timestamps: true });

signInRecordSchema.index({ company: 1, checkInTime: -1 });
signInRecordSchema.index({ user: 1, checkInTime: -1 });

module.exports = mongoose.model('SignInRecord', signInRecordSchema);

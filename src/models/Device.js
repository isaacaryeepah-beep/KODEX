const mongoose = require('mongoose');

const networkSchema = new mongoose.Schema({
  ssid:     { type: String, required: true, trim: true },
  password: { type: String, required: true },
  priority: { type: Number, default: 0 } // higher = try first
}, { _id: false });

const deviceSchema = new mongoose.Schema({
  // Identity
  // unique: true on the field already creates the index — no schema.index() needed
  deviceId:   { type: String, required: true, unique: true, trim: true },
  deviceName: { type: String, required: true, trim: true },

  // Tenant isolation
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },

  // ── STRICT OWNERSHIP ──────────────────────────────────────────────────────
  // unique: true on the field already creates the index — no schema.index() needed
  lecturerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  ownershipType:  { type: String, default: 'dedicated', enum: ['dedicated'] },
  isTransferable: { type: Boolean, default: false },
  // ─────────────────────────────────────────────────────────────────────────

  // Multi-WiFi support
  allowedNetworks: { type: [networkSchema], default: [] },

  // Allowed school WiFi subnets (e.g. ['192.168.1.', '10.0.0.'])
  allowedSubnets: { type: [String], default: [] },

  // Current state
  mode:           { type: String, enum: ['station', 'access_point', 'hybrid'], default: 'hybrid' },
  currentNetwork: { type: String, default: null },
  apSSID:         { type: String, default: null },
  status:         { type: String, enum: ['online', 'offline'], default: 'offline' },
  lastHeartbeat:  { type: Date, default: null },

  // Location
  assignedRoom:       { type: String, default: null },
  assignedDepartment: { type: String, default: null },

  // Meta
  isActive:    { type: Boolean, default: true },
  registeredAt: { type: Date, default: Date.now },
  token:       { type: String, default: null }

}, { timestamps: true });

// Auto-compute online status based on heartbeat threshold (10s)
deviceSchema.virtual('isOnline').get(function () {
  if (!this.lastHeartbeat) return false;
  return (Date.now() - this.lastHeartbeat.getTime()) < 10000;
});

deviceSchema.set('toJSON',   { virtuals: true });
deviceSchema.set('toObject', { virtuals: true });

// Only compound indexes here — deviceId and lecturerId unique indexes
// are already created by unique: true on the field definitions above
deviceSchema.index({ companyId: 1 });

module.exports = mongoose.model('Device', deviceSchema);

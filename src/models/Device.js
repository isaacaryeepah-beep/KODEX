const mongoose = require('mongoose');

const networkSchema = new mongoose.Schema({
  ssid:     { type: String, required: true, trim: true },
  password: { type: String, required: true },
  priority: { type: Number, default: 0 } // higher = try first
}, { _id: false });

const deviceSchema = new mongoose.Schema({
  // Identity
  deviceId:   { type: String, required: true, unique: true, trim: true },
  deviceName: { type: String, required: true, trim: true },

  // Tenant isolation
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },

  // ── STRICT OWNERSHIP ──────────────────────────────────────────────────────
  lecturerId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  ownershipType: { type: String, default: 'dedicated', enum: ['dedicated'] },
  isTransferable: { type: Boolean, default: false },
  // ─────────────────────────────────────────────────────────────────────────

  // Multi-WiFi support
  allowedNetworks: { type: [networkSchema], default: [] },

  // Current state
  mode:           { type: String, enum: ['station', 'access_point', 'hybrid'], default: 'hybrid' },
  currentNetwork: { type: String, default: null },
  apSSID:         { type: String, default: null }, // e.g. KODEX-ENG-DEPT
  status:         { type: String, enum: ['online', 'offline'], default: 'offline' },
  lastHeartbeat:  { type: Date, default: null },

  // Allowed subnets for IP check (e.g. ["10.0.0.", "172.16.0."])
  // 192.168.4.x (ESP32 AP) is always allowed automatically
  allowedSubnets: [{ type: String }],

  // Location
  assignedRoom:       { type: String, default: null },
  assignedDepartment: { type: String, default: null },

  // Meta
  isActive:    { type: Boolean, default: true },
  registeredAt: { type: Date, default: Date.now },
  token:       { type: String, default: null } // device auth token
}, { timestamps: true });

// Auto-compute online status based on heartbeat threshold (10s)
deviceSchema.virtual('isOnline').get(function () {
  if (!this.lastHeartbeat) return false;
  return (Date.now() - this.lastHeartbeat.getTime()) < 10000;
});

deviceSchema.set('toJSON', { virtuals: true });
deviceSchema.set('toObject', { virtuals: true });

deviceSchema.index({ companyId: 1 });
deviceSchema.index({ lecturerId: 1 }, { unique: true });
deviceSchema.index({ deviceId: 1 }, { unique: true });

module.exports = mongoose.model('Device', deviceSchema);

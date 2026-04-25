const mongoose = require("mongoose");
const crypto = require("crypto");

const TRIAL_DURATION_DAYS = 30;

function generateInstitutionCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(crypto.randomInt(chars.length));
  }
  return code;
}

/** Derive a URL-safe slug from a company name. */
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 64);
}

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Institution name is required"],
      unique: true,
      trim: true,
    },
    // Human-friendly display name used on portals, PDFs, and emails.
    // Defaults to `name` if not provided.
    displayName: {
      type: String,
      trim: true,
      default: null,
    },
    // URL-safe unique identifier. Auto-generated from name on first save.
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    institutionCode: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
    },
    mode: {
      type: String,
      enum: ["corporate", "academic", "both"],
      required: [true, "Institution mode is required"],
      default: "corporate",
    },
    // Primary contact details for the institution/company.
    contactEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },
    contactPhone: {
      type: String,
      trim: true,
      default: null,
    },
    address: {
      street:  { type: String, trim: true, default: null },
      city:    { type: String, trim: true, default: null },
      region:  { type: String, trim: true, default: null },
      country: { type: String, trim: true, default: "Ghana" },
    },
    // Academic-mode specific configuration.
    academicSettings: {
      // Supported programme types for this institution.
      programmeTypes: {
        type: [String],
        default: ["HND", "Diploma", "Degree", "BSc", "BTech", "Top-Up"],
      },
      // Supported session types (Morning, Evening, Weekend…).
      sessionTypes: {
        type: [String],
        default: ["Morning", "Afternoon", "Evening", "Weekend"],
      },
      // Number of semesters per academic year.
      semestersPerYear: { type: Number, default: 2 },
      // Whether ESP32 devices are required for attendance sessions.
      requireEsp32Attendance: { type: Boolean, default: false },
      // Whether students must be enrolled in a course to view its content.
      enforceEnrollment: { type: Boolean, default: true },
    },
    // Corporate-mode specific configuration.
    corporateSettings: {
      // Supported employment types.
      employmentTypes: {
        type: [String],
        default: ["full_time", "part_time", "contract", "intern", "probation"],
      },
      // Working hours per day used for overtime calculation.
      standardWorkHoursPerDay: { type: Number, default: 8 },
      // Whether geofence validation is required for clock-in.
      requireGeofence: { type: Boolean, default: false },
      // Whether managers can approve leave requests without HR.
      managerLeaveApproval: { type: Boolean, default: false },
      // Strict WiFi + GPS attendance enforcement
      strictAttendance:     { type: Boolean, default: false },
      allowedWifiIPs:       { type: [String], default: [] },
      officeLatitude:       { type: Number, default: null },
      officeLongitude:      { type: Number, default: null },
      geofenceRadiusMeters: { type: Number, default: 150 },
      // ── Clock-in / clock-out time windows ───────────────────────────────
      // Times stored as "HH:MM" 24-hour. If both start and end set, attempts
      // outside the window are rejected.
      clockInStart:  { type: String, default: null },   // e.g. "06:00"
      clockInEnd:    { type: String, default: null },   // e.g. "10:00"
      clockOutStart: { type: String, default: null },   // e.g. "16:00"
      clockOutEnd:   { type: String, default: null },   // e.g. "22:00"
    },
    subscriptionActive: {
      type: Boolean,
      default: false,
    },
    subscriptionStatus: {
      type: String,
      enum: ["active", "inactive", "trial", "expired", "past_due"],
      default: "trial",
    },
    subscriptionPlan: {
      type: String,
      enum: ["none", "monthly", "annual"],
      default: "none",
    },
    subscriptionProvider: {
      type: String,
      enum: ["none", "stripe", "paystack"],
      default: "none",
    },
    trialStartDate: {
      type: Date,
      default: Date.now,
    },
    trialEndDate: {
      type: Date,
      default: function () {
        return new Date(Date.now() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000);
      },
    },
    trialUsed: {
      type: Boolean,
      default: false,
    },
    paymentCustomerId: {
      type: String,
      default: null,
    },
    paymentSubscriptionId: {
      type: String,
      default: null,
    },
    // Paystack-specific tracking
    paystackCustomerCode:    { type: String, default: null },
    paystackSubscriptionCode:{ type: String, default: null },
    subscriptionStartDate:   { type: Date,   default: null },
    subscriptionEndDate:     { type: Date,   default: null },
    lastPaymentReference:    { type: String, default: null },
    lastPaymentAmount:       { type: Number, default: null },
    lastPaymentDate:         { type: Date,   default: null },
    nextBillingDate:         { type: Date,   default: null },
    nextEmployeeSeq: {
      type: Number,
      default: 0,
    },
    qrSeed: {
      type: String,
      default: null,
    },
    bleLocationId: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // ── DEPRECATED ESP32 fields ───────────────────────────────────────
    // Replaced by the per-lecturer Device model. No controller reads these
    // any more; they remain in the schema only so existing documents don't
    // produce strict-mode errors and so a future migration can drop them.
    esp32Devices:        { type: [mongoose.Schema.Types.Mixed], default: undefined, select: false },
    esp32PendingCommand: { type: mongoose.Schema.Types.Mixed,   default: undefined, select: false },
    esp32Required:       { type: Boolean, default: false },
    superadminNotes: {
      type: String,
      default: "",
    },
    // ── White-label Branding ──────────────────────────────────
    branding: {
      logoUrl:        { type: String, default: "" },
      primaryColor:   { type: String, default: "#6366f1" },
      accentColor:    { type: String, default: "#4f46e5" },
      companyTagline: { type: String, default: "" },
      supportEmail:   { type: String, default: "" },
      website:        { type: String, default: "" },
    },
    // ── Payroll Settings ──────────────────────────────────────
    payroll: {
      currency:      { type: String, default: "GHS" },
      payPeriod:     { type: String, default: "monthly" },
      overtimeRate:  { type: Number, default: 1.5 },
      standardHours: { type: Number, default: 160 },
    },
  },
  {
    timestamps: true,
  }
);

companySchema.pre("save", async function () {
  const Company = mongoose.model("Company");

  if (!this.institutionCode) {
    let code;
    let exists = true;
    while (exists) {
      code = generateInstitutionCode();
      exists = await Company.findOne({ institutionCode: code });
    }
    this.institutionCode = code;
  }

  // Auto-generate slug from name on first save; ensure uniqueness with suffix.
  if (!this.slug) {
    let base = slugify(this.name);
    let candidate = base;
    let attempt = 0;
    while (await Company.findOne({ slug: candidate, _id: { $ne: this._id } })) {
      attempt++;
      candidate = `${base}-${attempt}`;
    }
    this.slug = candidate;
  }

  if (!this.qrSeed) {
    this.qrSeed = crypto.randomBytes(32).toString("hex");
  }
  if (!this.bleLocationId) {
    this.bleLocationId = `BLE-${crypto.randomBytes(8).toString("hex").toUpperCase()}`;
  }
});

companySchema.virtual("isTrialActive").get(function () {
  if (this.subscriptionActive) return false;
  if (this.trialUsed) return false;
  return new Date() < this.trialEndDate;
});

companySchema.virtual("trialDaysRemaining").get(function () {
  if (this.subscriptionActive || this.trialUsed) return 0;
  const remaining = this.trialEndDate - new Date();
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
});

companySchema.virtual("trialTimeRemaining").get(function () {
  if (this.subscriptionActive || this.trialUsed) {
    return { days: 0, hours: 0, minutes: 0 };
  }
  const remaining = Math.max(0, this.trialEndDate - new Date());
  const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
  const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
  return { days, hours, minutes };
});

companySchema.virtual("hasAccess").get(function () {
  return this.subscriptionActive || this.isTrialActive;
});

companySchema.set("toJSON", { virtuals: true });
companySchema.set("toObject", { virtuals: true });

// Covering index for tenant-scoped status lookups.
companySchema.index({ isActive: 1, mode: 1 });
companySchema.index({ subscriptionStatus: 1, trialEndDate: 1 });

module.exports = mongoose.model("Company", companySchema);
module.exports.TRIAL_DURATION_DAYS = TRIAL_DURATION_DAYS;

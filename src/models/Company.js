const mongoose = require("mongoose");
const crypto = require("crypto");

const TRIAL_DURATION_DAYS = 14;

function generateInstitutionCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(crypto.randomInt(chars.length));
  }
  return code;
}

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Institution name is required"],
      unique: true,
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
      enum: ["corporate", "academic"],
      required: [true, "Institution mode is required"],
      default: "corporate",
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
    // ── ESP32 Devices ─────────────────────────────────────────
    esp32Devices: {
      type: [
        {
          deviceId:     { type: String },
          token:        { type: String },
          registeredAt: { type: Date },
          lastSeenAt:   { type: Date },
        },
      ],
      default: [],
    },
    esp32PendingCommand: {
      action:    { type: String, default: null },
      sessionId: { type: String, default: null },
      title:     { type: String, default: null },
      issuedAt:  { type: Date,   default: null },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
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
  if (!this.institutionCode) {
    let code;
    let exists = true;
    while (exists) {
      code = generateInstitutionCode();
      exists = await mongoose.model("Company").findOne({ institutionCode: code });
    }
    this.institutionCode = code;
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

module.exports = mongoose.model("Company", companySchema);
module.exports.TRIAL_DURATION_DAYS = TRIAL_DURATION_DAYS;

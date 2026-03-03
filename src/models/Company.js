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
      enum: ["active", "inactive", "trial", "expired"],
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

const mongoose = require("mongoose");
const crypto = require("crypto");

const qrTokenSchema = new mongoose.Schema(
  {
    session: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AttendanceSession",
      required: [true, "Attendance session is required"],
      index: true,
    },
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required"],
      index: true,
    },
    code: {
      type: String,
      required: true,
      index: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

qrTokenSchema.index({ session: 1, code: 1 });
qrTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

qrTokenSchema.statics.generateCode = function () {
  return String(crypto.randomInt(100000, 1000000));
};

qrTokenSchema.statics.generateToken = function () {
  return crypto.randomBytes(32).toString("hex");
};

qrTokenSchema.statics.generateUniqueCode = async function (sessionId) {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const code = this.generateCode();
    const existing = await this.findOne({
      session: sessionId,
      code,
      expiresAt: { $gt: new Date() },
      isUsed: false,
    });
    if (!existing) return code;
  }
  throw new Error("Unable to generate unique code after maximum attempts");
};

qrTokenSchema.methods.isExpired = function () {
  return new Date() > this.expiresAt;
};

module.exports = mongoose.model("QrToken", qrTokenSchema);

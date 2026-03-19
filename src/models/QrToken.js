const mongoose = require("mongoose");
const crypto = require("crypto");

const qrTokenSchema = new mongoose.Schema(
{
session: {
type: mongoose.Schema.Types.ObjectId,
ref: "AttendanceSession",
required: true,
index: true,
},
company: {
type: mongoose.Schema.Types.ObjectId,
ref: "Company",
required: true,
index: true,
},
code: {
type: String,
required: true,
uppercase: true,
trim: true,
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
// "qr" = time-gated 15s rotating QR scan (multi-use within window)
// "verbal" = multi-use code lecturer reads out loud
codeType: {
type: String,
enum: ["qr", "verbal"],
default: "qr",
},
createdBy: {
type: mongoose.Schema.Types.ObjectId,
ref: "User",
},
},
{ timestamps: true }
);

// Query performance index
qrTokenSchema.index({ session: 1, code: 1 });
// TTL index -- MongoDB auto-deletes expired tokens 1 hour after expiry (cleanup buffer)
qrTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

qrTokenSchema.methods.isExpired = function () {
return new Date() > this.expiresAt;
};

// Generate a secure random token string
qrTokenSchema.statics.generateToken = function () {
return crypto.randomBytes(32).toString("hex");
};

// Generate a unique short code for a session (e.g. "AB12")
qrTokenSchema.statics.generateUniqueCode = async function (sessionId) {
const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const maxAttempts = 10;
for (let i = 0; i < maxAttempts; i++) {
let code = "";
for (let j = 0; j < 4; j++) {
code += chars[Math.floor(Math.random() * chars.length)];
}
const exists = await this.findOne({ session: sessionId, code });
if (!exists) return code;
}
throw new Error("Unable to generate unique code after maximum attempts");
};

module.exports = mongoose.model("QrToken", qrTokenSchema);

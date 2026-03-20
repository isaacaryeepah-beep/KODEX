const mongoose = require("mongoose");

const paymentLogSchema = new mongoose.Schema({
  company:     { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
  reference:   { type: String, required: true, unique: true },
  amount:      { type: Number, required: true },
  currency:    { type: String, default: "GHS" },
  plan:        { type: String, enum: ["monthly", "yearly", "unknown"], default: "unknown" },
  event:       { type: String, default: "charge.success" },
  paidAt:      { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model("PaymentLog", paymentLogSchema);

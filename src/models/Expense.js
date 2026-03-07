const mongoose = require("mongoose");

const expenseSchema = new mongoose.Schema(
  {
    company:    { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    employee:   { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    title:      { type: String, required: true, trim: true },
    category:   { type: String, enum: ["travel","meals","equipment","software","training","other"], default: "other" },
    amount:     { type: Number, required: true, min: 0 },
    currency:   { type: String, default: "GHS" },
    date:       { type: Date, required: true },
    receiptUrl: { type: String, default: "" },
    notes:      { type: String, default: "" },
    status:     { type: String, enum: ["pending","approved","rejected"], default: "pending" },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    reviewedAt: { type: Date, default: null },
    reviewNote: { type: String, default: "" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Expense", expenseSchema);

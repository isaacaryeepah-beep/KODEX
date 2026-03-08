const mongoose = require("mongoose");

const branchSchema = new mongoose.Schema(
  {
    company:   { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name:      { type: String, required: true, trim: true },
    code:      { type: String, trim: true, uppercase: true },
    address:   { type: String, default: "" },
    city:      { type: String, default: "" },
    country:   { type: String, default: "" },
    phone:     { type: String, default: "" },
    manager:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    isActive:  { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

branchSchema.index({ company: 1, code: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Branch", branchSchema);

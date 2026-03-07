const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema(
  {
    company:      { type: mongoose.Schema.Types.ObjectId, ref: "Company", required: true, index: true },
    name:         { type: String, required: true, trim: true },
    assetTag:     { type: String, trim: true },
    category:     { type: String, enum: ["laptop","phone","vehicle","furniture","equipment","other"], default: "other" },
    serialNumber: { type: String, trim: true, default: "" },
    description:  { type: String, default: "" },
    purchaseDate: { type: Date, default: null },
    purchaseValue:{ type: Number, default: null },
    condition:    { type: String, enum: ["new","good","fair","poor"], default: "good" },
    assignedTo:   { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    assignedAt:   { type: Date, default: null },
    isActive:     { type: Boolean, default: true },
    createdBy:    { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Asset", assetSchema);

"use strict";

/**
 * BrandingSettings
 *
 * One-to-one with Company. Stores full white-label configuration so each
 * company's portal, emails, and PDFs look like their own product.
 *
 * The Company document retains a minimal `branding` subdoc (logo, colors)
 * for fast access. This model holds the complete, version-tracked settings.
 *
 * Design decisions:
 *  - `updatedHistory` is a capped array of the last 20 change records,
 *    giving basic version awareness without a separate collection.
 *  - `customCss` is length-limited and sanitized in the controller before
 *    persisting — never injected directly into HTML without server-side
 *    sanitisation.
 *  - Fields are grouped into logical sections (identity, colors, documents,
 *    email, portal, social) so the settings UI can be rendered section by
 *    section.
 */

const mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const changeRecordSchema = new mongoose.Schema(
  {
    changedBy:   { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    changedByName: { type: String, default: null },
    changedAt:   { type: Date, default: Date.now },
    // List of top-level field names that changed in this save.
    fields:      { type: [String], default: [] },
    note:        { type: String, default: null },
  },
  { _id: false }
);

// ---------------------------------------------------------------------------
// Main schema
// ---------------------------------------------------------------------------

const brandingSettingsSchema = new mongoose.Schema(
  {
    // Tenant anchor — one document per company.
    company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      required: [true, "Company is required for BrandingSettings"],
      unique: true,
      index: true,
    },

    // ── Identity ─────────────────────────────────────────────────────────
    // The name shown across the portal, PDFs, and emails.
    // Falls back to Company.displayName → Company.name if null.
    portalDisplayName: {
      type: String,
      trim: true,
      maxlength: [120, "Portal display name may not exceed 120 characters"],
      default: null,
    },
    tagline: {
      type: String,
      trim: true,
      maxlength: [200, "Tagline may not exceed 200 characters"],
      default: null,
    },
    logoUrl: {
      type: String,
      trim: true,
      default: null,
    },
    logoAltText: {
      type: String,
      trim: true,
      default: null,
    },
    faviconUrl: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Colors ───────────────────────────────────────────────────────────
    // Hex color strings. Validated as #RRGGBB or #RGB in the controller.
    primaryColor:   { type: String, trim: true, default: "#6366f1" },
    secondaryColor: { type: String, trim: true, default: "#4f46e5" },
    accentColor:    { type: String, trim: true, default: "#818cf8" },
    textOnPrimary:  { type: String, trim: true, default: "#ffffff" },
    fontFamily: {
      type: String,
      trim: true,
      default: "Inter, sans-serif",
    },

    // ── Document / PDF headers & footers ─────────────────────────────────
    documentHeaderText: {
      type: String,
      trim: true,
      maxlength: [300, "Document header text may not exceed 300 characters"],
      default: null,
    },
    documentFooterText: {
      type: String,
      trim: true,
      maxlength: [300, "Document footer text may not exceed 300 characters"],
      default: null,
    },
    // URL for a banner/watermark image on generated PDFs.
    documentHeaderLogoUrl: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Email branding ────────────────────────────────────────────────────
    emailHeaderLogoUrl: {
      type: String,
      trim: true,
      default: null,
    },
    emailFooterText: {
      type: String,
      trim: true,
      maxlength: [500, "Email footer text may not exceed 500 characters"],
      default: null,
    },
    emailFromName: {
      type: String,
      trim: true,
      maxlength: [80, "Email from-name may not exceed 80 characters"],
      default: null,
    },
    emailReplyTo: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    // ── Portal / login page ───────────────────────────────────────────────
    // Label shown in the browser tab and top-bar.
    portalLabel: {
      type: String,
      trim: true,
      maxlength: [100, "Portal label may not exceed 100 characters"],
      default: null,
    },
    loginPageHeroText: {
      type: String,
      trim: true,
      maxlength: [400, "Login hero text may not exceed 400 characters"],
      default: null,
    },
    // URL for a full-bleed background image on the login page.
    loginPageBackgroundUrl: {
      type: String,
      trim: true,
      default: null,
    },
    // Small block of custom CSS injected into the portal shell.
    // Must be sanitized server-side before saving; max 4 KB.
    customCss: {
      type: String,
      maxlength: [4096, "Custom CSS may not exceed 4096 characters"],
      default: null,
    },

    // ── Support & contact ─────────────────────────────────────────────────
    supportEmail: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    supportPhone: {
      type: String,
      trim: true,
      default: null,
    },
    website: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Social links ──────────────────────────────────────────────────────
    socialLinks: {
      facebook:  { type: String, trim: true, default: null },
      twitter:   { type: String, trim: true, default: null },
      linkedin:  { type: String, trim: true, default: null },
      instagram: { type: String, trim: true, default: null },
      youtube:   { type: String, trim: true, default: null },
    },

    // ── Audit trail ───────────────────────────────────────────────────────
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Rolling window of the last 20 change records.
    updatedHistory: {
      type: [changeRecordSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Pre-save: cap history at 20 entries.
// ---------------------------------------------------------------------------

brandingSettingsSchema.pre("save", function (next) {
  if (this.updatedHistory.length > 20) {
    this.updatedHistory = this.updatedHistory.slice(-20);
  }
  next();
});

// ---------------------------------------------------------------------------
// Statics
// ---------------------------------------------------------------------------

/**
 * Retrieve branding for a company, creating a blank document if none exists.
 * Safe to call on every page render — idempotent.
 */
brandingSettingsSchema.statics.forCompany = async function (companyId) {
  let settings = await this.findOne({ company: companyId });
  if (!settings) {
    settings = await this.create({ company: companyId });
  }
  return settings;
};

/**
 * Apply a partial update and record the change in history.
 *
 * @param {ObjectId} companyId
 * @param {Object}   updates   - Plain object of fields to set.
 * @param {Object}   updatedBy - User document (for history).
 * @param {string}   [note]    - Optional change note.
 */
brandingSettingsSchema.statics.applyUpdate = async function (
  companyId,
  updates,
  updatedBy,
  note = null
) {
  const settings = await this.forCompany(companyId);

  const changedFields = [];
  for (const [key, value] of Object.entries(updates)) {
    if (key === "updatedHistory" || key === "company") continue;
    settings[key] = value;
    changedFields.push(key);
  }

  if (changedFields.length === 0) return settings;

  settings.lastUpdatedBy = updatedBy?._id || updatedBy;
  settings.updatedHistory.push({
    changedBy:     updatedBy?._id || updatedBy,
    changedByName: updatedBy?.name || null,
    changedAt:     new Date(),
    fields:        changedFields,
    note,
  });

  return settings.save();
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

module.exports = mongoose.model("BrandingSettings", brandingSettingsSchema);

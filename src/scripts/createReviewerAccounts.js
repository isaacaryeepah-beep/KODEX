"use strict";

/**
 * createReviewerAccounts
 *
 * Creates a demo institution and two Google Play reviewer test accounts:
 *   Admin  → reviewer.admin@dikly.sbs   / Reviewer@2025!
 *   Student→ reviewer.student@dikly.sbs / Reviewer@2025!
 *
 * Safe to re-run: skips creation if accounts already exist.
 *
 * Usage:
 *   node src/scripts/createReviewerAccounts.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");
const crypto   = require("crypto");

const REVIEWER_PASSWORD = process.env.REVIEWER_PASSWORD
  || crypto.randomBytes(24).toString('base64url');

const INSTITUTION_NAME = "DIKLY Demo University";
const INSTITUTION_MODE = "academic";

const ACCOUNTS = [
  {
    name:     "Review Admin",
    email:    "reviewer.admin@dikly.sbs",
    password: REVIEWER_PASSWORD,
    role:     "admin",
  },
  {
    name:        "Review Student",
    email:       "reviewer.student@dikly.sbs",
    password:    REVIEWER_PASSWORD,
    role:        "student",
    IndexNumber: "DU/REV/001",
    programme:   "BSc",
    studentLevel: 100,
    studentGroup: "A",
    sessionType:  "Morning",
    semester:     1,
  },
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("✅ Connected to MongoDB");

  const Company = require("../models/Company");
  const User    = require("../models/User");

  // ── 1. Find or create the demo institution ──────────────────────────────────
  let company = await Company.findOne({ name: INSTITUTION_NAME });
  if (!company) {
    company = await Company.create({
      name:           INSTITUTION_NAME,
      mode:           INSTITUTION_MODE,
      contactEmail:   "reviewer.admin@dikly.sbs",
      subscriptionActive: true,
    });
    console.log(`✅ Created institution: ${company.name} (${company._id})`);
  } else {
    console.log(`ℹ️  Institution already exists: ${company.name} (${company._id})`);
  }

  // ── 2. Create reviewer accounts ─────────────────────────────────────────────
  for (const acc of ACCOUNTS) {
    const existing = await User.findOne({ email: acc.email });
    if (existing) {
      console.log(`ℹ️  Account already exists: ${acc.email}`);
      continue;
    }

    const hashed = await bcrypt.hash(acc.password, 12);
    const { password, ...rest } = acc;

    await User.create({
      ...rest,
      password:           hashed,
      company:            company._id,
      isApproved:         true,
      isActive:           true,
      mustChangePassword: false,
    });

    console.log(`✅ Created ${acc.role}: ${acc.email}`);
  }

  console.log("\n─────────────────────────────────────────");
  console.log("Google Play Reviewer Credentials");
  console.log("─────────────────────────────────────────");
  console.log("App URL : https://dikly.sbs");
  console.log("");
  console.log("Admin account");
  console.log("  Email   : reviewer.admin@dikly.sbs");
  console.log(`  Password: ${REVIEWER_PASSWORD}`);
  console.log("");
  console.log("Student account");
  console.log("  Email   : reviewer.student@dikly.sbs");
  console.log(`  Password: ${REVIEWER_PASSWORD}`);
  console.log("─────────────────────────────────────────\n");

  process.exit(0);
}

run().catch(err => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});

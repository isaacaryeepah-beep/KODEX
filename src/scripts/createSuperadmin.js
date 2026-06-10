// WARNING: Set SA_PASSWORD env var before running this script
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const SA_NAME     = 'Isaac Aryeepah';
const SA_EMAIL    = process.env.SA_EMAIL;
const SA_PASSWORD = process.env.SA_PASSWORD;
if (!SA_EMAIL || !SA_PASSWORD) { console.error('Set SA_EMAIL and SA_PASSWORD env vars'); process.exit(1); }

async function run() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const User = require('../models/User');

    const existing = await User.findOne({ role: 'superadmin' });
    if (existing) {
      console.log('⚠️  Superadmin already exists:', existing.email);
      process.exit(0);
    }

    const hashed = await bcrypt.hash(SA_PASSWORD, 12);

    await User.create({
      name:               SA_NAME,
      email:              SA_EMAIL,
      password:           hashed,
      role:               'superadmin',
      isApproved:         true,
      isActive:           true,
      mustChangePassword: false,
    });

    console.log('✅ Superadmin created! Login at https://dikly.sbs/superadmin');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

run();

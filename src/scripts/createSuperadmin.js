/**
 * One-time script to create the superadmin account.
 * 
 * Run from your project root:
 *   SA_EMAIL=you@email.com SA_PASSWORD=YourPassword123 node src/scripts/createSuperadmin.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const SUPERADMIN_EMAIL    = process.env.SA_EMAIL    || 'superadmin@kodex.it.com';
const SUPERADMIN_PASSWORD = process.env.SA_PASSWORD || 'ChangeMe123!';
const SUPERADMIN_NAME     = process.env.SA_NAME     || 'KODEX Superadmin';

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not set. Add it to your .env file.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  const User = require('../models/User');

  const existing = await User.findOne({ role: 'superadmin' });
  if (existing) {
    console.log('ℹ️  Superadmin already exists:', existing.email);
    await mongoose.disconnect();
    process.exit(0);
  }

  const hashed = await bcrypt.hash(SUPERADMIN_PASSWORD, 12);
  await User.create({
    name:               SUPERADMIN_NAME,
    email:              SUPERADMIN_EMAIL,
    password:           hashed,
    role:               'superadmin',
    isApproved:         true,
    isActive:           true,
    mustChangePassword: false,
  });

  console.log('✅ Superadmin account created!');
  console.log('   Email:   ', SUPERADMIN_EMAIL);
  console.log('   Password:', SUPERADMIN_PASSWORD);
  console.log('\n⚠️  Log in at https://kodex.it.com/superadmin and change your password immediately.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });

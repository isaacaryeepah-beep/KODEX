// Run on Render shell: node scripts/create-demo-user.js
// Creates a demo student account for Google Play reviewers.

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');
const Company = require('../src/models/Company');

async function main() {
  await connectDB();

  const DEMO_EMAIL    = 'reviewer@dikly.sbs';
  const DEMO_PASSWORD = 'Review2024!';

  // Find the first active company to attach the demo user to
  const company = await Company.findOne({ isActive: true }).sort({ createdAt: 1 });
  if (!company) {
    console.error('No active company found. Please create one first.');
    process.exit(1);
  }
  console.log(`Using company: ${company.name} (${company._id})`);

  // Remove any stale demo account first
  await User.deleteOne({ email: DEMO_EMAIL, company: company._id });

  const demo = new User({
    name:       'Google Play Reviewer',
    email:      DEMO_EMAIL,
    password:   DEMO_PASSWORD,
    role:       'student',
    company:    company._id,
    isApproved: true,
    isActive:   true,
  });

  await demo.save();
  console.log('');
  console.log('Demo account created:');
  console.log('  Email   :', DEMO_EMAIL);
  console.log('  Password:', DEMO_PASSWORD);
  console.log('  Role    : student');
  console.log('  Company :', company.name);
  console.log('');
  console.log('Enter these credentials in the Google Play App access form.');
  process.exit(0);
}

main().catch(err => { console.error(err); process.exit(1); });

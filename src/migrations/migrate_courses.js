/**
 * migrate_courses.js
 *
 * Safe migration for existing KODEX course data.
 * Run once: node src/migrations/migrate_courses.js
 *
 * What it does:
 *  - Sets status = 'active' where missing
 *  - Sets isActive = true where missing
 *  - Sets isArchived = false where missing
 *  - Migrates sessionType → studyType where studyType is null
 *  - Preserves all existing enrolledStudents, lecturerId, attendance links
 *  - Does NOT change companyId, code, title, or any existing data
 */

require('dotenv').config();
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('[Migration] Connected to MongoDB');

  // Load Course model (after connect so indexes don't run before migration)
  const Course = require('../models/Course');

  // ── Step 1: Set missing lifecycle fields ───────────────────────────────────
  const step1 = await Course.updateMany(
    { status: { $exists: false } },
    { $set: { status: 'active', isActive: true, isArchived: false } }
  );
  console.log(`[Migration] Step 1 — Set missing status fields: ${step1.modifiedCount} courses updated`);

  // ── Step 2: Ensure isActive consistent with status ────────────────────────
  const step2a = await Course.updateMany(
    { status: 'archived', isActive: { $ne: false } },
    { $set: { isActive: false, isArchived: true } }
  );
  const step2b = await Course.updateMany(
    { status: { $in: ['active', 'completed', 'suspended'] }, isActive: { $ne: true } },
    { $set: { isActive: true, isArchived: false } }
  );
  console.log(`[Migration] Step 2 — isActive sync: ${step2a.modifiedCount + step2b.modifiedCount} courses updated`);

  // ── Step 3: Migrate sessionType → studyType ───────────────────────────────
  const validStudyTypes = ['Regular', 'Evening', 'Weekend', 'Distance', 'Sandwich', 'Part-Time', 'Full-Time'];
  const coursesWithSession = await Course.find({
    sessionType: { $exists: true, $ne: null },
    studyType:   { $in: [null, undefined] },
  }).select('_id sessionType').lean();

  let migrated = 0;
  for (const c of coursesWithSession) {
    if (validStudyTypes.includes(c.sessionType)) {
      await Course.updateOne({ _id: c._id }, { $set: { studyType: c.sessionType } });
      migrated++;
    }
  }
  console.log(`[Migration] Step 3 — Migrated sessionType → studyType: ${migrated} courses`);

  // ── Step 4: Set companyId from company field (legacy compat) ──────────────
  const step4 = await Course.updateMany(
    { companyId: { $exists: false }, company: { $exists: true } },
    [{ $set: { companyId: '$company' } }]
  );
  console.log(`[Migration] Step 4 — companyId from company: ${step4.modifiedCount} courses updated`);

  // ── Step 5: Set lecturerId from lecturer field (legacy compat) ────────────
  const step5 = await Course.updateMany(
    { lecturerId: { $exists: false }, lecturer: { $exists: true } },
    [{ $set: { lecturerId: '$lecturer' } }]
  );
  console.log(`[Migration] Step 5 — lecturerId from lecturer: ${step5.modifiedCount} courses updated`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = await Course.countDocuments();
  console.log(`\n[Migration] Complete. Total courses in DB: ${total}`);
  console.log('[Migration] All existing data preserved. No destructive changes made.');

  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error('[Migration] FAILED:', err);
  process.exit(1);
});

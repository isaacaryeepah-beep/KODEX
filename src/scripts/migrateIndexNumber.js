/**
 * migrateIndexNumber.js
 * Run once: renames the `indexNumber` field to `IndexNumber` on all student documents.
 * Usage: node src/scripts/migrateIndexNumber.js
 */

require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;
  const users = db.collection('users');

  // Find all documents that still have the old lowercase field
  const count = await users.countDocuments({ indexNumber: { $exists: true } });
  console.log(`Found ${count} documents with legacy 'indexNumber' field`);

  if (count === 0) {
    console.log('Nothing to migrate.');
    await mongoose.disconnect();
    return;
  }

  // Rename the field in all matching documents
  const result = await users.updateMany(
    { indexNumber: { $exists: true } },
    { $rename: { indexNumber: 'IndexNumber' } }
  );

  console.log(`Migrated ${result.modifiedCount} documents`);
  await mongoose.disconnect();
  console.log('Done.');
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});

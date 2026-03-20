const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB connected: ${conn.connection.host}`);

    const db = conn.connection.db;
    try {
      const usersCollection = db.collection("users");
      const indexes = await usersCollection.indexes();
      for (const idx of indexes) {
        // Drop stale email-only index (missing company key)
        if (idx.key && idx.key.email && !idx.key.company && idx.unique) {
          console.log("Dropping stale unique email-only index:", idx.name);
          await usersCollection.dropIndex(idx.name);
        }
        // Drop ANY indexNumber+company unique index and let Mongoose rebuild it correctly
        // Fixes false duplicate errors caused by null indexNumber values conflicting
        if (idx.key && idx.key.indexNumber && idx.key.company && idx.unique) {
          console.log("Rebuilding indexNumber index:", idx.name);
          await usersCollection.dropIndex(idx.name);
        }
      }
    } catch (indexErr) {
      console.log("Index cleanup skipped:", indexErr.message);
    }
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;

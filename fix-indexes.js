require("dotenv").config();
const mongoose = require("mongoose");

async function fixIndexes() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    const usersCollection = db.collection("users");

    // Drop the problematic googleId index
    try {
      await usersCollection.dropIndex("googleId_1");
      console.log("✅ Dropped old googleId index");
    } catch (error) {
      console.log("Index might not exist or already fixed:", error.message);
    }

    // Create new sparse unique index
    await usersCollection.createIndex(
      { googleId: 1 },
      { unique: true, sparse: true }
    );
    console.log("✅ Created new sparse googleId index");

    // Verify indexes
    const indexes = await usersCollection.indexes();
    console.log("\n📋 Current indexes:");
    indexes.forEach((index) => {
      console.log(JSON.stringify(index, null, 2));
    });

    console.log("\n✨ Index fix complete!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

fixIndexes();

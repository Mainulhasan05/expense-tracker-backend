require("dotenv").config();
const mongoose = require("mongoose");

async function verifyUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;
    const result = await db.collection("users").updateOne(
      { email: "testuser@example.com" },
      { $set: { isVerified: true } }
    );
    console.log("✅ User verified:", result.modifiedCount > 0 ? "Success" : "User not found");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}
verifyUser();

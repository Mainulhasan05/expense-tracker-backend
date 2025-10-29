require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");

async function makeAdmin(email) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      console.log(`❌ User not found with email: ${email}`);
      console.log("\nAvailable users:");
      const allUsers = await User.find({}, "email name role").limit(10);
      allUsers.forEach(u => {
        console.log(`  - ${u.email} (${u.name}) - Role: ${u.role}`);
      });
      mongoose.connection.close();
      process.exit(1);
    }

    console.log("📋 Current User Information:");
    console.log("=".repeat(50));
    console.log(`Name: ${user.name}`);
    console.log(`Email: ${user.email}`);
    console.log(`Current Role: ${user.role}`);
    console.log(`Verified: ${user.isVerified ? "✅ Yes" : "❌ No"}`);

    if (user.role === "admin") {
      console.log("\n✅ User is already an admin!");
    } else {
      // Make user admin
      user.role = "admin";
      await user.save();

      console.log("\n✅ User role updated to ADMIN successfully!");
      console.log("🎉 This user now has full administrative access.");
    }

    console.log("\n" + "=".repeat(50));
    mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    mongoose.connection.close();
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2] || "mdrifatbd5@gmail.com";

console.log(`\n🔐 Making user admin: ${email}\n`);
makeAdmin(email);

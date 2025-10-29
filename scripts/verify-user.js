require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");

async function verifyUser(email) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      console.log(`❌ User not found with email: ${email}`);
      process.exit(1);
    }

    console.log(`\n📧 User found: ${user.name} (${user.email})`);
    console.log(`Current verification status: ${user.isVerified ? "✅ Verified" : "❌ Not Verified"}`);

    if (user.isVerified) {
      console.log("\n✅ User is already verified!");
    } else {
      // Manually verify the user
      user.isVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpire = undefined;
      await user.save();

      console.log("\n✅ User manually verified successfully!");
      console.log("The user can now log in.");
    }

    mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    mongoose.connection.close();
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log("Usage: node verify-user.js <email>");
  console.log("Example: node verify-user.js mdrifatbd5@gmail.com");
  process.exit(1);
}

verifyUser(email);

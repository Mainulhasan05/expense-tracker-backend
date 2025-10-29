require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");
const { sendTestEmail } = require("../src/utils/sendEmail");

async function checkUserAndSendTest(email) {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    // Find user by email
    const user = await User.findOne({ email });

    if (!user) {
      console.log(`❌ User not found with email: ${email}`);
      console.log("\nAvailable users:");
      const allUsers = await User.find({}, "email name isVerified").limit(10);
      allUsers.forEach(u => {
        console.log(`  - ${u.email} (${u.name}) - Verified: ${u.isVerified ? "✅" : "❌"}`);
      });
      mongoose.connection.close();
      process.exit(1);
    }

    console.log("📋 User Information:");
    console.log("=".repeat(50));
    console.log(`Name: ${user.name}`);
    console.log(`Email: ${user.email}`);
    console.log(`Verified: ${user.isVerified ? "✅ Yes" : "❌ No"}`);
    console.log(`Google ID: ${user.googleId || "N/A (Email registration)"}`);
    console.log(`Created: ${user.createdAt}`);

    if (user.emailVerificationToken) {
      console.log(`\n⚠️  Pending verification token exists`);
      console.log(`Token expires: ${user.emailVerificationExpire ? new Date(user.emailVerificationExpire) : "Unknown"}`);
    }

    if (user.telegramId) {
      console.log(`\n📱 Telegram: Connected (@${user.telegramUsername})`);
    }

    console.log("\n" + "=".repeat(50));
    console.log("\n📧 Sending test email...");

    try {
      await sendTestEmail(email);
      console.log("✅ Test email sent successfully!");
      console.log("\n📬 Please check:");
      console.log("  1. Your inbox");
      console.log("  2. Spam/Junk folder");
      console.log("  3. Promotions tab (if using Gmail)");
    } catch (emailError) {
      console.error("❌ Failed to send test email:", emailError.message);
      console.log("\n⚠️  Email service might not be configured correctly.");
      console.log("Check your .env file for:");
      console.log("  - EMAIL_USER");
      console.log("  - EMAIL_PASS");
    }

    mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    mongoose.connection.close();
    process.exit(1);
  }
}

// Get email from command line argument
const email = process.argv[2];

if (!email) {
  console.log("Usage: node check-user-and-send-test.js <email>");
  console.log("Example: node check-user-and-send-test.js mdrifatbd5@gmail.com");
  process.exit(1);
}

checkUserAndSendTest(email);

const mongoose = require("mongoose");
const axios = require("axios");
require("dotenv").config();

const AssemblyAIAccount = require("../src/models/AssemblyAIAccount");

async function addAssemblyAIAccount() {
  try {
    // Get API key from command line arguments
    const apiKey = process.argv[2];
    const accountName = process.argv[3] || "AssemblyAI Account";

    if (!apiKey) {
      console.log("❌ Error: API key is required\n");
      console.log("Usage:");
      console.log('  node scripts/add-assemblyai-account.js YOUR_API_KEY "Account Name"\n');
      console.log("Example:");
      console.log('  node scripts/add-assemblyai-account.js 4e54410eb51147c1bbbc37df40db2d8d "My AssemblyAI Account"\n');
      console.log("Get your API key from: https://www.assemblyai.com/app/account");
      process.exit(1);
    }

    // Connect to MongoDB
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    // Test the API key first
    console.log("🔍 Validating API key...");
    try {
      await axios.get("https://api.assemblyai.com/v2/transcript", {
        headers: {
          authorization: apiKey,
        },
      });
      console.log("✅ API key is valid\n");
    } catch (error) {
      if (error.response?.status === 401) {
        console.log("❌ Invalid API key");
        console.log("\nPlease check your API key at: https://www.assemblyai.com/app/account");
        process.exit(1);
      }
    }

    // Check if account already exists
    const existingAccount = await AssemblyAIAccount.findOne({ apiKey });
    if (existingAccount) {
      console.log("⚠️  This API key is already in the database");
      console.log(`   Account Name: ${existingAccount.name}`);
      console.log(`   Status: ${existingAccount.status}`);
      console.log(`   Credits Remaining: $${existingAccount.remainingCredits.toFixed(2)}`);
      console.log(`   Usage: ${existingAccount.usagePercentage.toFixed(1)}%\n`);
      process.exit(0);
    }

    // Create new account
    console.log("💾 Adding account to database...");
    const account = new AssemblyAIAccount({
      apiKey,
      name: accountName,
    });

    await account.save();

    console.log("✅ Account added successfully!\n");
    console.log("Account Details:");
    console.log(`   Name: ${account.name}`);
    console.log(`   Status: ${account.status}`);
    console.log(`   Total Credits: $${account.totalCredits.toFixed(2)}`);
    console.log(`   Remaining Credits: $${account.remainingCredits.toFixed(2)}`);
    console.log(`   Trial End Date: ${account.trialEndDate.toLocaleDateString()}`);
    console.log(`   Rate Limit: ${account.rateLimit} requests/minute\n`);

    // Get total accounts
    const totalAccounts = await AssemblyAIAccount.countDocuments();
    const activeAccounts = await AssemblyAIAccount.countDocuments({
      status: "active",
    });

    console.log(`📊 Total Accounts in Database: ${totalAccounts}`);
    console.log(`   Active: ${activeAccounts}\n`);

    console.log("🎉 You can now test voice transcription with:");
    console.log("   node scripts/test-voice-transcription.js\n");
  } catch (error) {
    console.error("❌ Error:", error.message);
  } finally {
    await mongoose.connection.close();
    console.log("🔌 MongoDB connection closed");
  }
}

addAssemblyAIAccount();

#!/usr/bin/env node

/**
 * Update Clarifai accounts to use stable model URLs
 * This script updates existing accounts to use modelUrl instead of modelVersionId
 */

require("dotenv").config();
const mongoose = require("mongoose");
const ClarifaiAccount = require("../src/models/ClarifaiAccount");

async function updateClarifaiAccounts() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    // Get all Clarifai accounts
    const accounts = await ClarifaiAccount.find({});
    console.log(`\nFound ${accounts.length} Clarifai account(s)\n`);

    if (accounts.length === 0) {
      console.log("No Clarifai accounts to update.");
      process.exit(0);
    }

    // Update each account
    for (const account of accounts) {
      console.log(`\n📝 Updating account: ${account.name}`);
      console.log(`   Current modelId: ${account.modelId}`);
      console.log(`   Current userId: ${account.userId}`);
      console.log(`   Current appId: ${account.appId}`);

      // Construct stable model URL
      const modelUrl = `https://clarifai.com/${account.userId}/${account.appId}/models/${account.modelId}`;

      // Update account
      account.modelUrl = modelUrl;
      await account.save();

      console.log(`   ✅ Updated modelUrl: ${modelUrl}`);
    }

    console.log("\n✅ All accounts updated successfully!");
    console.log("\n📌 Note: The modelVersionId field is now optional and no longer required.");
    console.log("   The system will use stable model URLs for better reliability.\n");

  } catch (error) {
    console.error("❌ Error updating accounts:", error.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log("✅ Database connection closed");
  }
}

// Run the script
updateClarifaiAccounts();

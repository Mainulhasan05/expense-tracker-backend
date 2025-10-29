/**
 * Quick script to add a Clarifai account
 * Usage: node scripts/add-clarifai-account.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const ClarifaiAccount = require("../src/models/ClarifaiAccount");
const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function main() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    console.log("=".repeat(60));
    console.log("        Add Clarifai Account for AI Parsing");
    console.log("=".repeat(60));
    console.log("\nGet your PAT (Personal Access Token) from:");
    console.log("https://clarifai.com/settings/security\n");

    // Get account details
    const name = await question("Account Name (e.g., Clarifai Account 1): ");
    const pat = await question("Personal Access Token (PAT): ");
    const userId = (await question("User ID [openai]: ")) || "openai";
    const appId = (await question("App ID [chat-completion]: ")) || "chat-completion";
    const modelId = (await question("Model ID [gpt-oss-120b]: ")) || "gpt-oss-120b";
    const modelVersionId =
      (await question("Model Version ID [b3c129d719144dd49f4cb8cb96585223]: ")) ||
      "b3c129d719144dd49f4cb8cb96585223";
    const monthlyLimitStr = await question("Monthly request limit [1000]: ");
    const monthlyLimit = monthlyLimitStr ? parseInt(monthlyLimitStr) : 1000;
    const notes = await question("Notes (optional): ");

    console.log("\n" + "=".repeat(60));
    console.log("Creating account...");

    // Create account
    const account = await ClarifaiAccount.create({
      name: name || "Clarifai Account",
      pat,
      userId,
      appId,
      modelId,
      modelVersionId,
      limits: {
        monthlyLimit,
      },
      notes,
    });

    console.log("\n✅ Account created successfully!");
    console.log("=".repeat(60));
    console.log("Account Details:");
    console.log(`  ID: ${account._id}`);
    console.log(`  Name: ${account.name}`);
    console.log(`  Status: ${account.isActive ? "Active" : "Inactive"}`);
    console.log(`  Monthly Limit: ${account.limits.monthlyLimit} requests`);
    console.log("=".repeat(60));

    console.log("\n🧪 Would you like to test this account now? (y/n)");
    const testNow = await question("> ");

    if (testNow.toLowerCase() === "y" || testNow.toLowerCase() === "yes") {
      console.log("\n🧪 Testing account with sample message...");

      const clarifaiService = require("../src/services/clarifaiService");
      const testResult = await clarifaiService.testAccount(account._id);

      if (testResult.success) {
        console.log("\n✅ Test successful!");
        console.log("Response:", testResult.response);
      } else {
        console.log("\n❌ Test failed:", testResult.error);
      }
    }

    console.log("\n📋 Next steps:");
    console.log("1. View all accounts: GET /api/admin/clarifai/accounts");
    console.log("2. Test parsing: POST /api/admin/clarifai/test-parsing");
    console.log("3. Check the integration guide: CLARIFAI_AI_INTEGRATION.md");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

main();

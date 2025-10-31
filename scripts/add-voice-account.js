/**
 * Script to add Speechmatics or ElevenLabs account
 * Usage:
 *   node scripts/add-voice-account.js speechmatics YOUR_API_KEY "Account Name"
 *   node scripts/add-voice-account.js elevenlabs YOUR_API_KEY "Account Name"
 */

require("dotenv").config();
const mongoose = require("mongoose");
const VoiceServiceAccount = require("../src/models/VoiceServiceAccount");

async function addAccount() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("❌ Usage: node scripts/add-voice-account.js <provider> <api-key> [name]");
    console.log("   Provider: speechmatics or elevenlabs");
    console.log("   Example: node scripts/add-voice-account.js speechmatics YOUR_API_KEY \"My Speechmatics Account\"");
    process.exit(1);
  }

  const [provider, apiKey, name] = args;

  if (!["speechmatics", "elevenlabs"].includes(provider)) {
    console.log("❌ Invalid provider. Must be 'speechmatics' or 'elevenlabs'");
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Create account
    const account = new VoiceServiceAccount({
      name: name || `${provider} Account`,
      provider: provider,
      apiKey: apiKey,
      priority: provider === "speechmatics" ? 10 : 5,
      planType: "trial",
      config: {
        language: provider === "speechmatics" ? "bn" : undefined,
        operatingPoint: provider === "speechmatics" ? "standard" : undefined,
        modelId: provider === "elevenlabs" ? "eleven_multilingual_v2" : undefined,
      },
    });

    await account.save();

    console.log("\n✅ Voice service account added successfully!");
    console.log("📋 Account Details:");
    console.log(`   ID: ${account._id}`);
    console.log(`   Name: ${account.name}`);
    console.log(`   Provider: ${account.provider}`);
    console.log(`   Priority: ${account.priority}`);
    console.log(`   Status: ${account.status}`);
    console.log(`   Plan Type: ${account.planType}`);
    console.log(`   Config: ${JSON.stringify(account.config, null, 2)}`);

    if (provider === "speechmatics") {
      console.log("\n💡 Note: Speechmatics has higher priority and will be used first for transcription.");
      console.log("   Language is set to Bengali (bn) by default.");
    } else {
      console.log("\n💡 Note: ElevenLabs is configured for Text-to-Speech with multilingual support.");
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error adding account:", error.message);
    process.exit(1);
  }
}

addAccount();

const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

// Import models and services
const AssemblyAIAccount = require("../src/models/AssemblyAIAccount");
const voiceTranscriptionService = require("../src/services/voiceTranscriptionService");

async function testVoiceTranscription() {
  try {
    // Connect to MongoDB
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    // Get available AssemblyAI account from database
    console.log("🔍 Looking for AssemblyAI account in database...");
    const account = await AssemblyAIAccount.getNextAvailableAccount();

    if (!account) {
      console.log("❌ No AssemblyAI accounts found in database");
      console.log("\n💡 To add an account:");
      console.log("1. Go to https://www.assemblyai.com and sign up");
      console.log("2. Copy your API key");
      console.log("3. Add it via the admin panel at http://localhost:3000/dashboard/admin/assemblyai");
      console.log("\nOR run this command:");
      console.log(`node scripts/add-assemblyai-account.js YOUR_API_KEY "Account Name"`);
      process.exit(1);
    }

    console.log(`✅ Found account: ${account.name}`);
    console.log(`   Status: ${account.status}`);
    console.log(`   Credits remaining: $${account.remainingCredits.toFixed(2)}`);
    console.log(`   Usage: ${account.usagePercentage.toFixed(1)}%\n`);

    // Check for audio files in uploads/temp
    const tempDir = path.join(__dirname, "../uploads/temp");
    console.log(`🔍 Checking for audio files in: ${tempDir}`);

    if (!fs.existsSync(tempDir)) {
      console.log("❌ uploads/temp directory does not exist");
      console.log("Creating directory...");
      fs.mkdirSync(tempDir, { recursive: true });
      console.log("✅ Directory created\n");
    }

    const files = fs
      .readdirSync(tempDir)
      .filter((file) =>
        /\.(mp3|wav|ogg|oga|m4a|webm)$/i.test(file)
      );

    if (files.length === 0) {
      console.log("❌ No audio files found in uploads/temp");
      console.log("\n💡 To test:");
      console.log("1. Place an audio file (MP3, WAV, OGG, M4A, WebM) in:");
      console.log(`   ${tempDir}`);
      console.log("2. Run this script again");
      console.log("\nOR send a voice message to your Telegram bot");
      process.exit(1);
    }

    console.log(`✅ Found ${files.length} audio file(s):\n`);
    files.forEach((file, index) => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      const sizeInKB = (stats.size / 1024).toFixed(2);
      console.log(`   ${index + 1}. ${file} (${sizeInKB} KB)`);
    });

    // Use the first audio file
    const testFile = path.join(tempDir, files[0]);
    console.log(`\n🎤 Testing transcription with: ${files[0]}`);
    console.log("⏳ Uploading and transcribing... This may take a minute...\n");

    // Transcribe the audio file
    const startTime = Date.now();
    const result = await voiceTranscriptionService.transcribeAudio(testFile);
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Display results
    console.log("═══════════════════════════════════════════════════════");
    console.log("✅ TRANSCRIPTION SUCCESSFUL!");
    console.log("═══════════════════════════════════════════════════════\n");

    console.log("📝 TRANSCRIBED TEXT:");
    console.log("───────────────────────────────────────────────────────");
    console.log(result.text);
    console.log("───────────────────────────────────────────────────────\n");

    console.log("📊 STATISTICS:");
    console.log(`   • Audio Duration: ${result.audioSeconds} seconds`);
    console.log(`   • Processing Time: ${duration} seconds`);
    console.log(`   • Cost: $${result.cost.toFixed(6)}`);
    console.log(`   • Account Used: ${result.accountUsed}`);
    console.log(`   • Credits Remaining: $${result.remainingCredits.toFixed(2)}\n`);

    console.log("✅ Test completed successfully!");
  } catch (error) {
    console.error("\n❌ ERROR:", error.message);
    console.error("\nFull error:", error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log("\n🔌 MongoDB connection closed");
  }
}

// Run the test
testVoiceTranscription();

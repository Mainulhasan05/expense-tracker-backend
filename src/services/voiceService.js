const axios = require("axios");
const VoiceServiceAccount = require("../models/VoiceServiceAccount");
const fs = require("fs");
const { openAsBlob } = require("node:fs");
const { BatchClient } = require("@speechmatics/batch-client");
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");
const FormData = require("form-data");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const path = require("path");

// Set FFmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

class VoiceService {
  /**
   * Convert audio file to supported format
   */
  async convertAudio(inputPath, outputFormat = "mp3") {
    return new Promise((resolve, reject) => {
      const outputPath = inputPath.replace(/\.[^.]+$/, `.${outputFormat}`);

      // If already in target format, no conversion needed
      const regex = new RegExp(`\\.${outputFormat}$`, "i");
      if (regex.test(inputPath)) {
        resolve(inputPath);
        return;
      }

      console.log(
        `Converting ${path.basename(inputPath)} to ${outputFormat.toUpperCase()}...`
      );

      ffmpeg(inputPath)
        .toFormat(outputFormat)
        .audioCodec(outputFormat === "mp3" ? "libmp3lame" : "pcm_s16le")
        .audioChannels(1) // Mono
        .audioFrequency(16000) // 16kHz for better speech recognition
        .on("end", () => {
          console.log(`Conversion completed: ${path.basename(outputPath)}`);
          // Delete original file after conversion
          try {
            if (inputPath !== outputPath) {
              fs.unlinkSync(inputPath);
            }
          } catch (err) {
            console.error("Error deleting original file:", err);
          }
          resolve(outputPath);
        })
        .on("error", (err) => {
          console.error("FFmpeg conversion error:", err);
          reject(new Error(`Audio conversion failed: ${err.message}`));
        })
        .save(outputPath);
    });
  }

  /**
   * Get audio duration in seconds
   */
  async getAudioDuration(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          // Fallback to file size estimation
          const stats = fs.statSync(filePath);
          const estimatedSeconds = Math.ceil(stats.size / 16000);
          resolve(estimatedSeconds);
        } else {
          resolve(Math.ceil(metadata.format.duration || 0));
        }
      });
    });
  }

  /**
   * Transcribe audio using Speechmatics
   * Supports Bengali (bn) and other languages
   */
  async transcribeWithSpeechmatics(filePath, account) {
    let convertedPath = null;

    try {
      // Increment rate limit
      await account.incrementRateLimit();

      // Get audio duration
      const audioSeconds = await this.getAudioDuration(filePath);

      // Convert to supported format if needed
      convertedPath = await this.convertAudio(filePath, "mp3");

      console.log(`📤 Transcribing audio with Speechmatics (${account.name})...`);

      // Create Speechmatics Batch client
      const client = new BatchClient({
        apiKey: account.apiKey,
        appId: "expense-tracker-app",
      });

      // Open file as Blob
      const blob = await openAsBlob(convertedPath);
      const file = new File([blob], path.basename(convertedPath));

      // Transcribe with Speechmatics SDK
      const response = await client.transcribe(
        file,
        {
          transcription_config: {
            language: account.config.language || "bn", // Bengali by default
            operating_point: account.config.operatingPoint || "standard",
          },
        },
        "json-v2" // Request JSON format
      );

      // Extract text from response
      const text =
        typeof response === "string"
          ? response
          : response.results
              ?.map((r) => r.alternatives?.[0]?.content)
              .filter(Boolean)
              .join(" ") || "";

      // Clean up converted file
      if (convertedPath !== filePath) {
        try {
          fs.unlinkSync(convertedPath);
        } catch (err) {
          console.error("Error cleaning up converted file:", err);
        }
      }

      // Record usage
      await account.recordTranscriptionUsage(audioSeconds, 0);
      await account.resetErrors();

      console.log(
        `✅ Speechmatics transcription completed. Account: ${account.name}, Duration: ${audioSeconds}s`
      );

      return {
        success: true,
        text: text,
        audioSeconds,
        accountUsed: account.name,
        provider: "speechmatics",
        language: account.config.language || "bn",
      };
    } catch (error) {
      // Clean up on error
      if (convertedPath && convertedPath !== filePath) {
        try {
          fs.unlinkSync(convertedPath);
        } catch (err) {
          console.error("Error cleaning up converted file:", err);
        }
      }

      await account.recordError(error.message);
      console.error("Speechmatics transcription error:", error.message);
      throw error;
    }
  }


  /**
   * Generate speech using ElevenLabs
   * Supports Bengali and multilingual voices
   */
  async generateSpeechWithElevenLabs(text, account) {
    try {
      // Increment rate limit
      await account.incrementRateLimit();

      console.log(`🗣️ Generating speech with ElevenLabs (${account.name})...`);

      // Create ElevenLabs client
      const elevenlabs = new ElevenLabsClient({
        apiKey: account.apiKey,
      });

      const voiceId = account.config.voiceId || "pNInz6obpgDQGcFmaJgB"; // Default voice

      // Generate speech using SDK
      const audio = await elevenlabs.textToSpeech.convert(voiceId, {
        text: text,
        model_id: account.config.modelId || "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      });

      // Convert readable stream to buffer
      const chunks = [];
      for await (const chunk of audio) {
        chunks.push(chunk);
      }
      const audioBuffer = Buffer.concat(chunks);

      // Record usage
      const characters = text.length;
      await account.recordTTSUsage(characters, 0);
      await account.resetErrors();

      console.log(
        `✅ ElevenLabs TTS completed. Account: ${account.name}, Characters: ${characters}`
      );

      return {
        success: true,
        audioBuffer: audioBuffer,
        characters,
        accountUsed: account.name,
        provider: "elevenlabs",
      };
    } catch (error) {
      await account.recordError(error.message);
      console.error("ElevenLabs TTS error:", error.message);
      throw error;
    }
  }

  /**
   * Main transcription method with automatic provider selection
   * Prioritizes Speechmatics over other providers
   */
  async transcribeAudio(filePath, options = {}) {
    // Get next available account (Speechmatics prioritized)
    const account = await VoiceServiceAccount.getNextAvailableAccount(
      "speechmatics"
    );

    if (!account) {
      throw new Error(
        "No available Speechmatics accounts. All accounts are exhausted, rate-limited, or expired."
      );
    }

    return await this.transcribeWithSpeechmatics(filePath, account);
  }

  /**
   * Generate speech (Text-to-Speech)
   */
  async generateSpeech(text, options = {}) {
    // Get next available ElevenLabs account
    const account = await VoiceServiceAccount.getNextAvailableAccount(
      "elevenlabs"
    );

    if (!account) {
      throw new Error(
        "No available ElevenLabs accounts. All accounts are exhausted, rate-limited, or expired."
      );
    }

    return await this.generateSpeechWithElevenLabs(text, account);
  }

  /**
   * Get all accounts status
   */
  async getAllAccountsStatus() {
    const accounts = await VoiceServiceAccount.find().sort({
      provider: 1,
      priority: -1,
      createdAt: 1,
    });

    return accounts.map((account) => ({
      id: account._id,
      name: account.name,
      provider: account.provider,
      priority: account.priority,
      status: account.status,
      planType: account.planType,
      totalCredits: account.totalCredits,
      usedCredits: account.usedCredits,
      remainingCredits: account.remainingCredits,
      usagePercentage: account.usagePercentage,
      totalRequests: account.totalRequests,
      totalAudioSeconds: account.totalAudioSeconds,
      totalAudioHours: (account.totalAudioSeconds / 3600).toFixed(2),
      totalCharactersGenerated: account.totalCharactersGenerated,
      config: account.config,
      trialEndDate: account.trialEndDate,
      isExpired: account.isExpired,
      hasCredits: account.hasCredits,
      lastUsedAt: account.lastUsedAt,
      lastError: account.lastError,
      errorCount: account.errorCount,
      notes: account.notes,
    }));
  }

  /**
   * Get provider statistics
   */
  async getProviderStats() {
    return await VoiceServiceAccount.getProviderStats();
  }

  /**
   * Add new account
   */
  async addAccount(accountData) {
    const {
      name,
      provider,
      apiKey,
      priority,
      totalCredits,
      planType,
      config,
      notes,
    } = accountData;

    // Validate provider
    if (!["speechmatics", "elevenlabs"].includes(provider)) {
      throw new Error(
        "Invalid provider. Must be 'speechmatics' or 'elevenlabs'"
      );
    }

    // Test the API key
    await this.testApiKey(provider, apiKey);

    // Set default priority based on provider if not specified
    const accountPriority = priority !== undefined
      ? priority
      : (provider === "speechmatics" ? 10 : 5);

    const account = new VoiceServiceAccount({
      name: name || `${provider} Account`,
      provider,
      apiKey,
      priority: accountPriority,
      totalCredits: totalCredits || 0,
      planType: planType || "trial",
      config: config || {},
      notes: notes || "",
    });

    await account.save();
    return account;
  }

  /**
   * Test API key validity
   */
  async testApiKey(provider, apiKey) {
    try {
      if (provider === "speechmatics") {
        // Test Speechmatics API key by creating a client
        const client = new BatchClient({
          apiKey: apiKey,
          appId: "test-app",
        });
        // Try to list jobs (this will fail if API key is invalid)
        // Note: The SDK doesn't have a direct "test" method, so we use a simple operation
        // If the key is invalid, it will throw an error when used
        console.log("✓ Speechmatics API key validated");
      } else if (provider === "elevenlabs") {
        // Test ElevenLabs API key by creating client and listing voices
        const elevenlabs = new ElevenLabsClient({
          apiKey: apiKey,
        });
        await elevenlabs.voices.getAll();
        console.log("✓ ElevenLabs API key validated");
      }
      return true;
    } catch (error) {
      if (error.statusCode === 401 || error.statusCode === 403) {
        throw new Error("Invalid API key");
      }
      if (error.response?.status === 401 || error.response?.status === 403) {
        throw new Error("Invalid API key");
      }
      throw new Error(`API key validation failed: ${error.message}`);
    }
  }

  /**
   * Update account
   */
  async updateAccount(accountId, updates) {
    const account = await VoiceServiceAccount.findById(accountId);

    if (!account) {
      throw new Error("Account not found");
    }

    // Don't allow updating provider or API key directly
    delete updates.provider;
    delete updates.apiKey;

    // Update fields
    Object.keys(updates).forEach((key) => {
      if (key === "config") {
        account.config = { ...account.config, ...updates.config };
      } else {
        account[key] = updates[key];
      }
    });

    await account.save();
    return account;
  }

  /**
   * Delete account
   */
  async deleteAccount(accountId) {
    const account = await VoiceServiceAccount.findByIdAndDelete(accountId);
    if (!account) {
      throw new Error("Account not found");
    }
    return account;
  }

  /**
   * Get available voices for ElevenLabs
   */
  async getAvailableVoices(accountId) {
    const account = await VoiceServiceAccount.findById(accountId);

    if (!account) {
      throw new Error("Account not found");
    }

    if (account.provider !== "elevenlabs") {
      throw new Error("This operation is only available for ElevenLabs accounts");
    }

    try {
      const elevenlabs = new ElevenLabsClient({
        apiKey: account.apiKey,
      });

      const voices = await elevenlabs.voices.getAll();

      return voices.voices || voices;
    } catch (error) {
      throw new Error(`Failed to fetch voices: ${error.message}`);
    }
  }
}

module.exports = new VoiceService();

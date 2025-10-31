const axios = require("axios");
const VoiceServiceAccount = require("../models/VoiceServiceAccount");
const fs = require("fs");
const FormData = require("form-data");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const path = require("path");
const WebSocket = require("ws");

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
    try {
      // Increment rate limit
      await account.incrementRateLimit();

      // Get audio duration
      const audioSeconds = await this.getAudioDuration(filePath);

      // Convert to supported format if needed
      const convertedPath = await this.convertAudio(filePath, "mp3");

      // Prepare the request
      const audioBuffer = fs.readFileSync(convertedPath);

      // Speechmatics Real-time API endpoint
      const apiUrl = "https://asr.api.speechmatics.com/v2/jobs";

      // Create config for Speechmatics
      const config = {
        type: "transcription",
        transcription_config: {
          language: account.config.language || "bn", // Bengali by default
          operating_point: account.config.operatingPoint || "standard",
          enable_partials: false,
          max_delay: 5,
        },
      };

      // Create form data
      const form = new FormData();
      form.append("data_file", audioBuffer, {
        filename: path.basename(convertedPath),
        contentType: "audio/mpeg",
      });
      form.append("config", JSON.stringify(config));

      // Make request to Speechmatics
      const response = await axios.post(apiUrl, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${account.apiKey}`,
        },
      });

      const jobId = response.data.id;

      // Poll for job completion
      const result = await this.pollSpeechmaticsJob(jobId, account.apiKey);

      // Clean up converted file
      if (convertedPath !== filePath) {
        try {
          fs.unlinkSync(convertedPath);
        } catch (err) {
          console.error("Error cleaning up converted file:", err);
        }
      }

      if (!result.success) {
        throw new Error(result.error || "Transcription failed");
      }

      // Record usage
      await account.recordTranscriptionUsage(audioSeconds, 0);
      await account.resetErrors();

      console.log(
        `✅ Speechmatics transcription completed. Account: ${account.name}, Duration: ${audioSeconds}s`
      );

      return {
        success: true,
        text: result.text,
        audioSeconds,
        accountUsed: account.name,
        provider: "speechmatics",
        language: result.language || account.config.language,
      };
    } catch (error) {
      await account.recordError(error.message);
      throw error;
    }
  }

  /**
   * Poll Speechmatics job for completion
   */
  async pollSpeechmaticsJob(jobId, apiKey, maxAttempts = 60) {
    const apiUrl = `https://asr.api.speechmatics.com/v2/jobs/${jobId}`;

    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await axios.get(apiUrl, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });

        const { job } = response.data;

        if (job.status === "done") {
          // Get transcript
          const transcriptResponse = await axios.get(
            `${apiUrl}/transcript`,
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
            }
          );

          const transcript = transcriptResponse.data;
          const text = transcript.results
            ?.map((r) => r.alternatives?.[0]?.content)
            .filter(Boolean)
            .join(" ");

          return {
            success: true,
            text: text || "",
            language: transcript.metadata?.language,
          };
        } else if (job.status === "rejected") {
          return {
            success: false,
            error: job.errors?.[0]?.message || "Job rejected",
          };
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        console.error("Error polling Speechmatics job:", error.message);
      }
    }

    return { success: false, error: "Transcription timeout" };
  }

  /**
   * Generate speech using ElevenLabs
   * Supports Bengali and multilingual voices
   */
  async generateSpeechWithElevenLabs(text, account) {
    try {
      // Increment rate limit
      await account.incrementRateLimit();

      const voiceId = account.config.voiceId || "pNInz6obpgDQGcFmaJgB"; // Default voice
      const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

      const requestBody = {
        text: text,
        model_id: account.config.modelId || "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      };

      const response = await axios.post(apiUrl, requestBody, {
        headers: {
          "xi-api-key": account.apiKey,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
      });

      // Record usage
      const characters = text.length;
      await account.recordTTSUsage(characters, 0);
      await account.resetErrors();

      console.log(
        `✅ ElevenLabs TTS completed. Account: ${account.name}, Characters: ${characters}`
      );

      return {
        success: true,
        audioBuffer: response.data,
        characters,
        accountUsed: account.name,
        provider: "elevenlabs",
      };
    } catch (error) {
      await account.recordError(error.message);
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
        // Test Speechmatics API key by checking account info
        await axios.get("https://asr.api.speechmatics.com/v2/jobs", {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
          params: {
            limit: 1,
          },
        });
      } else if (provider === "elevenlabs") {
        // Test ElevenLabs API key by getting voice list
        await axios.get("https://api.elevenlabs.io/v1/voices", {
          headers: {
            "xi-api-key": apiKey,
          },
        });
      }
      return true;
    } catch (error) {
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
      const response = await axios.get("https://api.elevenlabs.io/v1/voices", {
        headers: {
          "xi-api-key": account.apiKey,
        },
      });

      return response.data.voices;
    } catch (error) {
      throw new Error(`Failed to fetch voices: ${error.message}`);
    }
  }
}

module.exports = new VoiceService();

const axios = require("axios");
const AssemblyAIAccount = require("../models/AssemblyAIAccount");
const fs = require("fs");
const FormData = require("form-data");

// AssemblyAI pricing per second (Nano tier: $0.12/hour = $0.00003333/second)
const NANO_TIER_COST_PER_SECOND = 0.00003333;

class VoiceTranscriptionService {
  /**
   * Upload audio file to AssemblyAI
   */
  async uploadAudio(filePath, apiKey) {
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath));

    const response = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      form,
      {
        headers: {
          ...form.getHeaders(),
          authorization: apiKey,
        },
      }
    );

    return response.data.upload_url;
  }

  /**
   * Create transcription request
   */
  async createTranscription(audioUrl, apiKey, options = {}) {
    const response = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      {
        audio_url: audioUrl,
        language_code: options.language || "en",
        punctuate: true,
        format_text: true,
        ...options,
      },
      {
        headers: {
          authorization: apiKey,
          "content-type": "application/json",
        },
      }
    );

    return response.data;
  }

  /**
   * Poll for transcription completion
   */
  async pollTranscription(transcriptId, apiKey, maxAttempts = 60) {
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await axios.get(
        `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
        {
          headers: {
            authorization: apiKey,
          },
        }
      );

      const { status, text, error } = response.data;

      if (status === "completed") {
        return { success: true, text, data: response.data };
      } else if (status === "error") {
        return { success: false, error };
      }

      // Wait 1 second before next poll
      await new Promise((resolve) => setTimeout(resolve, 1000));
      attempts++;
    }

    return { success: false, error: "Transcription timeout" };
  }

  /**
   * Get audio duration from file (in seconds)
   * For now, we'll estimate based on file size (this is approximate)
   * Better to get actual duration from audio metadata
   */
  getAudioDuration(filePath) {
    const stats = fs.statSync(filePath);
    const fileSizeInBytes = stats.size;

    // Rough estimate: 1 second of voice audio ≈ 16KB (at 128kbps)
    // This is very approximate and should be replaced with actual audio duration
    const estimatedSeconds = fileSizeInBytes / 16000;

    return Math.ceil(estimatedSeconds);
  }

  /**
   * Calculate cost based on audio duration
   */
  calculateCost(audioSeconds) {
    return audioSeconds * NANO_TIER_COST_PER_SECOND;
  }

  /**
   * Main transcription method with round-robin account selection
   */
  async transcribeAudio(filePath, options = {}) {
    // Get next available account
    const account = await AssemblyAIAccount.getNextAvailableAccount();

    if (!account) {
      throw new Error(
        "No available AssemblyAI accounts. All accounts are exhausted, rate-limited, or expired."
      );
    }

    try {
      // Check and increment rate limit
      await account.incrementRateLimit();

      // Upload audio file
      console.log(
        `Using AssemblyAI account: ${account.name} (${account.usagePercentage.toFixed(1)}% used)`
      );
      const audioUrl = await this.uploadAudio(filePath, account.apiKey);

      // Create transcription
      const transcription = await this.createTranscription(
        audioUrl,
        account.apiKey,
        options
      );

      // Poll for completion
      const result = await this.pollTranscription(
        transcription.id,
        account.apiKey
      );

      if (!result.success) {
        await account.recordError(result.error);
        throw new Error(`Transcription failed: ${result.error}`);
      }

      // Get audio duration from the result
      const audioSeconds = result.data.audio_duration || 0;

      // Calculate and record usage
      const cost = this.calculateCost(audioSeconds);
      await account.recordUsage(audioSeconds, cost);
      await account.resetErrors();

      console.log(
        `Transcription completed. Audio: ${audioSeconds}s, Cost: $${cost.toFixed(4)}, Remaining: $${account.remainingCredits.toFixed(2)}`
      );

      return {
        success: true,
        text: result.text,
        audioSeconds,
        cost,
        accountUsed: account.name,
        remainingCredits: account.remainingCredits,
      };
    } catch (error) {
      await account.recordError(error.message);
      throw error;
    }
  }

  /**
   * Get all accounts status
   */
  async getAllAccountsStatus() {
    const accounts = await AssemblyAIAccount.find().sort({ createdAt: 1 });

    return accounts.map((account) => ({
      id: account._id,
      name: account.name,
      status: account.status,
      totalCredits: account.totalCredits,
      usedCredits: account.usedCredits,
      remainingCredits: account.remainingCredits,
      usagePercentage: account.usagePercentage,
      totalTranscriptions: account.totalTranscriptions,
      totalAudioSeconds: account.totalAudioSeconds,
      totalAudioHours: (account.totalAudioSeconds / 3600).toFixed(2),
      trialEndDate: account.trialEndDate,
      isExpired: account.isExpired,
      hasCredits: account.hasCredits,
      lastUsedAt: account.lastUsedAt,
      lastError: account.lastError,
      errorCount: account.errorCount,
    }));
  }

  /**
   * Add new account
   */
  async addAccount(apiKey, name = "AssemblyAI Account") {
    // Test the API key first
    try {
      await axios.get("https://api.assemblyai.com/v2/transcript", {
        headers: {
          authorization: apiKey,
        },
      });
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error("Invalid API key");
      }
    }

    const account = new AssemblyAIAccount({
      apiKey,
      name,
    });

    await account.save();
    return account;
  }

  /**
   * Delete account
   */
  async deleteAccount(accountId) {
    const account = await AssemblyAIAccount.findByIdAndDelete(accountId);
    if (!account) {
      throw new Error("Account not found");
    }
    return account;
  }

  /**
   * Update account
   */
  async updateAccount(accountId, updates) {
    const account = await AssemblyAIAccount.findByIdAndUpdate(
      accountId,
      updates,
      { new: true }
    );

    if (!account) {
      throw new Error("Account not found");
    }

    return account;
  }
}

module.exports = new VoiceTranscriptionService();

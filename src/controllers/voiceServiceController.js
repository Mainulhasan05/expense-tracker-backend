const voiceService = require("../services/voiceService");

/**
 * Get all voice service accounts status
 */
exports.getAllAccounts = async (req, res) => {
  try {
    const accounts = await voiceService.getAllAccountsStatus();
    const stats = await voiceService.getProviderStats();

    res.status(200).json({
      success: true,
      accounts,
      stats,
    });
  } catch (error) {
    console.error("Error getting voice service accounts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get accounts",
      error: error.message,
    });
  }
};

/**
 * Add new voice service account
 */
exports.addAccount = async (req, res) => {
  try {
    const { name, provider, apiKey, priority, totalCredits, planType, config, notes } = req.body;

    if (!provider || !apiKey) {
      return res.status(400).json({
        success: false,
        message: "Provider and API key are required",
      });
    }

    const account = await voiceService.addAccount({
      name,
      provider,
      apiKey,
      priority,
      totalCredits,
      planType,
      config,
      notes,
    });

    res.status(201).json({
      success: true,
      message: `${provider} account added successfully`,
      account: {
        id: account._id,
        name: account.name,
        provider: account.provider,
        priority: account.priority,
        status: account.status,
        planType: account.planType,
        remainingCredits: account.remainingCredits,
        trialEndDate: account.trialEndDate,
      },
    });
  } catch (error) {
    console.error("Error adding voice service account:", error);

    if (error.message === "Invalid API key") {
      return res.status(400).json({
        success: false,
        message: "Invalid API key. Please check and try again.",
      });
    }

    if (error.message.includes("Invalid provider")) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "This API key has already been added",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to add account",
      error: error.message,
    });
  }
};

/**
 * Update voice service account
 */
exports.updateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const account = await voiceService.updateAccount(id, updates);

    res.status(200).json({
      success: true,
      message: "Account updated successfully",
      account: {
        id: account._id,
        name: account.name,
        provider: account.provider,
        priority: account.priority,
        status: account.status,
        remainingCredits: account.remainingCredits,
        config: account.config,
      },
    });
  } catch (error) {
    console.error("Error updating voice service account:", error);

    if (error.message === "Account not found") {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to update account",
      error: error.message,
    });
  }
};

/**
 * Delete voice service account
 */
exports.deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;

    await voiceService.deleteAccount(id);

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting voice service account:", error);

    if (error.message === "Account not found") {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to delete account",
      error: error.message,
    });
  }
};

/**
 * Test transcription with a sample audio
 */
exports.testTranscription = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Audio file is required",
      });
    }

    const result = await voiceService.transcribeAudio(req.file.path);

    // Clean up uploaded file
    const fs = require("fs");
    try {
      fs.unlinkSync(req.file.path);
    } catch (err) {
      console.error("Error deleting test file:", err);
    }

    res.status(200).json({
      success: true,
      message: "Transcription completed",
      result,
    });
  } catch (error) {
    console.error("Error testing transcription:", error);

    // Clean up uploaded file on error
    if (req.file) {
      const fs = require("fs");
      try {
        fs.unlinkSync(req.file.path);
      } catch (e) {
        console.error("Error cleaning up test file:", e);
      }
    }

    res.status(500).json({
      success: false,
      message: "Transcription failed",
      error: error.message,
    });
  }
};

/**
 * Test TTS with sample text
 */
exports.testTTS = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({
        success: false,
        message: "Text is required",
      });
    }

    const result = await voiceService.generateSpeech(text);

    res.status(200).json({
      success: true,
      message: "TTS completed",
      audioData: result.audioBuffer.toString("base64"),
      characters: result.characters,
      accountUsed: result.accountUsed,
      provider: result.provider,
    });
  } catch (error) {
    console.error("Error testing TTS:", error);

    res.status(500).json({
      success: false,
      message: "TTS failed",
      error: error.message,
    });
  }
};

/**
 * Get available voices (ElevenLabs only)
 */
exports.getVoices = async (req, res) => {
  try {
    const { id } = req.params;

    const voices = await voiceService.getAvailableVoices(id);

    res.status(200).json({
      success: true,
      voices,
    });
  } catch (error) {
    console.error("Error getting voices:", error);

    if (error.message === "Account not found") {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to get voices",
      error: error.message,
    });
  }
};

/**
 * Get provider statistics
 */
exports.getStats = async (req, res) => {
  try {
    const stats = await voiceService.getProviderStats();

    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error("Error getting provider stats:", error);

    res.status(500).json({
      success: false,
      message: "Failed to get statistics",
      error: error.message,
    });
  }
};

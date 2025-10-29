const voiceTranscriptionService = require("../services/voiceTranscriptionService");

/**
 * Get all AssemblyAI accounts status
 */
exports.getAllAccounts = async (req, res) => {
  try {
    const accounts = await voiceTranscriptionService.getAllAccountsStatus();
    res.status(200).json({
      success: true,
      accounts,
    });
  } catch (error) {
    console.error("Error getting AssemblyAI accounts:", error);
    res.status(500).json({
      success: false,
      message: "Failed to get accounts",
      error: error.message,
    });
  }
};

/**
 * Add new AssemblyAI account
 */
exports.addAccount = async (req, res) => {
  try {
    const { apiKey, name } = req.body;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: "API key is required",
      });
    }

    const account = await voiceTranscriptionService.addAccount(
      apiKey,
      name || "AssemblyAI Account"
    );

    res.status(201).json({
      success: true,
      message: "AssemblyAI account added successfully",
      account: {
        id: account._id,
        name: account.name,
        status: account.status,
        remainingCredits: account.remainingCredits,
        trialEndDate: account.trialEndDate,
      },
    });
  } catch (error) {
    console.error("Error adding AssemblyAI account:", error);

    if (error.message === "Invalid API key") {
      return res.status(400).json({
        success: false,
        message: "Invalid API key. Please check and try again.",
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
 * Update AssemblyAI account
 */
exports.updateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Don't allow updating the API key
    delete updates.apiKey;

    const account = await voiceTranscriptionService.updateAccount(id, updates);

    res.status(200).json({
      success: true,
      message: "Account updated successfully",
      account: {
        id: account._id,
        name: account.name,
        status: account.status,
        remainingCredits: account.remainingCredits,
      },
    });
  } catch (error) {
    console.error("Error updating AssemblyAI account:", error);

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
 * Delete AssemblyAI account
 */
exports.deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;

    await voiceTranscriptionService.deleteAccount(id);

    res.status(200).json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting AssemblyAI account:", error);

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

    const result = await voiceTranscriptionService.transcribeAudio(
      req.file.path
    );

    // Clean up uploaded file
    const fs = require("fs");
    fs.unlinkSync(req.file.path);

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
      } catch (e) {}
    }

    res.status(500).json({
      success: false,
      message: "Transcription failed",
      error: error.message,
    });
  }
};

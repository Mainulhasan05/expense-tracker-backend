const ClarifaiAccount = require("../models/ClarifaiAccount");
const clarifaiService = require("../services/clarifaiService");
const Category = require("../models/Category");

/**
 * Get all Clarifai accounts
 */
exports.getAllAccounts = async (req, res) => {
  try {
    const accounts = await ClarifaiAccount.find().sort({ priority: -1, createdAt: -1 });

    // Don't send full PAT in response (security)
    const sanitizedAccounts = accounts.map((account) => ({
      _id: account._id,
      name: account.name,
      pat: account.pat.substring(0, 8) + "..." + account.pat.substring(account.pat.length - 4),
      userId: account.userId,
      appId: account.appId,
      modelId: account.modelId,
      modelVersionId: account.modelVersionId,
      isActive: account.isActive,
      priority: account.priority,
      usage: account.usage,
      limits: account.limits,
      notes: account.notes,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    }));

    res.json({
      success: true,
      accounts: sanitizedAccounts,
      total: accounts.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch accounts",
      error: error.message,
    });
  }
};

/**
 * Add a new Clarifai account
 */
exports.addAccount = async (req, res) => {
  try {
    const {
      name,
      pat,
      userId,
      appId,
      modelId,
      modelVersionId,
      priority,
      monthlyLimit,
      dailyLimit,
      notes,
    } = req.body;

    // Validation
    if (!name || !pat) {
      return res.status(400).json({
        success: false,
        message: "Name and PAT are required",
      });
    }

    // Create new account
    const account = await ClarifaiAccount.create({
      name,
      pat,
      userId: userId || "openai",
      appId: appId || "chat-completion",
      modelId: modelId || "gpt-oss-120b",
      modelVersionId: modelVersionId || "b3c129d719144dd49f4cb8cb96585223",
      priority: priority || 1,
      limits: {
        monthlyLimit: monthlyLimit || 1000,
        dailyLimit: dailyLimit || 50,
      },
      notes,
    });

    res.status(201).json({
      success: true,
      message: "Clarifai account added successfully",
      account: {
        _id: account._id,
        name: account.name,
        isActive: account.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to add account",
      error: error.message,
    });
  }
};

/**
 * Update an existing Clarifai account
 */
exports.updateAccount = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      pat,
      userId,
      appId,
      modelId,
      modelVersionId,
      isActive,
      priority,
      monthlyLimit,
      dailyLimit,
      notes,
    } = req.body;

    const account = await ClarifaiAccount.findById(id);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    // Update fields
    if (name) account.name = name;
    if (pat) account.pat = pat;
    if (userId) account.userId = userId;
    if (appId) account.appId = appId;
    if (modelId) account.modelId = modelId;
    if (modelVersionId) account.modelVersionId = modelVersionId;
    if (typeof isActive === "boolean") account.isActive = isActive;
    if (priority) account.priority = priority;
    if (monthlyLimit) account.limits.monthlyLimit = monthlyLimit;
    if (dailyLimit) account.limits.dailyLimit = dailyLimit;
    if (notes !== undefined) account.notes = notes;

    await account.save();

    res.json({
      success: true,
      message: "Account updated successfully",
      account: {
        _id: account._id,
        name: account.name,
        isActive: account.isActive,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update account",
      error: error.message,
    });
  }
};

/**
 * Delete a Clarifai account
 */
exports.deleteAccount = async (req, res) => {
  try {
    const { id } = req.params;

    const account = await ClarifaiAccount.findByIdAndDelete(id);
    if (!account) {
      return res.status(404).json({
        success: false,
        message: "Account not found",
      });
    }

    res.json({
      success: true,
      message: "Account deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete account",
      error: error.message,
    });
  }
};

/**
 * Test a Clarifai account
 */
exports.testAccount = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await clarifaiService.testAccount(id);

    if (result.success) {
      res.json({
        success: true,
        message: "Account test successful",
        response: result.response,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Account test failed",
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to test account",
      error: error.message,
    });
  }
};

/**
 * Get usage statistics for all accounts
 */
exports.getUsageStats = async (req, res) => {
  try {
    const result = await clarifaiService.getUsageStats();

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get usage stats",
      error: error.message,
    });
  }
};

/**
 * Parse a user message to extract transaction(s)
 * This endpoint can be used by the mobile app or Telegram bot
 */
exports.parseMessage = async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user._id;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    // Get user's categories for better AI suggestions
    const categories = await Category.find({ user: userId });

    // Parse the message
    const result = await clarifaiService.parseTransaction(message, categories);

    if (result.success) {
      res.json({
        success: true,
        data: result.data,
        accountUsed: result.accountUsed,
        duration: result.duration,
      });
    } else {
      res.status(400).json({
        success: false,
        message: "Failed to parse message",
        error: result.error,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to parse message",
      error: error.message,
    });
  }
};

/**
 * Test parsing with a sample message (admin only)
 */
exports.testParsing = async (req, res) => {
  try {
    const { message, categories } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: "Message is required",
      });
    }

    const sampleCategories = categories || [
      { name: "Groceries", type: "expense" },
      { name: "Transport", type: "expense" },
      { name: "Food", type: "expense" },
      { name: "Salary", type: "income" },
    ];

    const result = await clarifaiService.parseTransaction(message, sampleCategories);

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to test parsing",
      error: error.message,
    });
  }
};

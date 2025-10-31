const mongoose = require("mongoose");

const clarifaiAccountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    pat: {
      // Personal Access Token
      type: String,
      required: true,
      trim: true,
    },
    userId: {
      type: String,
      required: true,
      default: "openai",
      trim: true,
    },
    appId: {
      type: String,
      required: true,
      default: "chat-completion",
      trim: true,
    },
    modelId: {
      type: String,
      required: true,
      default: "gpt-oss-120b",
      trim: true,
    },
    modelVersionId: {
      type: String,
      required: false, // No longer needed with OpenAI API
      trim: true,
    },
    modelUrl: {
      // URL-based model identifier (e.g., https://clarifai.com/openai/chat-completion/models/gpt-oss-120b)
      type: String,
      required: false,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    priority: {
      type: Number,
      default: 1,
      min: 1,
      max: 100,
    },
    usage: {
      totalRequests: {
        type: Number,
        default: 0,
      },
      successfulRequests: {
        type: Number,
        default: 0,
      },
      failedRequests: {
        type: Number,
        default: 0,
      },
      lastUsed: {
        type: Date,
        default: null,
      },
      monthlyRequests: {
        type: Number,
        default: 0,
      },
      lastMonthReset: {
        type: Date,
        default: Date.now,
      },
    },
    limits: {
      monthlyLimit: {
        type: Number,
        default: 1000, // Adjust based on Clarifai free tier
      },
      dailyLimit: {
        type: Number,
        default: 50,
      },
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Method to check if account has reached limits
clarifaiAccountSchema.methods.hasReachedLimit = function () {
  const now = new Date();
  const lastReset = new Date(this.usage.lastMonthReset);
  const daysSinceReset = Math.floor((now - lastReset) / (1000 * 60 * 60 * 24));

  // Reset monthly counter if it's been more than 30 days
  if (daysSinceReset >= 30) {
    this.usage.monthlyRequests = 0;
    this.usage.lastMonthReset = now;
  }

  // Check limits
  if (this.usage.monthlyRequests >= this.limits.monthlyLimit) {
    return true;
  }

  return false;
};

// Method to increment usage
clarifaiAccountSchema.methods.incrementUsage = async function (success = true) {
  this.usage.totalRequests += 1;
  this.usage.monthlyRequests += 1;
  this.usage.lastUsed = new Date();

  if (success) {
    this.usage.successfulRequests += 1;
  } else {
    this.usage.failedRequests += 1;
  }

  await this.save();
};

// Static method to get available account with least usage
clarifaiAccountSchema.statics.getAvailableAccount = async function () {
  const accounts = await this.find({ isActive: true }).sort({ priority: -1 });

  // Check each account for availability
  for (const account of accounts) {
    if (!account.hasReachedLimit()) {
      return account;
    }
  }

  // If all accounts are at limit, return the one with lowest usage
  return await this.findOne({ isActive: true }).sort({ "usage.monthlyRequests": 1 });
};

module.exports = mongoose.model("ClarifaiAccount", clarifaiAccountSchema);

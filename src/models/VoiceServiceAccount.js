const mongoose = require("mongoose");

const voiceServiceAccountSchema = new mongoose.Schema(
  {
    // Account details
    name: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      enum: ["speechmatics", "elevenlabs"],
      required: true,
    },
    apiKey: {
      type: String,
      required: true,
    },

    // Priority system (higher number = higher priority)
    // Speechmatics will have higher priority than ElevenLabs
    priority: {
      type: Number,
      default: function() {
        return this.provider === "speechmatics" ? 10 : 5;
      },
    },

    // Credits/Usage tracking
    totalCredits: {
      type: Number,
      default: 0, // Set based on plan
    },
    usedCredits: {
      type: Number,
      default: 0,
    },
    remainingCredits: {
      type: Number,
      default: function() {
        return this.totalCredits;
      },
    },

    // Usage statistics
    totalRequests: {
      type: Number,
      default: 0,
    },
    totalAudioSeconds: {
      type: Number,
      default: 0,
    },
    totalCharactersGenerated: {
      type: Number,
      default: 0, // For ElevenLabs TTS
    },

    // Rate limiting
    requestsThisMinute: {
      type: Number,
      default: 0,
    },
    lastRequestTime: {
      type: Date,
      default: null,
    },
    rateLimit: {
      type: Number,
      default: function() {
        return this.provider === "speechmatics" ? 10 : 20;
      },
    },

    // Account status
    status: {
      type: String,
      enum: ["active", "exhausted", "expired", "error", "disabled"],
      default: "active",
    },

    // Provider-specific configuration
    config: {
      // Speechmatics specific
      language: {
        type: String,
        default: "bn", // Bengali by default
      },
      operatingPoint: {
        type: String,
        enum: ["standard", "enhanced"],
        default: "standard",
      },
      // ElevenLabs specific
      voiceId: {
        type: String,
        default: null,
      },
      modelId: {
        type: String,
        default: "eleven_multilingual_v2", // Supports Bengali
      },
    },

    // Subscription/Trial tracking
    planType: {
      type: String,
      enum: ["free", "trial", "paid"],
      default: "trial",
    },
    trialStartDate: {
      type: Date,
      default: Date.now,
    },
    trialEndDate: {
      type: Date,
      default: function() {
        return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      },
    },

    // Usage tracking
    lastUsedAt: {
      type: Date,
      default: null,
    },

    // Error tracking
    lastError: {
      type: String,
      default: null,
    },
    errorCount: {
      type: Number,
      default: 0,
    },

    // Notes
    notes: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
voiceServiceAccountSchema.index({ provider: 1, status: 1, priority: -1 });
voiceServiceAccountSchema.index({ lastUsedAt: 1 });

// Virtual for checking if account is expired
voiceServiceAccountSchema.virtual("isExpired").get(function () {
  if (this.planType === "paid") return false;
  return new Date() > this.trialEndDate;
});

// Virtual for checking if account has credits
voiceServiceAccountSchema.virtual("hasCredits").get(function () {
  if (this.totalCredits === 0) return true; // Unlimited
  return this.remainingCredits > 0;
});

// Virtual for usage percentage
voiceServiceAccountSchema.virtual("usagePercentage").get(function () {
  if (this.totalCredits === 0) return 0; // Unlimited
  return (this.usedCredits / this.totalCredits) * 100;
});

// Method to update usage after transcription (Speechmatics)
voiceServiceAccountSchema.methods.recordTranscriptionUsage = async function (
  audioSeconds,
  cost = 0
) {
  this.totalAudioSeconds += audioSeconds;
  this.totalRequests += 1;

  if (cost > 0) {
    this.usedCredits += cost;
    this.remainingCredits = this.totalCredits - this.usedCredits;
  }

  this.lastUsedAt = new Date();

  // Check if exhausted
  if (this.totalCredits > 0 && this.remainingCredits <= 0) {
    this.status = "exhausted";
  }

  // Check if expired
  if (this.isExpired) {
    this.status = "expired";
  }

  await this.save();
};

// Method to update usage after TTS (ElevenLabs)
voiceServiceAccountSchema.methods.recordTTSUsage = async function (
  characters,
  cost = 0
) {
  this.totalCharactersGenerated += characters;
  this.totalRequests += 1;

  if (cost > 0) {
    this.usedCredits += cost;
    this.remainingCredits = this.totalCredits - this.usedCredits;
  }

  this.lastUsedAt = new Date();

  // Check if exhausted
  if (this.totalCredits > 0 && this.remainingCredits <= 0) {
    this.status = "exhausted";
  }

  // Check if expired
  if (this.isExpired) {
    this.status = "expired";
  }

  await this.save();
};

// Method to check and reset rate limit
voiceServiceAccountSchema.methods.checkRateLimit = function () {
  const now = new Date();
  const lastRequest = this.lastRequestTime || new Date(0);
  const timeDiff = now - lastRequest;

  // Reset counter if more than 1 minute has passed
  if (timeDiff > 60000) {
    this.requestsThisMinute = 0;
  }

  // Check if rate limit exceeded
  if (this.requestsThisMinute >= this.rateLimit) {
    return false; // Rate limit exceeded
  }

  return true; // Can make request
};

// Method to increment rate limit counter
voiceServiceAccountSchema.methods.incrementRateLimit = async function () {
  const now = new Date();
  const lastRequest = this.lastRequestTime || new Date(0);
  const timeDiff = now - lastRequest;

  // Reset counter if more than 1 minute has passed
  if (timeDiff > 60000) {
    this.requestsThisMinute = 1;
  } else {
    this.requestsThisMinute += 1;
  }

  this.lastRequestTime = now;
  await this.save();
};

// Method to record error
voiceServiceAccountSchema.methods.recordError = async function (error) {
  this.lastError = error;
  this.errorCount += 1;

  // Mark as error status if too many consecutive errors
  if (this.errorCount >= 5) {
    this.status = "error";
  }

  await this.save();
};

// Method to reset error count (after successful request)
voiceServiceAccountSchema.methods.resetErrors = async function () {
  this.errorCount = 0;
  this.lastError = null;
  if (this.status === "error") {
    this.status = "active";
  }
  await this.save();
};

// Static method to get next available account with priority
// Speechmatics has higher priority than ElevenLabs
voiceServiceAccountSchema.statics.getNextAvailableAccount = async function (
  provider = null
) {
  const query = {
    status: "active",
    $or: [
      { totalCredits: 0 }, // Unlimited credits
      { remainingCredits: { $gt: 0 } }, // Has remaining credits
    ],
  };

  // If provider is specified, filter by provider
  if (provider) {
    query.provider = provider;
  }

  // Check for expired trials
  const now = new Date();
  query.$or.push({
    $or: [
      { planType: "paid" },
      { trialEndDate: { $gt: now } },
    ],
  });

  // Find available accounts, sorted by priority (desc) and lastUsedAt (asc)
  // This ensures Speechmatics accounts are used first
  const availableAccounts = await this.find(query).sort({
    priority: -1, // Higher priority first
    lastUsedAt: 1, // Least recently used
  });

  // Check each account for rate limit
  for (const account of availableAccounts) {
    if (account.checkRateLimit()) {
      return account;
    }
  }

  return null; // No available account
};

// Static method to get account statistics by provider
voiceServiceAccountSchema.statics.getProviderStats = async function () {
  const speechmaticsAccounts = await this.find({ provider: "speechmatics" });
  const elevenlabsAccounts = await this.find({ provider: "elevenlabs" });

  const calculateStats = (accounts) => {
    return {
      total: accounts.length,
      active: accounts.filter((a) => a.status === "active").length,
      totalRequests: accounts.reduce((sum, a) => sum + a.totalRequests, 0),
      totalAudioSeconds: accounts.reduce((sum, a) => sum + a.totalAudioSeconds, 0),
      totalCharacters: accounts.reduce((sum, a) => sum + a.totalCharactersGenerated, 0),
    };
  };

  return {
    speechmatics: calculateStats(speechmaticsAccounts),
    elevenlabs: calculateStats(elevenlabsAccounts),
  };
};

module.exports = mongoose.model("VoiceServiceAccount", voiceServiceAccountSchema);

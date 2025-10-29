const mongoose = require("mongoose");

const assemblyAIAccountSchema = new mongoose.Schema(
  {
    apiKey: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      default: "AssemblyAI Account",
    },
    // Credits tracking
    totalCredits: {
      type: Number,
      default: 50, // $50 free tier
    },
    usedCredits: {
      type: Number,
      default: 0,
    },
    remainingCredits: {
      type: Number,
      default: 50,
    },
    // Usage statistics
    totalAudioSeconds: {
      type: Number,
      default: 0,
    },
    totalTranscriptions: {
      type: Number,
      default: 0,
    },
    // Rate limiting (5 streams per minute for free tier)
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
      default: 5, // 5 requests per minute for free tier
    },
    // Account status
    status: {
      type: String,
      enum: ["active", "exhausted", "expired", "error"],
      default: "active",
    },
    // Trial period tracking (90 days)
    trialStartDate: {
      type: Date,
      default: Date.now,
    },
    trialEndDate: {
      type: Date,
      default: function () {
        return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days from now
      },
    },
    // Last used for round-robin
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
  },
  {
    timestamps: true,
  }
);

// Virtual for checking if account is expired
assemblyAIAccountSchema.virtual("isExpired").get(function () {
  return new Date() > this.trialEndDate;
});

// Virtual for checking if account has credits
assemblyAIAccountSchema.virtual("hasCredits").get(function () {
  return this.remainingCredits > 0;
});

// Virtual for usage percentage
assemblyAIAccountSchema.virtual("usagePercentage").get(function () {
  return (this.usedCredits / this.totalCredits) * 100;
});

// Method to update usage after transcription
assemblyAIAccountSchema.methods.recordUsage = async function (
  audioSeconds,
  cost
) {
  this.totalAudioSeconds += audioSeconds;
  this.totalTranscriptions += 1;
  this.usedCredits += cost;
  this.remainingCredits = this.totalCredits - this.usedCredits;
  this.lastUsedAt = new Date();

  // Check if exhausted
  if (this.remainingCredits <= 0) {
    this.status = "exhausted";
  }

  // Check if expired
  if (this.isExpired) {
    this.status = "expired";
  }

  await this.save();
};

// Method to check and reset rate limit
assemblyAIAccountSchema.methods.checkRateLimit = function () {
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
assemblyAIAccountSchema.methods.incrementRateLimit = async function () {
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
assemblyAIAccountSchema.methods.recordError = async function (error) {
  this.lastError = error;
  this.errorCount += 1;

  // Mark as error status if too many consecutive errors
  if (this.errorCount >= 5) {
    this.status = "error";
  }

  await this.save();
};

// Method to reset error count (after successful request)
assemblyAIAccountSchema.methods.resetErrors = async function () {
  this.errorCount = 0;
  this.lastError = null;
  if (this.status === "error") {
    this.status = "active";
  }
  await this.save();
};

// Static method to get next available account (round-robin with health check)
assemblyAIAccountSchema.statics.getNextAvailableAccount = async function () {
  // Find active accounts with credits and not expired
  const availableAccounts = await this.find({
    status: "active",
    remainingCredits: { $gt: 0 },
    trialEndDate: { $gt: new Date() },
  }).sort({ lastUsedAt: 1 }); // Sort by least recently used

  // Check each account for rate limit
  for (const account of availableAccounts) {
    if (account.checkRateLimit()) {
      return account;
    }
  }

  return null; // No available account
};

module.exports = mongoose.model("AssemblyAIAccount", assemblyAIAccountSchema);

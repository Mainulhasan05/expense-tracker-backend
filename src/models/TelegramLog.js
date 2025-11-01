const mongoose = require("mongoose");

const telegramLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    telegramUserId: {
      type: String,
      required: true,
      index: true,
    },
    telegramUsername: {
      type: String,
    },
    messageType: {
      type: String,
      enum: ["text", "voice", "photo", "command"],
      required: true,
    },
    userMessage: {
      type: String,
      required: true,
    },
    botResponse: {
      type: String,
      required: true,
    },
    intent: {
      type: String,
      enum: [
        "ADD_TRANSACTION",
        "VIEW_TRANSACTIONS",
        "VIEW_BALANCE",
        "VIEW_CATEGORIES",
        "ADD_CATEGORY",
        "VIEW_REPORT",
        "GENERAL_GREETING",
        "HELP",
        "OTHER",
        "LEGACY_TRANSACTION",
      ],
    },
    success: {
      type: Boolean,
      default: true,
    },
    error: {
      type: String,
    },
    metadata: {
      voiceTranscribed: String,
      ocrExtracted: String,
      aiConfidence: Number,
      processingTime: Number,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
telegramLogSchema.index({ user: 1, createdAt: -1 });
telegramLogSchema.index({ telegramUserId: 1, createdAt: -1 });
telegramLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("TelegramLog", telegramLogSchema);

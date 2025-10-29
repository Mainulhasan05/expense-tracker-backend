const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, unique: true, sparse: true },
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    picture: { type: String },
    password: { type: String }, // required only if registered by email
    fcmToken: { type: String },
    isVerified: { type: Boolean, default: false },
    emailVerificationToken: String,
    emailVerificationExpire: Date,
    resetPasswordToken: String,
    resetPasswordExpire: Date,

    // Telegram Integration
    telegramId: { type: String, unique: true, sparse: true },
    telegramUsername: { type: String },
    telegramFirstName: { type: String },
    telegramLinkedAt: { type: Date },
    telegramLinkCode: { type: String },
    telegramLinkCodeExpiry: { type: Date },
    telegramNotifications: {
      enabled: { type: Boolean, default: true },
      dailySummary: { type: Boolean, default: true },
      dailySummaryTime: { type: String, default: "20:00" }, // 8 PM
      weeklyReport: { type: Boolean, default: true },
      budgetAlerts: { type: Boolean, default: true },
      expenseAdded: { type: Boolean, default: false }
    },

    role: { type: String, default: "user" },

    // Security & Monitoring
    registrationIp: { type: String },
    registrationGeo: {
      country: String,
      region: String,
      city: String,
      timezone: String,
      coordinates: [Number],
    },
    lastLoginIp: { type: String },
    lastLoginGeo: {
      country: String,
      region: String,
      city: String,
    },
    loginHistory: [
      {
        ip: String,
        userAgent: String,
        timestamp: { type: Date, default: Date.now },
        country: String,
        city: String,
      },
    ],
    suspiciousActivityFlags: { type: Number, default: 0 },
    accountStatus: {
      type: String,
      enum: ["active", "suspended", "flagged"],
      default: "active",
    },
  },
  { timestamps: true }
);

// Hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("User", userSchema);

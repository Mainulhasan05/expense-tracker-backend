const TelegramBot = require("node-telegram-bot-api");
const logger = require("../config/logger");

class AdminNotificationService {
  constructor() {
    this.bot = null;
    this.adminChatId = process.env.ADMIN_TELEGRAM_CHAT_ID;
    this.adminEmail = process.env.ADMIN_EMAIL;
    this.initialize();
  }

  initialize() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (token && token !== "YOUR_TELEGRAM_BOT_TOKEN_HERE") {
      this.bot = new TelegramBot(token);
    }
  }

  /**
   * Send notification to admin via Telegram
   */
  async sendToAdmin(message) {
    if (!this.bot || !this.adminChatId) {
      logger.warn("Admin Telegram notifications not configured");
      logger.info(`[ADMIN ALERT] ${message}`);
      return;
    }

    try {
      await this.bot.sendMessage(this.adminChatId, message, {
        parse_mode: "Markdown",
      });
    } catch (error) {
      logger.error("Failed to send admin notification:", error.message);
    }
  }

  /**
   * Notify admin of new user registration
   */
  async notifyNewUserRegistration(user, ip, geoInfo) {
    const location = geoInfo
      ? `${geoInfo.city || "Unknown"}, ${geoInfo.country || "Unknown"}`
      : "Unknown";

    const message =
      `🆕 *New User Registered*\n\n` +
      `👤 Name: ${user.name}\n` +
      `📧 Email: ${user.email}\n` +
      `🌍 Location: ${location}\n` +
      `📍 IP: \`${ip}\`\n` +
      `🔐 Method: ${user.googleId ? "Google OAuth" : "Email/Password"}\n` +
      `⏰ Time: ${new Date().toLocaleString()}`;

    await this.sendToAdmin(message);
  }

  /**
   * Notify admin of suspicious activity
   */
  async notifySuspiciousActivity(type, details) {
    const message =
      `⚠️ *Suspicious Activity Detected*\n\n` +
      `🚨 Type: ${type}\n` +
      `📋 Details:\n${details}\n` +
      `⏰ Time: ${new Date().toLocaleString()}`;

    await this.sendToAdmin(message);
  }

  /**
   * Notify admin of multiple failed login attempts
   */
  async notifyFailedLogins(ip, email, attempts, geoInfo) {
    const location = geoInfo
      ? `${geoInfo.city || "Unknown"}, ${geoInfo.country || "Unknown"}`
      : "Unknown";

    const message =
      `🔒 *Multiple Failed Login Attempts*\n\n` +
      `📧 Email: ${email}\n` +
      `📍 IP: \`${ip}\`\n` +
      `🌍 Location: ${location}\n` +
      `🔢 Attempts: ${attempts}\n` +
      `⏰ Time: ${new Date().toLocaleString()}`;

    await this.sendToAdmin(message);
  }

  /**
   * Notify admin of rate limit violations
   */
  async notifyRateLimitViolation(ip, path, violations) {
    const message =
      `⛔ *Rate Limit Exceeded*\n\n` +
      `📍 IP: \`${ip}\`\n` +
      `🛣️ Path: ${path}\n` +
      `🔢 Violations: ${violations}\n` +
      `⏰ Time: ${new Date().toLocaleString()}\n\n` +
      `This IP may be attempting to abuse the system.`;

    await this.sendToAdmin(message);
  }

  /**
   * Send system health status
   */
  async sendHealthStatus(stats) {
    const message =
      `💚 *System Health Check*\n\n` +
      `✅ Status: Running\n` +
      `👥 Total Users: ${stats.totalUsers}\n` +
      `🆕 New Users (24h): ${stats.newUsersToday}\n` +
      `💳 Transactions (24h): ${stats.transactionsToday}\n` +
      `🤖 Telegram Users: ${stats.telegramUsers}\n` +
      `💾 Database: ${stats.databaseStatus}\n` +
      `📧 Email Service: ${stats.emailStatus}\n` +
      `⏰ Uptime: ${stats.uptime}\n` +
      `🕐 Time: ${new Date().toLocaleString()}`;

    await this.sendToAdmin(message);
  }

  /**
   * Send error alert
   */
  async sendErrorAlert(error, context) {
    const message =
      `❌ *System Error*\n\n` +
      `🐛 Error: ${error.message}\n` +
      `📍 Context: ${context}\n` +
      `⏰ Time: ${new Date().toLocaleString()}`;

    await this.sendToAdmin(message);
  }

  /**
   * Send account suspension notification
   */
  async notifyAccountSuspension(user, reason) {
    const message =
      `🚫 *Account Suspended*\n\n` +
      `👤 User: ${user.name}\n` +
      `📧 Email: ${user.email}\n` +
      `📋 Reason: ${reason}\n` +
      `⏰ Time: ${new Date().toLocaleString()}`;

    await this.sendToAdmin(message);
  }

  /**
   * Notify admin when a new user connects their Telegram account
   */
  async notifyNewTelegramUser(user, telegramData) {
    const message =
      `🔗 *New Telegram Connection*\n\n` +
      `👤 User: ${user.name}\n` +
      `📧 Email: ${user.email}\n` +
      `🤖 Telegram: @${telegramData.username || "N/A"}\n` +
      `🆔 Telegram ID: \`${telegramData.id}\`\n` +
      `📱 First Name: ${telegramData.first_name || "N/A"}\n` +
      `⏰ Time: ${new Date().toLocaleString()}\n\n` +
      `This user can now interact with the bot.`;

    await this.sendToAdmin(message);
  }

  /**
   * Notify admin when a Telegram message fails
   */
  async notifyTelegramMessageFailure(user, messageDetails) {
    const {
      userMessage,
      intent,
      messageType,
      error,
      metadata
    } = messageDetails;

    let metadataStr = "";
    if (metadata && Object.keys(metadata).length > 0) {
      metadataStr = `\n📋 Details: ${JSON.stringify(metadata, null, 2)}`;
    }

    const message =
      `❌ *Telegram Message Failed*\n\n` +
      `👤 User: ${user.name}\n` +
      `📧 Email: ${user.email}\n` +
      `🤖 Telegram: @${user.telegramUsername || "N/A"}\n` +
      `💬 Message: "${userMessage || "N/A"}"\n` +
      `🎯 Intent: ${intent || "UNKNOWN"}\n` +
      `📝 Type: ${messageType || "text"}\n` +
      `⚠️ Error: ${error || "Unknown error"}${metadataStr}\n` +
      `⏰ Time: ${new Date().toLocaleString()}`;

    await this.sendToAdmin(message);
  }
}

module.exports = new AdminNotificationService();

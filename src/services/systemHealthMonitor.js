const cron = require("node-cron");
const mongoose = require("mongoose");
const adminNotificationService = require("./adminNotificationService");
const logger = require("../config/logger");

class SystemHealthMonitor {
  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Get system health statistics
   */
  async getHealthStats() {
    try {
      const User = require("../models/User");
      const Transaction = require("../models/Transaction");

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Get user statistics
      const totalUsers = await User.countDocuments();
      const newUsersToday = await User.countDocuments({
        createdAt: { $gte: oneDayAgo },
      });
      const telegramUsers = await User.countDocuments({
        telegramId: { $exists: true, $ne: null },
      });

      // Get transaction statistics
      const transactionsToday = await Transaction.countDocuments({
        createdAt: { $gte: oneDayAgo },
      });

      // Check database connection
      const databaseStatus =
        mongoose.connection.readyState === 1 ? "Connected" : "Disconnected";

      // Check email service (basic check)
      const emailStatus = process.env.EMAIL_USER ? "Configured" : "Not Configured";

      // Calculate uptime
      const uptimeMs = Date.now() - this.startTime;
      const uptimeHours = Math.floor(uptimeMs / (1000 * 60 * 60));
      const uptimeMinutes = Math.floor((uptimeMs % (1000 * 60 * 60)) / (1000 * 60));
      const uptime = `${uptimeHours}h ${uptimeMinutes}m`;

      return {
        totalUsers,
        newUsersToday,
        telegramUsers,
        transactionsToday,
        databaseStatus,
        emailStatus,
        uptime,
      };
    } catch (error) {
      logger.error("Error getting health stats:", error);
      return null;
    }
  }

  /**
   * Start scheduled health checks
   * Runs every 24 hours at 9 AM
   */
  startHealthChecks() {
    // Send daily health report at 9 AM
    cron.schedule("0 9 * * *", async () => {
      logger.info("Running scheduled health check");
      const stats = await this.getHealthStats();

      if (stats) {
        await adminNotificationService.sendHealthStatus(stats);
        logger.info("Health report sent to admin");
      }
    });

    logger.info("✅ System health monitoring started (Daily at 9 AM)");
  }

  /**
   * Manual health check (for testing or on-demand checks)
   */
  async performHealthCheck() {
    const stats = await this.getHealthStats();

    if (stats) {
      await adminNotificationService.sendHealthStatus(stats);
      return stats;
    }

    return null;
  }

  /**
   * Monitor critical errors
   */
  monitorErrors() {
    // Catch unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled Rejection at:", promise, "reason:", reason);

      adminNotificationService.sendErrorAlert(
        {
          message: reason?.message || String(reason),
        },
        "Unhandled Promise Rejection"
      );
    });

    // Catch uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught Exception:", error);

      adminNotificationService.sendErrorAlert(error, "Uncaught Exception");

      // Give time for the notification to be sent before exiting
      setTimeout(() => {
        process.exit(1);
      }, 1000);
    });

    logger.info("✅ Error monitoring enabled");
  }
}

module.exports = new SystemHealthMonitor();

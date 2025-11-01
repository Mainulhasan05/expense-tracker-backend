const TelegramLog = require('../models/TelegramLog');
const User = require('../models/User');
const logger = require('../config/logger');

/**
 * Get all Telegram logs with pagination and filtering
 */
exports.getAllLogs = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      userId,
      intent,
      messageType,
      success,
      startDate,
      endDate
    } = req.query;

    // Build query
    const query = {};

    if (userId) {
      query.user = userId;
    }

    if (intent) {
      query.intent = intent;
    }

    if (messageType) {
      query.messageType = messageType;
    }

    if (success !== undefined) {
      query.success = success === 'true';
    }

    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        query.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        query.createdAt.$lte = new Date(endDate);
      }
    }

    // Execute query with pagination
    const logs = await TelegramLog.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await TelegramLog.countDocuments(query);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching telegram logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching logs',
      error: error.message
    });
  }
};

/**
 * Get logs for a specific user
 */
exports.getUserLogs = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      page = 1,
      limit = 50,
      intent,
      messageType
    } = req.query;

    const query = { user: userId };

    if (intent) {
      query.intent = intent;
    }

    if (messageType) {
      query.messageType = messageType;
    }

    const logs = await TelegramLog.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await TelegramLog.countDocuments(query);

    // Get user info
    const user = await User.findById(userId).select('name email lastTelegramActivity telegramMessageCount');

    res.json({
      success: true,
      data: {
        user,
        logs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching user telegram logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user logs',
      error: error.message
    });
  }
};

/**
 * Delete a specific log entry
 */
exports.deleteLog = async (req, res) => {
  try {
    const { logId } = req.params;

    const log = await TelegramLog.findByIdAndDelete(logId);

    if (!log) {
      return res.status(404).json({
        success: false,
        message: 'Log not found'
      });
    }

    res.json({
      success: true,
      message: 'Log deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting telegram log:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting log',
      error: error.message
    });
  }
};

/**
 * Get Telegram activity statistics
 */
exports.getActivityStats = async (req, res) => {
  try {
    // Get overall statistics - optimized to use counts only
    const totalMessages = await TelegramLog.countDocuments();
    const totalUsers = await User.countDocuments({
      telegramId: { $exists: true, $ne: null }
    });

    // Get most recently active user (for displaying last activity)
    const lastActiveUser = await User.findOne({
      telegramId: { $exists: true, $ne: null },
      lastTelegramActivity: { $exists: true }
    })
      .select('name email lastTelegramActivity')
      .sort({ lastTelegramActivity: -1 });

    // Get message statistics by type
    const messagesByType = await TelegramLog.aggregate([
      {
        $group: {
          _id: '$messageType',
          count: { $sum: 1 }
        }
      }
    ]);

    // Get message statistics by intent
    const messagesByIntent = await TelegramLog.aggregate([
      {
        $match: { intent: { $ne: null } }
      },
      {
        $group: {
          _id: '$intent',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Get success rate
    const successCount = await TelegramLog.countDocuments({ success: true });
    const failureCount = await TelegramLog.countDocuments({ success: false });
    const successRate = totalMessages > 0 ? ((successCount / totalMessages) * 100).toFixed(2) : 0;

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivity = await TelegramLog.aggregate([
      {
        $match: {
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Calculate total messages in last 7 days
    const last7Days = await TelegramLog.countDocuments({
      createdAt: { $gte: sevenDaysAgo }
    });

    // Get active users in last 24 hours
    const last24Hours = new Date();
    last24Hours.setHours(last24Hours.getHours() - 24);
    const activeUsersToday = await User.countDocuments({
      lastTelegramActivity: { $gte: last24Hours }
    });

    res.json({
      success: true,
      data: {
        statistics: {
          totalMessages,
          totalUsers,
          successCount,
          failureCount,
          successRate: parseFloat(successRate),
          last7Days,
          activeUsersToday,
          lastActiveUser: lastActiveUser ? {
            name: lastActiveUser.name,
            email: lastActiveUser.email,
            lastActivity: lastActiveUser.lastTelegramActivity
          } : null,
          messagesByType,
          messagesByIntent,
          recentActivity
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching telegram activity stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching activity statistics',
      error: error.message
    });
  }
};

/**
 * Delete all logs for a specific user
 */
exports.deleteUserLogs = async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await TelegramLog.deleteMany({ user: userId });

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} log(s) for user`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    logger.error('Error deleting user telegram logs:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting user logs',
      error: error.message
    });
  }
};

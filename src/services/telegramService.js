const User = require('../models/User');
const crypto = require('crypto');

/**
 * Generate a unique link code for Telegram connection
 */
const generateLinkCode = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Check if already linked
    if (user.telegramId) {
      return {
        success: false,
        message: 'Telegram account already linked',
        linkedUsername: user.telegramUsername
      };
    }

    // Generate a unique 8-character code
    const linkCode = crypto.randomBytes(4).toString('hex').toUpperCase();

    // Set expiry to 15 minutes from now
    const expiryTime = new Date(Date.now() + 15 * 60 * 1000);

    // Save code to user
    user.telegramLinkCode = linkCode;
    user.telegramLinkCodeExpiry = expiryTime;
    await user.save();

    return {
      success: true,
      linkCode,
      expiresAt: expiryTime
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Verify link code and connect Telegram account
 */
const verifyLinkCode = async (linkCode, telegramData) => {
  try {
    const user = await User.findOne({
      telegramLinkCode: linkCode,
      telegramLinkCodeExpiry: { $gt: new Date() }
    });

    if (!user) {
      return {
        success: false,
        message: 'Invalid or expired link code'
      };
    }

    // Link the Telegram account
    user.telegramId = telegramData.id.toString();
    user.telegramUsername = telegramData.username;
    user.telegramFirstName = telegramData.first_name;
    user.telegramLinkedAt = new Date();

    // Clear the link code
    user.telegramLinkCode = undefined;
    user.telegramLinkCodeExpiry = undefined;

    await user.save();

    return {
      success: true,
      user: {
        name: user.name,
        email: user.email
      }
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Get Telegram connection status
 */
const getTelegramStatus = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    return {
      isLinked: !!user.telegramId,
      telegramUsername: user.telegramUsername,
      telegramFirstName: user.telegramFirstName,
      linkedAt: user.telegramLinkedAt,
      notifications: user.telegramNotifications
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Unlink Telegram account
 */
const unlinkTelegram = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.telegramId) {
      return {
        success: false,
        message: 'No Telegram account linked'
      };
    }

    // Clear Telegram data
    user.telegramId = undefined;
    user.telegramUsername = undefined;
    user.telegramFirstName = undefined;
    user.telegramLinkedAt = undefined;
    user.telegramLinkCode = undefined;
    user.telegramLinkCodeExpiry = undefined;

    await user.save();

    return {
      success: true,
      message: 'Telegram account unlinked successfully'
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Update notification preferences
 */
const updateNotificationPreferences = async (userId, preferences) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error('User not found');
    }

    // Update preferences
    if (preferences.enabled !== undefined) {
      user.telegramNotifications.enabled = preferences.enabled;
    }
    if (preferences.dailySummary !== undefined) {
      user.telegramNotifications.dailySummary = preferences.dailySummary;
    }
    if (preferences.dailySummaryTime !== undefined) {
      user.telegramNotifications.dailySummaryTime = preferences.dailySummaryTime;
    }
    if (preferences.weeklyReport !== undefined) {
      user.telegramNotifications.weeklyReport = preferences.weeklyReport;
    }
    if (preferences.budgetAlerts !== undefined) {
      user.telegramNotifications.budgetAlerts = preferences.budgetAlerts;
    }
    if (preferences.expenseAdded !== undefined) {
      user.telegramNotifications.expenseAdded = preferences.expenseAdded;
    }

    await user.save();

    return {
      success: true,
      notifications: user.telegramNotifications
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  generateLinkCode,
  verifyLinkCode,
  getTelegramStatus,
  unlinkTelegram,
  updateNotificationPreferences
};

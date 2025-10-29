const telegramService = require('../services/telegramService');
const logger = require('../config/logger');

/**
 * Generate link code for Telegram connection
 * POST /api/telegram/generate-link-code
 */
const generateLinkCode = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await telegramService.generateLinkCode(userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
        linkedUsername: result.linkedUsername
      });
    }

    res.status(200).json({
      success: true,
      linkCode: result.linkCode,
      expiresAt: result.expiresAt,
      message: 'Link code generated. Use /link command in Telegram bot with this code.'
    });
  } catch (error) {
    logger.error('Error generating link code:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate link code'
    });
  }
};

/**
 * Get Telegram connection status
 * GET /api/telegram/status
 */
const getTelegramStatus = async (req, res) => {
  try {
    const userId = req.user._id;

    const status = await telegramService.getTelegramStatus(userId);

    res.status(200).json({
      success: true,
      ...status,
      botInfo: {
        username: process.env.TELEGRAM_BOT_USERNAME,
        name: process.env.TELEGRAM_BOT_NAME,
        link: process.env.TELEGRAM_BOT_USERNAME ? `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}` : null
      }
    });
  } catch (error) {
    logger.error('Error getting Telegram status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get Telegram status'
    });
  }
};

/**
 * Unlink Telegram account
 * POST /api/telegram/unlink
 */
const unlinkTelegram = async (req, res) => {
  try {
    const userId = req.user._id;

    const result = await telegramService.unlinkTelegram(userId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    logger.error('Error unlinking Telegram:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unlink Telegram account'
    });
  }
};

/**
 * Update notification preferences
 * PUT /api/telegram/notifications
 */
const updateNotificationPreferences = async (req, res) => {
  try {
    const userId = req.user._id;
    const preferences = req.body;

    const result = await telegramService.updateNotificationPreferences(userId, preferences);

    res.status(200).json({
      success: true,
      message: 'Notification preferences updated',
      notifications: result.notifications
    });
  } catch (error) {
    logger.error('Error updating notification preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update notification preferences'
    });
  }
};

module.exports = {
  generateLinkCode,
  getTelegramStatus,
  unlinkTelegram,
  updateNotificationPreferences
};

const adminService = require("../services/adminService");
const logger = require("../config/logger");

/**
 * Get dashboard statistics
 * GET /api/admin/dashboard
 */
exports.getDashboardStats = async (req, res) => {
  try {
    const stats = await adminService.getDashboardStats();

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error("Error fetching dashboard stats:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch dashboard statistics"
    });
  }
};

/**
 * Get all users
 * GET /api/admin/users
 */
exports.getAllUsers = async (req, res) => {
  try {
    const { page, limit, search, role, verified } = req.query;

    const result = await adminService.getAllUsers({
      page,
      limit,
      search,
      role,
      verified
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error("Error fetching users:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch users"
    });
  }
};

/**
 * Get user details
 * GET /api/admin/users/:id
 */
exports.getUserDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const result = await adminService.getUserDetails(id);

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error("Error fetching user details:", error);
    res.status(404).json({
      success: false,
      message: error.message || "Failed to fetch user details"
    });
  }
};

/**
 * Update user
 * PUT /api/admin/users/:id
 */
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Prevent admin from updating their own role
    if (id === req.user._id.toString() && updates.role) {
      return res.status(400).json({
        success: false,
        message: "You cannot change your own role"
      });
    }

    const user = await adminService.updateUser(id, updates);

    res.status(200).json({
      success: true,
      message: "User updated successfully",
      user
    });
  } catch (error) {
    logger.error("Error updating user:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to update user"
    });
  }
};

/**
 * Delete user
 * DELETE /api/admin/users/:id
 */
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if (id === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: "You cannot delete your own account"
      });
    }

    const result = await adminService.deleteUser(id);

    res.status(200).json({
      success: true,
      message: result.message
    });
  } catch (error) {
    logger.error("Error deleting user:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to delete user"
    });
  }
};

/**
 * Get activity logs
 * GET /api/admin/activity
 */
exports.getActivityLogs = async (req, res) => {
  try {
    const { limit } = req.query;

    const logs = await adminService.getActivityLogs(limit);

    res.status(200).json({
      success: true,
      ...logs
    });
  } catch (error) {
    logger.error("Error fetching activity logs:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch activity logs"
    });
  }
};

/**
 * Restrict user from Telegram
 * POST /api/admin/users/:userId/restrict-telegram
 */
exports.restrictTelegramAccess = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const adminId = req.user._id;

    const User = require('../models/User');

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.telegramId) {
      return res.status(400).json({
        success: false,
        message: 'User does not have a linked Telegram account'
      });
    }

    // Update user restriction status
    user.telegramRestricted = true;
    user.telegramRestrictedReason = reason || 'Restricted by administrator';
    user.telegramRestrictedAt = new Date();
    user.telegramRestrictedBy = adminId;
    await user.save();

    logger.info(`Admin ${req.user.email} restricted Telegram access for user ${user.email}`);

    res.json({
      success: true,
      message: 'User Telegram access has been restricted',
      data: {
        userId: user._id,
        telegramRestricted: user.telegramRestricted,
        telegramRestrictedReason: user.telegramRestrictedReason,
        telegramRestrictedAt: user.telegramRestrictedAt
      }
    });
  } catch (error) {
    logger.error('Error restricting Telegram access:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to restrict Telegram access'
    });
  }
};

/**
 * Remove Telegram restriction from user
 * POST /api/admin/users/:userId/unrestrict-telegram
 */
exports.unrestrictTelegramAccess = async (req, res) => {
  try {
    const { userId } = req.params;
    const User = require('../models/User');

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Remove restriction
    user.telegramRestricted = false;
    user.telegramRestrictedReason = undefined;
    user.telegramRestrictedAt = undefined;
    user.telegramRestrictedBy = undefined;
    await user.save();

    logger.info(`Admin ${req.user.email} unrestricted Telegram access for user ${user.email}`);

    res.json({
      success: true,
      message: 'User Telegram restriction has been removed',
      data: {
        userId: user._id,
        telegramRestricted: user.telegramRestricted
      }
    });
  } catch (error) {
    logger.error('Error unrestricting Telegram access:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to unrestrict Telegram access'
    });
  }
};

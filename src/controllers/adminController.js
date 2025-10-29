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

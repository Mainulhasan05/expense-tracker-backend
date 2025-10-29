const User = require("../models/User");

/**
 * Admin middleware - Checks if user has admin role
 * Use after authMiddleware to ensure user is authenticated
 */
const adminMiddleware = async (req, res, next) => {
  try {
    // Check if user exists (should be set by authMiddleware)
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    // Check if user has admin role
    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Access denied. Admin privileges required."
      });
    }

    // User is admin, proceed to next middleware/controller
    next();
  } catch (error) {
    console.error("Admin middleware error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

module.exports = adminMiddleware;

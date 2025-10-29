const User = require("../models/User");
const Transaction = require("../models/Transaction");
const Category = require("../models/Category");
const Task = require("../models/Task");

/**
 * Get dashboard statistics
 */
exports.getDashboardStats = async () => {
  try {
    // Get counts
    const totalUsers = await User.countDocuments();
    const totalTransactions = await Transaction.countDocuments();
    const totalCategories = await Category.countDocuments();
    const totalTasks = await Task.countDocuments();

    // Get verified vs unverified users
    const verifiedUsers = await User.countDocuments({ isVerified: true });
    const unverifiedUsers = totalUsers - verifiedUsers;

    // Get users with Google OAuth
    const googleUsers = await User.countDocuments({ googleId: { $exists: true, $ne: null } });
    const emailUsers = totalUsers - googleUsers;

    // Get users with Telegram
    const telegramUsers = await User.countDocuments({ telegramId: { $exists: true, $ne: null } });

    // Get transaction statistics
    const transactionStats = await Transaction.aggregate([
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const income = transactionStats.find(s => s._id === "income") || { total: 0, count: 0 };
    const expenses = transactionStats.find(s => s._id === "expense") || { total: 0, count: 0 };

    // Get recent activity (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentUsers = await User.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });
    const recentTransactions = await Transaction.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

    // Get monthly growth data for charts (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyUsers = await User.aggregate([
      {
        $match: { createdAt: { $gte: sixMonthsAgo } }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);

    const monthlyTransactions = await Transaction.aggregate([
      {
        $match: { createdAt: { $gte: sixMonthsAgo } }
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          totalIncome: {
            $sum: {
              $cond: [{ $eq: ["$type", "income"] }, "$amount", 0]
            }
          },
          totalExpense: {
            $sum: {
              $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0]
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": 1, "_id.month": 1 }
      }
    ]);

    // Get top categories
    const topCategories = await Transaction.aggregate([
      {
        $group: {
          _id: "$category",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { total: -1 }
      },
      {
        $limit: 10
      }
    ]);

    return {
      overview: {
        totalUsers,
        totalTransactions,
        totalCategories,
        totalTasks,
        verifiedUsers,
        unverifiedUsers,
        googleUsers,
        emailUsers,
        telegramUsers
      },
      transactions: {
        totalIncome: income.total,
        totalExpenses: expenses.total,
        incomeCount: income.count,
        expenseCount: expenses.count,
        netBalance: income.total - expenses.total
      },
      recentActivity: {
        newUsers: recentUsers,
        newTransactions: recentTransactions
      },
      charts: {
        monthlyUsers,
        monthlyTransactions,
        topCategories
      }
    };
  } catch (error) {
    throw new Error("Failed to fetch dashboard statistics: " + error.message);
  }
};

/**
 * Get all users with pagination and filters
 */
exports.getAllUsers = async ({ page = 1, limit = 10, search = "", role = "", verified = "" }) => {
  try {
    const query = {};

    // Apply search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } }
      ];
    }

    // Apply role filter
    if (role) {
      query.role = role;
    }

    // Apply verified filter
    if (verified !== "") {
      query.isVerified = verified === "true";
    }

    const skip = (page - 1) * limit;

    const users = await User.find(query)
      .select("-password -emailVerificationToken -resetPasswordToken")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await User.countDocuments(query);

    return {
      users,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    throw new Error("Failed to fetch users: " + error.message);
  }
};

/**
 * Get single user details with statistics
 */
exports.getUserDetails = async (userId) => {
  try {
    const user = await User.findById(userId).select("-password -emailVerificationToken -resetPasswordToken");

    if (!user) {
      throw new Error("User not found");
    }

    // Get user's statistics
    const transactionCount = await Transaction.countDocuments({ user: userId });
    const categoryCount = await Category.countDocuments({ user: userId });
    const taskCount = await Task.countDocuments({ user: userId });

    const transactionStats = await Transaction.aggregate([
      { $match: { user: user._id } },
      {
        $group: {
          _id: "$type",
          total: { $sum: "$amount" },
          count: { $sum: 1 }
        }
      }
    ]);

    const income = transactionStats.find(s => s._id === "income") || { total: 0, count: 0 };
    const expenses = transactionStats.find(s => s._id === "expense") || { total: 0, count: 0 };

    return {
      user,
      statistics: {
        transactionCount,
        categoryCount,
        taskCount,
        totalIncome: income.total,
        totalExpenses: expenses.total,
        netBalance: income.total - expenses.total
      }
    };
  } catch (error) {
    throw new Error("Failed to fetch user details: " + error.message);
  }
};

/**
 * Update user
 */
exports.updateUser = async (userId, updates) => {
  try {
    // Don't allow updating password through this method
    const allowedUpdates = ["name", "email", "role", "isVerified"];
    const filteredUpdates = {};

    for (const key of allowedUpdates) {
      if (updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    }

    const user = await User.findByIdAndUpdate(
      userId,
      filteredUpdates,
      { new: true, runValidators: true }
    ).select("-password -emailVerificationToken -resetPasswordToken");

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  } catch (error) {
    throw new Error("Failed to update user: " + error.message);
  }
};

/**
 * Delete user and all related data
 */
exports.deleteUser = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new Error("User not found");
    }

    // Don't allow deleting admin users
    if (user.role === "admin") {
      throw new Error("Cannot delete admin users");
    }

    // Delete all user's data
    await Transaction.deleteMany({ user: userId });
    await Category.deleteMany({ user: userId });
    await Task.deleteMany({ user: userId });
    await User.findByIdAndDelete(userId);

    return { message: "User and all related data deleted successfully" };
  } catch (error) {
    throw new Error("Failed to delete user: " + error.message);
  }
};

/**
 * Get system activity logs (recent transactions, new users, etc.)
 */
exports.getActivityLogs = async (limit = 20) => {
  try {
    // Get recent transactions
    const recentTransactions = await Transaction.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Get recent users
    const recentUsers = await User.find()
      .select("name email createdAt isVerified role")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return {
      recentTransactions,
      recentUsers
    };
  } catch (error) {
    throw new Error("Failed to fetch activity logs: " + error.message);
  }
};

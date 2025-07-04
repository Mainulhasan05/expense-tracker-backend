const dashboardService = require("../services/dashboardService");

exports.getDashboard = async (req, res) => {
  try {
    const data = await dashboardService.getDashboardData(
      req.user.id,
      req.params.month
    );
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// getMonthlyTrends
exports.getMonthlyTrends = async (req, res) => {
  try {
    const trends = await dashboardService.getMonthlyTrends(req.user.id);
    res.status(200).json(trends);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// getRecentTransactions
exports.getRecentTransactions = async (req, res) => {
  try {
    const transactions = await dashboardService.getRecentTransactions(
      req.user.id,
      req.params.month
    );
    res.status(200).json(transactions);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get category-wise breakdown
exports.getCategoryWiseData = async (req, res) => {
  try {
    const data = await dashboardService.getCategoryWiseData(
      req.user.id,
      req.params.month
    );
    res.status(200).json(data);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get top categories
exports.getTopCategories = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const categories = await dashboardService.getTopCategories(
      req.user.id,
      req.params.month,
      limit
    );
    res.status(200).json(categories);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const authMiddleware = require("../middlewares/authMiddleware");

// getMonthlyTrends
router.get(
  "/monthly-trends",
  authMiddleware,
  dashboardController.getMonthlyTrends
);

// getRecentTransactions
router.get(
  "/recent-transactions/:month",
  authMiddleware,
  dashboardController.getRecentTransactions
);

// Get category-wise data for current month
router.get(
  "/categories",
  authMiddleware,
  dashboardController.getCategoryWiseData
);

// Get category-wise data for specific month
router.get(
  "/categories/:month",
  authMiddleware,
  dashboardController.getCategoryWiseData
);

// Get top categories for current month
router.get(
  "/top-categories",
  authMiddleware,
  dashboardController.getTopCategories
);

// Get top categories for specific month
router.get(
  "/top-categories/:month",
  authMiddleware,
  dashboardController.getTopCategories
);

router.get("/:month", authMiddleware, dashboardController.getDashboard);

module.exports = router;

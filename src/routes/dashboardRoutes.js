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

router.get("/:month", authMiddleware, dashboardController.getDashboard);

module.exports = router;

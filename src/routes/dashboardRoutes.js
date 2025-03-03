const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const authMiddleware = require("../middlewares/authMiddleware");

router.get("/", authMiddleware, dashboardController.getDashboard);
// getRecentTransactions
router.get(
  "/recent-transactions/:month",
  authMiddleware,
  dashboardController.getRecentTransactions
);

module.exports = router;

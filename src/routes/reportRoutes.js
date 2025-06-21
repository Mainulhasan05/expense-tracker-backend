// routes/reports.js
const express = require("express");
const router = express.Router();
const EmailReportService = require("../services/emailService");

const emailService = new EmailReportService();

// Manual trigger endpoint for testing
router.post("/send-monthly-report/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.body;

    const currentDate = new Date();
    const reportMonth = month || currentDate.getMonth() + 1;
    const reportYear = year || currentDate.getFullYear();

    const result = await emailService.sendMonthlyReport(
      userId,
      reportMonth,
      reportYear
    );

    res.json({
      success: true,
      message: "Monthly report sent successfully",
      messageId: result.messageId,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to send monthly report",
      error: error.message,
    });
  }
});

// Send reports to all users
router.post("/send-all-monthly-reports", async (req, res) => {
  try {
    const { month, year } = req.body;

    const currentDate = new Date();
    const reportMonth = month || currentDate.getMonth() + 1;
    const reportYear = year || currentDate.getFullYear();

    const results = await emailService.sendMonthlyReportsToAllUsers(
      reportMonth,
      reportYear
    );

    res.json({
      success: true,
      message: "Monthly reports processing complete",
      results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to send monthly reports",
      error: error.message,
    });
  }
});

// Get report data without sending email
router.get("/monthly-report/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { month, year } = req.query;

    const currentDate = new Date();
    const reportMonth = parseInt(month) || currentDate.getMonth() + 1;
    const reportYear = parseInt(year) || currentDate.getFullYear();

    const reportData = await emailService.generateMonthlyReport(
      userId,
      reportMonth,
      reportYear
    );

    res.json({
      success: true,
      data: reportData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to generate report data",
      error: error.message,
    });
  }
});

module.exports = router;

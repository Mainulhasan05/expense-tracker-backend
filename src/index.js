require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const path = require("path");
const logger = require("./config/logger");
const { testEmailConnection, sendTestEmail } = require("./utils/sendEmail");

// app.js (add this to your main app file)
const EmailReportService = require("./services/emailService");
const reportsRouter = require("./routes/reportRoutes");

// Initialize email service and setup cron job
const emailService = new EmailReportService();
emailService.setupMonthlyCronJob();
// emailService.setup30MinCronJob();

// Initialize Telegram bot (already exported as instance)
const telegramBot = require("./services/telegramBot");

const app = express();
connectDB();

app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

// Routes
app.use("/api/auth", require("./routes/authRoutes"));
// Add reports routes
app.use("/api/reports", reportsRouter);
// app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/tasks", require("./routes/taskRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));
app.use("/api/dashboard", require("./routes/dashboardRoutes"));
app.use("/api/telegram", require("./routes/telegramRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.get("/",()=>{
return "Hello from Finance"
})

app.listen(process.env.PORT || 5000, async () => {
  logger.info(
    `Server running on port http://localhost:${process.env.PORT || 5000}`
  );

  // Test email connection on startup
  console.log("\n🔍 Testing email configuration...");
  const isEmailReady = await testEmailConnection();

  if (!isEmailReady) {
    console.warn("⚠️  Email service is not available. Please check your configuration.\n");
  } else {
    console.log("✅ Email service is ready to use!\n");
  }

  // Initialize Telegram bot
  console.log("🔍 Initializing Telegram bot...");
  await telegramBot.initialize();

  // To manually send a test email, you can call:
  // await sendTestEmail("recipient@example.com");
});

// Export telegram bot instance for use in other modules
module.exports = { telegramBot };

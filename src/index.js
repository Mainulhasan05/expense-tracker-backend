require("dotenv").config();
const express = require("express");
const connectDB = require("./config/db");
const cors = require("cors");
const path = require("path");
const logger = require("./config/logger");

// app.js (add this to your main app file)
const EmailReportService = require("./services/emailService");
const reportsRouter = require("./routes/reportRoutes");

// Initialize email service and setup cron job
const emailService = new EmailReportService();
emailService.setupMonthlyCronJob();
// emailService.setup30MinCronJob();

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

app.listen(process.env.PORT || 5000, () => {
  logger.info(
    `Server running on port http://localhost:${process.env.PORT || 5000}`
  );
});

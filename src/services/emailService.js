// services/emailService.js
const nodemailer = require("nodemailer");
const cron = require("node-cron");
const Transaction = require("../models/Transaction");
const User = require("../models/User");
const Category = require("../models/Category");
const logger = require("../config/logger");

class EmailReportService {
  constructor() {
    // Configure email transporter (using Gmail as example)
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER, // your email
        pass: process.env.EMAIL_PASS, // your app password
      },
    });
  }

  // Generate monthly report data for a user
  async generateMonthlyReport(userId, month, year) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    try {
      // Get user details
      const user = await User.findById(userId);
      if (!user) throw new Error("User not found");

      // Get transactions for the month
      const transactions = await Transaction.find({
        user: userId,
        date: { $gte: startDate, $lte: endDate },
      }).populate("user");

      // Calculate totals
      const income = transactions
        .filter((t) => t.type === "income")
        .reduce((sum, t) => sum + t.amount, 0);

      const expenses = transactions
        .filter((t) => t.type === "expense")
        .reduce((sum, t) => sum + t.amount, 0);

      const netSavings = income - expenses;

      // Group expenses by category
      const expensesByCategory = transactions
        .filter((t) => t.type === "expense")
        .reduce((acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + t.amount;
          return acc;
        }, {});

      // Group income by category
      const incomeByCategory = transactions
        .filter((t) => t.type === "income")
        .reduce((acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + t.amount;
          return acc;
        }, {});

      // Get top expenses
      const topExpenses = transactions
        .filter((t) => t.type === "expense")
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5);

      return {
        user,
        month,
        year,
        monthName: new Date(year, month - 1).toLocaleString("default", {
          month: "long",
        }),
        totalIncome: income,
        totalExpenses: expenses,
        netSavings,
        transactionCount: transactions.length,
        expensesByCategory,
        incomeByCategory,
        topExpenses,
        transactions,
      };
    } catch (error) {
      console.error("Error generating monthly report:", error);
      throw error;
    }
  }

  // Generate HTML email template
  generateEmailHTML(reportData) {
    const {
      user,
      monthName,
      year,
      totalIncome,
      totalExpenses,
      netSavings,
      transactionCount,
      expensesByCategory,
      incomeByCategory,
      topExpenses,
    } = reportData;

    const savingsColor = netSavings >= 0 ? "#28a745" : "#dc3545";
    const savingsIcon = netSavings >= 0 ? "📈" : "📉";

    return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
        .content { padding: 30px; }
        .summary-card { background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 20px 0; }
        .metric { display: inline-block; margin: 10px 20px; text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #333; }
        .metric-label { font-size: 14px; color: #666; margin-top: 5px; }
        .section { margin: 30px 0; }
        .section-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 15px; border-bottom: 2px solid #667eea; padding-bottom: 5px; }
        .category-item { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
        .transaction-item { background: #f8f9fa; margin: 8px 0; padding: 12px; border-radius: 6px; border-left: 4px solid #667eea; }
        .amount-positive { color: #28a745; font-weight: bold; }
        .amount-negative { color: #dc3545; font-weight: bold; }
        .footer { background: #333; color: white; padding: 20px; text-align: center; font-size: 12px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #f2f2f2; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>💰 Monthly Financial Report</h1>
          <h2>${monthName} ${year}</h2>
          <p>Hello ${user.name}!</p>
        </div>
        
        <div class="content">
          <div class="summary-card">
            <div style="text-align: center;">
              <div class="metric">
                <div class="metric-value amount-positive">$${totalIncome.toFixed(
                  2
                )}</div>
                <div class="metric-label">💵 Total Income</div>
              </div>
              <div class="metric">
                <div class="metric-value amount-negative">$${totalExpenses.toFixed(
                  2
                )}</div>
                <div class="metric-label">💸 Total Expenses</div>
              </div>
              <div class="metric">
                <div class="metric-value" style="color: ${savingsColor}">
                  ${savingsIcon} $${Math.abs(netSavings).toFixed(2)}
                </div>
                <div class="metric-label">${
                  netSavings >= 0 ? "Net Savings" : "Net Loss"
                }</div>
              </div>
              <div class="metric">
                <div class="metric-value">${transactionCount}</div>
                <div class="metric-label">📊 Transactions</div>
              </div>
            </div>
          </div>

          ${
            Object.keys(expensesByCategory).length > 0
              ? `
          <div class="section">
            <div class="section-title">📋 Expenses by Category</div>
            ${Object.entries(expensesByCategory)
              .sort(([, a], [, b]) => b - a)
              .map(
                ([category, amount]) => `
                <div class="category-item">
                  <span>${category} </span>
                  <span class="amount-negative">$${amount.toFixed(2)}</span>
                </div>
              `
              )
              .join("")}
          </div>
          `
              : ""
          }

          ${
            Object.keys(incomeByCategory).length > 0
              ? `
          <div class="section">
            <div class="section-title">💰 Income by Category </div>
            ${Object.entries(incomeByCategory)
              .sort(([, a], [, b]) => b - a)
              .map(
                ([category, amount]) => `
                <div class="category-item">
                  <span>${category} </span>
                  <span class="amount-positive"> $${amount.toFixed(2)}</span>
                </div>
              `
              )
              .join("")}
          </div>
          `
              : ""
          }

          ${
            topExpenses.length > 0
              ? `
          <div class="section">
            <div class="section-title">🏆 Top 5 Expenses</div>
            ${topExpenses
              .map(
                (transaction, index) => `
              <div class="transaction-item">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <div>
                    <strong>#${index + 1} ${transaction.description} </strong>
                    <div style="font-size: 12px; color: #666;">
                      ${transaction.category} • ${new Date(
                  transaction.date
                ).toLocaleDateString()}
                    </div>
                  </div>
                  <div class="amount-negative"> $${transaction.amount.toFixed(
                    2
                  )}</div>
                </div>
              </div>
            `
              )
              .join("")}
          </div>
          `
              : ""
          }

          <div class="section">
            <div class="section-title">📈 Monthly Insights</div>
            <div style="background: #e3f2fd; padding: 15px; border-radius: 6px; border-left: 4px solid #2196f3;">
              ${this.generateInsights(reportData)}
            </div>
          </div>
        </div>
        
        <div class="footer ">
          <p>This report was automatically generated by your Expense Tracker App. <a href="${
            process.env.APP_URL
          }">Click here</a> to access your dashboard.</p>
          <p>Generated on ${new Date().toLocaleDateString()}</p>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  // Generate insights based on the data
  generateInsights(reportData) {
    const { totalIncome, totalExpenses, netSavings, expensesByCategory } =
      reportData;
    const insights = [];

    if (netSavings > 0) {
      const savingsRate = ((netSavings / totalIncome) * 100).toFixed(1);
      insights.push(
        `🎉 Great job! You saved ${savingsRate}% of your income this month.`
      );
    } else if (netSavings < 0) {
      insights.push(
        `⚠️ You spent $${Math.abs(netSavings).toFixed(
          2
        )} more than you earned this month.`
      );
    }

    if (Object.keys(expensesByCategory).length > 0) {
      const topCategory = Object.entries(expensesByCategory).sort(
        ([, a], [, b]) => b - a
      )[0];
      insights.push(
        `💡 Your biggest expense category was "${
          topCategory[0]
        }" at $${topCategory[1].toFixed(2)}.`
      );
    }

    if (insights.length === 0) {
      insights.push(
        `📊 Keep tracking your expenses to build better financial habits!`
      );
    }

    return insights.join("<br><br>");
  }

  // Send email report to a user
  async sendMonthlyReport(userId, month, year) {
    try {
      const reportData = await this.generateMonthlyReport(userId, month, year);
      const htmlContent = this.generateEmailHTML(reportData);

      const mailOptions = {
        from: process.env.EMAIL_USER,
        to: reportData.user.email,
        subject: `💰 Your ${reportData.monthName} ${year} Financial Report`,
        html: htmlContent,
      };
      const result = await this.transporter.sendMail(mailOptions);
      console.log(
        `Monthly report sent to ${reportData.user.email}:`,
        result.messageId
      );
      return result;
    } catch (error) {
      console.error("Error sending monthly report:", error);
      throw error;
    }
  }

  // Send reports to all users
  async sendMonthlyReportsToAllUsers(month, year) {
    try {
      const users = await User.find({});
      const results = [];

      for (const user of users) {
        try {
          const result = await this.sendMonthlyReport(user._id, month, year);
          results.push({
            userId: user._id,
            email: user.email,
            success: true,
            messageId: result.messageId,
          });
          logger.info(
            `Monthly report sent to ${user.email}:`,
            result.messageId
          );
        } catch (error) {
          console.error(`Failed to send report to ${user.email}:`, error);
          logger.error(`Failed to send report to ${user.email}:`, error);
          results.push({
            userId: user._id,
            email: user.email,
            success: false,
            error: error.message,
          });
        }

        // Add delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      return results;
    } catch (error) {
      console.error("Error sending monthly reports to all users:", error);
      throw error;
    }
  }

  // Setup cron job for automatic monthly reports
  setupMonthlyCronJob() {
    // Run on the 1st day of every month at 9:00 AM
    cron.schedule("0 9 1 * *", async () => {
      console.log("Starting monthly report generation...");

      const now = new Date();
      const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
      const year =
        now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

      try {
        const results = await this.sendMonthlyReportsToAllUsers(
          lastMonth,
          year
        );
        console.log("Monthly reports sent:", results);
      } catch (error) {
        console.error("Error in monthly cron job:", error);
      }
    });

    console.log("Monthly report cron job setup complete");
    logger.info("Monthly report cron job setup complete");
  }

  //   30mins testing
  setup30MinCronJob() {
    // Run on the 1st day of every month at 9:00 AM
    cron.schedule("*/30 * * * *", async () => {
      console.log("Starting 30min report generation...");

      const now = new Date();
      const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
      const year =
        now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

      try {
        const results = await this.sendMonthlyReportsToAllUsers(
          lastMonth,
          year
        );
        console.log("Monthly reports sent:", results);
      } catch (error) {
        console.error("Error in monthly cron job:", error);
      }
    });

    console.log("30min report cron job setup complete");
    logger.info("30min report cron job setup complete");
  }

  // Manual trigger for testing
  async sendTestReport(userId) {
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    return await this.sendMonthlyReport(userId, currentMonth, currentYear);
  }
}

module.exports = EmailReportService;

// Example usage in your existing code:
/*
// To send a test report
const emailService = new EmailReportService();
emailService.sendTestReport('USER_ID_HERE');

// To send report for specific month
emailService.sendMonthlyReport('USER_ID_HERE', 11, 2024); // November 2024
*/

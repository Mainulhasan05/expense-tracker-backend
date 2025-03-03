const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");
// Updated dashboard data service
exports.getDashboardData = async (userId, month) => {
  let startDate, endDate;

  if (month) {
    startDate = new Date(`${month}-01`);
    endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
  } else {
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
  const userIdObj = new mongoose.Types.ObjectId(userId);
  const transactions = await Transaction.aggregate([
    {
      $match: {
        user: userIdObj,
        date: { $gte: startDate, $lt: endDate },
      },
    },
    { $group: { _id: "$type", total: { $sum: "$amount" } } },
  ]);

  const income = transactions.find((t) => t._id === "income")?.total || 0;
  const expense = transactions.find((t) => t._id === "expense")?.total || 0;

  return { income, expense, balance: income - expense };
};

// New service for monthly trends
exports.getMonthlyTrends = async (userId) => {
  // Create date range for last 12 months
  const now = new Date();
  const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

  // Convert userId to ObjectId
  const userIdObj = new mongoose.Types.ObjectId(userId);

  const results = await Transaction.aggregate([
    {
      $match: {
        user: userIdObj,
        date: { $gte: oneYearAgo },
      },
    },
    {
      $group: {
        _id: {
          year: { $year: "$date" },
          month: { $month: "$date" },
        },
        income: {
          $sum: {
            $cond: [{ $eq: ["$type", "income"] }, "$amount", 0],
          },
        },
        expenses: {
          $sum: {
            $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0],
          },
        },
      },
    },
    {
      $addFields: {
        month: {
          $let: {
            vars: {
              months: [
                "Jan",
                "Feb",
                "Mar",
                "Apr",
                "May",
                "Jun",
                "Jul",
                "Aug",
                "Sep",
                "Oct",
                "Nov",
                "Dec",
              ],
            },
            in: {
              $arrayElemAt: ["$$months", { $subtract: ["$_id.month", 1] }],
            },
          },
        },
        year: "$_id.year",
      },
    },
    {
      $project: {
        _id: 0,
        name: { $concat: ["$month", " ", { $toString: "$year" }] },
        income: 1,
        expenses: 1,
      },
    },
    { $sort: { year: 1, "_id.month": 1 } },
  ]);

  return results;
};
// recent 5 transactions of a user
exports.getRecentTransactions = async (userId, month) => {
  let startDate, endDate;

  if (month) {
    startDate = new Date(`${month}-01`);
    endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 1);
  } else {
    // Default to current month
    const now = new Date();
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  const transactions = await Transaction.find({
    user: userId,
    date: { $gte: startDate, $lt: endDate },
  })
    .sort({ date: -1 })
    .limit(5);

  return transactions;
};

const Transaction = require("../models/Transaction");

exports.getDashboardData = async (userId) => {
  const currentMonth = new Date().getMonth() + 1;
  const transactions = await Transaction.aggregate([
    {
      $match: {
        user: userId,
        date: { $gte: new Date(new Date().setMonth(currentMonth - 1)) },
      },
    },
    { $group: { _id: "$type", total: { $sum: "$amount" } } },
  ]);

  const income = transactions.find((t) => t._id === "income")?.total || 0;
  const expense = transactions.find((t) => t._id === "expense")?.total || 0;

  return { income, expense, balance: income - expense };
};

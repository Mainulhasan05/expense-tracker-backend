const Transaction = require("../models/Transaction");

exports.createTransaction = async (userId, transactionData) => {
  return await Transaction.create({ user: userId, ...transactionData });
};

exports.getUserTransactions = async (userId, month) => {
  const startDate = new Date(`${month}-01`);
  const endDate = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + 1,
    1
  ); // First day of next month

  return await Transaction.aggregate([
    {
      $match: {
        user: userId,
        date: { $gte: startDate, $lt: endDate },
      },
    },
    { $group: { _id: "$type", total: { $sum: "$amount" } } },
  ]);
};

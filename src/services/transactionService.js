const Transaction = require("../models/Transaction");

exports.createTransaction = async (userId, transactionData) => {
  return await Transaction.create({ user: userId, ...transactionData });
};

exports.getUserTransactions = async (userId, month) => {
  return await Transaction.aggregate([
    {
      $match: {
        user: userId,
        date: { $gte: new Date(`${month}-01`), $lt: new Date(`${month}-31`) },
      },
    },
    { $group: { _id: "$type", total: { $sum: "$amount" } } },
  ]);
};

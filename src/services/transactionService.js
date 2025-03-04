const Transaction = require("../models/Transaction");
const mongoose = require("mongoose");

exports.createTransaction = async (userId, transactionData) => {
  const transaction = await Transaction.create({
    user: userId,
    ...transactionData,
  });
  return transaction;
};

exports.getUserTransactions = async (userId, month, page = 1) => {
  const startDate = new Date(`${month}-01`);
  const endDate = new Date(
    startDate.getFullYear(),
    startDate.getMonth() + 1,
    1
  );
  const userIdObj = new mongoose.Types.ObjectId(userId);
  const itemsPerPage = 20;
  const skip = (page - 1) * itemsPerPage;

  const result = await Transaction.aggregate([
    {
      $match: {
        user: userIdObj,
        date: { $gte: startDate, $lt: endDate },
      },
    },
    { $sort: { date: -1 } }, // Sort transactions by date (latest first)
    { $skip: skip },
    { $limit: itemsPerPage },
  ]);

  const totalTransactions = await Transaction.countDocuments({
    user: userIdObj,
    date: { $gte: startDate, $lt: endDate },
  });

  return {
    transactions: result,
    totalPages: Math.ceil(totalTransactions / itemsPerPage),
    currentPage: page,
  };
};

exports.deleteTransaction = async (userId, transactionId) => {
  const transaction = await Transaction.findOne({
    _id: transactionId,
    user: userId,
  });
  await Transaction.deleteOne({ _id: transactionId, user: userId });
  return transaction;
};

exports.searchUserTransactions = async (
  userId,
  search,
  category,
  type,
  startDate,
  endDate,
  page = 1
) => {
  const userIdObj = new mongoose.Types.ObjectId(userId);
  const itemsPerPage = 20;
  const skip = (page - 1) * itemsPerPage;

  // Build the match query
  const matchQuery = {
    user: userIdObj,
    date: { $gte: startDate, $lte: endDate },
  };

  if (category) {
    matchQuery.category = category; // Exact match for category
  }

  if (type) {
    matchQuery.type = type; // Filter by type (income/expense)
  }

  if (search) {
    matchQuery.$or = [
      { description: { $regex: search, $options: "i" } }, // Case-insensitive search on description
    ];
  }

  const result = await Transaction.aggregate([
    {
      $match: matchQuery,
    },
    { $sort: { date: -1 } }, // Sort transactions by date (latest first)
    { $skip: skip },
    { $limit: itemsPerPage },
  ]);

  const totalTransactions = await Transaction.countDocuments(matchQuery);

  return {
    transactions: result,
    totalPages: Math.ceil(totalTransactions / itemsPerPage),
    currentPage: page,
  };
};

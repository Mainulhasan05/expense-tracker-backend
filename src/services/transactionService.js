const Transaction = require("../models/Transaction");
const Category = require("../models/Category");
const mongoose = require("mongoose");

exports.createTransaction = async (userId, transactionData) => {
  let category;

  // Check if category is an ObjectId or a string name
  if (mongoose.Types.ObjectId.isValid(transactionData.category)) {
    // Try to find by ID first
    category = await Category.findById(transactionData.category);
  }

  // If not found by ID, try to find by name
  if (!category) {
    category = await Category.findOne({
      name: transactionData.category,
      user: userId
    });
  }

  // If category still not found, use the string as-is (for Telegram bot and quick entries)
  if (!category) {
    // Use category name directly and infer type from transactionData.type
    const categoryName = transactionData.category;
    const transactionType = transactionData.type || 'expense';

    const transaction = await Transaction.create({
      user: userId,
      type: transactionType,
      amount: transactionData.amount,
      category: categoryName,
      description: transactionData.description,
      date: transactionData.date || new Date(),
    });
    return transaction;
  }

  // Check if the user is the owner of the category
  if (category.user.toString() !== userId) {
    throw new Error("Unauthorized");
  }

  // Use category type if not explicitly provided
  if (!transactionData.type) {
    transactionData.type = category.type;
  }
  transactionData.category = category.name;

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

exports.updateTransaction = async (userId, transactionId, updateData) => {
  // Find the transaction and verify ownership
  const transaction = await Transaction.findOne({
    _id: transactionId,
    user: userId,
  });

  if (!transaction) {
    throw new Error("Transaction not found or unauthorized");
  }

  // If category is being updated, validate it
  if (updateData.category) {
    const category = await Category.findOne({
      name: updateData.category,
      user: userId,
    });

    if (!category) {
      throw new Error("Category not found");
    }

    // Update type based on category
    updateData.type = category.type;
  }

  // Update the transaction
  const updatedTransaction = await Transaction.findByIdAndUpdate(
    transactionId,
    updateData,
    { new: true, runValidators: true }
  );

  return updatedTransaction;
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

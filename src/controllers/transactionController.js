const transactionService = require("../services/transactionService");

exports.addTransaction = async (req, res) => {
  try {
    const transaction = await transactionService.createTransaction(
      req.user.id,
      req.body
    );
    res.status(201).json(transaction);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getTransactions = async (req, res) => {
  try {
    const transactions = await transactionService.getUserTransactions(
      req.user.id,
      req.params.month,
      req.query?.page
    );
    res.status(200).json(transactions);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// deleteTransaction controller
exports.deleteTransaction = async (req, res) => {
  try {
    const transaction = await transactionService.deleteTransaction(
      req.user.id,
      req.params.id
    );
    res
      .status(200)
      .json({ message: "Transaction deleted successfully", transaction });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.searchTransactions = async (req, res) => {
  try {
    const { search, category, type, startDate, endDate, page = 1 } = req.query;

    // Validate required fields
    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ message: "Start date and end date are required." });
    }

    const transactions = await transactionService.searchUserTransactions(
      req.user.id,
      search,
      category,
      type,
      new Date(startDate),
      new Date(endDate),
      parseInt(page)
    );

    res.status(200).json(transactions);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

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
      req.params.month
    );
    res.status(200).json(transactions);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

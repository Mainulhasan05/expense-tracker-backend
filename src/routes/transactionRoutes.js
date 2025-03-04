const express = require("express");
const router = express.Router();
const transactionController = require("../controllers/transactionController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/add", authMiddleware, transactionController.addTransaction);
router.get("/search", authMiddleware, transactionController.searchTransactions);
router.get("/:month", authMiddleware, transactionController.getTransactions);
router.delete("/:id", authMiddleware, transactionController.deleteTransaction);

module.exports = router;

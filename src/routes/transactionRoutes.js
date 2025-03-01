const express = require("express");
const router = express.Router();
const transactionController = require("../controllers/transactionController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/add", authMiddleware, transactionController.addTransaction);
router.get("/:month", authMiddleware, transactionController.getTransactions);

module.exports = router;

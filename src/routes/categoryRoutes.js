const express = require("express");
const router = express.Router();
const categoryController = require("../controllers/categoryController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/", authMiddleware, categoryController.addCategory);
router.get("/", authMiddleware, categoryController.getCategories);

module.exports = router;

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/google-login", authController.googleAuth);
router.get("/profile", authMiddleware, authController.getProfile);

module.exports = router;

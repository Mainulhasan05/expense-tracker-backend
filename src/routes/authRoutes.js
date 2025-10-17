const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");

router.post("/google-login", authController.googleAuth);
// Email login/register/forgot
router.post("/register", authController.register);
router.post("/login", authController.login);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password/:token", authController.resetPassword);

router.get("/profile", authMiddleware, authController.getProfile);
router.get("/set-dummy-password", authController.setDummyPasswordForGoogleUsers);


module.exports = router;

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middlewares/authMiddleware");
const {
  authLimiter,
  registrationLimiter,
  passwordResetLimiter,
} = require("../middlewares/rateLimitMiddleware");

router.post("/google-login", authLimiter, authController.googleAuth);
// Email login/register/forgot
router.post("/register", registrationLimiter, authController.register);
router.post("/login", authLimiter, authController.login);
router.post("/forgot-password", passwordResetLimiter, authController.forgotPassword);
router.post("/reset-password/:token", passwordResetLimiter, authController.resetPassword);

// Email verification
router.get("/verify-email/:token", authController.verifyEmail);
router.post("/resend-verification", authController.resendVerificationEmail);

router.get("/profile", authMiddleware, authController.getProfile);
router.post("/change-password", authMiddleware, authController.changePassword);
router.get("/set-passwords-google-users", authController.setPasswordsForGoogleUsers);


module.exports = router;

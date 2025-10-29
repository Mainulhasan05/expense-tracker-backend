const express = require('express');
const router = express.Router();
const telegramController = require('../controllers/telegramController');
const authMiddleware = require('../middlewares/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Generate link code for Telegram connection
router.post('/generate-link-code', telegramController.generateLinkCode);

// Get Telegram connection status
router.get('/status', telegramController.getTelegramStatus);

// Unlink Telegram account
router.post('/unlink', telegramController.unlinkTelegram);

// Update notification preferences
router.put('/notifications', telegramController.updateNotificationPreferences);

module.exports = router;

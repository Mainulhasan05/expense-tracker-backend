const express = require('express');
const router = express.Router();
const telegramLogController = require('../controllers/telegramLogController');
const authMiddleware = require('../middlewares/authMiddleware');
const adminMiddleware = require('../middlewares/adminMiddleware');

// All routes require authentication and admin privileges
router.use(authMiddleware);
router.use(adminMiddleware);

// Get all Telegram logs with pagination and filtering
router.get('/logs', telegramLogController.getAllLogs);

// Get activity statistics
router.get('/activity', telegramLogController.getActivityStats);

// Get logs for a specific user
router.get('/logs/user/:userId', telegramLogController.getUserLogs);

// Delete a specific log entry
router.delete('/logs/:logId', telegramLogController.deleteLog);

// Delete all logs for a specific user
router.delete('/logs/user/:userId', telegramLogController.deleteUserLogs);

module.exports = router;

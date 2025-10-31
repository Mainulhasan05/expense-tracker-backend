const express = require("express");
const router = express.Router();
const multer = require("multer");
const adminController = require("../controllers/adminController");
const voiceServiceController = require("../controllers/voiceServiceController");
const clarifaiController = require("../controllers/clarifaiController");
const authMiddleware = require("../middlewares/authMiddleware");
const adminMiddleware = require("../middlewares/adminMiddleware");
const { uploadLimiter } = require("../middlewares/rateLimitMiddleware");

// Configure multer for audio file uploads
const upload = multer({
  dest: "uploads/temp/",
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB limit
  fileFilter: (req, file, cb) => {
    // Accept audio files
    if (
      file.mimetype.startsWith("audio/") ||
      file.originalname.match(/\.(mp3|wav|ogg|oga|m4a|webm)$/i)
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only audio files are allowed"));
    }
  },
});

// All routes require authentication and admin privileges
router.use(authMiddleware);
router.use(adminMiddleware);

// Dashboard statistics
router.get("/dashboard", adminController.getDashboardStats);

// User management
router.get("/users", adminController.getAllUsers);
router.get("/users/:id", adminController.getUserDetails);
router.put("/users/:id", adminController.updateUser);
router.delete("/users/:id", adminController.deleteUser);

// Activity logs
router.get("/activity", adminController.getActivityLogs);

// Voice Service account management (Speechmatics & ElevenLabs)
router.get("/voice/accounts", voiceServiceController.getAllAccounts);
router.post("/voice/accounts", voiceServiceController.addAccount);
router.put("/voice/accounts/:id", voiceServiceController.updateAccount);
router.delete("/voice/accounts/:id", voiceServiceController.deleteAccount);
router.get("/voice/stats", voiceServiceController.getStats);
router.get("/voice/accounts/:id/voices", voiceServiceController.getVoices);
router.post(
  "/voice/test/transcription",
  uploadLimiter,
  upload.single("audio"),
  voiceServiceController.testTranscription
);
router.post("/voice/test/tts", voiceServiceController.testTTS);

// Clarifai AI account management
router.get("/clarifai/accounts", clarifaiController.getAllAccounts);
router.post("/clarifai/accounts", clarifaiController.addAccount);
router.put("/clarifai/accounts/:id", clarifaiController.updateAccount);
router.delete("/clarifai/accounts/:id", clarifaiController.deleteAccount);
router.post("/clarifai/test/:id", clarifaiController.testAccount);
router.get("/clarifai/usage-stats", clarifaiController.getUsageStats);
router.post("/clarifai/test-parsing", clarifaiController.testParsing);

module.exports = router;

const express = require("express");
const router = express.Router();
const multer = require("multer");
const adminController = require("../controllers/adminController");
const assemblyAIController = require("../controllers/assemblyAIController");
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

// AssemblyAI account management
router.get("/assemblyai/accounts", assemblyAIController.getAllAccounts);
router.post("/assemblyai/accounts", assemblyAIController.addAccount);
router.put("/assemblyai/accounts/:id", assemblyAIController.updateAccount);
router.delete("/assemblyai/accounts/:id", assemblyAIController.deleteAccount);
router.post(
  "/assemblyai/test",
  uploadLimiter,
  upload.single("audio"),
  assemblyAIController.testTranscription
);

module.exports = router;

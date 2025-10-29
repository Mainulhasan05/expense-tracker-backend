const rateLimit = require("express-rate-limit");
const { getClientIp } = require("./ipTrackingMiddleware");
const logger = require("../config/logger");

/**
 * Custom key generator for rate limiting (uses real client IP)
 */
const keyGenerator = (req) => {
  return getClientIp(req);
};

/**
 * Custom handler for rate limit exceeded
 */
const rateLimitHandler = (req, res) => {
  const clientIp = getClientIp(req);
  logger.warn(`Rate limit exceeded for IP: ${clientIp} on ${req.path}`);

  // Send admin notification for repeated abuse
  const abuseMonitor = require("../services/abuseMonitoringService");
  abuseMonitor.recordRateLimitViolation(clientIp, req.path);

  res.status(429).json({
    success: false,
    message: "Too many requests from this IP, please try again later.",
    retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
  });
};

/**
 * General API Rate Limiter
 * 100 requests per 15 minutes per IP
 */
const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  keyGenerator,
  handler: rateLimitHandler,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for admin users (optional)
    return req.user && req.user.role === "admin";
  },
});

/**
 * Strict Rate Limiter for Authentication Routes
 * 5 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator,
  handler: rateLimitHandler,
  skipSuccessfulRequests: true, // Don't count successful logins
  message: {
    success: false,
    message: "Too many authentication attempts, please try again after 15 minutes.",
  },
});

/**
 * Registration Rate Limiter
 * 3 registrations per hour per IP
 */
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator,
  handler: rateLimitHandler,
  message: {
    success: false,
    message: "Too many registration attempts from this IP. Please try again later.",
  },
});

/**
 * Password Reset Rate Limiter
 * 3 requests per hour per IP
 */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  keyGenerator,
  handler: rateLimitHandler,
  message: {
    success: false,
    message: "Too many password reset requests. Please try again later.",
  },
});

/**
 * File Upload Rate Limiter
 * 10 uploads per hour per IP
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator,
  handler: rateLimitHandler,
  message: {
    success: false,
    message: "Too many file uploads. Please try again later.",
  },
});

/**
 * Transaction Creation Rate Limiter
 * 50 transactions per hour per IP (generous for legitimate users)
 */
const transactionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  keyGenerator,
  handler: rateLimitHandler,
  message: {
    success: false,
    message: "Too many transactions created. Please wait before creating more.",
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  registrationLimiter,
  passwordResetLimiter,
  uploadLimiter,
  transactionLimiter,
};

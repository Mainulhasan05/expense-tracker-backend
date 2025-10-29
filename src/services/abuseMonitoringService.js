const adminNotificationService = require("./adminNotificationService");
const logger = require("../config/logger");

class AbuseMonitoringService {
  constructor() {
    // Track rate limit violations by IP
    this.rateLimitViolations = new Map();
    // Track failed login attempts by IP
    this.failedLoginAttempts = new Map();
    // Clean up old data every hour
    this.startCleanupInterval();
  }

  /**
   * Record a rate limit violation
   */
  recordRateLimitViolation(ip, path) {
    const key = `${ip}:${path}`;
    const violations = this.rateLimitViolations.get(key) || {
      count: 0,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
    };

    violations.count += 1;
    violations.lastSeen = Date.now();
    this.rateLimitViolations.set(key, violations);

    // Alert admin if violations exceed threshold
    if (violations.count >= 5) {
      adminNotificationService.notifyRateLimitViolation(
        ip,
        path,
        violations.count
      );
      logger.warn(
        `IP ${ip} has ${violations.count} rate limit violations on ${path}`
      );
    }
  }

  /**
   * Record a failed login attempt
   */
  recordFailedLogin(ip, email, geoInfo) {
    const key = `${ip}:${email}`;
    const attempts = this.failedLoginAttempts.get(key) || {
      count: 0,
      firstSeen: Date.now(),
      lastSeen: Date.now(),
      geoInfo,
    };

    attempts.count += 1;
    attempts.lastSeen = Date.now();
    this.failedLoginAttempts.set(key, attempts);

    // Alert admin if attempts exceed threshold
    if (attempts.count >= 3) {
      adminNotificationService.notifyFailedLogins(
        ip,
        email,
        attempts.count,
        geoInfo
      );
      logger.warn(
        `IP ${ip} has ${attempts.count} failed login attempts for ${email}`
      );
    }

    return attempts.count;
  }

  /**
   * Clear failed login attempts for an IP/email (after successful login)
   */
  clearFailedLogins(ip, email) {
    const key = `${ip}:${email}`;
    this.failedLoginAttempts.delete(key);
  }

  /**
   * Check if user should be flagged for suspicious activity
   */
  async checkSuspiciousActivity(user, currentIp, currentGeo) {
    const suspiciousReasons = [];

    // Check for location changes (different countries)
    if (user.lastLoginGeo && currentGeo) {
      if (
        user.lastLoginGeo.country &&
        currentGeo.country &&
        user.lastLoginGeo.country !== currentGeo.country
      ) {
        // Check time since last login
        const lastLoginTime = user.updatedAt || user.createdAt;
        const timeDiff = Date.now() - new Date(lastLoginTime).getTime();
        const hoursDiff = timeDiff / (1000 * 60 * 60);

        // If logged in from different country within 24 hours, flag it
        if (hoursDiff < 24) {
          suspiciousReasons.push(
            `Login from different country (${user.lastLoginGeo.country} -> ${currentGeo.country}) within 24 hours`
          );
        }
      }
    }

    // Check for multiple IPs in short time
    if (user.loginHistory && user.loginHistory.length > 0) {
      const recentLogins = user.loginHistory.filter((login) => {
        const timeDiff = Date.now() - new Date(login.timestamp).getTime();
        return timeDiff < 60 * 60 * 1000; // Last hour
      });

      const uniqueIps = new Set(recentLogins.map((l) => l.ip));
      if (uniqueIps.size > 3) {
        suspiciousReasons.push(`Multiple IPs (${uniqueIps.size}) in last hour`);
      }
    }

    // Notify admin if suspicious activity detected
    if (suspiciousReasons.length > 0) {
      const details = `User: ${user.email}\nIP: ${currentIp}\nLocation: ${currentGeo?.city}, ${currentGeo?.country}\nReasons:\n${suspiciousReasons.map((r) => `• ${r}`).join("\n")}`;

      await adminNotificationService.notifySuspiciousActivity(
        "Unusual Login Pattern",
        details
      );

      logger.warn(`Suspicious activity detected for user ${user.email}`, {
        reasons: suspiciousReasons,
      });
    }

    return suspiciousReasons;
  }

  /**
   * Check for registration abuse (multiple registrations from same IP)
   */
  async checkRegistrationAbuse(ip, geoInfo) {
    const User = require("../models/User");

    // Count registrations from this IP in last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const registrationsFromIp = await User.countDocuments({
      registrationIp: ip,
      createdAt: { $gte: oneDayAgo },
    });

    if (registrationsFromIp >= 3) {
      const location = geoInfo
        ? `${geoInfo.city || "Unknown"}, ${geoInfo.country || "Unknown"}`
        : "Unknown";

      const details = `IP: ${ip}\nLocation: ${location}\nRegistrations in 24h: ${registrationsFromIp + 1}`;

      await adminNotificationService.notifySuspiciousActivity(
        "Multiple Registrations",
        details
      );

      logger.warn(
        `Multiple registrations (${registrationsFromIp + 1}) from IP ${ip}`
      );

      return true; // Potentially abusive
    }

    return false;
  }

  /**
   * Clean up old tracking data
   */
  startCleanupInterval() {
    setInterval(
      () => {
        const oneHourAgo = Date.now() - 60 * 60 * 1000;

        // Clean rate limit violations
        for (const [key, data] of this.rateLimitViolations.entries()) {
          if (data.lastSeen < oneHourAgo) {
            this.rateLimitViolations.delete(key);
          }
        }

        // Clean failed login attempts
        for (const [key, data] of this.failedLoginAttempts.entries()) {
          if (data.lastSeen < oneHourAgo) {
            this.failedLoginAttempts.delete(key);
          }
        }

        logger.info("Cleaned up abuse monitoring data");
      },
      60 * 60 * 1000
    ); // Run every hour
  }

  /**
   * Get abuse statistics for an IP
   */
  getIpStatistics(ip) {
    const rateLimits = Array.from(this.rateLimitViolations.entries())
      .filter(([key]) => key.startsWith(ip + ":"))
      .reduce((sum, [, data]) => sum + data.count, 0);

    const failedLogins = Array.from(this.failedLoginAttempts.entries())
      .filter(([key]) => key.startsWith(ip + ":"))
      .reduce((sum, [, data]) => sum + data.count, 0);

    return {
      rateLimitViolations: rateLimits,
      failedLoginAttempts: failedLogins,
    };
  }
}

module.exports = new AbuseMonitoringService();

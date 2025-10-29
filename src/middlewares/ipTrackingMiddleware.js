const geoip = require("geoip-lite");

/**
 * Extract real IP address from request (considering nginx reverse proxy)
 */
function getClientIp(req) {
  // Check various headers that might contain the real IP
  const xForwardedFor = req.headers["x-forwarded-for"];
  const xRealIp = req.headers["x-real-ip"];
  const cfConnectingIp = req.headers["cf-connecting-ip"]; // Cloudflare

  // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2, ...)
  // The first one is the original client IP
  if (xForwardedFor) {
    const ips = xForwardedFor.split(",").map(ip => ip.trim());
    return ips[0];
  }

  if (xRealIp) {
    return xRealIp;
  }

  if (cfConnectingIp) {
    return cfConnectingIp;
  }

  // Fall back to socket IP
  return req.socket.remoteAddress || req.connection.remoteAddress;
}

/**
 * Get geographic information from IP
 */
function getGeoInfo(ip) {
  try {
    const geo = geoip.lookup(ip);
    if (geo) {
      return {
        country: geo.country,
        region: geo.region,
        city: geo.city,
        timezone: geo.timezone,
        coordinates: geo.ll,
      };
    }
  } catch (error) {
    console.error("Error getting geo info:", error);
  }
  return null;
}

/**
 * IP Tracking Middleware
 * Attaches client IP and geo information to request object
 */
const ipTrackingMiddleware = (req, res, next) => {
  const clientIp = getClientIp(req);
  const geoInfo = getGeoInfo(clientIp);

  // Attach to request object
  req.clientIp = clientIp;
  req.geoInfo = geoInfo;

  // Log for debugging (remove in production or use proper logging)
  if (process.env.NODE_ENV === "development") {
    console.log(`[IP Tracking] ${req.method} ${req.path} from ${clientIp} ${geoInfo ? `(${geoInfo.country})` : ""}`);
  }

  next();
};

module.exports = {
  ipTrackingMiddleware,
  getClientIp,
  getGeoInfo,
};

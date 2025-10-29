# Security & Monitoring System Documentation

## Overview
This document describes the comprehensive security and monitoring system implemented for the Expense Tracker application.

## Features Implemented

### 1. IP Tracking & Geolocation
- **File**: `src/middlewares/ipTrackingMiddleware.js`
- **Purpose**: Extract real client IP from nginx reverse proxy headers
- **Features**:
  - Reads `X-Forwarded-For`, `X-Real-IP`, and `CF-Connecting-IP` headers
  - Extracts geographic information (country, region, city, timezone)
  - Attaches `clientIp` and `geoInfo` to every request

### 2. Rate Limiting (Per IP)
- **File**: `src/middlewares/rateLimitMiddleware.js`
- **Purpose**: Prevent abuse and spam by limiting requests per IP
- **Limiters**:
  - **General Limiter**: 100 requests per 15 minutes (all routes)
  - **Auth Limiter**: 5 attempts per 15 minutes (login, google-login)
  - **Registration Limiter**: 3 registrations per hour
  - **Password Reset Limiter**: 3 attempts per hour
  - **Upload Limiter**: 10 uploads per hour (audio/image files)
  - **Transaction Limiter**: 50 requests per hour

**Applied to routes**:
- Auth routes: [src/routes/authRoutes.js](src/routes/authRoutes.js)
- Transaction routes: [src/routes/transactionRoutes.js](src/routes/transactionRoutes.js)
- Admin routes: [src/routes/adminRoutes.js](src/routes/adminRoutes.js)

### 3. Security Headers & Protection
- **File**: `src/middlewares/securityMiddleware.js`
- **Features**:
  - **Helmet.js**: Security headers (CSP, XSS protection, etc.)
  - **MongoDB Injection Protection**: Sanitizes user input
  - **CORS Configuration**: Strict origin checking with whitelist
  - **Allowed Origins**:
    - `process.env.FRONTEND_URL`
    - `process.env.APP_URL`
    - `http://localhost:3000`
    - `http://localhost:3001`
    - All `*.vercel.app` domains

### 4. Abuse Monitoring & Detection
- **File**: `src/services/abuseMonitoringService.js`
- **Features**:
  - Tracks rate limit violations per IP
  - Monitors failed login attempts (alerts after 3)
  - Detects suspicious activity:
    - Logins from different countries within 24 hours
    - Multiple IPs (>3) in the same hour
  - Registration abuse detection (3+ from same IP in 24h)
  - Auto-cleanup of old tracking data (hourly)

### 5. User Tracking & History
- **File**: `src/models/User.js` (updated)
- **New Fields**:
  - `registrationIp`: IP address at registration
  - `registrationGeo`: Geographic info at registration
  - `lastLoginIp`: Most recent login IP
  - `lastLoginGeo`: Most recent login location
  - `loginHistory`: Array of last 20 login attempts with IP, location, userAgent
  - `suspiciousActivityFlags`: Counter for suspicious activities
  - `accountStatus`: enum ['active', 'suspended', 'flagged']

### 6. Admin Telegram Notifications
- **File**: `src/services/adminNotificationService.js`
- **Notifications Sent For**:
  - New user registrations (with IP and location)
  - Suspicious activity detected
  - Failed login attempts (after 3 attempts)
  - Rate limit violations (after 5 violations)
  - System health reports (daily at 9 AM)
  - Critical errors (unhandled rejections, exceptions)
  - Account suspensions

**Configuration Required**:
Add to `.env`:
```env
ADMIN_EMAIL="your-email@example.com"
ADMIN_TELEGRAM_CHAT_ID="your-chat-id"
```

**To get your Telegram Chat ID**:
1. Open Telegram
2. Search for `@userinfobot`
3. Start a chat and send `/start`
4. Bot will reply with your chat ID
5. Add the chat ID to `.env`

### 7. System Health Monitoring
- **File**: `src/services/systemHealthMonitor.js`
- **Features**:
  - Scheduled daily health checks (9 AM)
  - Statistics tracked:
    - Total users
    - New users (last 24h)
    - Telegram-connected users
    - Transactions (last 24h)
    - Database connection status
    - Email service status
    - Server uptime
  - Error monitoring:
    - Unhandled promise rejections
    - Uncaught exceptions
  - Admin notification on critical errors

### 8. Auth Service Integration
- **File**: `src/services/authService.js` (updated)
- **Registration**:
  - Records user's IP and geolocation
  - Checks for registration abuse
  - Sends admin notification for new users
- **Login**:
  - Tracks IP, location, and user agent
  - Records failed login attempts
  - Detects suspicious activity patterns
  - Maintains login history (last 20 logins)
  - Clears failed attempts on successful login

## Environment Variables

Add these to your `.env` file:

```env
# Admin Monitoring Configuration
ADMIN_EMAIL="mdrifatbd5@gmail.com"
ADMIN_TELEGRAM_CHAT_ID=""  # Get from @userinfobot on Telegram

# Security Configuration
RATE_LIMIT_WINDOW_MS=900000  # 15 minutes in ms
RATE_LIMIT_MAX_REQUESTS=100
TRUST_PROXY=true

# Existing variables
TELEGRAM_BOT_TOKEN="your-bot-token"
FRONTEND_URL="https://your-frontend.vercel.app"
APP_URL="https://your-app.vercel.app"
```

## Nginx Configuration

The system requires nginx to be configured as a reverse proxy with proper headers. See [nginx-example.conf](nginx-example.conf) for a complete configuration.

**Critical nginx headers for rate limiting**:
```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header Host $host;
```

## Testing the System

### 1. Test Rate Limiting
```bash
# Try making 6 rapid login attempts (should be rate limited)
for i in {1..6}; do
  curl -X POST http://localhost:8000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"wrong"}'
  echo ""
done
```

### 2. Test IP Tracking
```bash
# Make a request with custom IP header
curl http://localhost:8000/api/auth/profile \
  -H "X-Forwarded-For: 8.8.8.8" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Test Admin Notifications
After adding `ADMIN_TELEGRAM_CHAT_ID` to `.env`:
- Register a new user - you should receive a Telegram notification
- Try 3 failed logins - you should receive a security alert
- Wait until 9 AM - you should receive a daily health report

### 4. Test System Health
```bash
# Manually trigger a health check (add this endpoint if needed)
node -e "
const monitor = require('./src/services/systemHealthMonitor');
monitor.performHealthCheck().then(() => console.log('Done'));
"
```

## Security Best Practices

### For Production:
1. **Always use HTTPS** - Set up SSL certificates
2. **Set strong CORS policies** - Restrict origins to your domains only
3. **Use environment variables** - Never commit secrets
4. **Monitor admin notifications** - Act on suspicious activity
5. **Regular database backups** - Schedule automatic backups
6. **Keep dependencies updated** - Run `npm audit` regularly
7. **Use a firewall** - Configure UFW or iptables
8. **Rate limit at nginx level** - Add additional protection

### Legitimate User Protection:
- Rate limits are generous for normal use
- Admin users bypass rate limits
- Only strict limits on auth endpoints (login/register)
- Successful requests don't count toward auth limits
- Geographic location changes are flagged but don't block access
- No IP blocking implemented (only monitoring)

## Architecture

```
┌─────────────────┐
│   Client App    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Nginx Proxy    │  ← Adds X-Forwarded-For header
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  IP Tracking    │  ← Extracts real client IP
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Security      │  ← Helmet, CORS, Sanitization
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Rate Limiting   │  ← Per-IP throttling
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│     Routes      │  ← Auth, Transactions, etc.
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Services (Auth, Abuse Monitoring)  │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Admin Notifications (Telegram)     │
└─────────────────────────────────────┘
```

## Monitoring Dashboard

Currently, monitoring is done via:
1. **Telegram notifications** - Real-time alerts to admin
2. **Server logs** - Winston logger in `logs/` directory
3. **Database** - User login history and flags in MongoDB

Future enhancements could include:
- Web-based admin dashboard
- Grafana/Prometheus integration
- Email alerts as backup to Telegram
- IP ban list management
- User account suspension UI

## Troubleshooting

### Rate limiting not working:
- Ensure `TRUST_PROXY=true` in `.env`
- Check nginx is sending `X-Forwarded-For` header
- Verify `app.set('trust proxy', true)` in `src/index.js`

### Admin notifications not received:
- Verify `TELEGRAM_BOT_TOKEN` is correct
- Check `ADMIN_TELEGRAM_CHAT_ID` is set
- Ensure bot has permission to send messages
- Check Telegram bot is initialized successfully in logs

### IP shows as localhost:
- Nginx not configured correctly
- Missing `X-Forwarded-For` header in proxy config
- `trust proxy` not enabled in Express

### Multiple bot instances error:
- Kill old processes: `lsof -ti:8000 | xargs kill -9`
- Only run one instance of the backend

## Files Modified/Created

### Created:
- `src/middlewares/ipTrackingMiddleware.js`
- `src/middlewares/rateLimitMiddleware.js`
- `src/middlewares/securityMiddleware.js`
- `src/services/abuseMonitoringService.js`
- `src/services/adminNotificationService.js`
- `src/services/systemHealthMonitor.js`
- `nginx-example.conf`
- `SECURITY.md` (this file)

### Modified:
- `src/index.js` - Added middleware and monitoring initialization
- `src/models/User.js` - Added security tracking fields
- `src/services/authService.js` - Added IP tracking and abuse detection
- `src/controllers/authController.js` - Pass IP and geo info to service
- `src/routes/authRoutes.js` - Applied rate limiters
- `src/routes/transactionRoutes.js` - Applied rate limiters
- `src/routes/adminRoutes.js` - Applied upload limiter
- `.env` - Added admin configuration variables

## Summary

The system now provides:
- Complete IP tracking and geolocation
- Per-IP rate limiting for spam prevention
- Real-time abuse detection and monitoring
- Admin notifications via Telegram
- Comprehensive security headers
- User login history tracking
- System health monitoring
- Error monitoring and alerting

All features are designed to **protect against abuse while not blocking legitimate users**.

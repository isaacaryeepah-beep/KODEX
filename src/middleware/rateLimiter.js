// ══════════════════════════════════════════════════════════════════════════════
//  KODEX Rate Limiter Middleware
//  - Protects login from brute force attacks
//  - Protects registration from spam
//  - Protects password reset from abuse
//  - Uses in-memory store (works without Redis)
// ══════════════════════════════════════════════════════════════════════════════

const requestCounts = new Map();

// Clean up old entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > data.windowMs) {
      requestCounts.delete(key);
    }
  }
}, 5 * 60 * 1000);

function createRateLimiter({ windowMs, max, message }) {
  return (req, res, next) => {
    // Use IP + route as key
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                req.socket?.remoteAddress || 
                'unknown';
    const key = `${ip}::${req.path}`;
    const now = Date.now();

    const existing = requestCounts.get(key);

    if (!existing || now - existing.windowStart > windowMs) {
      // New window
      requestCounts.set(key, { count: 1, windowStart: now, windowMs });
      return next();
    }

    existing.count++;

    if (existing.count > max) {
      const retryAfterSec = Math.ceil((windowMs - (now - existing.windowStart)) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        error: message || 'Too many requests. Please try again later.',
        retryAfter: retryAfterSec,
      });
    }

    next();
  };
}

// ── Specific limiters ─────────────────────────────────────────────────────────

// Login: max 10 attempts per 15 minutes per IP
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts. Please wait 15 minutes and try again.',
});

// Register: max 5 registrations per hour per IP
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: 'Too many accounts created from this IP. Please try again later.',
});

// Password reset: max 5 requests per hour per IP
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 2,
  message: 'Too many password reset attempts. Please wait an hour and try again.',
});

// General API: max 200 requests per 15 minutes per IP
const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests from this IP. Please slow down.',
});

module.exports = { loginLimiter, registerLimiter, passwordResetLimiter, apiLimiter };

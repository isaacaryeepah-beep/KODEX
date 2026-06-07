// ══════════════════════════════════════════════════════════════════════════════
//  DIKLY Rate Limiter Middleware
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
    // Key by IP + route + phone so each person gets their own bucket
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                req.socket?.remoteAddress ||
                'unknown';
    const phone = req.body?.phone || req.body?.email || '';
    const key = `${ip}::${req.path}::${phone}`;
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

// Register: max 20 registrations per hour per IP
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many accounts created from this IP. Please try again later.',
});

// Password reset: keyed on identifier only (not IP) so shared campus Wi-Fi
// doesn't cause one person's failed attempts to block another.
// Max 10 per hour per email/phone — enough for typos, strict enough vs abuse.
const passwordResetLimiter = (() => {
  const _counts = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of _counts.entries()) if (now - v.start > 60 * 60 * 1000) _counts.delete(k);
  }, 5 * 60 * 1000);
  return (req, res, next) => {
    const id = (req.body?.phone || req.body?.email || req.body?.indexNumber || '').toLowerCase().trim();
    if (!id) return next(); // no identifier — controller will reject; don't pollute rate-limit bucket
    const key = `pwr::${id}`;
    const now = Date.now();
    const entry = _counts.get(key);
    if (!entry || now - entry.start > 60 * 60 * 1000) {
      _counts.set(key, { count: 1, start: now });
      return next();
    }
    entry.count++;
    if (entry.count > 10) {
      const retryAfterSec = Math.ceil((60 * 60 * 1000 - (now - entry.start)) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        error: 'Too many password reset attempts. Please wait and try again.',
        retryAfter: retryAfterSec,
      });
    }
    next();
  };
})();

// General API: max 200 requests per 15 minutes per IP
const apiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Too many requests from this IP. Please slow down.',
});

// Beacon (unauthenticated): max 60 pings per 10 minutes per IP
const beaconLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: 'Too many beacon requests.',
});

module.exports = { loginLimiter, registerLimiter, passwordResetLimiter, apiLimiter, beaconLimiter };

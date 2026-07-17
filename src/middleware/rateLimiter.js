// ══════════════════════════════════════════════════════════════════════════════
//  DIKLY Rate Limiter Middleware
//  - Protects login from brute force attacks
//  - Protects registration from spam
//  - Protects password reset from abuse
//  - Redis-backed when REDIS_URL is configured (correct across multiple
//    instances); falls back to the original in-memory store otherwise, or
//    if Redis errors mid-request -- rate limiting must degrade to "works
//    like it always did on one instance," never to "stops limiting at all."
// ══════════════════════════════════════════════════════════════════════════════

const { isEnabled, getRawClient } = require("../services/cacheService");
const logger = require("../services/logger");

const requestCounts = new Map();

// Clean up old entries every 5 minutes to prevent memory leaks.
// unref() so this timer never keeps the process (or a test runner) alive.
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > data.windowMs) {
      requestCounts.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

// ── In-memory check (original implementation, unchanged) ───────────────────────
// Per-process only -- correct on a single instance, but each horizontally
// scaled instance would keep an independent counter. This is why it's now
// only the fallback path, not the only implementation.
function _memoryCheck(key, windowMs, max) {
  const now = Date.now();
  const existing = requestCounts.get(key);

  if (!existing || now - existing.windowStart > windowMs) {
    requestCounts.set(key, { count: 1, windowStart: now, windowMs });
    return { blocked: false };
  }

  existing.count++;
  if (existing.count > max) {
    const retryAfterSec = Math.ceil((windowMs - (now - existing.windowStart)) / 1000);
    return { blocked: true, retryAfterSec };
  }
  return { blocked: false };
}

// ── Redis check ──────────────────────────────────────────────────────────────
// Fixed-window counter via INCR + EXPIRE-on-first-hit. Not perfectly atomic
// across the two calls, but the failure mode of that tiny race (a key
// created without its expiry briefly) is benign and self-corrects on the
// next INCR -- standard, well-understood tradeoff for this kind of limiter.
async function _redisCheck(redis, key, windowMs, max) {
  const windowSec = Math.max(1, Math.ceil(windowMs / 1000));
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSec);
  }
  if (count > max) {
    const ttl = await redis.ttl(key);
    return { blocked: true, retryAfterSec: ttl > 0 ? ttl : windowSec };
  }
  return { blocked: false };
}

function _respond(res, next, message, result) {
  if (result.blocked) {
    res.setHeader("Retry-After", result.retryAfterSec);
    return res.status(429).json({
      error: message || "Too many requests. Please try again later.",
      retryAfter: result.retryAfterSec,
    });
  }
  next();
}

function _defaultKeyFn(req) {
  // Key by IP + route + phone so each person gets their own bucket
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
              req.socket?.remoteAddress ||
              "unknown";
  const phone = req.body?.phone || req.body?.email || "";
  return `${ip}::${req.path}::${phone}`;
}

/**
 * @param {Object} opts
 * @param {number} opts.windowMs
 * @param {number} opts.max
 * @param {string} [opts.message]
 * @param {(req) => string|null} [opts.keyFn] Custom key derivation. Return
 *   null to skip rate limiting for that request entirely (e.g. no
 *   identifier present yet -- let the controller reject it instead).
 */
function createRateLimiter({ windowMs, max, message, keyFn }) {
  const deriveKey = keyFn || _defaultKeyFn;

  return (req, res, next) => {
    const key = deriveKey(req);
    if (key === null) return next();

    // No REDIS_URL configured: exact original synchronous in-memory path.
    // Zero behavior change for any deployment that hasn't set up Redis yet.
    if (!isEnabled()) {
      return _respond(res, next, message, _memoryCheck(key, windowMs, max));
    }

    // Redis path -- only reached when Redis is actually configured.
    const redis = getRawClient();
    if (!redis) {
      return _respond(res, next, message, _memoryCheck(key, windowMs, max));
    }

    _redisCheck(redis, `rl:${key}`, windowMs, max)
      .then((result) => _respond(res, next, message, result))
      .catch((err) => {
        logger.warn(`[rateLimiter] Redis check failed for "${key}", falling back to in-memory: ${err.message}`);
        _respond(res, next, message, _memoryCheck(key, windowMs, max));
      });
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
const passwordResetLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many password reset attempts. Please wait and try again.',
  keyFn: (req) => {
    const id = (req.body?.phone || req.body?.email || req.body?.indexNumber || '').toLowerCase().trim();
    return id ? `pwr::${id}` : null; // no identifier — controller will reject; don't pollute the rate-limit bucket
  },
});

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

// AI/proctoring snapshots: 30 req per 10 minutes per IP
const snapshotLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: 'Too many snapshot submissions. Please slow down.',
});

// Report/PDF generation: 20 req per hour per IP
const reportLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many report requests. Please wait before generating more reports.',
});

// AI quiz generation: 15 req per hour per IP
const aiGenerateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: 'Too many AI generation requests. Please wait before generating more quizzes.',
});

// AI chat (FAQ assistant): 30 req per 15 minutes per IP -- looser than
// aiGenerateLimiter since this is interactive back-and-forth, not bulk
// content generation, but still bounds paid-API cost per caller.
const aiChatLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many AI chat requests. Please wait a moment before asking again.',
});

// Attendance mark: 60 req per 10 minutes per IP
const attendanceMarkLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 60,
  message: 'Too many attendance mark requests.',
});

// File uploads: 30 req per hour per IP
const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: 'Too many file uploads. Please wait before uploading more files.',
});

// Device pairing (unauthenticated -- gated only by pairingCode + institutionCode):
// 20 req per hour per IP. Generous enough for legitimate firmware retries,
// tight enough to bound brute-forcing the pairing code space.
const devicePairLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: 'Too many pairing attempts. Please wait before trying again.',
});

// Institution lookup (unauthenticated, public by design): 30 req per 15 minutes
// per IP -- throttles bulk enumeration of institutionCodes without blocking
// normal typo/retry use on the login screen.
const institutionLookupLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many requests. Please wait before trying again.',
});

module.exports = {
  loginLimiter,
  registerLimiter,
  passwordResetLimiter,
  apiLimiter,
  beaconLimiter,
  snapshotLimiter,
  reportLimiter,
  aiGenerateLimiter,
  aiChatLimiter,
  attendanceMarkLimiter,
  uploadLimiter,
  devicePairLimiter,
  institutionLookupLimiter,
};

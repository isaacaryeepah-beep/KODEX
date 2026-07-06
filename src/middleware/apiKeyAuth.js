"use strict";

/**
 * apiKeyAuth.js
 *
 * Authentication + scoping + rate limiting for the public API (/api/v1/*).
 * This is a SEPARATE door from user JWT auth (middleware/auth.js) — an API
 * key never authenticates as a person, only as one company with a fixed
 * whitelist of read scopes, so a leaked key's blast radius is far smaller
 * than a leaked password.
 *
 * Request contract: the caller sends `X-API-Key: dk_live_…`. On success,
 * req.apiKey (lean key doc) and req.apiCompany (Company doc) are attached;
 * the tenant is ALWAYS derived from the key server-side, never from any
 * request parameter.
 */

const crypto = require("crypto");
const ApiKey = require("../models/ApiKey");
const Company = require("../models/Company");

const hashKey = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

// ── Per-key rate limit ────────────────────────────────────────────────────
// In-memory fixed window, consistent with the app's single-instance design
// (see render.yaml notes — the app-wide rate limiter is in-memory too).
const RATE_LIMIT = 120;              // requests…
const RATE_WINDOW_MS = 60 * 1000;    // …per minute per key
const _buckets = new Map();          // keyId → { count, windowStart }
setInterval(() => {
  const cutoff = Date.now() - RATE_WINDOW_MS;
  for (const [id, b] of _buckets) if (b.windowStart < cutoff) _buckets.delete(id);
}, 5 * 60 * 1000).unref();

function rateLimited(keyId) {
  const now = Date.now();
  const b = _buckets.get(keyId);
  if (!b || now - b.windowStart >= RATE_WINDOW_MS) {
    _buckets.set(keyId, { count: 1, windowStart: now });
    return false;
  }
  b.count++;
  return b.count > RATE_LIMIT;
}

// Throttled usage stamping — fire-and-forget, at most one write per key
// per 30s so a busy integration doesn't turn every request into a DB write.
const USAGE_WRITE_INTERVAL_MS = 30 * 1000;
const _lastUsageWrite = new Map(); // keyId → { at, pending }
function stampUsage(keyId) {
  const now = Date.now();
  const entry = _lastUsageWrite.get(keyId) || { at: 0, pending: 0 };
  entry.pending++;
  if (now - entry.at >= USAGE_WRITE_INTERVAL_MS) {
    const inc = entry.pending;
    entry.at = now;
    entry.pending = 0;
    ApiKey.updateOne({ _id: keyId }, { $set: { lastUsedAt: new Date() }, $inc: { requestCount: inc } }).catch(() => {});
  }
  _lastUsageWrite.set(keyId, entry);
}

async function apiKeyAuth(req, res, next) {
  try {
    const raw = req.headers["x-api-key"];
    if (!raw || typeof raw !== "string") {
      return res.status(401).json({ error: "missing_api_key", message: "Provide your API key in the X-API-Key header." });
    }

    const key = await ApiKey.findOne({ keyHash: hashKey(raw.trim()) }).lean().maxTimeMS(5000);
    if (!key) {
      return res.status(401).json({ error: "invalid_api_key", message: "This API key is not recognised." });
    }
    if (key.revokedAt) {
      return res.status(401).json({ error: "revoked_api_key", message: "This API key has been revoked." });
    }

    if (rateLimited(String(key._id))) {
      res.setHeader("Retry-After", Math.ceil(RATE_WINDOW_MS / 1000));
      return res.status(429).json({ error: "rate_limited", message: `Rate limit exceeded (${RATE_LIMIT} requests/minute per key).` });
    }

    const company = await Company.findById(key.company).maxTimeMS(5000);
    if (!company) {
      return res.status(401).json({ error: "invalid_api_key", message: "This API key is not recognised." });
    }
    // API access rides on the same subscription/trial coverage as the app —
    // an expired institution's data stops flowing to integrations too.
    if (!company.hasAccess) {
      return res.status(402).json({ error: "subscription_expired", message: "This organization's Dikly subscription has expired. Renew to restore API access." });
    }

    req.apiKey = key;
    req.apiCompany = company;
    stampUsage(String(key._id));
    next();
  } catch (err) {
    console.error("[apiKeyAuth]", err.message);
    res.status(500).json({ error: "auth_failed", message: "Could not verify API key." });
  }
}

// Scope gate: requireScope("read:attendance") → 403 with a message that
// names the missing scope, so integration debugging is self-explanatory.
function requireScope(scope) {
  return (req, res, next) => {
    if (!req.apiKey?.scopes?.includes(scope)) {
      return res.status(403).json({
        error: "missing_scope",
        message: `This API key does not have the "${scope}" scope. Ask your Dikly admin to issue a key with it.`,
      });
    }
    next();
  };
}

// Corporate-mode gate for endpoints whose data model only exists in
// corporate mode (attendance/leaves/shifts).
function requireCorporate(req, res, next) {
  if (req.apiCompany?.mode !== "corporate") {
    return res.status(400).json({
      error: "corporate_only",
      message: "This endpoint is only available for corporate-mode organizations.",
    });
  }
  next();
}

module.exports = { apiKeyAuth, requireScope, requireCorporate, hashKey };

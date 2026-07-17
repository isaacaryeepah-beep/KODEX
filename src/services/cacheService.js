"use strict";

/**
 * Thin Redis caching layer. Fail-open by design: any Redis error (down,
 * unreachable, REDIS_URL unset) falls back to calling the caller's fetch
 * function directly and skips the cache write -- caching must never be able
 * to make a request fail or hang that would otherwise have succeeded.
 */

const Redis  = require("ioredis");
const logger = require("./logger");

let client = null;
let loggedDisabled = false;

function getClient() {
  if (client) return client;
  if (!process.env.REDIS_URL) {
    if (!loggedDisabled) {
      logger.info("[cacheService] REDIS_URL not set -- caching disabled, all reads go straight to the DB.");
      loggedDisabled = true;
    }
    return null;
  }
  client = new Redis(process.env.REDIS_URL, {
    // Cap retry attempts instead of ioredis's default infinite backoff --
    // a caching layer should give up and fall back, not keep the process
    // busy retrying forever.
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 5 ? null : Math.min(times * 200, 2000)),
    lazyConnect: true,
  });
  client.on("error", (err) => logger.warn(`[cacheService] Redis error: ${err.message}`));
  client.connect().catch((err) => logger.warn(`[cacheService] Redis connect failed: ${err.message}`));
  return client;
}

function isEnabled() {
  return !!process.env.REDIS_URL;
}

/**
 * Returns the cached value for `key` if present, otherwise calls `fetchFn`,
 * caches the result for `ttlSeconds`, and returns it. On any Redis error
 * (or when Redis isn't configured), falls through to calling `fetchFn`
 * directly without caching.
 */
async function getOrSetCache(key, ttlSeconds, fetchFn) {
  const redis = getClient();
  if (!redis) return fetchFn();

  try {
    const cached = await redis.get(key);
    if (cached !== null) return JSON.parse(cached);
  } catch (err) {
    logger.warn(`[cacheService] get(${key}) failed, falling back to source: ${err.message}`);
    return fetchFn();
  }

  const value = await fetchFn();

  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn(`[cacheService] set(${key}) failed (value still returned): ${err.message}`);
  }

  return value;
}

/** Deletes a single cache key. No-ops (does not throw) if Redis is unavailable. */
async function invalidateCache(key) {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    logger.warn(`[cacheService] invalidate(${key}) failed: ${err.message}`);
  }
}

/** Deletes every key matching `prefix*`. No-ops if Redis is unavailable. */
async function invalidatePattern(prefix) {
  const redis = getClient();
  if (!redis) return;
  try {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length) await redis.del(...keys);
  } catch (err) {
    logger.warn(`[cacheService] invalidatePattern(${prefix}) failed: ${err.message}`);
  }
}

module.exports = { getOrSetCache, invalidateCache, invalidatePattern, isEnabled };

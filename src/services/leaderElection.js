"use strict";

/**
 * Redis-backed leader election so cron jobs / interval-based schedulers run
 * on exactly one instance, not once per instance -- the second prerequisite
 * render.yaml's comment names for horizontal scaling (the first, the rate
 * limiter, was fixed in src/middleware/rateLimiter.js).
 *
 * Without REDIS_URL configured, electLeaderThenRun() calls its callback
 * immediately, unconditionally -- exact single-instance behavior, unchanged.
 * This only does anything once Redis (and therefore multiple instances) is
 * actually in play.
 *
 * Scope, deliberately: this guarantees exactly one instance ever STARTS the
 * schedulers (a startup-time race, decided once), plus a clean handoff on
 * ordinary graceful shutdown (redeploys). It does NOT tear down an
 * already-running node-cron job/setInterval mid-flight if this instance
 * later loses the lock to a transient Redis outage while still alive --
 * doing that would mean plumbing a stop() through every one of the ~7
 * scheduler modules server.js starts, for a failure window that only
 * exists during an actual Redis outage overlapping a lock renewal, not
 * during normal operation or an ordinary redeploy (which IS covered, via
 * release() below). That tradeoff is intentional, not an oversight.
 */

const crypto = require("crypto");
const { getRawClient, isEnabled } = require("./cacheService");
const logger = require("./logger");

const LOCK_KEY           = "leader:cron";
const LOCK_TTL_SEC       = 30;
const RENEW_INTERVAL_MS  = 10_000;
const RETRY_INTERVAL_MS  = 15_000;

const instanceId = crypto.randomUUID();
let isLeader = false;

// Only extend/release the lock if we still own it -- prevents an instance
// that already lost leadership from clobbering whichever instance holds it
// now.
const RENEW_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("EXPIRE", KEYS[1], ARGV[2])
else
  return 0
end
`;
const RELEASE_SCRIPT = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
`;

/**
 * Calls `onLeader` once this process becomes the cron leader. See module
 * doc comment for exactly what "leader" guarantees here.
 */
function electLeaderThenRun(onLeader) {
  if (!isEnabled()) {
    onLeader();
    return;
  }

  const tryAcquire = async () => {
    if (isLeader) return;
    const redis = getRawClient();
    if (!redis) return; // Redis unreachable right now -- next retry tick will try again
    try {
      const got = await redis.set(LOCK_KEY, instanceId, "NX", "EX", LOCK_TTL_SEC);
      if (got === "OK") {
        isLeader = true;
        logger.info(`[leaderElection] became cron leader (${instanceId})`);
        onLeader();
      }
    } catch (err) {
      logger.warn(`[leaderElection] acquire failed: ${err.message}`);
    }
  };

  const renew = async () => {
    if (!isLeader) return;
    const redis = getRawClient();
    if (!redis) return;
    try {
      const extended = await redis.eval(RENEW_SCRIPT, 1, LOCK_KEY, instanceId, LOCK_TTL_SEC);
      if (extended !== 1) {
        isLeader = false;
        logger.warn("[leaderElection] lost cron leadership (lock renewal failed) -- schedulers already running on this instance keep running; see module doc comment");
      }
    } catch (err) {
      logger.warn(`[leaderElection] renew failed: ${err.message}`);
    }
  };

  tryAcquire();
  setInterval(tryAcquire, RETRY_INTERVAL_MS).unref();
  setInterval(renew, RENEW_INTERVAL_MS).unref();
}

/**
 * Releases the lock if this instance currently holds it -- call on graceful
 * shutdown (SIGTERM/SIGINT) so a redeploy hands leadership to the new
 * instance immediately instead of waiting out LOCK_TTL_SEC.
 */
async function release() {
  if (!isLeader || !isEnabled()) return;
  const redis = getRawClient();
  if (!redis) return;
  try {
    await redis.eval(RELEASE_SCRIPT, 1, LOCK_KEY, instanceId);
    isLeader = false;
  } catch (err) {
    logger.warn(`[leaderElection] release failed: ${err.message}`);
  }
}

module.exports = { electLeaderThenRun, release };

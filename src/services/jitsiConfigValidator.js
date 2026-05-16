'use strict';

let _ran = false;

/**
 * Validate Jitsi environment configuration at server startup.
 * Logs warnings/errors but never throws — server starts in degraded mode
 * (public meet.jit.si fallback) rather than refusing to boot.
 */
exports.validateJitsiConfig = function () {
  if (_ran) return;
  _ran = true;

  const domain  = process.env.JITSI_DOMAIN;
  const appId   = process.env.JITSI_APP_ID;
  const secret  = process.env.JITSI_APP_SECRET;
  const jicofo  = process.env.JITSI_JICOFO_URL;

  if (!secret) {
    console.warn('[Jitsi] JITSI_APP_SECRET not set — using public meet.jit.si (no JWT auth, no moderator enforcement)');
    console.warn('[Jitsi] Set JITSI_DOMAIN, JITSI_APP_ID, JITSI_APP_SECRET to enable self-hosted mode.');
    return;
  }

  const errors = [];
  if (!domain || domain === 'meet.jit.si') {
    errors.push('JITSI_DOMAIN must be your self-hosted domain — not meet.jit.si');
  }
  if (!appId) {
    errors.push('JITSI_APP_ID is required (must match Prosody JWT_APP_ID)');
  }

  if (errors.length) {
    errors.forEach(e => console.error('[Jitsi] ✗', e));
    console.error('[Jitsi] Fix the above errors to enable self-hosted mode. Falling back to public Jitsi.');
    return;
  }

  console.log(`[Jitsi] ✓ Self-hosted: ${domain}  app_id=${appId}`);

  if (jicofo) {
    console.log(`[Jitsi] ✓ Jicofo REST: ${jicofo} (server-side kick enabled)`);
  } else {
    console.warn('[Jitsi] JITSI_JICOFO_URL not set — server-side kick disabled (SSE client-side fallback active)');
  }
};

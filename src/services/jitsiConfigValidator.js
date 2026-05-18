'use strict';

let _ran = false;

/**
 * Validate Jitsi environment configuration at server startup.
 * Logs a summary — the actual fatal guard is in jitsiTokenService.js which
 * throws if required vars are missing before the server binds to any port.
 */
exports.validateJitsiConfig = function () {
  if (_ran) return;
  _ran = true;

  const domain = process.env.JITSI_DOMAIN;
  const appId  = process.env.JITSI_APP_ID;
  const jicofo = process.env.JITSI_JICOFO_URL;

  console.log(`[Jitsi] ✓ Self-hosted: ${domain}  app_id=${appId}`);

  if (jicofo) {
    console.log(`[Jitsi] ✓ Jicofo REST: ${jicofo} (server-side kick enabled)`);
  } else {
    console.warn('[Jitsi] JITSI_JICOFO_URL not set — server-side participant kick disabled');
  }
};

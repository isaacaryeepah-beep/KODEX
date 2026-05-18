'use strict';
const jwt = require('jsonwebtoken');

// ── Required configuration — no fallbacks, no public Jitsi ───────────────────
// These must be set in .env. The server will refuse to start if they are missing.
const JITSI_DOMAIN     = process.env.JITSI_DOMAIN;
const JITSI_APP_ID     = process.env.JITSI_APP_ID;
const JITSI_APP_SECRET = process.env.JITSI_APP_SECRET;

const MISSING = ['JITSI_DOMAIN', 'JITSI_APP_ID', 'JITSI_APP_SECRET'].filter(k => !process.env[k]);
if (MISSING.length) {
  const msg = `[Jitsi] FATAL: Required environment variables not set: ${MISSING.join(', ')}. ` +
    'The platform cannot use self-hosted Jitsi without these. Set them in .env and restart.';
  console.error(msg);
  // Throw so the process exits immediately rather than serving broken meeting joins
  throw new Error(msg);
}

/**
 * Generate a Prosody mod_auth_token-compatible JWT for a DIKLY user.
 *
 * Token scope is locked to the specific roomName so it cannot be reused
 * across rooms. The moderator flag is always set server-side — the client
 * never controls this claim.
 */
exports.generateJitsiToken = function (user, roomName, isModerator, durationMinutes = 240) {
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss:  JITSI_APP_ID,
    sub:  JITSI_DOMAIN,
    aud:  JITSI_APP_ID,
    room: roomName,
    exp:  now + durationMinutes * 60,
    nbf:  now - 30,
    context: {
      user: {
        id:        String(user._id),
        name:      user.name || user.email || 'Participant',
        email:     user.email || '',
        avatar:    '',
        moderator: Boolean(isModerator),
      },
      features: {
        livestreaming:   false,
        recording:       false,
        screensharing:   true,
        'outbound-call': false,
      },
    },
  };

  return jwt.sign(payload, JITSI_APP_SECRET, {
    algorithm: 'HS256',
    header: { kid: JITSI_APP_ID, alg: 'HS256' },
  });
};

exports.JITSI_DOMAIN  = JITSI_DOMAIN;
exports.JITSI_APP_ID  = JITSI_APP_ID;

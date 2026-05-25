'use strict';
const jwt = require('jsonwebtoken');

// ── Required configuration — no fallbacks, no public Jitsi ───────────────────
const JITSI_DOMAIN     = process.env.JITSI_DOMAIN;
const JITSI_APP_ID     = process.env.JITSI_APP_ID;
const JITSI_APP_SECRET = process.env.JITSI_APP_SECRET;

const MISSING = ['JITSI_DOMAIN', 'JITSI_APP_ID', 'JITSI_APP_SECRET'].filter(k => !process.env[k]);
if (!MISSING.length) {
  console.log(`[Jitsi] ✓ Configured — domain=${JITSI_DOMAIN}  app_id=${JITSI_APP_ID}`);
}

/**
 * Generate a Prosody mod_auth_token-compatible JWT for a DIKLY user.
 * The moderator flag is always set server-side — the client never controls it.
 */
exports.jitsiConfigured = MISSING.length === 0;

exports.generateJitsiToken = function (user, roomName, isModerator, durationMinutes = 240) {
  if (MISSING.length) throw new Error('Jitsi is not configured. Set JITSI_DOMAIN, JITSI_APP_ID and JITSI_APP_SECRET.');
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

  const token = jwt.sign(payload, JITSI_APP_SECRET, {
    algorithm: 'HS256',
    header: { kid: JITSI_APP_ID, alg: 'HS256' },
  });

  console.log(
    `[Jitsi] JWT issued — room=${roomName}  user=${user.email || user._id}` +
    `  moderator=${isModerator}  exp=${new Date((now + durationMinutes * 60) * 1000).toISOString()}`
  );

  return token;
};

exports.JITSI_DOMAIN  = JITSI_DOMAIN;
exports.JITSI_APP_ID  = JITSI_APP_ID;

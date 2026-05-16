'use strict';
const jwt = require('jsonwebtoken');

const JITSI_DOMAIN     = process.env.JITSI_DOMAIN     || 'meet.jit.si';
const JITSI_APP_ID     = process.env.JITSI_APP_ID     || 'dikly';
const JITSI_APP_SECRET = process.env.JITSI_APP_SECRET;

function isSelfHosted() {
  return !!(JITSI_APP_SECRET && JITSI_DOMAIN !== 'meet.jit.si');
}

/**
 * Generate a Prosody mod_auth_token-compatible JWT for a DIKLY user.
 *
 * Token scope is locked to the specific roomName so it cannot be reused
 * across rooms. The moderator flag is always set server-side from the user's
 * DIKLY role — the client never controls this claim.
 *
 * Returns null when not in self-hosted mode (no JITSI_APP_SECRET set).
 */
exports.generateJitsiToken = function (user, roomName, isModerator, durationMinutes = 240) {
  if (!isSelfHosted()) return null;

  try {
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
  } catch (err) {
    console.error('[Jitsi] Token generation failed:', err.message);
    return null;
  }
};

exports.isSelfHosted = isSelfHosted;
exports.JITSI_DOMAIN  = JITSI_DOMAIN;
exports.JITSI_APP_ID  = JITSI_APP_ID;

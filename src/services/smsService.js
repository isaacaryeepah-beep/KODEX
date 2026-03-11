// ─── KODEX SMS Service (mNotify) ─────────────────────────────────────────────
// Docs: https://apps.mnotify.net/docs
// Env vars needed in Render:
//   MNOTIFY_API_KEY  — your API key from mnotify.net dashboard
//   SMS_SENDER_ID    — e.g. "KODEX" (must be approved in mNotify dashboard)
// ─────────────────────────────────────────────────────────────────────────────

const https = require('https');

// Normalise any Ghana phone format → 233XXXXXXXXX
function normalisePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/\s+/g, '').replace(/[^0-9+]/g, '');
  if (p.startsWith('+')) p = p.slice(1);
  if (p.startsWith('0')) p = '233' + p.slice(1);
  return p;
}

// Send a raw SMS via mNotify
async function sendSms({ to, message }) {
  const apiKey   = process.env.MNOTIFY_API_KEY;
  const senderId = process.env.SMS_SENDER_ID || 'KODEX';
  const phone    = normalisePhone(to);

  if (!apiKey) {
    console.log(`[SMS] DEV MODE — to:${phone} msg:"${message}"`);
    return { ok: true, dev: true };
  }
  if (!phone) {
    console.error('[SMS] Invalid phone number:', to);
    return { ok: false, error: 'Invalid phone number' };
  }

  // mNotify uses query params on GET request
  const params = new URLSearchParams({
    key:       apiKey,
    to:        phone,
    msg:       message,
    sender_id: senderId,
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'apps.mnotify.net',
      path:     `/smsapi?${params.toString()}`,
      method:   'GET',
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          // mNotify returns status 1000 for success
          if (json.status === '1000' || json.status === 1000) {
            console.log(`[SMS] ✅ Sent to ${phone} via mNotify`);
            resolve({ ok: true });
          } else {
            console.error(`[SMS] ❌ mNotify error:`, JSON.stringify(json));
            resolve({ ok: false, error: json.title || json.message || body });
          }
        } catch (e) {
          // mNotify sometimes returns plain text
          if (body.includes('1000')) {
            console.log(`[SMS] ✅ Sent to ${phone} via mNotify`);
            resolve({ ok: true });
          } else {
            console.error('[SMS] ❌ Parse error:', body);
            resolve({ ok: false, error: body });
          }
        }
      });
    });
    req.on('error', (err) => {
      console.error('[SMS] ❌ Request error:', err.message);
      resolve({ ok: false, error: err.message });
    });
    req.end();
  });
}

// Send OTP reset code
async function sendOtp({ phone, code, name }) {
  const message = `KODEX: Hi ${name}, your password reset code is ${code}. Valid for 1 hour. Do not share this code.`;
  return sendSms({ to: phone, message });
}

module.exports = { sendOtp, sendSms, normalisePhone };

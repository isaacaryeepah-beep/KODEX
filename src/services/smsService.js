// ─── KODEX SMS Service (Arkesel) ─────────────────────────────────────────────
// Docs: https://developers.arkesel.com
// Env vars needed in Render:
//   ARKESEL_API_KEY  -- your API key from arkesel.com dashboard
//   SMS_SENDER_ID    -- e.g. "KODEX" (max 11 chars, no spaces)
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

// Send a raw SMS
async function sendSms({ to, message }) {
  const apiKey   = process.env.ARKESEL_API_KEY;
  const senderId = process.env.SMS_SENDER_ID || 'KODEX';
  const phone    = normalisePhone(to);

  if (!apiKey) {
    console.log(`[SMS] DEV MODE -- to:${phone} msg:"${message}"`);
    return { ok: true, dev: true };
  }
  if (!phone) {
    console.error('[SMS] Invalid phone number:', to);
    return { ok: false, error: 'Invalid phone number' };
  }

  const payload = JSON.stringify({
    sender:     senderId,
    message,
    recipients: [phone],
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'sms.arkesel.com',
      path:     '/api/v2/sms/send',
      method:   'POST',
      headers: {
        'api-key':        apiKey,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.status === 'success') {
            console.log(`[SMS] ✅ Sent to ${phone}`);
            resolve({ ok: true });
          } else {
            console.error(`[SMS] ❌ Arkesel error:`, JSON.stringify(json));
            resolve({ ok: false, error: json.message || body });
          }
        } catch (e) {
          console.error('[SMS] ❌ Parse error:', body);
          resolve({ ok: false, error: body });
        }
      });
    });
    req.on('error', (err) => {
      console.error('[SMS] ❌ Request error:', err.message);
      resolve({ ok: false, error: err.message });
    });
    req.write(payload);
    req.end();
  });
}

// Send OTP reset code
async function sendOtp({ phone, code, name }) {
  const message = `KODEX: Hi ${name}, your verification code is ${code}. Valid for 1 hour.`;
  return sendSms({ to: phone, message });
}

module.exports = { sendOtp, sendSms, normalisePhone };

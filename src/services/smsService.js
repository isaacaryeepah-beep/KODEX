// ─── KODEX SMS Service (mNotify) ─────────────────────────────────────────────
// Docs: https://api.mnotify.com/docs
// Env vars needed in Render:
//   MNOTIFY_API_KEY  — your API key from mnotify.net dashboard
//   SMS_SENDER_ID    — e.g. "KODEX" (approved sender ID)
// ─────────────────────────────────────────────────────────────────────────────

const https = require('https');

// Normalise any Ghana phone format → 0XXXXXXXXX (mNotify prefers local format)
function normalisePhone(raw) {
  if (!raw) return null;
  let p = String(raw).replace(/\s+/g, '').replace(/[^0-9+]/g, '');
  if (p.startsWith('+233')) p = '0' + p.slice(4);
  if (p.startsWith('233')) p = '0' + p.slice(3);
  return p;
}

// Send a raw SMS via mNotify REST API
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

  const payload = JSON.stringify({
    recipient:     [phone],
    sender:        senderId,
    message,
    is_schedule:   'false',
    schedule_date: '',
  });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.mnotify.com',
      path:     `/api/sms/quick?key=${apiKey}`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        console.log(`[SMS] mNotify response (${res.statusCode}):`, body);
        try {
          const json = JSON.parse(body);
          // mNotify returns status "success" or code 200
          if (json.status === 'success' || res.statusCode === 200) {
            console.log(`[SMS] ✅ Sent to ${phone} via mNotify`);
            resolve({ ok: true });
          } else {
            console.error(`[SMS] ❌ mNotify error:`, JSON.stringify(json));
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
  const message = `Your KODEX verification code is ${code}. Valid for 1 hour.`;
  return sendSms({ to: phone, message });
}

module.exports = { sendOtp, sendSms, normalisePhone };

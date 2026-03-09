// ─── KODEX SMS Service ────────────────────────────────────────────────────────
// Uses Arkesel SMS API (arkesel.com)
// Set ARKESEL_API_KEY and SMS_SENDER_ID in Render environment variables
// SMS_SENDER_ID must be ≤11 chars e.g. "KODEX"
// If ARKESEL_API_KEY is not set, OTPs are logged to console only (dev mode)
// ─────────────────────────────────────────────────────────────────────────────

const https       = require('https');
const SENDER_ID   = process.env.SMS_SENDER_ID || 'KODEX';

// ── Normalise phone number to Arkesel format (233XXXXXXXXX) ──────────────────
function normalisePhone(raw) {
  if (!raw) return null;
  let phone = String(raw).replace(/\s+/g, '').replace(/[^0-9+]/g, '');
  // +233... → 233...
  if (phone.startsWith('+')) phone = phone.slice(1);
  // 0XX... → 233XX...  (Ghana local)
  if (phone.startsWith('0')) phone = '233' + phone.slice(1);
  // already 233...
  return phone;
}

// ── Raw SMS send ──────────────────────────────────────────────────────────────
async function sendSms({ to, message }) {
  const apiKey = process.env.ARKESEL_API_KEY;
  const phone  = normalisePhone(to);

  if (!apiKey) {
    console.log(`[SmsService] DEV — would send to ${phone}: "${message}"`);
    return { ok: true, dev: true };
  }
  if (!phone) {
    console.error('[SmsService] Invalid phone number:', to);
    return { ok: false, error: 'Invalid phone number' };
  }

  const payload = JSON.stringify({
    sender:     SENDER_ID,
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
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.status === 'success') {
            console.log(`[SmsService] ✅ Sent to ${phone}`);
            resolve({ ok: true });
          } else {
            console.error(`[SmsService] ❌ Arkesel error:`, json);
            resolve({ ok: false, error: json.message || body });
          }
        } catch (e) {
          console.error('[SmsService] ❌ Parse error:', body);
          resolve({ ok: false, error: body });
        }
      });
    });
    req.on('error', (err) => {
      console.error('[SmsService] ❌ Request error:', err.message);
      resolve({ ok: false, error: err.message });
    });
    req.write(payload);
    req.end();
  });
}

// ── Send OTP code via SMS ─────────────────────────────────────────────────────
async function sendOtp({ phone, code, name, context = 'password reset' }) {
  const message =
    `KODEX: Your ${context} code is ${code}. Valid for 1 hour. Do not share this code.`;
  return sendSms({ to: phone, message });
}

module.exports = { sendOtp, sendSms, normalisePhone };

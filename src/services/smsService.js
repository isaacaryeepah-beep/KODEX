'use strict';
// ─── DIKLY SMS Service ────────────────────────────────────────────────────────
// Supports Arkesel and mNotify. Switch provider via env var:
//   SMS_PROVIDER=arkesel   (default)
//   SMS_PROVIDER=mnotify
//
// Arkesel env vars:   ARKESEL_API_KEY, SMS_SENDER_ID
// mNotify env vars:   MNOTIFY_API_KEY, SMS_SENDER_ID
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

// ── Arkesel provider ──────────────────────────────────────────────────────────
function _sendArkesel(phone, message) {
  const apiKey   = process.env.ARKESEL_API_KEY;
  const senderId = process.env.SMS_SENDER_ID || 'DIKLY';

  if (!apiKey) return Promise.resolve({ ok: true, dev: true });

  const payload = JSON.stringify({ sender: senderId, message, recipients: [phone] });

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'sms.arkesel.com',
      path:     '/api/v2/sms/send',
      method:   'POST',
      timeout:  8000,
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
            console.log(`[SMS/Arkesel] ✅ Sent to ${phone}`);
            resolve({ ok: true });
          } else {
            console.error('[SMS/Arkesel] ❌', JSON.stringify(json));
            resolve({ ok: false, error: json.message || body });
          }
        } catch {
          console.error('[SMS/Arkesel] ❌ Parse error:', body);
          resolve({ ok: false, error: body });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error',   (e) => resolve({ ok: false, error: e.message }));
    req.write(payload);
    req.end();
  });
}

// ── mNotify provider ──────────────────────────────────────────────────────────
// Docs: https://developers.mnotify.com/docs
// API key from: https://app.mnotify.com/dashboard/account/api
function _sendMnotify(phone, message) {
  const apiKey   = process.env.MNOTIFY_API_KEY;
  const senderId = process.env.SMS_SENDER_ID || 'DIKLY';

  if (!apiKey) return Promise.resolve({ ok: true, dev: true });

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
      timeout:  8000,
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        // mNotify returns "1000" on success, "1001"–"1006" on error
        const code = body.trim();
        if (code === '1000') {
          console.log(`[SMS/mNotify] ✅ Sent to ${phone}`);
          resolve({ ok: true });
        } else {
          const errors = {
            '1002': 'Invalid number', '1003': 'You do not have enough units',
            '1004': 'Invalid API key', '1005': 'Invalid Sender ID',
            '1006': 'Invalid Schedule time', '1007': 'Message too long',
          };
          const msg = errors[code] || `mNotify error code ${code}`;
          console.error(`[SMS/mNotify] ❌ ${msg}`);
          resolve({ ok: false, error: msg });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    req.on('error',   (e) => resolve({ ok: false, error: e.message }));
    req.end();
  });
}

// ── Unified send ──────────────────────────────────────────────────────────────
async function sendSms({ to, message }) {
  const phone    = normalisePhone(to);
  const provider = (process.env.SMS_PROVIDER || 'arkesel').toLowerCase();
  const hasKey   = provider === 'mnotify' ? !!process.env.MNOTIFY_API_KEY : !!process.env.ARKESEL_API_KEY;

  if (!hasKey) {
    console.log(`[SMS] DEV MODE (${provider}) -- to:${phone} msg:"${message}"`);
    return { ok: true, dev: true };
  }
  if (!phone) {
    console.error('[SMS] Invalid phone number:', to);
    return { ok: false, error: 'Invalid phone number' };
  }

  return provider === 'mnotify'
    ? _sendMnotify(phone, message)
    : _sendArkesel(phone, message);
}

// ── OTP helper — fire-and-forget so caller responds immediately ───────────────
async function sendOtp({ phone, code, name }) {
  const message = `DIKLY: Hi ${name}, your verification code is ${code}. Valid for 1 hour.`;
  sendSms({ to: phone, message }).then(r => {
    if (!r.ok && !r.dev) console.error('[SMS] OTP delivery failed:', r.error);
  });
  return { ok: true, queued: true };
}

module.exports = { sendOtp, sendSms, normalisePhone };

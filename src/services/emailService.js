// ─── DIKLY Email Service ───────────────────────────────────────────────────
// Primary sender: Gmail SMTP (GMAIL_USER + GMAIL_APP_PASSWORD env vars)
// Fallback:       MailerSend API (MAILERSEND_API_KEY env var)
// FROM address always resolves to the Gmail user so bounces reach a real inbox.

// Always use the real Gmail address as FROM — no-reply@dikly.sbs has no mail server.
const GMAIL_USER    = process.env.GMAIL_USER || '';
const SUPPORT_EMAIL = GMAIL_USER;
const _rawFrom      = process.env.EMAIL_FROM || `DIKLY <${GMAIL_USER}>`;
const _safeFrom     = _rawFrom.includes('dikly.it.com')
  ? `DIKLY <${GMAIL_USER}>`
  : _rawFrom;
// If EMAIL_FROM still points at no-reply@dikly.sbs, override with the real Gmail address.
const FROM = _safeFrom.includes('no-reply@dikly.sbs') || _safeFrom.includes('no-reply@dikly')
  ? `DIKLY <${GMAIL_USER}>`
  : _safeFrom;


const BASE_URL = process.env.APP_URL || 'https://dikly.sbs';

// ── Colour palette ────────────────────────────────────────────────────────────
// Matches the app's own indigo/violet brand system (see style.css --accent /
// --accent2) so transactional email reads as the same product, not a
// generic template. Every colour is applied via inline attributes as well
// as CSS below, and the shell forces color-scheme:light — Gmail/Outlook
// "smart" dark-mode inversion was flattening the white card into a harsh
// black box with no contrast control, which is what actually made these
// look unpolished, independent of the content design.
const C = {
  primary   : '#4f6ef7',
  purple    : '#7c3aed',
  green     : '#0a7c4a',
  greenSoft : '#e9f9f1',
  greenLine : '#b7ebd1',
  red       : '#c0261f',
  redSoft   : '#fdedec',
  redLine   : '#f4c3c0',
  amber     : '#a25a06',
  amberSoft : '#fdf3e2',
  amberLine : '#f2d8a2',
  page      : '#f3f4f8',
  card      : '#ffffff',
  text      : '#12131a',
  muted     : '#666a78',
  faint     : '#9498a3',
  border    : '#e7e8ef',
};

// ── Small shared components ───────────────────────────────────────────────────
// Category label + title, replacing emoji-in-heading — matches how the rest
// of the product (and how any professional transactional sender) signals
// what an email is about: a short label, not a decorative glyph.
function heading(eyebrow, title, tone = C.primary) {
  return `
    <div style="font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${tone};margin:0 0 10px">${eyebrow}</div>
    <h1 style="font-size:23px;font-weight:800;letter-spacing:-.4px;color:${C.text};margin:0 0 10px;line-height:1.3">${title}</h1>`;
}

// Two-column label/value card — replaces the old cramped <p><strong> stack.
// pairs: [[label, value], ...]
function detailCard(pairs) {
  const rows = pairs.filter(Boolean).map(([label, value], i, arr) => `
    <tr>
      <td style="padding:11px 0;${i < arr.length - 1 ? `border-bottom:1px solid ${C.border};` : ''}font-size:12.5px;color:${C.muted};vertical-align:top;white-space:nowrap">${label}</td>
      <td style="padding:11px 0 11px 18px;${i < arr.length - 1 ? `border-bottom:1px solid ${C.border};` : ''}font-size:13.5px;color:${C.text};font-weight:600;text-align:right;word-break:break-word">${value}</td>
    </tr>`).join('');
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${C.page};border:1px solid ${C.border};border-radius:12px;margin:22px 0">
      <tr><td style="padding:2px 20px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows}</table>
      </td></tr>
    </table>`;
}

// One-time-code display — kept visually distinct from detailCard on purpose.
function otpBox(code) {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${C.page};border:1px solid ${C.border};border-radius:12px;margin:22px 0">
      <tr><td style="padding:24px;text-align:center">
        <div style="font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${C.muted};margin-bottom:10px">Your reset code</div>
        <div style="font-family:Consolas,'SF Mono',Menlo,monospace;font-size:32px;font-weight:800;letter-spacing:8px;color:${C.primary}">${code}</div>
        <div style="font-size:12px;color:${C.faint};margin-top:10px">Valid for 1 hour · do not share this code</div>
      </td></tr>
    </table>`;
}

// Bulletproof-ish button: flat colour declared first as a fallback for
// clients that don't parse gradients (Outlook desktop), gradient declared
// second for everyone else — clients keep the last background they understand.
function button(url, label, tone = 'primary') {
  const flat = tone === 'green' ? C.green : C.primary;
  const grad = tone === 'green' ? C.green : `linear-gradient(135deg, ${C.primary}, ${C.purple})`;
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto"><tr>
      <td style="border-radius:10px;background:${flat};background:${grad}">
        <a href="${url}" style="display:inline-block;padding:14px 30px;font-size:14.5px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:.2px">${label}</a>
      </td>
    </tr></table>`;
}

// Faithful inline reproduction of dikly-icon.svg — a hosted image would be
// more portable, but the source file is a 1536x1024 banner PNG (wrong shape
// for a header mark) and inline SVG renders correctly in Gmail, Apple Mail,
// and Outlook.com, which covers the overwhelming majority of this product's
// mobile-first audience.
const LOGO_SVG = `<svg width="30" height="30" viewBox="0 0 100 100" style="display:block">
  <defs>
    <linearGradient id="dg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#60a5fa"/><stop offset="45%" stop-color="#2563eb"/><stop offset="100%" stop-color="#1e40af"/>
    </linearGradient>
    <clipPath id="dc"><path d="M14,4 L14,96 L50,96 C97,93 97,7 50,4 Z"/></clipPath>
  </defs>
  <path d="M14,4 L14,96 L50,96 C97,93 97,7 50,4 Z" fill="url(#dg)"/>
  <g clip-path="url(#dc)">
    <polygon points="4,58 63,-2 89,-2 30,58" fill="#ffffff"/>
    <polygon points="30,102 89,42 63,42 4,102" fill="#ffffff"/>
  </g>
</svg>`;

// ── Shared HTML wrapper ───────────────────────────────────────────────────────
function wrap(bodyHtml, previewText = '') {
  return `<!DOCTYPE html>
<html lang="en" style="color-scheme:light;supported-color-schemes:light">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light"/>
<meta name="supported-color-schemes" content="light"/>
<title>DIKLY</title>
<style>
  :root { color-scheme: light; supported-color-schemes: light; }
  * { box-sizing: border-box; }
  body { margin:0; padding:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
         background: ${C.page} !important; color: ${C.text} !important; -webkit-font-smoothing: antialiased; }
  a { color: ${C.primary}; text-decoration: none; }
  h1, p, td, div { color: inherit; }
  p { font-size: 14.5px; line-height: 1.7; color: ${C.muted}; margin: 0 0 16px; }
  .divider  { border: none; border-top: 1px solid ${C.border}; margin: 24px 0; }
  .highlight{ color: ${C.text}; font-weight: 600; }
  .badge    { display: inline-block; padding: 4px 11px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: .3px; }
  .badge-green  { background: ${C.greenSoft}; color: ${C.green}; border: 1px solid ${C.greenLine}; }
  .badge-orange { background: ${C.amberSoft}; color: ${C.amber}; border: 1px solid ${C.amberLine}; }
  .badge-red    { background: ${C.redSoft}; color: ${C.red}; border: 1px solid ${C.redLine}; }
  /* Neutralise Gmail/Outlook automatic dark-mode repainting so the card
     always renders on the white/light surfaces it was actually designed for. */
  [data-ogsc] body, [data-ogsb] body { background: ${C.page} !important; }
  [data-ogsc] .dk-card, [data-ogsb] .dk-card { background: ${C.card} !important; }
  [data-ogsc] .dk-card *, [data-ogsb] .dk-card * { color: inherit !important; }
  u + .body .dk-card { background: ${C.card} !important; }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};color:${C.text}">
${previewText ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.page}">${previewText}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;background:${C.page}">
<tr><td align="center" style="padding:36px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px">

  <tr><td align="center" style="padding-bottom:26px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="padding-right:9px;vertical-align:middle">${LOGO_SVG}</td>
      <td style="vertical-align:middle;font-size:20px;font-weight:800;letter-spacing:-.4px;color:${C.text}">DIKLY</td>
    </tr></table>
  </td></tr>

  <tr><td class="dk-card" style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:38px 34px;box-shadow:0 2px 10px rgba(15,23,42,.05)">
    ${bodyHtml}
  </td></tr>

  <tr><td align="center" style="padding-top:26px">
    <div style="font-size:12.5px;color:${C.faint};line-height:1.7">
      © ${new Date().getFullYear()} DIKLY Technologies · Smart Attendance &amp; Assessment Platform<br/>
      Questions? Reply to this email or visit <a href="${BASE_URL}" style="color:${C.muted};font-weight:600">${BASE_URL.replace(/^https?:\/\//, '')}</a>
    </div>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ── Send helper ───────────────────────────────────────────────────────────────
// Parses "Name <email@domain.com>" into { name, email }
function parseAddress(addr) {
  const m = addr.match(/^(.+?)\s*<(.+?)>$/);
  if (m) return { name: m[1].trim(), email: m[2].trim() };
  return { name: addr.trim(), email: addr.trim() };
}

// ── Gmail SMTP sender (primary) ───────────────────────────────────────────────
async function sendViaGmail({ toEmail, toName, fromEmail, fromName, subject, html, textBody, replyTo }) {
  return new Promise((resolve, reject) => {
    const tls  = require('tls');
    const user = GMAIL_USER; // use module-level constant (resolved from GMAIL_USER env var)
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!pass) { reject(new Error('GMAIL_APP_PASSWORD not set')); return; }

    const auth = Buffer.from(`\x00${user}\x00${pass.replace(/\s/g, '')}`).toString('base64');
    const boundary = `dikly_${Date.now()}`;
    const msgBody = [
      `From: ${fromName} <${fromEmail}>`,
      `To: ${toName} <${toEmail}>`,
      ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      ``,
      textBody || subject,
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      ``,
      html,
      ``,
      `--${boundary}--`,
    ].join('\r\n');

    const socket = tls.connect({ host: 'smtp.gmail.com', port: 465 }, () => {
      let step = 0;
      const send = (cmd) => socket.write(cmd + '\r\n');

      socket.on('data', (data) => {
        const line = data.toString();
        if (step === 0 && line.startsWith('220')) { send('EHLO smtp.gmail.com'); step++; }
        else if (step === 1 && line.includes('250 ')) { send('AUTH PLAIN ' + auth); step++; }
        else if (step === 2 && line.startsWith('235')) { send(`MAIL FROM:<${fromEmail}>`); step++; }
        else if (step === 3 && line.startsWith('250')) { send(`RCPT TO:<${toEmail}>`); step++; }
        else if (step === 4 && line.startsWith('250')) { send('DATA'); step++; }
        else if (step === 5 && line.startsWith('354')) { send(msgBody + '\r\n.'); step++; }
        else if (step === 6 && line.startsWith('250')) { send('QUIT'); resolve({ ok: true, id: line.trim() }); step++; }
        else if (line.startsWith('5')) { socket.destroy(); reject(new Error(`SMTP error: ${line.trim()}`)); }
      });

      socket.on('error', reject);
    });

    socket.on('error', reject);
  });
}

// ── MailerSend fallback ───────────────────────────────────────────────────────
async function sendViaMailerSend({ toEmail, toName, fromEmail, fromName, subject, html, textBody, replyTo }) {
  const https = require('https');
  const apiKey = process.env.MAILERSEND_API_KEY;

  const payload = JSON.stringify({
    from: { email: fromEmail, name: fromName },
    to:   [{ email: toEmail, name: toName || toEmail }],
    ...(replyTo ? { reply_to: { email: replyTo } } : {}),
    subject,
    html,
    text: textBody || subject,
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.mailersend.com',
      path:     '/v1/email',
      method:   'POST',
      headers: {
        'Authorization':  `Bearer ${apiKey}`,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode === 202) {
          resolve({ ok: true, id: res.headers['x-message-id'] || 'sent' });
        } else {
          console.error(`[EmailService] MailerSend rejected (HTTP ${res.statusCode}): ${body}`);
          reject(new Error(`MailerSend HTTP ${res.statusCode}: ${body}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ── Main send() -- tries Gmail first, falls back to MailerSend ─────────────────
async function send({ to, subject, html, textBody }) {
  if (!to) {
    console.error('[EmailService] Missing recipient address');
    return { ok: false, error: 'Missing recipient' };
  }
  if (!subject) subject = '(no subject)';

  // GMAIL_USER is already resolved at module level from the env var.
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  const mailerKey = process.env.MAILERSEND_API_KEY;

  if (!gmailPass && !mailerKey) {
    console.log(`[EmailService] No credentials -- would send to ${to}: "${subject}"`);
    return { ok: true, dev: true };
  }

  const toParsed   = parseAddress(to);
  const fromParsed = parseAddress(FROM);

  if (!toParsed.email || !toParsed.email.includes('@')) {
    console.error(`[EmailService] Invalid recipient: "${to}"`);
    return { ok: false, error: `Invalid recipient: ${to}` };
  }

  const cleanSubject = subject.replace(/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27FF}]/gu, '').trim();

  // Try Gmail SMTP first
  if (GMAIL_USER && gmailPass) {
    try {
      const result = await sendViaGmail({
        toEmail: toParsed.email,
        toName: toParsed.name || toParsed.email,
        fromEmail: GMAIL_USER,
        fromName: fromParsed.name || 'DIKLY',
        replyTo: GMAIL_USER,
        subject: cleanSubject,
        html,
        textBody,
      });
      console.log(`[EmailService] Gmail SUCCESS "${cleanSubject}" to ${toParsed.email}`);
      return { ok: true, id: result.id };
    } catch (err) {
      console.error(`[EmailService] Gmail FAILED, trying MailerSend fallback:`, err.message);
    }
  }

  // Fallback to MailerSend — always send FROM the Gmail address if available,
  // since no-reply@dikly.sbs is not a verified MailerSend sender domain.
  if (mailerKey) {
    try {
      const result = await sendViaMailerSend({
        toEmail: toParsed.email,
        toName: toParsed.name || toParsed.email,
        fromEmail: GMAIL_USER,
        fromName: fromParsed.name || 'DIKLY',
        replyTo: GMAIL_USER,
        subject: cleanSubject,
        html,
        textBody,
      });
      console.log(`[EmailService] MailerSend SUCCESS "${cleanSubject}" to ${toParsed.email}`);
      return { ok: true, id: result.id };
    } catch (err) {
      console.error(`[EmailService] MailerSend FAILED:`, err.message);
      return { ok: false, error: err.message };
    }
  }

  return { ok: false, error: 'No working email provider configured' };
}


// ═══════════════════════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

// 1. Welcome / trial started
async function sendWelcome({ email, name, institutionName, trialDays = 14, trialEndDate }) {
  const endStr = trialEndDate ? new Date(trialEndDate).toDateString() : `${trialDays} days from now`;
  const html = wrap(`
    ${heading('Account created', 'Welcome to DIKLY')}
    <p>Hi <span class="highlight">${name}</span>, your account for <strong>${institutionName}</strong> is ready. You're on a <strong>${trialDays}-day free trial</strong> — no card needed.</p>

    ${detailCard([
      ['Status', '<span class="badge badge-green">TRIAL ACTIVE</span>'],
      ['Trial ends', endStr],
    ])}

    <p><strong>Get started in 3 steps:</strong></p>
    <p>1. Create a course and invite your students<br/>
       2. Start an attendance session — students scan or mark themselves in<br/>
       3. Create a quiz and let the AI generate your questions</p>

    ${button(BASE_URL, 'Open DIKLY')}

    <hr class="divider"/>
    <p style="font-size:13px">Your trial runs until <strong>${endStr}</strong>. After that, subscribe for <strong>GHS 200/month</strong> to keep all your data and features.</p>
  `, `Welcome to DIKLY — your ${trialDays}-day trial has started`);

  return send({ to: email, subject: 'Welcome to DIKLY — your free trial has started', html });
}

// 2. Trial ending soon (day 10 -- 4 days left)
async function sendTrialEndingSoon({ email, name, daysLeft, trialEndDate }) {
  const endStr = trialEndDate ? new Date(trialEndDate).toDateString() : `in ${daysLeft} days`;
  const html = wrap(`
    ${heading('Trial ending soon', `Your trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`, C.amber)}
    <p>Hi <span class="highlight">${name}</span>, just a heads-up — your DIKLY free trial expires on <strong>${endStr}</strong>.</p>

    ${detailCard([
      ['Status', '<span class="badge badge-orange">TRIAL ENDING SOON</span>'],
      ['Expires', endStr],
    ])}

    <p><strong>What you keep with a subscription:</strong></p>
    <p>All attendance session history<br/>
       All quizzes and student results<br/>
       All assignments and submissions<br/>
       AI question generation<br/>
       Live proctoring</p>

    ${button(`${BASE_URL}/#subscription`, 'Subscribe Now — GHS 200/month')}

    <p style="font-size:13px">Prefer annual? Pay <strong>GHS 2,000/year</strong> and get 2 months free.</p>
  `, `Your DIKLY trial ends in ${daysLeft} days — subscribe to keep access`);

  return send({ to: email, subject: `Your DIKLY trial ends in ${daysLeft} days`, html });
}

// 3. Trial expired
async function sendTrialExpired({ email, name }) {
  const html = wrap(`
    ${heading('Trial expired', 'Your DIKLY trial has ended', C.red)}
    <p>Hi <span class="highlight">${name}</span>, your 14-day free trial has expired. Your account is currently paused.</p>

    ${detailCard([
      ['Status', '<span class="badge badge-red">TRIAL EXPIRED</span>'],
      ['Your data', 'Safely saved and waiting for you'],
    ])}

    <p>Subscribe now to reactivate your account instantly. No setup needed.</p>

    ${button(`${BASE_URL}/#subscription`, 'Reactivate — GHS 200/month')}

    <p style="font-size:13px">Annual plan: <strong>GHS 2,000/year</strong> (save GHS 400 — 2 months free)</p>
  `, 'Your DIKLY trial has expired — reactivate to keep your data');

  return send({ to: email, subject: 'Your DIKLY trial has ended — reactivate your account', html });
}

// 4. Grace period nudge (day 16 -- 2 days after expiry)
async function sendGraceNudge({ email, name }) {
  const html = wrap(`
    ${heading('Final notice', 'Your data is still here', C.red)}
    <p>Hi <span class="highlight">${name}</span>, your DIKLY account has been paused for 2 days. We've kept all your data safe, but we wanted to check in one last time.</p>

    ${detailCard([
      ['Sessions & quizzes', 'All still saved'],
      ['Reactivation', 'Instant — subscribe to restore access'],
    ])}

    ${button(`${BASE_URL}/#subscription`, 'Reactivate My Account', 'green')}

    <p style="font-size:13px;text-align:center">GHS 200/month &nbsp;·&nbsp; GHS 2,000/year (2 months free)</p>
  `, 'Last chance — your DIKLY data is still waiting for you');

  return send({ to: email, subject: 'Last chance — your DIKLY data is still here', html });
}

// 5. Subscription confirmed (after payment)
async function sendSubscriptionConfirmed({ email, name, plan, endDate, amountGhs }) {
  const endStr = endDate ? new Date(endDate).toDateString() : 'N/A';
  const planLabel = plan === 'yearly' ? 'Annual Plan' : 'Monthly Plan';
  const html = wrap(`
    ${heading('Payment received', 'Subscription confirmed', C.green)}
    <p>Hi <span class="highlight">${name}</span>, your payment was successful. DIKLY is fully active.</p>

    ${detailCard([
      ['Status', '<span class="badge badge-green">ACTIVE</span>'],
      ['Plan', planLabel],
      ['Amount paid', `GHS ${amountGhs}`],
      ['Access until', endStr],
    ])}

    <p>Everything is exactly as you left it. Keep running sessions, creating quizzes, and tracking attendance.</p>

    ${button(BASE_URL, 'Go to DIKLY')}

    <hr class="divider"/>
    <p style="font-size:13px">We'll remind you before your next renewal. Thank you for subscribing to DIKLY.</p>
  `, `DIKLY subscription confirmed — active until ${endStr}`);

  return send({ to: email, subject: `DIKLY subscription confirmed — you're all set`, html });
}

// 6. Renewal reminder (7 days before subscription end)
async function sendRenewalReminder({ email, name, plan, endDate }) {
  const endStr = endDate ? new Date(endDate).toDateString() : 'soon';
  const planLabel = plan === 'yearly' ? 'Annual Plan' : 'Monthly Plan';
  const html = wrap(`
    ${heading('Renewal reminder', 'Your subscription renews in 7 days', C.amber)}
    <p>Hi <span class="highlight">${name}</span>, your DIKLY <strong>${planLabel}</strong> expires on <strong>${endStr}</strong>.</p>

    <p>To avoid any interruption to your sessions and quizzes, renew before that date.</p>

    ${button(`${BASE_URL}/#subscription`, 'Renew Subscription')}

    <p style="font-size:13px">Monthly: GHS 200 &nbsp;·&nbsp; Annual: GHS 2,000 (save GHS 400)</p>
  `, `Your DIKLY subscription expires on ${endStr}`);

  return send({ to: email, subject: `Your DIKLY subscription expires on ${endStr}`, html });
}

// ── Password Reset OTP Email ──────────────────────────────────────────────────
async function sendPasswordReset({ email, name, resetCode, institutionName }) {
  const html = wrap(`
    ${heading('Security', 'Password reset request')}
    <p>Hi <span class="highlight">${name || email}</span>, we received a request to reset your password${institutionName ? ` for <strong>${institutionName}</strong>` : ''}.</p>

    ${otpBox(resetCode)}

    <p>Enter this code on the DIKLY password reset page to set a new password.</p>
    <p>If you did not request this reset, you can safely ignore this email — your password has not changed.</p>

    <hr class="divider"/>
    <p style="font-size:12px;color:${C.faint}">This code expires in 1 hour. If you need a new code, request another reset from the login page.</p>
  `, `DIKLY password reset code: ${resetCode}`);

  return send({ to: email, subject: `Your DIKLY password reset code: ${resetCode}`, html, textBody: `Your DIKLY password reset code is: ${resetCode}\n\nThis code expires in 1 hour. Do not share it with anyone.` });
}

// ── Admin: User password reset notification ───────────────────────────────────
async function sendAdminPasswordResetNotice({ adminEmail, adminName, targetUserName, targetUserRole, targetUserEmail, institutionName }) {
  const html = wrap(`
    ${heading('Security alert', 'Password reset performed')}
    <p>Hi <span class="highlight">${adminName}</span>, this is a notification that a password reset was completed on your institution <strong>${institutionName}</strong>.</p>

    ${detailCard([
      ['User', targetUserName],
      ['Role', targetUserRole],
      ['Email / ID', targetUserEmail],
      ['Time', new Date().toLocaleString()],
    ])}

    <p>If you did not expect this reset, please review your institution's user activity in the DIKLY admin panel.</p>

    ${button(BASE_URL, 'Open DIKLY')}
  `, `Password reset notification — ${targetUserName}`);

  return send({ to: adminEmail, subject: `DIKLY: Password reset by ${targetUserName}`, html });
}


// 9. Payment failed notification
async function sendPaymentFailed({ email, name, plan, institutionName }) {
  const planLabel = plan === 'annual' ? 'Annual' : 'Monthly';
  const html = wrap(`
    ${heading('Action required', 'Payment failed', C.red)}
    <p>Hi <span class="highlight">${name || email}</span>, we were unable to process your ${planLabel} subscription payment for <strong>${institutionName || 'your institution'}</strong>.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:${C.redSoft};border:1px solid ${C.redLine};border-radius:12px;margin:22px 0">
      <tr><td style="padding:16px 20px">
        <p style="margin:0 0 4px;color:${C.red};font-weight:700;font-size:13px">Action required</p>
        <p style="margin:0;color:${C.text};font-size:13.5px">Your subscription will be suspended if payment is not received. Please update your payment method in the DIKLY dashboard.</p>
      </td></tr>
    </table>

    ${button(BASE_URL, 'Update Payment')}

    <p>If you believe this is an error, please contact your bank or try a different card. If the issue persists, contact us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
  `, 'Payment failed — action required');

  return send({ to: email, subject: 'DIKLY: Payment failed — action required', html });
}


// 10. New institution signup notification to superadmin
async function sendNewInstitutionAlert({ institutionName, adminName, adminEmail, mode, institutionCode }) {
  const html = wrap(`
    ${heading('New signup', 'New institution signed up', C.green)}
    <p>A new institution has registered on the DIKLY platform.</p>
    ${detailCard([
      ['Institution', institutionName],
      ['Mode', mode === 'academic' ? 'Academic (School/University)' : 'Corporate (Company)'],
      ['Code', `<span style="font-family:Consolas,'SF Mono',Menlo,monospace;font-size:16px;font-weight:700;color:${C.primary};letter-spacing:3px">${institutionCode}</span>`],
      ['Admin', adminName],
      ['Admin email', adminEmail],
    ])}
    <p>They are now on a 14-day free trial. Log in to the superadmin portal to manage their account.</p>
    ${button(`${BASE_URL}/superadmin`, 'Open Superadmin')}
  `, `New institution: ${institutionName}`);
  return send({ to: GMAIL_USER, subject: `New institution on DIKLY: ${institutionName}`, html });
}


// ── Lecturer welcome email ────────────────────────────────────────────────────
async function sendLecturerWelcome({ email, name, institutionName, department, isApproved }) {
  const html = wrap(`
    ${heading('Account created', 'Welcome to DIKLY')}
    <p>Hi <span class="highlight">${name}</span>, your lecturer account at <strong>${institutionName}</strong> has been created.</p>

    ${detailCard([
      ['Institution', institutionName],
      department ? ['Department', department] : null,
      ['Status', `<span class="badge ${isApproved ? 'badge-green' : 'badge-orange'}">${isApproved ? 'APPROVED' : 'PENDING APPROVAL'}</span>`],
    ])}

    ${isApproved
      ? `<p>You can log in now and start creating courses, attendance sessions, and quizzes.</p>
         ${button(BASE_URL, 'Open DIKLY')}`
      : `<p>Your account is pending approval by your institution admin. You will be able to log in once approved.</p>`
    }

    <hr class="divider"/>
    <p style="font-size:13px">Log in at <a href="${BASE_URL}">${BASE_URL}</a> using your email and the password you set during registration.</p>
  `, `Welcome to DIKLY — ${institutionName}`);
  return send({ to: email, subject: `Welcome to DIKLY — ${institutionName}`, html });
}

// ── Student welcome email ─────────────────────────────────────────────────────
async function sendStudentWelcome({ email, name, institutionName, IndexNumber }) {
  if (!email) return; // students may not have email
  const html = wrap(`
    ${heading('Account created', 'Welcome to DIKLY')}
    <p>Hi <span class="highlight">${name}</span>, your student account at <strong>${institutionName}</strong> is ready.</p>

    ${detailCard([
      ['Institution', institutionName],
      ['Student ID', `<span class="highlight">${IndexNumber}</span>`],
    ])}

    <p><strong>What you can do on DIKLY:</strong></p>
    <p>Mark your attendance using QR code or entry code<br/>
       Take quizzes and see your results instantly<br/>
       Submit assignments and track your grades<br/>
       View your schedule and upcoming sessions</p>

    ${button(BASE_URL, 'Open DIKLY')}

    <hr class="divider"/>
    <p style="font-size:13px">Log in using your <strong>Student ID: ${IndexNumber}</strong> and the password you set during registration.</p>
  `, `Welcome to DIKLY — ${institutionName}`);
  return send({ to: email, subject: `Welcome to DIKLY — ${institutionName}`, html });
}

// ── Employee welcome email ────────────────────────────────────────────────────
async function sendEmployeeWelcome({ email, name, companyName, employeeId }) {
  const html = wrap(`
    ${heading('Account created', 'Welcome to DIKLY')}
    <p>Hi <span class="highlight">${name}</span>, your employee account at <strong>${companyName}</strong> has been created.</p>

    ${detailCard([
      ['Company', companyName],
      ['Employee ID', `<span class="highlight">${employeeId}</span>`],
      ['Status', '<span class="badge badge-orange">PENDING APPROVAL</span>'],
    ])}

    <p>Your account is pending approval by your company admin. Once approved you will be able to:</p>
    <p>Mark your daily attendance<br/>
       Submit timesheets<br/>
       Request and track leave<br/>
       Access company training materials</p>

    <hr class="divider"/>
    <p style="font-size:13px">Log in at <a href="${BASE_URL}">${BASE_URL}</a> using your email and the password you set during registration.</p>
  `, `Welcome to DIKLY — ${companyName}`);
  return send({ to: email, subject: `Welcome to DIKLY — ${companyName}`, html });
}

// ── HOD welcome email ─────────────────────────────────────────────────────────
async function sendHodWelcome({ email, name, institutionName, department }) {
  const html = wrap(`
    ${heading('Account created', 'Welcome to DIKLY')}
    <p>Hi <span class="highlight">${name}</span>, your Head of Department account at <strong>${institutionName}</strong> has been created.</p>

    ${detailCard([
      ['Institution', institutionName],
      department ? ['Department', department] : null,
      ['Role', '<span class="badge badge-green">HEAD OF DEPARTMENT</span>'],
    ])}

    <p>As HOD you can approve lecturers in your department, monitor attendance, view department analytics, and manage courses.</p>

    ${button(BASE_URL, 'Open DIKLY')}

    <hr class="divider"/>
    <p style="font-size:13px">Log in at <a href="${BASE_URL}">${BASE_URL}</a> using your email and the password you set.</p>
  `, `Welcome to DIKLY — ${institutionName}`);
  return send({ to: email, subject: `Welcome to DIKLY — ${institutionName}`, html });
}

// ── Registration rejection email ──────────────────────────────────────────────
async function sendRegistrationRejected({ email, name, orgName, reason }) {
  if (!email) return;
  const html = wrap(`
    ${heading('Update', 'Registration update', C.red)}
    <p>Hi <span class="highlight">${name}</span>, we have reviewed your registration request for <strong>${orgName}</strong>.</p>

    ${detailCard([
      ['Status', '<span class="badge badge-red">NOT APPROVED</span>'],
      reason ? ['Reason', reason] : null,
    ])}

    <p>If you believe this is a mistake or have questions, please contact your institution administrator directly.</p>

    <hr class="divider"/>
    <p style="font-size:13px">This is an automated message from DIKLY. Please do not reply to this email.</p>
  `, `Your DIKLY registration was not approved`);
  return send({ to: email, subject: `Your DIKLY registration update — ${orgName}`, html });
}

// ── Self-registration pending email (sent to the applicant) ──────────────────
async function sendSelfRegPending({ email, name, orgName, role }) {
  if (!email) return;
  const roleLabel = role === 'student' ? 'Student' : 'Employee';
  const html = wrap(`
    ${heading('Received', 'Registration received', C.green)}
    <p>Hi <span class="highlight">${name}</span>, your ${roleLabel.toLowerCase()} registration request for <strong>${orgName}</strong> has been received.</p>

    ${detailCard([
      ['Organisation', orgName],
      ['Role', roleLabel],
      ['Status', '<span class="badge badge-orange">PENDING APPROVAL</span>'],
    ])}

    <p>An admin will review your request shortly. You will receive another email once your account is approved and ready to use.</p>

    <hr class="divider"/>
    <p style="font-size:13px">If you did not submit this request, please ignore this email.</p>
  `, `Your DIKLY registration is under review`);
  return send({ to: email, subject: `Your DIKLY registration is under review`, html });
}

// ── Notify admin of a new self-registration request ───────────────────────────
async function sendAdminNewSelfReg({ adminEmail, applicantName, role, orgName }) {
  if (!adminEmail) return;
  const roleLabel = role === 'student' ? 'Student' : 'Employee';
  const html = wrap(`
    ${heading('Action needed', 'New self-registration request')}
    <p>A new <strong>${roleLabel}</strong> has submitted a self-registration request for <strong>${orgName}</strong> on DIKLY.</p>

    ${detailCard([
      ['Applicant', applicantName],
      ['Role', roleLabel],
      ['Organisation', orgName],
    ])}

    <p>Log in to your admin portal to review and approve or reject the request.</p>

    ${button(BASE_URL, 'Review in DIKLY')}
  `, `New ${roleLabel} registration request`);
  return send({ to: adminEmail, subject: `New ${roleLabel} registration request — ${orgName}`, html });
}

module.exports = {
  send,
  sendWelcome,
  sendTrialEndingSoon,
  sendTrialExpired,
  sendGraceNudge,
  sendSubscriptionConfirmed,
  sendRenewalReminder,
  sendPasswordReset,
  sendAdminPasswordResetNotice,
  sendPaymentFailed,
  sendNewInstitutionAlert,
  sendLecturerWelcome,
  sendStudentWelcome,
  sendEmployeeWelcome,
  sendHodWelcome,
  sendSelfRegPending,
  sendAdminNewSelfReg,
  sendRegistrationRejected,
};

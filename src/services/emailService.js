// ─── KODEX Email Service ───────────────────────────────────────────────────
// Uses MailerSend API — free tier = 3,000 emails/month
// Set MAILERSEND_API_KEY and EMAIL_FROM in Render environment variables
// EMAIL_FROM example: "KODEX <no-reply@kodex.it.com>"
// If MAILERSEND_API_KEY is not set, emails are logged to console only (dev mode)

const FROM     = process.env.EMAIL_FROM || 'KODEX <no-reply@kodex.it.com>';
const BASE_URL = process.env.APP_URL    || 'https://kodex-713g.onrender.com';

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  primary : '#4f46e5',
  purple  : '#7c3aed',
  green   : '#059669',
  red     : '#dc2626',
  orange  : '#d97706',
  bg      : '#f1f5f9',
  card    : '#ffffff',
  text    : '#0f172a',
  muted   : '#64748b',
  border  : '#e2e8f0',
};

// ── Shared HTML wrapper ───────────────────────────────────────────────────────
function wrap(bodyHtml, previewText = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>KODEX</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         background: ${C.bg}; color: ${C.text}; -webkit-font-smoothing: antialiased; }
  a { color: ${C.primary}; text-decoration: none; }
  .wrapper  { max-width: 560px; margin: 0 auto; padding: 32px 16px; }
  .logo-row { text-align: center; margin-bottom: 24px; }
  .logo     { display: inline-flex; align-items: center; gap: 10px; font-size: 22px;
               font-weight: 800; color: ${C.text}; letter-spacing: -0.5px; }
  .logo-icon{ width: 36px; height: 36px; border-radius: 10px;
               background: linear-gradient(135deg, ${C.primary}, ${C.purple});
               display: inline-flex; align-items: center; justify-content: center; }
  .card     { background: ${C.card}; border-radius: 16px; padding: 36px 32px;
               box-shadow: 0 4px 24px rgba(0,0,0,.07); border: 1px solid ${C.border}; }
  h1        { font-size: 22px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.3px; }
  p         { font-size: 15px; line-height: 1.7; color: ${C.muted}; margin-bottom: 16px; }
  .btn      { display: inline-block; padding: 13px 28px; border-radius: 10px; font-size: 15px;
               font-weight: 600; text-align: center; margin: 8px 0; }
  .btn-primary { background: linear-gradient(135deg, ${C.primary}, ${C.purple}); color: #fff !important; }
  .btn-green   { background: ${C.green}; color: #fff !important; }
  .info-box { background: ${C.bg}; border-radius: 10px; padding: 16px 20px;
               border: 1px solid ${C.border}; margin: 20px 0; }
  .info-box p { margin: 0; font-size: 14px; }
  .divider  { border: none; border-top: 1px solid ${C.border}; margin: 24px 0; }
  .footer   { text-align: center; margin-top: 24px; font-size: 13px; color: ${C.muted}; line-height: 1.6; }
  .highlight{ color: ${C.text}; font-weight: 600; }
  .badge    { display: inline-block; padding: 4px 10px; border-radius: 20px;
               font-size: 12px; font-weight: 700; }
  .badge-green  { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
  .badge-orange { background: #fff7ed; color: #9a3412; border: 1px solid #fed7aa; }
  .badge-red    { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
</style>
</head>
<body>
${previewText ? `<div style="display:none;max-height:0;overflow:hidden;color:#f1f5f9">${previewText}</div>` : ''}
<div class="wrapper">
  <div class="logo-row">
    <span class="logo">
      <span class="logo-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
      </span>
      KODEX
    </span>
  </div>
  <div class="card">
    ${bodyHtml}
  </div>
  <div class="footer">
    <p>© ${new Date().getFullYear()} KODEX · Smart Attendance & Assessment Platform</p>
    <p style="margin-top:4px">Questions? Reply to this email or visit <a href="${BASE_URL}">${BASE_URL}</a></p>
  </div>
</div>
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

async function send({ to, subject, html }) {
  const apiKey = process.env.MAILERSEND_API_KEY;
  if (!apiKey) {
    console.log(`[EmailService] No MAILERSEND_API_KEY — would send to ${to}: "${subject}"`);
    return { ok: true, dev: true };
  }
  try {
    const { MailerSend, EmailParams, Sender, Recipient } = require('mailersend');

    const mailerSend = new MailerSend({ apiKey });

    const fromParsed = parseAddress(FROM);
    const toParsed   = parseAddress(to);

    const sentFrom   = new Sender(fromParsed.email, fromParsed.name);
    const recipients = [new Recipient(toParsed.email, toParsed.name || toParsed.email)];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setReplyTo(sentFrom)
      .setSubject(subject)
      .setHtml(html)
      .setText(subject); // plain text fallback

    const result = await mailerSend.email.send(emailParams);
    console.log(`[EmailService] Sent "${subject}" to ${to}`);
    return { ok: true, id: result?.['x-message-id'] || '' };
  } catch (err) {
    const detail = err.body || err.message || err;
    console.error(`[EmailService] Failed to send "${subject}" to ${to}:`, JSON.stringify(detail));
    return { ok: false, error: detail };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  EMAIL TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════════

// 1. Welcome / trial started
async function sendWelcome({ email, name, institutionName, trialDays = 14, trialEndDate }) {
  const endStr = trialEndDate ? new Date(trialEndDate).toDateString() : `${trialDays} days from now`;
  const html = wrap(`
    <h1>Welcome to KODEX 🎉</h1>
    <p>Hi <span class="highlight">${name}</span>, your account for <strong>${institutionName}</strong> is ready. You're on a <strong>${trialDays}-day free trial</strong> — no card needed.</p>

    <div class="info-box">
      <p><span class="badge badge-green">TRIAL ACTIVE</span></p>
      <p style="margin-top:10px">Trial ends: <span class="highlight">${endStr}</span></p>
    </div>

    <p><strong>Get started in 3 steps:</strong></p>
    <p>1️⃣ &nbsp;Create a course and invite your students<br/>
       2️⃣ &nbsp;Start an attendance session — students scan or mark themselves in<br/>
       3️⃣ &nbsp;Create a quiz and let the AI generate your questions</p>

    <div style="text-align:center;margin:28px 0">
      <a href="${BASE_URL}" class="btn btn-primary">Open KODEX →</a>
    </div>

    <hr class="divider"/>
    <p style="font-size:13px">Your trial runs until <strong>${endStr}</strong>. After that, subscribe for <strong>GHS 200/month</strong> to keep all your data and features.</p>
  `, `Welcome to KODEX — your ${trialDays}-day trial has started`);

  return send({ to: email, subject: 'Welcome to KODEX — your free trial has started 🚀', html });
}

// 2. Trial ending soon (day 10 — 4 days left)
async function sendTrialEndingSoon({ email, name, daysLeft, trialEndDate }) {
  const endStr = trialEndDate ? new Date(trialEndDate).toDateString() : `in ${daysLeft} days`;
  const html = wrap(`
    <h1>Your trial ends in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} ⏳</h1>
    <p>Hi <span class="highlight">${name}</span>, just a heads-up — your KODEX free trial expires on <strong>${endStr}</strong>.</p>

    <div class="info-box">
      <p><span class="badge badge-orange">TRIAL ENDING SOON</span></p>
      <p style="margin-top:10px">Subscribe before it expires and your sessions, quizzes, and student data stay exactly where they are.</p>
    </div>

    <p><strong>What you keep with a subscription:</strong></p>
    <p>✅ &nbsp;All attendance session history<br/>
       ✅ &nbsp;All quizzes and student results<br/>
       ✅ &nbsp;All assignments and submissions<br/>
       ✅ &nbsp;AI question generation<br/>
       ✅ &nbsp;Live proctoring</p>

    <div style="text-align:center;margin:28px 0">
      <a href="${BASE_URL}/#subscription" class="btn btn-primary">Subscribe Now — GHS 200/month →</a>
    </div>

    <p style="font-size:13px">Prefer annual? Pay <strong>GHS 2,000/year</strong> and get 2 months free.</p>
  `, `Your KODEX trial ends in ${daysLeft} days — subscribe to keep access`);

  return send({ to: email, subject: `⏳ Your KODEX trial ends in ${daysLeft} days`, html });
}

// 3. Trial expired
async function sendTrialExpired({ email, name }) {
  const html = wrap(`
    <h1>Your KODEX trial has ended</h1>
    <p>Hi <span class="highlight">${name}</span>, your 14-day free trial has expired. Your account is currently paused.</p>

    <div class="info-box">
      <p><span class="badge badge-red">TRIAL EXPIRED</span></p>
      <p style="margin-top:10px"><strong>Good news:</strong> All your data — sessions, quizzes, assignments, student records — is safely saved and waiting for you.</p>
    </div>

    <p>Subscribe now to reactivate your account instantly. No setup needed.</p>

    <div style="text-align:center;margin:28px 0">
      <a href="${BASE_URL}/#subscription" class="btn btn-primary">Reactivate — GHS 200/month →</a>
    </div>

    <p style="font-size:13px">Annual plan: <strong>GHS 2,000/year</strong> (save GHS 400 — 2 months free)</p>
  `, 'Your KODEX trial has expired — reactivate to keep your data');

  return send({ to: email, subject: 'Your KODEX trial has ended — reactivate your account', html });
}

// 4. Grace period nudge (day 16 — 2 days after expiry)
async function sendGraceNudge({ email, name }) {
  const html = wrap(`
    <h1>Last chance — your data is still here 🔒</h1>
    <p>Hi <span class="highlight">${name}</span>, your KODEX account has been paused for 2 days. We've kept all your data safe, but we wanted to check in one last time.</p>

    <div class="info-box">
      <p>📂 &nbsp;Your sessions, quizzes, and student records are all still saved.<br/>
         ⚡ &nbsp;Subscribing reactivates everything instantly.</p>
    </div>

    <div style="text-align:center;margin:28px 0">
      <a href="${BASE_URL}/#subscription" class="btn btn-green">Reactivate My Account →</a>
    </div>

    <p style="font-size:13px;text-align:center">GHS 200/month &nbsp;·&nbsp; GHS 2,000/year (2 months free)</p>
  `, 'Last chance — your KODEX data is still waiting for you');

  return send({ to: email, subject: '🔒 Last chance — your KODEX data is still here', html });
}

// 5. Subscription confirmed (after payment)
async function sendSubscriptionConfirmed({ email, name, plan, endDate, amountGhs }) {
  const endStr = endDate ? new Date(endDate).toDateString() : 'N/A';
  const planLabel = plan === 'yearly' ? 'Annual Plan' : 'Monthly Plan';
  const html = wrap(`
    <h1>Subscription confirmed ✅</h1>
    <p>Hi <span class="highlight">${name}</span>, your payment was successful. KODEX is fully active.</p>

    <div class="info-box">
      <p><span class="badge badge-green">ACTIVE</span></p>
      <p style="margin-top:12px">
        <strong>Plan:</strong> ${planLabel}<br/>
        <strong>Amount paid:</strong> GHS ${amountGhs}<br/>
        <strong>Access until:</strong> ${endStr}
      </p>
    </div>

    <p>Everything is exactly as you left it. Keep running sessions, creating quizzes, and tracking attendance.</p>

    <div style="text-align:center;margin:28px 0">
      <a href="${BASE_URL}" class="btn btn-primary">Go to KODEX →</a>
    </div>

    <hr class="divider"/>
    <p style="font-size:13px">We'll remind you before your next renewal. Thank you for subscribing to KODEX.</p>
  `, `KODEX subscription confirmed — active until ${endStr}`);

  return send({ to: email, subject: '✅ KODEX subscription confirmed — you\'re all set', html });
}

// 6. Renewal reminder (7 days before subscription end)
async function sendRenewalReminder({ email, name, plan, endDate }) {
  const endStr = endDate ? new Date(endDate).toDateString() : 'soon';
  const planLabel = plan === 'yearly' ? 'Annual Plan' : 'Monthly Plan';
  const html = wrap(`
    <h1>Your subscription renews in 7 days</h1>
    <p>Hi <span class="highlight">${name}</span>, your KODEX <strong>${planLabel}</strong> expires on <strong>${endStr}</strong>.</p>

    <p>To avoid any interruption to your sessions and quizzes, renew before that date.</p>

    <div style="text-align:center;margin:28px 0">
      <a href="${BASE_URL}/#subscription" class="btn btn-primary">Renew Subscription →</a>
    </div>

    <p style="font-size:13px">Monthly: GHS 200 &nbsp;·&nbsp; Annual: GHS 2,000 (save GHS 400)</p>
  `, `Your KODEX subscription expires on ${endStr}`);

  return send({ to: email, subject: `⏰ Your KODEX subscription expires on ${endStr}`, html });
}

// ── Password Reset OTP Email ──────────────────────────────────────────────────
async function sendPasswordReset({ email, name, resetCode, role, institutionName }) {
  const roleLabel = role === 'admin' || role === 'superadmin' ? 'Admin' :
                    role === 'lecturer' ? 'Lecturer' :
                    role === 'manager' ? 'Manager' : 'Employee';
  const html = wrap(`
    <h1>Password Reset Request 🔐</h1>
    <p>Hi <span class="highlight">${name || email}</span>, we received a request to reset your password${institutionName ? ` for <strong>${institutionName}</strong>` : ''}.</p>

    <div class="info-box" style="text-align:center">
      <p style="font-size:13px;color:#6b7280;margin-bottom:8px">YOUR RESET CODE</p>
      <p style="font-size:36px;font-weight:800;letter-spacing:10px;color:#4f46e5;margin:0">${resetCode}</p>
      <p style="font-size:12px;color:#9ca3af;margin-top:8px">Valid for 1 hour · Do not share this code</p>
    </div>

    <p>Enter this code on the KODEX password reset page to set a new password.</p>
    <p>If you did not request this reset, you can safely ignore this email — your password has not changed.</p>

    <hr class="divider"/>
    <p style="font-size:12px;color:#9ca3af">This code expires in 1 hour. If you need a new code, request another reset from the login page.</p>
  `, `KODEX Password Reset Code: ${resetCode}`);

  return send({ to: email, subject: `🔐 Your KODEX password reset code: ${resetCode}`, html });
}

// ── Admin: User password reset notification ───────────────────────────────────
async function sendAdminPasswordResetNotice({ adminEmail, adminName, targetUserName, targetUserRole, targetUserEmail, institutionName }) {
  const html = wrap(`
    <h1>Password Reset Performed 🔔</h1>
    <p>Hi <span class="highlight">${adminName}</span>, this is a notification that a password reset was completed on your institution <strong>${institutionName}</strong>.</p>

    <div class="info-box">
      <p><strong>User:</strong> ${targetUserName}</p>
      <p><strong>Role:</strong> ${targetUserRole}</p>
      <p><strong>Email / ID:</strong> ${targetUserEmail}</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    </div>

    <p>If you did not expect this reset, please review your institution's user activity in the KODEX admin panel.</p>

    <div style="text-align:center;margin:28px 0">
      <a href="${BASE_URL}" class="btn btn-primary">Open KODEX →</a>
    </div>
  `, `Password reset notification — ${targetUserName}`);

  return send({ to: adminEmail, subject: `🔔 KODEX: Password reset by ${targetUserName}`, html });
}

module.exports = {
  sendWelcome,
  sendTrialEndingSoon,
  sendTrialExpired,
  sendGraceNudge,
  sendSubscriptionConfirmed,
  sendRenewalReminder,
  sendPasswordReset,
  sendAdminPasswordResetNotice,
};

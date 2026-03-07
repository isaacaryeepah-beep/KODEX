const API = '';
let token = localStorage.getItem('token');

// ══════════════════════════════════════════════════════════════════════════════
//  OFFLINE LOGIN MODULE
//  - On successful online login, saves a secure profile to localStorage
//  - On offline login attempt, verifies against the cached profile
//  - Uses SHA-256 hashing (no plaintext passwords ever stored)
//  - Supports all roles: admin, lecturer, employee, student
// ══════════════════════════════════════════════════════════════════════════════

const OFFLINE_LOGIN_KEY = 'kodex_offline_profiles';  // stores cached user profiles
const OFFLINE_LOGIN_MAX_AGE_DAYS = 30;               // cached profile expires after 30 days

// ── Hash a password with SHA-256 (async, no library needed) ──────────────────
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'KODEX_SALT_2025'); // salted hash
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Save user profile after successful online login ───────────────────────────
async function saveOfflineProfile(credentials, userData) {
  try {
    const profiles = JSON.parse(localStorage.getItem(OFFLINE_LOGIN_KEY) || '{}');
    const profileKey = buildProfileKey(credentials);
    const passwordHash = await hashPassword(credentials.password);

    profiles[profileKey] = {
      passwordHash,
      user: {
        id: userData.user.id || userData.user._id,
        name: userData.user.name,
        email: userData.user.email,
        role: userData.user.role,
        isApproved: userData.user.isApproved,
        indexNumber: userData.user.indexNumber || null,
        employeeId: userData.user.employeeId || null,
        company: userData.user.company,
      },
      token: userData.token,           // cached JWT (may expire but used for UI)
      trial: userData.trial || null,
      savedAt: Date.now(),
    };

    localStorage.setItem(OFFLINE_LOGIN_KEY, JSON.stringify(profiles));
    console.log('[OfflineLogin] Profile cached for', credentials.email || credentials.indexNumber);
  } catch (e) {
    console.warn('[OfflineLogin] Failed to save profile:', e);
  }
}

// ── Build a unique key per user identity ─────────────────────────────────────
function buildProfileKey(credentials) {
  if (credentials.indexNumber) {
    return `student::${credentials.indexNumber}::${(credentials.institutionCode || '').toUpperCase()}`;
  }
  if (credentials.employeeId || (credentials.loginRole === 'employee')) {
    return `employee::${(credentials.email || '').toLowerCase()}::${(credentials.institutionCode || '').toUpperCase()}`;
  }
  return `${credentials.loginRole || 'admin'}::${(credentials.email || '').toLowerCase()}`;
}

// ── Attempt offline login ─────────────────────────────────────────────────────
async function attemptOfflineLogin(credentials) {
  try {
    const profiles = JSON.parse(localStorage.getItem(OFFLINE_LOGIN_KEY) || '{}');
    const profileKey = buildProfileKey(credentials);
    const profile = profiles[profileKey];

    if (!profile) {
      throw new Error('No offline profile found. Please login online at least once first.');
    }

    // Check if profile has expired
    const ageMs = Date.now() - profile.savedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays > OFFLINE_LOGIN_MAX_AGE_DAYS) {
      throw new Error('Offline session expired. Please connect to the internet to login.');
    }

    // Verify password hash
    const enteredHash = await hashPassword(credentials.password);
    if (enteredHash !== profile.passwordHash) {
      throw new Error('Incorrect password.');
    }

    // Return a fake login response matching the real API shape
    console.log('[OfflineLogin] Offline login successful for', profileKey);
    return {
      token: profile.token,
      user: profile.user,
      trial: profile.trial,
      offlineMode: true,   // flag so app knows we're offline
    };
  } catch (e) {
    throw e;
  }
}

// ── Clear a specific offline profile (on logout) ──────────────────────────────
function clearOfflineProfile(userRole, email, indexNumber, institutionCode) {
  try {
    const profiles = JSON.parse(localStorage.getItem(OFFLINE_LOGIN_KEY) || '{}');
    const key = buildProfileKey({ loginRole: userRole, email, indexNumber, institutionCode });
    delete profiles[key];
    localStorage.setItem(OFFLINE_LOGIN_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.warn('[OfflineLogin] Could not clear profile:', e);
  }
}

// ── Show offline login notice on the form ─────────────────────────────────────
function showOfflineLoginNotice(containerId) {
  const existing = document.getElementById('offline-login-notice');
  if (existing) return;
  const notice = document.createElement('div');
  notice.id = 'offline-login-notice';
  notice.style.cssText = [
    'background:#fef3c7','color:#92400e','border:1px solid #fbbf24',
    'border-radius:8px','padding:10px 14px','font-size:12px',
    'margin-bottom:12px','display:flex','align-items:center','gap:8px'
  ].join(';');
  notice.innerHTML = `
    <span style="font-size:16px">📶</span>
    <span><strong>You're offline.</strong> Signing in with your saved credentials.</span>
  `;
  const container = document.getElementById(containerId);
  if (container) container.prepend(notice);
}

function removeOfflineLoginNotice() {
  const n = document.getElementById('offline-login-notice');
  if (n) n.remove();
}

// ══════════════════════════════════════════════════════════════════════════════
//  OFFLINE SUPPORT MODULE
//  - Detects online/offline state and shows a banner
//  - Caches read data (sessions, courses, attendance) in localStorage
//  - Queues write actions (start/stop session, manual mark, student mark)
//  - Auto-syncs the queue the moment connection is restored
// ══════════════════════════════════════════════════════════════════════════════

const OFFLINE_CACHE_KEY   = 'edu_offline_cache';
const OFFLINE_QUEUE_KEY   = 'edu_offline_queue';
const OFFLINE_BANNER_ID   = 'offline-banner';

// ── Helpers ──────────────────────────────────────────────────────────────────
function isOnline() { return navigator.onLine; }

function offlineCache(key, data) {
  try {
    const store = JSON.parse(localStorage.getItem(OFFLINE_CACHE_KEY) || '{}');
    store[key] = { data, ts: Date.now() };
    localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(store));
  } catch(e) { console.warn('[Offline] Cache write failed', e); }
}

function offlineRead(key) {
  try {
    const store = JSON.parse(localStorage.getItem(OFFLINE_CACHE_KEY) || '{}');
    return store[key]?.data ?? null;
  } catch(e) { return null; }
}

function offlineEnqueue(action) {
  try {
    const q = JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]');
    q.push({ ...action, queuedAt: Date.now(), id: Math.random().toString(36).slice(2) });
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q));
    showOfflineBanner(true);
  } catch(e) { console.warn('[Offline] Queue write failed', e); }
}

function offlineQueueCount() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || '[]').length;
  } catch(e) { return 0; }
}

// ── Banner ────────────────────────────────────────────────────────────────────
function showOfflineBanner(hasPending) {
  let banner = document.getElementById(OFFLINE_BANNER_ID);
  if (!banner) {
    banner = document.createElement('div');
    banner.id = OFFLINE_BANNER_ID;
    banner.style.cssText = [
      'position:fixed','top:60px','left:0','right:0','z-index:9998',
      'display:flex','align-items:center','justify-content:center','gap:8px',
      'padding:7px 16px','font-size:12px','font-weight:600',
      'transition:all 0.3s ease','box-shadow:0 2px 8px rgba(0,0,0,0.1)'
    ].join(';');
    document.body.prepend(banner);
  }

  const count = offlineQueueCount();
  if (!isOnline()) {
    banner.style.background = '#fef3c7';
    banner.style.color = '#92400e';
    banner.style.borderBottom = '2px solid #fbbf24';
    banner.innerHTML = `
      <span>📶</span>
      <span>You're offline — attendance changes will sync when you reconnect</span>
      ${count > 0 ? `<span style="background:#f59e0b;color:#fff;padding:2px 8px;border-radius:999px;font-size:11px">${count} pending</span>` : ''}
    `;
    banner.style.display = 'flex';
  } else if (count > 0) {
    banner.style.background = '#eff6ff';
    banner.style.color = '#1e40af';
    banner.style.borderBottom = '2px solid #93c5fd';
    banner.innerHTML = `
      <span>🔄</span>
      <span>Back online — syncing ${count} pending action${count !== 1 ? 's' : ''}…</span>
    `;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

function hideOfflineBanner() {
  const b = document.getElementById(OFFLINE_BANNER_ID);
  if (b) b.style.display = 'none';
}

// ── Auto-sync on reconnect ────────────────────────────────────────────────────
async function syncOfflineQueue() {
  const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
  if (!raw) return;
  const queue = JSON.parse(raw);
  if (!queue.length) return;

  console.log(`[Offline] Syncing ${queue.length} queued action(s)…`);
  showOfflineBanner(true);

  const remaining = [];
  for (const action of queue) {
    try {
      await api(action.url, action.options);
      console.log(`[Offline] Synced: ${action.label || action.url}`);
    } catch (e) {
      console.warn(`[Offline] Sync failed for ${action.url}:`, e.message);
      // Keep failed items if it's a server error (not 4xx client error)
      if (!e.message.includes('400') && !e.message.includes('409') && !e.message.includes('404')) {
        remaining.push(action);
      }
    }
  }

  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remaining));

  if (remaining.length === 0) {
    hideOfflineBanner();
    // Refresh whichever attendance view is active
    const active = document.querySelector('.nav-item.active')?.dataset?.view;
    if (active === 'sessions') renderSessions();
    else if (active === 'mark-attendance') renderMarkAttendance();
    showToastNotif('✅ All offline actions synced!', 'success');
  } else {
    showOfflineBanner(true);
  }
}

function showToastNotif(msg, type) {
  const t = document.createElement('div');
  t.style.cssText = [
    'position:fixed','bottom:24px','left:50%','transform:translateX(-50%)',
    'padding:10px 20px','border-radius:8px','font-size:13px','font-weight:600',
    'z-index:10000','box-shadow:0 4px 16px rgba(0,0,0,0.15)',
    type === 'success' ? 'background:#dcfce7;color:#166534;border:1px solid #86efac' :
                         'background:#fef3c7;color:#92400e;border:1px solid #fbbf24'
  ].join(';');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// Listen for online/offline events
window.addEventListener('offline', () => showOfflineBanner(false));
window.addEventListener('online',  () => {
  showOfflineBanner(true);
  setTimeout(syncOfflineQueue, 800); // slight delay to ensure connection is stable
});

// Show banner on load if already offline or has queue
window.addEventListener('DOMContentLoaded', () => {
  if (!isOnline() || offlineQueueCount() > 0) showOfflineBanner(!isOnline());
});

let currentUser = null;
let currentView = 'dashboard';

function svgIcon(path, size = 18) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}
function dashboardIcon() {
  return svgIcon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>');
}
function sessionsIcon() {
  return svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>');
}
function usersIcon() {
  return svgIcon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>');
}
function meetingsIcon() {
  return svgIcon('<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>');
}
function reportsIcon() {
  return svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>');
}
function coursesIcon() {
  return svgIcon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>');
}
function quizzesIcon() {
  return svgIcon('<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/>');
}
function attendanceIcon() {
  return svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>');
}
function subscriptionIcon() {
  return svgIcon('<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>');
}
function approvalsIcon() {
  return svgIcon('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>');
}

function assignmentsIcon() {
  return svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>');
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (res.headers.get('content-type')?.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      // Subscription gate — redirect lecturer to subscription page automatically
      if (res.status === 403 && data.subscriptionRequired) {
        showSubscriptionGate(data.message);
        throw new Error(data.error || 'Subscription required');
      }
      throw new Error(data.error || 'Request failed');
    }
    return data;
  }
  if (!res.ok) throw new Error('Request failed');
  return res;
}

function showError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 5000);
}

let selectedPortalType = 'admin-corporate';

function selectPortal(type) {
  selectedPortalType = type;
  document.getElementById('portal-selector').classList.add('hidden');
  if (type === 'admin-corporate' || type === 'admin-academic') {
    const isAcademic = type === 'admin-academic';
    document.getElementById('admin-auth').classList.remove('hidden');
    document.getElementById('admin-portal-title').textContent = isAcademic ? 'Institution Admin' : 'Admin Portal';
    document.getElementById('admin-portal-subtitle').textContent = isAcademic ? 'Academic Institution Admin' : 'Corporate Admin Access';
    document.getElementById('admin-reg-company-label').textContent = isAcademic ? 'Institution Name' : 'Company Name';
    document.getElementById('admin-reg-company').placeholder = isAcademic ? 'Your institution name' : 'Your company name';
  } else if (type === 'lecturer') {
    document.getElementById('lecturer-auth').classList.remove('hidden');
  } else if (type === 'employee') {
    document.getElementById('employee-auth').classList.remove('hidden');
  } else {
    document.getElementById('student-auth').classList.remove('hidden');
  }
}

function showPortalSelector() {
  document.getElementById('admin-auth').classList.add('hidden');
  document.getElementById('lecturer-auth').classList.add('hidden');
  document.getElementById('employee-auth').classList.add('hidden');
  document.getElementById('student-auth').classList.add('hidden');
  document.getElementById('portal-selector').classList.remove('hidden');
  document.querySelectorAll('.auth-container input').forEach(i => i.value = '');
  document.querySelectorAll('.error-msg').forEach(e => e.style.display = 'none');
  selectedPortalType = null;
}

function backToPortalSelector() {
  showPortalSelector();
}

function showAdminRegister() {
  document.getElementById('admin-login-form').classList.add('hidden');
  document.getElementById('admin-register-form').classList.remove('hidden');
  document.getElementById('admin-auth-error').style.display = 'none';
}

function showAdminLogin() {
  document.getElementById('admin-register-form').classList.add('hidden');
  document.getElementById('admin-login-form').classList.remove('hidden');
  document.getElementById('admin-auth-error').style.display = 'none';
  const f = document.getElementById('admin-forgot-form'); if(f) f.classList.add('hidden');
}

function showAdminForgot() {
  document.getElementById('admin-login-form').classList.add('hidden');
  document.getElementById('admin-register-form').classList.add('hidden');
  const f = document.getElementById('admin-forgot-form'); if(f) f.classList.remove('hidden');
  const rc = document.getElementById('admin-reset-code-group'); if(rc) rc.classList.add('hidden');
  const np = document.getElementById('admin-new-password-group'); if(np) np.classList.add('hidden');
  const btn = document.getElementById('admin-forgot-btn'); if(btn) btn.textContent = 'Request Reset Code';
  adminForgotStep = 'request';
}

let adminForgotEmail = '', adminForgotStep = 'request';
async function handleAdminForgotPassword() {
  function setAdminForgotMsg(msg, isSuccess) {
    let el = document.getElementById('admin-forgot-msg');
    if (!el) {
      el = document.createElement('div');
      el.id = 'admin-forgot-msg';
      el.style.cssText = 'padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px;display:none';
      const btn = document.getElementById('admin-forgot-btn');
      if (btn) btn.parentNode.insertBefore(el, btn);
    }
    el.textContent = msg;
    el.style.background = isSuccess ? '#f0fdf4' : '#fef2f2';
    el.style.color = isSuccess ? '#15803d' : '#dc2626';
    el.style.border = isSuccess ? '1px solid #86efac' : '1px solid #fca5a5';
    el.style.display = 'block';
  }

  if (adminForgotStep === 'request') {
    const email = document.getElementById('admin-forgot-email').value.trim();
    if (!email) return setAdminForgotMsg('Please enter your email address', false);
    const btn = document.getElementById('admin-forgot-btn');
    btn.textContent = 'Sending...'; btn.disabled = true;
    try {
      const data = await api('/api/auth/forgot-password-email', { method: 'POST', body: JSON.stringify({ email }) });
      adminForgotEmail = email; adminForgotStep = 'reset';
      document.getElementById('admin-reset-code-group').classList.remove('hidden');
      document.getElementById('admin-new-password-group').classList.remove('hidden');
      btn.textContent = 'Reset Password'; btn.disabled = false;
      setAdminForgotMsg((data.message || 'Code generated.') + (data.resetCode ? ' Your reset code: ' + data.resetCode : ''), true);
    } catch(e) { btn.textContent = 'Request Reset Code'; btn.disabled = false; setAdminForgotMsg(e.message, false); }
  } else {
    const resetCode = document.getElementById('admin-reset-code').value.trim();
    const newPassword = document.getElementById('admin-new-password').value;
    if (!resetCode || !newPassword) return setAdminForgotMsg('Please enter the reset code and new password', false);
    if (newPassword.length < 8) return setAdminForgotMsg('Password must be at least 8 characters', false);
    const btn = document.getElementById('admin-forgot-btn');
    btn.textContent = 'Resetting...'; btn.disabled = true;
    try {
      await api('/api/auth/reset-password-email', { method: 'POST', body: JSON.stringify({ email: adminForgotEmail, resetCode, newPassword }) });
      adminForgotStep = 'request';
      setAdminForgotMsg('✅ Password reset! Redirecting to sign in...', true);
      setTimeout(() => { showAdminLogin(); }, 1800);
    } catch(e) { btn.textContent = 'Reset Password'; btn.disabled = false; setAdminForgotMsg(e.message, false); }
  }
}

function showAdminError(msg) {
  const el = document.getElementById('admin-auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = '';
  el.style.color = '';
  // Shake + keep visible for 8 seconds
  el.classList.remove('shake');
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add('shake');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; el.classList.remove('shake'); }, 8000);
}

function showLecturerRegister() {
  document.getElementById('lecturer-login-form').classList.add('hidden');
  document.getElementById('lecturer-register-form').classList.remove('hidden');
  document.getElementById('lecturer-auth-error').style.display = 'none';
}

function showLecturerLogin() {
  document.getElementById('lecturer-register-form').classList.add('hidden');
  document.getElementById('lecturer-login-form').classList.remove('hidden');
  document.getElementById('lecturer-auth-error').style.display = 'none';
  const f = document.getElementById('lecturer-forgot-form'); if(f) f.classList.add('hidden');
}

function showLecturerForgot() {
  document.getElementById('lecturer-login-form').classList.add('hidden');
  document.getElementById('lecturer-register-form').classList.add('hidden');
  const f = document.getElementById('lecturer-forgot-form'); if(f) f.classList.remove('hidden');
  const rc = document.getElementById('lecturer-reset-code-group'); if(rc) rc.classList.add('hidden');
  const np = document.getElementById('lecturer-new-password-group'); if(np) np.classList.add('hidden');
  const btn = document.getElementById('lecturer-forgot-btn'); if(btn) btn.textContent = 'Request Reset Code';
  lecturerForgotStep = 'request';
}

let lecturerForgotEmail = '', lecturerForgotStep = 'request';
async function handleLecturerForgotPassword() {
  function setLecturerForgotMsg(msg, isSuccess) {
    let el = document.getElementById('lecturer-forgot-msg');
    if (!el) {
      el = document.createElement('div');
      el.id = 'lecturer-forgot-msg';
      el.style.cssText = 'padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px;display:none';
      const btn = document.getElementById('lecturer-forgot-btn');
      if (btn) btn.parentNode.insertBefore(el, btn);
    }
    el.textContent = msg;
    el.style.background = isSuccess ? '#f0fdf4' : '#fef2f2';
    el.style.color = isSuccess ? '#15803d' : '#dc2626';
    el.style.border = isSuccess ? '1px solid #86efac' : '1px solid #fca5a5';
    el.style.display = 'block';
  }

  if (lecturerForgotStep === 'request') {
    const email = document.getElementById('lecturer-forgot-email').value.trim();
    if (!email) return setLecturerForgotMsg('Please enter your email address', false);
    const btn = document.getElementById('lecturer-forgot-btn');
    btn.textContent = 'Sending...'; btn.disabled = true;
    try {
      const data = await api('/api/auth/forgot-password-email', { method: 'POST', body: JSON.stringify({ email }) });
      lecturerForgotEmail = email; lecturerForgotStep = 'reset';
      document.getElementById('lecturer-reset-code-group').classList.remove('hidden');
      document.getElementById('lecturer-new-password-group').classList.remove('hidden');
      btn.textContent = 'Reset Password'; btn.disabled = false;
      setLecturerForgotMsg((data.message || 'Code generated.') + (data.resetCode ? ' Your reset code: ' + data.resetCode : ''), true);
    } catch(e) { btn.textContent = 'Request Reset Code'; btn.disabled = false; setLecturerForgotMsg(e.message, false); }
  } else {
    const resetCode = document.getElementById('lecturer-reset-code').value.trim();
    const newPassword = document.getElementById('lecturer-new-password').value;
    if (!resetCode || !newPassword) return setLecturerForgotMsg('Please enter the reset code and new password', false);
    if (newPassword.length < 8) return setLecturerForgotMsg('Password must be at least 8 characters', false);
    const btn = document.getElementById('lecturer-forgot-btn');
    btn.textContent = 'Resetting...'; btn.disabled = true;
    try {
      await api('/api/auth/reset-password-email', { method: 'POST', body: JSON.stringify({ email: lecturerForgotEmail, resetCode, newPassword }) });
      lecturerForgotStep = 'request';
      setLecturerForgotMsg('✅ Password reset! Redirecting to sign in...', true);
      setTimeout(() => { showLecturerLogin(); }, 1800);
    } catch(e) { btn.textContent = 'Reset Password'; btn.disabled = false; setLecturerForgotMsg(e.message, false); }
  }
}

function showLecturerError(msg) {
  const el = document.getElementById('lecturer-auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = '';
  el.style.color = '';
  // Shake + keep visible for 8 seconds
  el.classList.remove('shake');
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add('shake');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; el.classList.remove('shake'); }, 8000);
}

function showEmployeeError(msg) {
  const el = document.getElementById('employee-auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = '';
  el.style.color = '';
  // Shake + keep visible for 8 seconds
  el.classList.remove('shake');
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add('shake');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; el.classList.remove('shake'); }, 8000);
}

function showStudentRegister() {
  document.getElementById('student-login-form').classList.add('hidden');
  document.getElementById('student-forgot-form').classList.add('hidden');
  document.getElementById('student-register-form').classList.remove('hidden');
  document.getElementById('student-auth-error').style.display = 'none';
}

function showStudentLogin() {
  document.getElementById('student-register-form').classList.add('hidden');
  document.getElementById('student-forgot-form').classList.add('hidden');
  document.getElementById('student-login-form').classList.remove('hidden');
  document.getElementById('student-auth-error').style.display = 'none';
  studentForgotStep = 'request';
}

function showStudentForgot() {
  document.getElementById('student-login-form').classList.add('hidden');
  document.getElementById('student-register-form').classList.add('hidden');
  document.getElementById('student-forgot-form').classList.remove('hidden');
  document.getElementById('student-auth-error').style.display = 'none';
  document.getElementById('student-reset-code-group').classList.add('hidden');
  document.getElementById('student-new-password-group').classList.add('hidden');
  document.getElementById('student-forgot-btn').textContent = 'Request Reset Code';
  studentForgotStep = 'request';
}

function showStudentError(msg) {
  const el = document.getElementById('student-auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  el.style.background = '';
  el.style.color = '';
  // Shake + keep visible for 8 seconds
  el.classList.remove('shake');
  void el.offsetWidth; // force reflow to restart animation
  el.classList.add('shake');
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(() => { el.style.display = 'none'; el.classList.remove('shake'); }, 8000);
}

function showPendingApproval(message) {
  document.getElementById('auth-page').style.display = 'flex';
  document.getElementById('dashboard-page').classList.add('hidden');
  document.getElementById('portal-selector').classList.add('hidden');
  const authMap = { lecturer: 'lecturer-auth', student: 'student-auth', employee: 'employee-auth' };
  const errorMap = { lecturer: 'lecturer-auth-error', student: 'student-auth-error', employee: 'employee-auth-error' };
  const authEl = authMap[selectedPortalType] || 'lecturer-auth';
  document.getElementById(authEl).classList.remove('hidden');
  const errorEl = errorMap[selectedPortalType] || 'lecturer-auth-error';
  const el = document.getElementById(errorEl);
  el.textContent = message || 'Your account is pending approval. Please contact your institution admin.';
  el.style.display = 'block';
  el.style.background = '#fef3c7';
  el.style.color = '#92400e';
  localStorage.removeItem('token');
  token = null;
  currentUser = null;
}


// Map raw server error messages to friendly user-facing text
function friendlyError(msg) {
  if (!msg) return null;
  const m = msg.toLowerCase();
  if (m.includes('invalid credentials'))         return 'Wrong Email or Password.';
  if (m.includes('institution not found'))        return 'Institution code not found. Please check and try again.';
  if (m.includes('company not found'))            return 'Institution code not found. Please check and try again.';
  if (m.includes('pending approval'))             return msg; // keep as-is — informative
  if (m.includes('too many login'))               return 'Too many failed attempts. Please wait 15 minutes.';
  if (m.includes('too many requests'))            return 'Too many requests. Please slow down and try again.';
  if (m.includes('no offline profile'))           return 'You\'re offline. Please connect to the internet to login for the first time.';
  if (m.includes('offline session expired'))      return 'Offline session expired. Please connect to login again.';
  if (m.includes('incorrect password'))           return 'Incorrect password. Please try again.';
  if (m.includes('network') || m.includes('fetch')) return 'Network error. Please check your connection.';
  return msg; // fallback: show as-is
}

async function handleAdminLogin() {
  const btn = document.querySelector('#admin-login-form button[type="submit"]');
  try {
    const email = document.getElementById('admin-login-email').value.trim();
    const password = document.getElementById('admin-login-password').value;
    if (!email) return showAdminError('Please enter your email.');
    if (!password) return showAdminError('Please enter your password.');
    if (btn) { btn.textContent = 'Signing in…'; btn.disabled = true; }

    const portalMode = selectedPortalType === 'admin-academic' ? 'academic' : 'corporate';
    const credentials = { email, password, loginRole: 'admin', portalMode };

    let data;
    if (!isOnline()) {
      showOfflineLoginNotice('admin-login-form');
      data = await attemptOfflineLogin(credentials);
    } else {
      removeOfflineLoginNotice();
      data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
      await saveOfflineProfile(credentials, data);
    }

    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showDashboard(data);
  } catch (e) {
    if (btn) { btn.textContent = 'Sign In'; btn.disabled = false; }
    const msg = e.message || '';
    const m = msg.toLowerCase();

    if (m.includes('pending approval')) {
      showAdminError('Your account is pending approval. Please contact your institution admin.');
    } else if (m.includes('too many')) {
      showAdminError('Too many failed attempts. Please wait 15 minutes and try again.');
    } else if (m.includes('network') || m.includes('fetch')) {
      showAdminError('Network error. Please check your connection and try again.');
    } else {
      showAdminError('Wrong Email or Password.');
    }
  }
}

async function handleAdminRegister() {
  try {
    const name = document.getElementById('admin-reg-name').value;
    const email = document.getElementById('admin-reg-email').value;
    const password = document.getElementById('admin-reg-password').value;
    const companyName = document.getElementById('admin-reg-company').value;
    const mode = selectedPortalType === 'admin-academic' ? 'academic' : 'corporate';
    if (!name || !email || !password || !companyName) {
      return showAdminError('Please fill in all fields');
    }
    if (password.length < 8) {
      return showAdminError('Password must be at least 8 characters');
    }
    const body = { name, email, password, companyName, mode };
    const data = await api('/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showDashboard(data);
  } catch (e) {
    showAdminError(e.message || 'Registration failed');
  }
}

async function handleLecturerLogin() {
  const btn = document.querySelector('#lecturer-login-form button[type="submit"]');
  try {
    const email = document.getElementById('lecturer-login-email').value.trim();
    const password = document.getElementById('lecturer-login-password').value;
    if (!email) return showLecturerError('Please enter your email');
    if (!password) return showLecturerError('Please enter your password');
    if (btn) { btn.textContent = 'Signing in…'; btn.disabled = true; }
    const credentials = { email, password, loginRole: 'lecturer', portalMode: 'academic' };

    let data;
    if (!isOnline()) {
      // ── OFFLINE PATH ──
      showOfflineLoginNotice('lecturer-login-form');
      data = await attemptOfflineLogin(credentials);
    } else {
      // ── ONLINE PATH ──
      removeOfflineLoginNotice();
      data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
      if (data.user && !data.user.isApproved) {
        if (btn) { btn.textContent = 'Sign In'; btn.disabled = false; }
        return showPendingApproval('Your account is pending admin approval. Please wait for your institution admin to approve your account.');
      }
      // Cache profile for future offline logins
      await saveOfflineProfile(credentials, data);
    }

    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showDashboard(data);
  } catch (e) {
    if (btn) { btn.textContent = 'Sign In'; btn.disabled = false; }
    const msg = e.message || '';
    const m = msg.toLowerCase();
    if (m.includes('pending approval')) {
      showLecturerError('Your account is pending approval. Please contact your institution admin.');
    } else if (m.includes('too many')) {
      showLecturerError('Too many failed attempts. Please wait 15 minutes and try again.');
    } else if (m.includes('network') || m.includes('fetch')) {
      showLecturerError('Network error. Please check your connection and try again.');
    } else {
      showLecturerError('Wrong Email or Password.');
    }
  }
}

async function handleLecturerRegister() {
  try {
    const name = document.getElementById('lecturer-reg-name').value;
    const email = document.getElementById('lecturer-reg-email').value;
    const password = document.getElementById('lecturer-reg-password').value;
    const regMode = document.getElementById('lecturer-reg-mode')?.value || 'join';

    if (!name || !email || !password) {
      return showLecturerError('Please fill in all fields');
    }
    if (password.length < 8) {
      return showLecturerError('Password must be at least 8 characters');
    }

    const dept = document.getElementById('lecturer-reg-dept')?.value?.trim();
    let body = { name, email, password };
    if (dept) body.department = dept;
    if (regMode === 'create') {
      const institutionName = document.getElementById('lecturer-reg-institution').value;
      if (!institutionName) return showLecturerError('Please enter your institution name');
      body.institutionName = institutionName;
    } else {
      const institutionCode = document.getElementById('lecturer-reg-code').value;
      if (!institutionCode) return showLecturerError('Please enter the institution code');
      body.institutionCode = institutionCode;
    }

    const data = await api('/api/auth/register-lecturer', { method: 'POST', body: JSON.stringify(body) });

    if (data.token) {
      // Created own institution — log them in immediately
      token = data.token;
      localStorage.setItem('token', token);
      currentUser = data.user;
      showDashboard(data);
    } else {
      const el = document.getElementById('lecturer-auth-error');
      el.textContent = data.message || 'Registration successful! Your account is pending admin approval.';
      el.style.display = 'block';
      el.style.background = '#f0fdf4';
      el.style.color = '#15803d';
      showLecturerLogin();
      document.getElementById('lecturer-auth-error').style.display = 'block';
    }
  } catch (e) {
    showLecturerError(e.message || 'Registration failed');
  }
}

function toggleLecturerRegMode() {
  const mode = document.getElementById('lecturer-reg-mode').value;
  const codeGroup = document.getElementById('lecturer-reg-code-group');
  const instGroup = document.getElementById('lecturer-reg-inst-group');
  const hint = document.getElementById('lecturer-reg-hint');
  if (mode === 'create') {
    codeGroup.classList.add('hidden');
    instGroup.classList.remove('hidden');
    hint.textContent = 'You will be the admin of your institution and can immediately start using the platform.';
  } else {
    codeGroup.classList.remove('hidden');
    instGroup.classList.add('hidden');
    hint.textContent = 'Your account will need admin approval before you can access the system.';
  }
}

function showEmployeeLogin() {
  document.getElementById('employee-login-form').classList.remove('hidden');
  document.getElementById('employee-register-form').classList.add('hidden');
}
function showEmployeeRegister() {
  document.getElementById('employee-login-form').classList.add('hidden');
  document.getElementById('employee-register-form').classList.remove('hidden');
}

async function handleEmployeeLogin() {
  const btn = document.querySelector('#employee-login-form button[type="submit"]');
  try {
    const email = document.getElementById('employee-login-email').value.trim();
    const institutionCode = document.getElementById('employee-login-code').value.trim().toUpperCase();
    const password = document.getElementById('employee-login-password').value;
    if (!email) return showEmployeeError('Please enter your email');
    if (!institutionCode) return showEmployeeError('Please enter your institution code');
    if (!password) return showEmployeeError('Please enter your password');
    if (btn) { btn.textContent = 'Signing in…'; btn.disabled = true; }
    const credentials = { email, password, institutionCode, loginRole: 'employee' };

    let data;
    if (!isOnline()) {
      // ── OFFLINE PATH ──
      showOfflineLoginNotice('employee-login-form');
      data = await attemptOfflineLogin(credentials);
    } else {
      // ── ONLINE PATH ──
      removeOfflineLoginNotice();
      data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
      // Cache profile for future offline logins
      await saveOfflineProfile(credentials, data);
    }

    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showDashboard(data);
  } catch (e) {
    if (btn) { btn.textContent = 'Sign In'; btn.disabled = false; }
    const msg2 = e.message || '';
    const m2 = msg2.toLowerCase();
    if (m2.includes('too many')) {
      showEmployeeError('Too many failed attempts. Please wait 15 minutes and try again.');
    } else if (m2.includes('network') || m2.includes('fetch')) {
      showEmployeeError('Network error. Please check your connection and try again.');
    } else {
      showEmployeeError('Wrong Email or Password.');
    }
  }
}

async function handleEmployeeRegister() {
  try {
    const name = document.getElementById('employee-reg-name').value;
    const email = document.getElementById('employee-reg-email').value;
    const institutionCode = document.getElementById('employee-reg-code').value;
    const password = document.getElementById('employee-reg-password').value;
    if (!name || !email || !institutionCode || !password) {
      return showEmployeeError('Please fill in all fields');
    }
    if (password.length < 8) {
      return showEmployeeError('Password must be at least 8 characters');
    }
    const data = await api('/api/auth/register-employee', { method: 'POST', body: JSON.stringify({ name, email, password, institutionCode }) });
    const el = document.getElementById('employee-auth-error');
    el.textContent = data.message || 'Registration successful! Your account is pending admin approval.';
    el.style.display = 'block';
    el.style.background = '#f0fdf4';
    el.style.color = '#15803d';
    showEmployeeLogin();
    document.getElementById('employee-auth-error').style.display = 'block';
  } catch (e) {
    showEmployeeError(e.message || 'Registration failed');
  }
}

async function handleStudentLogin() {
  const btn = document.querySelector('#student-login-form button[type="submit"]');
  try {
    const indexNumber = document.getElementById('student-login-index').value.trim();
    const institutionCode = document.getElementById('student-login-code').value.trim().toUpperCase();
    const password = document.getElementById('student-login-password').value;
    if (!indexNumber) return showStudentError('Please enter your student ID');
    if (!institutionCode) return showStudentError('Please enter your institution code');
    if (!password) return showStudentError('Please enter your password');
    if (btn) { btn.textContent = 'Signing in…'; btn.disabled = true; }
    const credentials = { indexNumber, password, institutionCode, loginRole: 'student' };

    let data;
    if (!isOnline()) {
      // ── OFFLINE PATH ──
      showOfflineLoginNotice('student-login-form');
      data = await attemptOfflineLogin(credentials);
    } else {
      // ── ONLINE PATH ──
      removeOfflineLoginNotice();
      data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
      // Cache profile for future offline logins
      await saveOfflineProfile(credentials, data);
    }

    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showDashboard(data);
  } catch (e) {
    if (btn) { btn.textContent = 'Sign In'; btn.disabled = false; }
    const msg3 = e.message || '';
    const m3 = msg3.toLowerCase();
    if (m3.includes('too many')) {
      showStudentError('Too many failed attempts. Please wait 15 minutes and try again.');
    } else if (m3.includes('network') || m3.includes('fetch')) {
      showStudentError('Network error. Please check your connection and try again.');
    } else {
      showStudentError('Wrong Student ID or Password.');
    }
  }
}

async function handleStudentRegister() {
  try {
    const name = document.getElementById('student-reg-name').value;
    const indexNumber = document.getElementById('student-reg-index').value;
    const institutionCode = document.getElementById('student-reg-code').value;
    const password = document.getElementById('student-reg-password').value;
    const confirm = document.getElementById('student-reg-confirm').value;
    if (!name || !indexNumber || !institutionCode || !password) {
      return showStudentError('Please fill in all fields');
    }
    if (password.length < 8) {
      return showStudentError('Password must be at least 8 characters');
    }
    if (password !== confirm) {
      return showStudentError('Passwords do not match');
    }
    const data = await api('/api/auth/register-student', { method: 'POST', body: JSON.stringify({ name, indexNumber, password, institutionCode }) });
    if (data.token) {
      token = data.token;
      localStorage.setItem('token', token);
      currentUser = data.user;
      showDashboard(data);
    } else {
      const el = document.getElementById('student-auth-error');
      el.textContent = data.message || 'Registration successful!';
      el.style.display = 'block';
      el.style.background = '#f0fdf4';
      el.style.color = '#15803d';
      showStudentLogin();
      document.getElementById('student-auth-error').style.display = 'block';
    }
  } catch (e) {
    showStudentError(e.message || 'Registration failed');
  }
}

let studentForgotStep = 'request';
let studentForgotIndex = '';
let studentForgotCode = '';

async function handleStudentForgotPassword() {
  if (studentForgotStep === 'request') {
    const indexNumber = document.getElementById('student-forgot-index').value;
    const institutionCode = document.getElementById('student-forgot-code').value;
    if (!indexNumber || !institutionCode) return showStudentError('Please fill in all fields');
    try {
      const data = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ indexNumber, institutionCode }) });
      studentForgotIndex = indexNumber;
      studentForgotCode = institutionCode;
      studentForgotStep = 'reset';
      document.getElementById('student-reset-code-group').classList.remove('hidden');
      document.getElementById('student-new-password-group').classList.remove('hidden');
      document.getElementById('student-forgot-btn').textContent = 'Reset Password';
      const el = document.getElementById('student-auth-error');
      el.textContent = data.message + (data.resetCode ? ' Code: ' + data.resetCode : '');
      el.style.display = 'block';
      el.style.background = '#f0fdf4';
      el.style.color = '#15803d';
    } catch (e) {
      showStudentError(e.message);
    }
  } else {
    const resetCode = document.getElementById('student-reset-code').value;
    const newPassword = document.getElementById('student-new-password').value;
    if (!resetCode || !newPassword) return showStudentError('Please enter the reset code and new password');
    if (newPassword.length < 8) return showStudentError('Password must be at least 8 characters');
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ indexNumber: studentForgotIndex, resetCode, newPassword, institutionCode: studentForgotCode }) });
      studentForgotStep = 'request';
      showStudentLogin();
      const el = document.getElementById('student-auth-error');
      el.textContent = 'Password reset successful! You can now sign in.';
      el.style.display = 'block';
      el.style.background = '#f0fdf4';
      el.style.color = '#15803d';
    } catch (e) {
      showStudentError(e.message);
    }
  }
}

async function handleLogout() {
  try {
    if (isOnline()) await api('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  document.getElementById('main-content').innerHTML = '';
  document.getElementById('sidebar-nav').innerHTML = '';
  document.getElementById('user-name').textContent = '';
  document.getElementById('user-role').textContent = '';
  document.getElementById('trial-banner').style.display = 'none';
  document.getElementById('trial-expired-banner').style.display = 'none';
  const topbarLeft = document.querySelector('.topbar-left');
  if (topbarLeft) topbarLeft.innerHTML = '';
  document.getElementById('dashboard-page').classList.add('hidden');
  document.getElementById('dashboard-page').removeAttribute('data-portal');
  document.getElementById('auth-page').style.display = 'flex';

  // Clean up mobile UI elements
  const bottomNav = document.getElementById('bottom-nav');
  if (bottomNav) bottomNav.remove();
  const overlay = document.getElementById('sidebar-overlay');
  if (overlay) overlay.remove();
  document.body.style.overflow = '';
  document.body.style.cssText = document.body.style.cssText; // flush

  showPortalSelector();
}

async function loadUserData() {
  try {
    const data = await api('/api/auth/me');
    currentUser = data.user;
    if (!currentUser) throw new Error('No user data');
    showDashboard(data);
  } catch (e) {
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    document.getElementById('auth-page').style.display = 'flex';
    document.getElementById('dashboard-page').classList.add('hidden');
  }
}

function getPortalName(role) {
  const names = {
    manager: 'Manager Portal',
    lecturer: 'Lecturer Portal',
    employee: 'Employee Portal',
    student: 'Student Portal',
    admin: 'Admin Portal',
    superadmin: 'Admin Portal'
  };
  return names[role] || 'KODEX';
}

function getPortalAttr(role) {
  if (role === 'superadmin' || role === 'admin') return 'admin';
  return role;
}

function showDashboard(data) {
  try {
    document.getElementById('auth-page').style.display = 'none';
    const dashPage = document.getElementById('dashboard-page');
    dashPage.classList.remove('hidden');

    const role = currentUser.role;
    const portalAttr = getPortalAttr(role);
    dashPage.setAttribute('data-portal', portalAttr);

    document.getElementById('user-name').textContent = currentUser.name || '';
    const roleEl = document.getElementById('user-role');
    roleEl.textContent = currentUser.role || '';
    roleEl.className = `role-badge role-${currentUser.role || 'user'}`;

    const companyName = currentUser.company?.name || '';
    const mode = currentUser.company?.mode || 'corporate';
    const topbarLeft = document.querySelector('.topbar-left');
    topbarLeft.innerHTML = `
      <button class="topbar-menu-btn" onclick="toggleMobileSidebar()" aria-label="Open menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>
      <h2>${getPortalName(role)}</h2>
      ${companyName ? `<span class="portal-company">— ${companyName}</span>` : ''}
      <span class="mode-badge">${mode}</span>
    `;
    if (!document.getElementById('sidebar-overlay')) {
      const overlay = document.createElement('div');
      overlay.id = 'sidebar-overlay';
      overlay.className = 'sidebar-overlay';
      overlay.onclick = closeMobileSidebar;
      document.body.appendChild(overlay);
    }
    buildBottomNav(role);
    const trial = data.trial || null;
    const subscription = data.subscription || null;
    const isSubRole = (role === 'employee' || role === 'student');

    if (isSubRole) {
      document.getElementById('trial-banner').style.display = 'none';
      document.getElementById('trial-expired-banner').style.display = 'none';
    } else if (trial && trial.active) {
      const banner = document.getElementById('trial-banner');
      const tr = trial.timeRemaining || {};
      banner.textContent = `Free Trial: ${trial.daysRemaining} days remaining (${tr.days || 0}d ${tr.hours || 0}h ${tr.minutes || 0}m)`;
      banner.style.display = 'block';
      document.getElementById('trial-expired-banner').style.display = 'none';
    } else if (subscription && !subscription.active && trial && !trial.active) {
      document.getElementById('trial-expired-banner').textContent = 'Your free trial has ended. Please subscribe to continue using premium features.';
      document.getElementById('trial-expired-banner').style.display = 'block';
      document.getElementById('trial-banner').style.display = 'none';
    } else {
      document.getElementById('trial-banner').style.display = 'none';
      document.getElementById('trial-expired-banner').style.display = 'none';
    }

    buildSidebar();
    navigateTo('dashboard');
  } catch (e) {
    console.error('Dashboard error:', e);
    document.getElementById('auth-page').style.display = 'flex';
    document.getElementById('dashboard-page').classList.add('hidden');
    localStorage.removeItem('token');
    token = null;
    currentUser = null;
    showError('Something went wrong. Please sign in again.');
  }
}

function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  const role = currentUser.role;

  let links = [
    { id: 'dashboard', label: 'Dashboard', icon: dashboardIcon() },
  ];

  switch (role) {
    case 'admin':
      links.push({ id: 'approvals', label: 'Approvals', icon: approvalsIcon() });
      links.push({ id: 'search', label: 'Search', icon: svgIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>') });
      links.push({ id: 'users', label: 'Users', icon: usersIcon() });
      links.push({ id: 'sessions', label: 'Sessions', icon: sessionsIcon() });
      if (currentUser.company?.mode === 'academic') {
        links.push({ id: 'courses', label: 'Courses', icon: coursesIcon() });
        links.push({ id: 'quizzes', label: 'Quizzes', icon: quizzesIcon() });
      }
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      links.push({ id: 'subscription', label: 'Subscription', icon: subscriptionIcon() });
      break;
    case 'manager':
      links.push({ id: 'approvals', label: 'Approvals', icon: approvalsIcon() });
      links.push({ id: 'sessions', label: 'Sessions', icon: sessionsIcon() });
      links.push({ id: 'users', label: 'Users', icon: usersIcon() });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      break;
    case 'lecturer':
      links.push({ id: 'sessions', label: 'Sessions', icon: sessionsIcon() });
      links.push({ id: 'search', label: 'Search', icon: svgIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>') });
      links.push({ id: 'courses', label: 'Courses', icon: coursesIcon() });
      links.push({ id: 'quizzes', label: 'Quizzes', icon: quizzesIcon() });
      links.push({ id: 'assignments', label: 'Assignments / Quiz', icon: assignmentsIcon() });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      links.push({ id: 'announcements', label: 'Announcements', icon: svgIcon('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') });
      links.push({ id: 'subscription', label: 'Subscription', icon: subscriptionIcon() });
      break;
    case 'employee':
      links.push({ id: 'sign-in-out', label: 'Sign In / Out', icon: attendanceIcon() });
      links.push({ id: 'my-attendance', label: 'My Attendance', icon: sessionsIcon() });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      break;
    case 'student':
      links.push({ id: 'mark-attendance', label: 'Mark Attendance', icon: attendanceIcon() });
      links.push({ id: 'my-attendance', label: 'My Attendance', icon: sessionsIcon() });
      links.push({ id: 'courses', label: 'My Courses', icon: coursesIcon() });
      links.push({ id: 'quizzes', label: 'Quizzes', icon: quizzesIcon() });
      links.push({ id: 'assignments', label: 'Assignments / Quiz', icon: assignmentsIcon() });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      links.push({ id: 'announcements', label: 'Announcements', icon: svgIcon('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') });
      break;
    case 'superadmin':
      links.push({ id: 'approvals', label: 'Approvals', icon: approvalsIcon() });
      links.push({ id: 'search', label: 'Search', icon: svgIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>') });
      links.push({ id: 'sessions', label: 'Sessions', icon: sessionsIcon() });
      links.push({ id: 'users', label: 'Users', icon: usersIcon() });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'courses', label: 'Courses', icon: coursesIcon() });
      links.push({ id: 'quizzes', label: 'Quizzes', icon: quizzesIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      links.push({ id: 'subscription', label: 'Subscription', icon: subscriptionIcon() });
      break;
  }

  // Universal links shown for all roles
  const universalLinks = [
    { id: 'profile',  label: 'My Profile',  icon: svgIcon('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>') },
    { id: 'contact',  label: 'Contact Us',  icon: svgIcon('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 17z"/>') },
    { id: 'about',    label: 'About',       icon: svgIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>') },
  ];

  nav.innerHTML =
    `<div class="sidebar-section-title">Navigation</div>` +
    links.map(l => `<a onclick="navigateTo('${l.id}')" id="nav-${l.id}">${l.icon} <span>${l.label}</span></a>`).join('') +
    `<div class="sidebar-section-title" style="margin-top:12px">Account</div>` +
    universalLinks.map(l => `<a onclick="navigateTo('${l.id}')" id="nav-${l.id}">${l.icon} <span>${l.label}</span></a>`).join('');
}

function navigateTo(view) {
  currentView = view;
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  const navEl = document.getElementById(`nav-${view}`);
  if (navEl) navEl.classList.add('active');

  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading...</div>';

  switch (view) {
    case 'dashboard': renderDashboard(); break;
    case 'sessions': renderSessions(); break;
    case 'users': renderUsers(); break;
    case 'meetings': renderMeetings(); break;
    case 'courses': renderCourses(); break;
    case 'quizzes': renderQuizzes(); break;
    case 'my-attendance': renderMyAttendance(); break;
    case 'mark-attendance': renderMarkAttendance(); break;
    case 'sign-in-out': renderSignInOut(); break;
    case 'subscription': renderSubscription(); break;
    case 'reports': renderReports(); break;
    case 'approvals': renderApprovals(); break;
    case 'search': renderSearch(); break;
    case 'assignments': location.href='/assignments.html'; return;
    case 'profile':     renderProfile(); break;
    case 'contact':     renderContact(); break;
    case 'about':       renderAbout(); break;
    case 'announcements': renderAnnouncements(); break;
    default: renderDashboard();
  }
}

async function renderDashboard() {
  const content = document.getElementById('main-content');
  if (!content) return;
  const role = currentUser.role;

  try {
    switch (role) {
      case 'admin':
        await renderAdminDashboard(content);
        break;
      case 'manager':
        await renderAdminDashboard(content);
        break;
      case 'lecturer':
        await renderLecturerDashboard(content);
        break;
      case 'employee':
        await renderEmployeeDashboard(content);
        break;
      case 'student':
        await renderStudentDashboard(content);
        break;
      case 'superadmin':
        await renderAdminDashboard(content);
        break;
      default:
        content.innerHTML = `<div class="card"><p>Welcome to KODEX!</p></div>`;
    }
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Welcome to ${getPortalName(role)}!</p></div>`;
  }
}

async function renderApprovals() {
  const content = document.getElementById('main-content');
  if (!content) return;
  try {
    const data = await api('/api/approvals/pending');
    const pending = data.pending || [];

    content.innerHTML = `
      <div class="page-header"><h2>Pending Approvals</h2><p>Review and approve registration requests</p></div>
      <div class="card">
        ${pending.length ? `
          <table>
            <thead><tr><th>Name</th><th>Email / ID</th><th>Role</th><th>Registered</th><th>Actions</th></tr></thead>
            <tbody>${pending.map(u => `
              <tr>
                <td style="font-weight:500">${u.name}</td>
                <td>${u.email || u.indexNumber || 'N/A'}</td>
                <td><span class="status-badge status-active">${u.role}</span></td>
                <td>${new Date(u.createdAt).toLocaleDateString()}</td>
                <td style="white-space:nowrap">
                  <button class="btn btn-sm" style="background:#22c55e;color:#fff" onclick="approveUser('${u._id}')">Approve</button>
                  <button class="btn btn-danger btn-sm" onclick="rejectUser('${u._id}')">Reject</button>
                </td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No pending approval requests</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Failed to load approvals: ${e.message}</p></div>`;
  }
}

async function approveUser(userId) {
  if (!confirm('Approve this user?')) return;
  try {
    await api(`/api/approvals/${userId}/approve`, { method: 'PATCH' });
    renderApprovals();
  } catch (e) {
    alert(e.message);
  }
}

async function rejectUser(userId) {
  if (!confirm('Reject and remove this user? This cannot be undone.')) return;
  try {
    await api(`/api/approvals/${userId}/reject`, { method: 'DELETE' });
    renderApprovals();
  } catch (e) {
    alert(e.message);
  }
}

async function renderLecturerDashboard(content) {
  const [sessionsData, coursesData, quizzesData] = await Promise.all([
    api('/api/attendance-sessions?limit=5').catch(() => ({ sessions: [], pagination: { total: 0 } })),
    api('/api/courses').catch(() => ({ courses: [] })),
    api('/api/quizzes').catch(() => ({ quizzes: [] })),
  ]);

  // Count students enrolled across lecturer's courses only
  const totalStudents = coursesData.courses.reduce((sum, c) => sum + (c.enrolledStudents?.length || 0), 0);
  const activeCourses = coursesData.courses.length;
  const quizzesCreated = quizzesData.quizzes.length;

  content.innerHTML = `
    <div class="page-header">
      <h2>Welcome back, ${currentUser.name.split(' ')[0]}</h2>
      <p>Here's an overview of your workspace at ${currentUser.company?.name || 'your institution'}</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${totalStudents}</div><div class="stat-label">Students</div></div>
      <div class="stat-card"><div class="stat-value">${activeCourses}</div><div class="stat-label">Courses</div></div>
      <div class="stat-card"><div class="stat-value">${sessionsData.pagination.total}</div><div class="stat-label">Sessions</div></div>
      <div class="stat-card"><div class="stat-value">${quizzesCreated}</div><div class="stat-label">Quizzes</div></div>
    </div>
    <div class="quick-actions">
      <button class="btn btn-primary btn-sm" onclick="navigateTo('sessions'); setTimeout(showStartSessionModal, 300)">${sessionsIcon()} Start Session</button>
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('courses'); setTimeout(showCreateCourseModal, 300)">${coursesIcon()} Create Course</button>
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('quizzes'); setTimeout(showCreateQuizModal, 300)">${quizzesIcon()} Create Quiz</button>
    </div>
    <div class="card">
      <div class="card-title">Recent Sessions</div>
      ${sessionsData.sessions.length ? `
        <table>
          <thead><tr><th>Title</th><th>Status</th><th>Started</th><th>Created By</th></tr></thead>
          <tbody>${sessionsData.sessions.map(s => `
            <tr>
              <td style="font-weight:500;color:var(--text)">${s.title || 'Untitled'}</td>
              <td><span class="status-badge status-${s.status}">${s.status}</span></td>
              <td>${new Date(s.startedAt).toLocaleString()}</td>
              <td>${s.createdBy?.name || 'N/A'}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      ` : '<div class="empty-state"><p>No sessions yet. Start your first attendance session!</p></div>'}
    </div>
  `;
}

async function renderEmployeeDashboard(content) {
  const [attendance, meetingsData, signInStatus] = await Promise.all([
    api('/api/attendance-sessions/my-attendance?limit=5').catch(() => ({ records: [], pagination: { total: 0 } })),
    api('/api/zoom').catch(() => ({ meetings: [] })),
    api('/api/attendance-sessions/sign-in-status').catch(() => ({ signedIn: false, record: null })),
  ]);

  const upcomingMeetings = meetingsData.meetings.filter(m => m.status === 'scheduled');
  const totalCheckins = attendance.pagination.total;
  const attendanceRate = totalCheckins > 0 ? Math.round((attendance.records.filter(r => r.status === 'present').length / attendance.records.length) * 100) : 0;
  const signedIn = signInStatus.signedIn;
  const signInRecord = signInStatus.record;
  const signInTime = signInRecord?.checkInTime ? new Date(signInRecord.checkInTime) : null;

  content.innerHTML = `
    <div class="page-header">
      <h2>Welcome back, ${currentUser.name.split(' ')[0]}</h2>
      <p>${currentUser.company?.name || 'Your company'}${currentUser.employeeId ? ` \u2022 ID: ${currentUser.employeeId}` : ''}</p>
    </div>

    <div class="card" style="border-left:4px solid ${signedIn ? 'var(--success)' : 'var(--primary)'};background:${signedIn ? 'linear-gradient(135deg,#f0fdf4,#ecfdf5)' : 'linear-gradient(135deg,#eef2ff,#e0e7ff)'}">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:12px;text-transform:uppercase;font-weight:700;letter-spacing:.5px;color:${signedIn ? 'var(--success)' : 'var(--primary)'}">
            ${signedIn ? '● Currently Signed In' : '○ Not Signed In'}
          </div>
          <div style="font-size:18px;font-weight:700;margin-top:4px">${signedIn ? 'You are clocked in' : 'Ready to start your day?'}</div>
          ${signInTime ? `<div style="font-size:12px;color:var(--text-light);margin-top:2px">Since ${signInTime.toLocaleString()}</div>` : ''}
        </div>
        <div style="display:flex;gap:10px">
          ${!signedIn ? `<button class="btn btn-success" onclick="employeeSignIn()" style="gap:8px;font-size:14px;padding:12px 24px">
            ${svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 16)} Sign In
          </button>` : `<button class="btn btn-danger" onclick="employeeSignOut()" style="gap:8px;font-size:14px;padding:12px 24px">
            ${svgIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', 16)} Sign Out
          </button>`}
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">Total Days</div></div>
      <div class="stat-card"><div class="stat-value">${attendanceRate}%</div><div class="stat-label">Attendance Rate</div></div>
      <div class="stat-card"><div class="stat-value">${upcomingMeetings.length}</div><div class="stat-label">Meetings</div></div>
    </div>

    <div class="card">
      <div class="card-title">Recent Attendance</div>
      ${attendance.records.length ? `
        <table>
          <thead><tr><th>Session</th><th>Status</th><th>Sign In</th><th>Sign Out</th><th>Duration</th></tr></thead>
          <tbody>${attendance.records.map(r => {
            const inTime = r.checkInTime ? new Date(r.checkInTime) : null;
            const outTime = r.checkOutTime ? new Date(r.checkOutTime) : null;
            const dur = inTime && outTime ? Math.round((outTime - inTime) / 60000) : null;
            return `<tr>
              <td>${r.session?.title || 'N/A'}</td>
              <td><span class="status-badge status-${r.status}">${r.status}</span></td>
              <td>${inTime ? inTime.toLocaleTimeString() : '—'}</td>
              <td>${outTime ? outTime.toLocaleTimeString() : '<span style="color:#f59e0b;font-weight:600">Active</span>'}</td>
              <td>${dur !== null ? Math.floor(dur/60)+'h '+(dur%60)+'m' : '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      ` : '<div class="empty-state"><p>No attendance records yet. Sign in to start tracking.</p></div>'}
    </div>
  `;
}

async function employeeSignIn() {
  try {
    const data = await api('/api/attendance-sessions/sign-in', { method: 'POST' });
    alert(data.message || 'Signed in successfully!');
    navigateTo('dashboard');
  } catch (e) {
    alert(e.message || 'Sign in failed');
  }
}

async function employeeSignOut() {
  if (!confirm('Are you sure you want to sign out?')) return;
  try {
    const data = await api('/api/attendance-sessions/sign-out', { method: 'POST' });
    alert(data.message ? data.message + (data.duration ? ' Duration: ' + data.duration : '') : 'Signed out successfully!');
    navigateTo('dashboard');
  } catch (e) {
    alert(e.message || 'Sign out failed');
  }
}

async function renderSignInOut() {
  const content = document.getElementById('main-content');
  if (!content) return;
  try {
    const [statusData, attendanceData] = await Promise.all([
      api('/api/attendance-sessions/sign-in-status').catch(() => ({ signedIn: false, record: null })),
      api('/api/attendance-sessions/my-attendance?limit=30').catch(() => ({ records: [] })),
    ]);

    const signedIn = statusData.signedIn;
    const record = statusData.record;
    const signInTime = record?.checkInTime ? new Date(record.checkInTime) : null;

    content.innerHTML = `
      <div class="page-header">
        <h2>Sign In / Sign Out</h2>
        <p>Track your daily attendance</p>
      </div>

      <div class="card" style="text-align:center;padding:40px 24px;border-left:4px solid ${signedIn ? 'var(--success)' : 'var(--primary)'}">
        <div style="font-size:56px;margin-bottom:16px">${signedIn ? svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 56) : svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 56)}</div>
        <div style="font-size:22px;font-weight:800;color:${signedIn ? 'var(--success)' : 'var(--primary)'}">
          ${signedIn ? 'You are currently signed in' : 'You are not signed in'}
        </div>
        ${signInTime ? `<div style="font-size:14px;color:var(--text-light);margin-top:6px">Signed in at ${signInTime.toLocaleString()}</div>` : ''}
        <div style="margin-top:28px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
          ${!signedIn ? `
            <button class="btn btn-success" onclick="employeeSignIn()" style="gap:10px;font-size:16px;padding:14px 32px;width:auto">
              ${svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 18)}
              Sign In
            </button>
          ` : `
            <button class="btn btn-danger" onclick="employeeSignOut()" style="gap:10px;font-size:16px;padding:14px 32px;width:auto">
              ${svgIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', 18)}
              Sign Out
            </button>
          `}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Attendance History</div>
        ${attendanceData.records.length ? `
          <table>
            <thead><tr><th>Date / Session</th><th>Status</th><th>Sign In</th><th>Sign Out</th><th>Duration</th></tr></thead>
            <tbody>${attendanceData.records.map(r => {
              const inTime = r.checkInTime ? new Date(r.checkInTime) : null;
              const outTime = r.checkOutTime ? new Date(r.checkOutTime) : null;
              const dur = inTime && outTime ? Math.round((outTime - inTime) / 60000) : null;
              return `<tr>
                <td>
                  <div style="font-weight:600;font-size:13px">${r.session?.title || 'Work Day'}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${inTime ? inTime.toLocaleDateString() : ''}</div>
                </td>
                <td><span class="status-badge status-${r.status}">${r.status}</span></td>
                <td style="font-size:13px">${inTime ? inTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                <td style="font-size:13px">${outTime ? outTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '<span style="color:#f59e0b;font-weight:600;font-size:11px">Active</span>'}</td>
                <td style="font-size:13px">${dur !== null ? Math.floor(dur/60)+'h '+(dur%60)+'m' : '—'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No attendance records yet. Click Sign In to start.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function renderStudentDashboard(content) {
  const [attendance, coursesData, quizzesData, meetingsData, activeSessionData] = await Promise.all([
    api('/api/attendance-sessions/my-attendance?limit=5').catch(() => ({ records: [], pagination: { total: 0 } })),
    api('/api/courses').catch(() => ({ courses: [] })),
    api('/api/quizzes').catch(() => ({ quizzes: [] })),
    api('/api/zoom').catch(() => ({ meetings: [] })),
    api('/api/attendance-sessions/active').catch(() => ({ session: null })),
  ]);

  const totalCheckins = attendance.pagination.total;
  const enrolledCourses = coursesData.courses.length;
  const quizzesTaken = quizzesData.quizzes.length;
  const upcomingMeetings = meetingsData.meetings.filter(m => m.status === 'scheduled');
  const activeSession = activeSessionData.session;
  const attendanceRate = totalCheckins > 0 ? Math.round((attendance.records.filter(r => r.status === 'present').length / attendance.records.length) * 100) : 0;

  const methodLabel = (m) => {
    const labels = { qr_mark: 'QR Code', code_mark: 'Code Entry', ble_mark: 'BLE Proximity', jitsi_join: 'Meeting Join', manual: 'Manual', qr: 'QR Code', ble: 'BLE', zoom: 'Meeting' };
    return labels[m] || m;
  };

  content.innerHTML = `
    <div class="page-header">
      <h2>Welcome back, ${currentUser.name.split(' ')[0]}</h2>
      <p>${currentUser.company?.name || 'Your institution'}${currentUser.indexNumber ? ' \u2022 ' + currentUser.indexNumber : ''}</p>
    </div>
    
    ${activeSession ? `
      <div class="card" style="border-left:4px solid var(--success);background:linear-gradient(135deg,#f0fdf4,#ecfdf5);cursor:pointer" onclick="navigateTo('mark-attendance')">
        <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
          <div style="background:var(--success);color:white;border-radius:12px;padding:12px;display:flex;align-items:center;justify-content:center">
            ${svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 28)}
          </div>
          <div style="flex:1">
            <div style="font-size:12px;text-transform:uppercase;color:var(--success);font-weight:700;letter-spacing:0.5px">Active Session — Mark Now</div>
            <div style="font-size:16px;font-weight:700;margin-top:2px">${activeSession.title || 'Untitled Session'}</div>
            <div style="font-size:12px;color:var(--text-light)">Started ${new Date(activeSession.startedAt).toLocaleString()}</div>
          </div>
          <span class="status-badge status-active" style="animation:pulse 2s infinite">LIVE</span>
        </div>
      </div>
    ` : ''}
    
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${totalCheckins}</div><div class="stat-label">Total Check-ins</div></div>
      <div class="stat-card"><div class="stat-value">${attendanceRate}%</div><div class="stat-label">Attendance Rate</div></div>
      <div class="stat-card"><div class="stat-value">${enrolledCourses}</div><div class="stat-label">Enrolled Courses</div></div>
      <div class="stat-card"><div class="stat-value">${quizzesTaken}</div><div class="stat-label">Quizzes Taken</div></div>
    </div>
    
    <div class="quick-actions">
      <button class="btn btn-primary btn-sm" onclick="navigateTo('mark-attendance')">Mark Attendance</button>
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('my-attendance')">View History</button>
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('courses')">My Courses</button>
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('quizzes')">Quizzes</button>
    </div>
    
    ${upcomingMeetings.length > 0 ? `
      <div class="card">
        <div class="card-title">Upcoming Meetings</div>
        ${upcomingMeetings.slice(0, 3).map(m => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:600;font-size:14px">${m.title}</div>
              <div style="font-size:12px;color:var(--text-light)">${new Date(m.scheduledStart).toLocaleString()} — ${m.duration} min</div>
            </div>
            ${m.joinUrl ? `<a href="${m.joinUrl}" target="_blank" class="btn btn-success btn-sm">Join</a>` : ''}
          </div>
        `).join('')}
      </div>
    ` : ''}
    
    <div class="card">
      <div class="card-title">Recent Attendance</div>
      ${attendance.records.length ? `
        <table>
          <thead><tr><th>Session</th><th>Status</th><th>Method</th><th>Check-in Time</th></tr></thead>
          <tbody>${attendance.records.map(r => `
            <tr>
              <td>${r.session?.title || 'N/A'}</td>
              <td><span class="status-badge status-${r.status}">${r.status}</span></td>
              <td><span style="font-size:11px;background:var(--bg);padding:3px 8px;border-radius:8px">${methodLabel(r.method)}</span></td>
              <td>${new Date(r.checkInTime).toLocaleString()}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      ` : '<div class="empty-state"><p>No attendance records yet. Mark attendance when a session is active.</p></div>'}
    </div>
  `;
}

async function renderAdminDashboard(content) {
  const [sessionsData, usersData, pendingData, meetingsData] = await Promise.all([
    api('/api/attendance-sessions?limit=5').catch(() => ({ sessions: [], pagination: { total: 0 } })),
    api('/api/users').catch(() => ({ users: [] })),
    api('/api/approvals/pending').catch(() => ({ pending: [] })),
    api('/api/zoom').catch(() => ({ meetings: [] })),
  ]);

  const activeSessions = sessionsData.sessions.filter(s => s.status === 'active').length;
  const totalUsers = usersData.users.length;
  const pendingCount = pendingData.pending.length;
  const upcomingMeetings = meetingsData.meetings.filter(m => m.status === 'scheduled').length;
  const instCode = currentUser.company?.institutionCode || 'N/A';
  const mode = currentUser.company?.mode || 'corporate';
  const bleLocId = currentUser.company?.bleLocationId || 'N/A';
  const qrSeed = currentUser.company?.qrSeed || 'N/A';

  content.innerHTML = `
    <div class="page-header">
      <h2>Welcome back, ${currentUser.name.split(' ')[0]}</h2>
      <p>${currentUser.company?.name || 'Your institution'}</p>
    </div>

    <div class="card" style="background:linear-gradient(135deg,#ede9fe,#e0e7ff);border:1px solid #c7d2fe;margin-bottom:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
        <div>
          <div style="font-size:12px;text-transform:uppercase;color:var(--primary);font-weight:700;letter-spacing:0.5px">Institution Code</div>
          <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:var(--primary);font-family:monospace;margin-top:4px">${instCode}</div>
          <div style="font-size:12px;color:var(--text-light);margin-top:4px">Share this code with ${mode === 'academic' ? 'lecturers and students' : 'employees'} so they can join your institution</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText('${instCode}').then(() => alert('Code copied!'))">Copy Code</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
      <div class="card" style="margin:0;background:#f0fdfa;border:1px solid #99f6e4">
        <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:#0d9488;letter-spacing:0.5px">BLE Location ID</div>
        <div style="font-size:13px;font-family:monospace;margin-top:6px;word-break:break-all">${bleLocId}</div>
      </div>
      <div class="card" style="margin:0;background:#fef9c3;border:1px solid #fde68a">
        <div style="font-size:11px;text-transform:uppercase;font-weight:700;color:#a16207;letter-spacing:0.5px">QR Seed</div>
        <div style="font-size:13px;font-family:monospace;margin-top:6px;word-break:break-all">${qrSeed.substring(0, 16)}...</div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card" ${pendingCount > 0 ? 'style="border-left:3px solid #f59e0b;cursor:pointer" onclick="navigateTo(\'approvals\')"' : ''}>
        <div class="stat-value" ${pendingCount > 0 ? 'style="color:#f59e0b"' : ''}>${pendingCount}</div>
        <div class="stat-label">Pending Approvals</div>
      </div>
      <div class="stat-card"><div class="stat-value">${totalUsers}</div><div class="stat-label">Total Users</div></div>
      <div class="stat-card"><div class="stat-value">${activeSessions}</div><div class="stat-label">Active Sessions</div></div>
      <div class="stat-card"><div class="stat-value">${upcomingMeetings}</div><div class="stat-label">Meetings</div></div>
    </div>

    <div class="quick-actions">
      ${pendingCount > 0 ? `<button class="btn btn-primary btn-sm" onclick="navigateTo('approvals')">${approvalsIcon()} Review Approvals (${pendingCount})</button>` : ''}
      <button class="btn btn-secondary btn-sm" onclick="navigateTo('users'); setTimeout(showCreateUserModal, 300)">${usersIcon()} Add User</button>
    </div>

    <div class="card">
      <div class="card-title">Recent Sessions</div>
      ${sessionsData.sessions.length ? `
        <table>
          <thead><tr><th>Title</th><th>Status</th><th>Started</th><th>Created By</th></tr></thead>
          <tbody>${sessionsData.sessions.map(s => `
            <tr>
              <td style="font-weight:500;color:var(--text)">${s.title || 'Untitled'}</td>
              <td><span class="status-badge status-${s.status}">${s.status}</span></td>
              <td>${new Date(s.startedAt).toLocaleString()}</td>
              <td>${s.createdBy?.name || 'N/A'}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      ` : '<div class="empty-state"><p>No sessions yet. Start your first attendance session!</p></div>'}
    </div>
  `;
}

async function renderSessions() {
  const content = document.getElementById('main-content');
  if (!content) return;

  // Offline: render from cache immediately
  if (!isOnline()) {
    const cached = offlineRead('sessions');
    _renderSessionsHTML(content, cached?.sessions || [], true);
    return;
  }

  try {
    const data = await api('/api/attendance-sessions');
    offlineCache('sessions', data); // cache for offline use
    _renderSessionsHTML(content, data.sessions || [], false);
  } catch (e) {
    // Network failed — fall back to cache
    const cached = offlineRead('sessions');
    if (cached) {
      _renderSessionsHTML(content, cached.sessions || [], true);
    } else {
      content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
    }
  }
}

function _renderSessionsHTML(content, sessions, isOffline) {
  const pendingCount = offlineQueueCount();
  content.innerHTML = `
    <div class="page-header">
      <h2>Attendance Sessions</h2>
      <p>Manage attendance sessions${isOffline ? ' <span style="color:#f59e0b;font-weight:600">(Offline — showing cached data)</span>' : ''}</p>
    </div>
    <div class="actions-bar">
      <button class="btn btn-primary btn-sm" onclick="showStartSessionModal()">Start New Session</button>
      ${pendingCount > 0 ? `<span style="background:#fef3c7;color:#92400e;border:1px solid #fbbf24;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600">${pendingCount} action${pendingCount!==1?'s':''} pending sync</span>` : ''}
    </div>
    <div class="card">
      ${sessions.length ? `
        <table>
          <thead><tr><th>Title</th><th>Status</th><th>Started</th><th>Stopped</th><th>Actions</th></tr></thead>
          <tbody>${sessions.map(s => `
            <tr>
              <td>${s.title || 'Untitled'}</td>
              <td><span class="status-badge status-${s.status}">${s.status}</span></td>
              <td>${new Date(s.startedAt).toLocaleString()}</td>
              <td>${s.stoppedAt ? new Date(s.stoppedAt).toLocaleString() : '-'}</td>
              <td>${s.status === 'active' ? `
                <button class="btn btn-danger btn-sm" onclick="stopSession('${s._id}')">Stop</button>
                ${!isOffline ? `<button class="btn btn-success btn-sm" onclick="generateQR('${s._id}')">QR Code</button>` : ''}
                <button class="btn btn-sm" style="font-size:11px;background:var(--bg);border:1px solid var(--border)" onclick="viewAttendees('${s._id}', '${(s.title||'Session').replace(/['"]/g,'')}')">Attendees</button>
              ` : ''}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      ` : '<div class="empty-state"><p>No sessions found</p></div>'}
    </div>
  `;
}

function showStartSessionModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Start New Session</h3>
        <div class="form-group">
          <label>Session Title</label>
          <input type="text" id="session-title" placeholder="e.g., Morning Roll Call">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="startSession()">Start Session</button>
        </div>
      </div>
    </div>
  `;
}

async function startSession() {
  const title = document.getElementById('session-title').value;
  closeModal();

  if (!isOnline()) {
    // Queue the start action
    const tempId = 'offline_' + Date.now();
    offlineEnqueue({
      label: `Start session: ${title || 'Untitled'}`,
      url: '/api/attendance-sessions/start',
      options: { method: 'POST', body: JSON.stringify({ title }) }
    });
    // Optimistically add to cache
    const cached = offlineRead('sessions') || { sessions: [] };
    cached.sessions.unshift({
      _id: tempId, title: title || 'Untitled',
      status: 'active', startedAt: new Date().toISOString(), stoppedAt: null,
      _offlinePending: true
    });
    offlineCache('sessions', cached);
    showToastNotif('📶 Session queued — will start when online', 'warn');
    renderSessions();
    return;
  }

  try {
    await api('/api/attendance-sessions/start', { method: 'POST', body: JSON.stringify({ title }) });
    renderSessions();
  } catch (e) {
    alert(e.message);
  }
}

async function stopSession(id) {
  if (!confirm('Stop this session?')) return;

  if (!isOnline()) {
    offlineEnqueue({
      label: `Stop session ${id}`,
      url: `/api/attendance-sessions/${id}/stop`,
      options: { method: 'POST' }
    });
    // Optimistically update cache
    const cached = offlineRead('sessions');
    if (cached) {
      const s = cached.sessions.find(s => s._id === id);
      if (s) { s.status = 'stopped'; s.stoppedAt = new Date().toISOString(); s._offlinePending = true; }
      offlineCache('sessions', cached);
    }
    showToastNotif('📶 Stop queued — will sync when online', 'warn');
    renderSessions();
    return;
  }

  try {
    await api(`/api/attendance-sessions/${id}/stop`, { method: 'POST' });
    renderSessions();
  } catch (e) {
    alert(e.message);
  }
}

// QR auto-rotation state
let _qrRotateTimer = null;
let _qrCountdownTimer = null;
const QR_EXPIRY_SECONDS = 15;

function _stopQrTimers() {
  if (_qrRotateTimer)   { clearTimeout(_qrRotateTimer);  _qrRotateTimer = null; }
  if (_qrCountdownTimer){ clearInterval(_qrCountdownTimer); _qrCountdownTimer = null; }
}

async function generateQR(sessionId) {
  _stopQrTimers();
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');

  async function _fetchAndShow() {
    try {
      const data = await api('/api/qr-tokens/generate', {
        method: 'POST',
        body: JSON.stringify({ sessionId, expirySeconds: QR_EXPIRY_SECONDS })
      });
      const code = data.qrToken.code;

      container.innerHTML = `
        <div class="modal-overlay" onclick="_stopQrTimers();closeModal(event)">
          <div class="modal" onclick="event.stopPropagation()" style="text-align:center;max-width:380px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <h3 style="margin:0">Attendance QR Code</h3>
              <button onclick="_stopQrTimers();closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-light)">×</button>
            </div>
            <p style="color:var(--text-light);font-size:12px;margin-bottom:16px">Code refreshes every ${QR_EXPIRY_SECONDS}s to prevent sharing</p>

            <!-- Countdown ring -->
            <div style="position:relative;width:100px;height:100px;margin:0 auto 16px">
              <svg width="100" height="100" style="transform:rotate(-90deg)">
                <circle cx="50" cy="50" r="44" fill="none" stroke="#e5e7eb" stroke-width="7"/>
                <circle id="qr-ring" cx="50" cy="50" r="44" fill="none" stroke="var(--primary)" stroke-width="7"
                  stroke-linecap="round"
                  stroke-dasharray="276"
                  stroke-dashoffset="0"
                  style="transition:stroke-dashoffset 1s linear,stroke 0.3s"/>
              </svg>
              <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
                <span id="qr-countdown" style="font-size:22px;font-weight:800;color:var(--primary)">${QR_EXPIRY_SECONDS}</span>
              </div>
            </div>

            <!-- The code -->
            <div id="qr-code-display" style="font-size:52px;font-weight:800;color:var(--primary);letter-spacing:10px;margin-bottom:8px;font-family:monospace">${code}</div>
            <p style="color:var(--text-light);font-size:12px;margin-bottom:20px">Students enter this code to mark attendance</p>

            <!-- Status badge -->
            <div id="qr-status" style="display:inline-flex;align-items:center;gap:6px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:999px;padding:5px 14px;font-size:12px;font-weight:600;color:#16a34a;margin-bottom:20px">
              <span style="width:7px;height:7px;border-radius:50%;background:#16a34a;display:inline-block;animation:pulse-green 1.5s infinite"></span>
              Active · Refreshing automatically
            </div>

            <div class="modal-actions" style="justify-content:center">
              <button class="btn btn-primary btn-sm" onclick="_stopQrTimers();closeModal()">Close</button>
            </div>
          </div>
        </div>
      `;

      // Animate countdown ring + number
      let remaining = QR_EXPIRY_SECONDS;
      const ring = document.getElementById('qr-ring');
      const countEl = document.getElementById('qr-countdown');
      const circumference = 276;

      _qrCountdownTimer = setInterval(() => {
        remaining--;
        if (countEl) countEl.textContent = remaining;
        if (ring) {
          const offset = circumference * (1 - remaining / QR_EXPIRY_SECONDS);
          ring.style.strokeDashoffset = offset;
          // Turn orange at 5s, red at 3s
          if (remaining <= 3)       ring.style.stroke = '#ef4444';
          else if (remaining <= 5)  ring.style.stroke = '#f97316';
          else                      ring.style.stroke = 'var(--primary)';
        }
        if (remaining <= 0) {
          clearInterval(_qrCountdownTimer);
          _qrCountdownTimer = null;
          // Flash "Refreshing…" 
          const codeEl = document.getElementById('qr-code-display');
          if (codeEl) { codeEl.style.opacity = '0.3'; codeEl.textContent = '······'; }
          const statusEl = document.getElementById('qr-status');
          if (statusEl) statusEl.innerHTML = '<span style="width:7px;height:7px;border-radius:50%;background:#f59e0b;display:inline-block"></span> Refreshing…';
        }
      }, 1000);

      // Schedule next refresh
      _qrRotateTimer = setTimeout(() => {
        _stopQrTimers();
        _fetchAndShow();
      }, QR_EXPIRY_SECONDS * 1000);

    } catch (e) {
      container.innerHTML = `
        <div class="modal-overlay" onclick="_stopQrTimers();closeModal(event)">
          <div class="modal" style="text-align:center">
            <p style="color:var(--danger)">${e.message}</p>
            <button class="btn btn-primary btn-sm" onclick="_stopQrTimers();closeModal()">Close</button>
          </div>
        </div>`;
    }
  }

  await _fetchAndShow();
}

async function renderUsers() {
  const content = document.getElementById('main-content');
  if (!content) return;
  try {
    const data = await api('/api/users');
    const mode = currentUser.company?.mode || 'corporate';
    const isManager = currentUser.role === 'manager';
    const canManage = ['manager', 'admin', 'superadmin'].includes(currentUser.role);
    const pageTitle = isManager ? 'Employees' : 'Users';
    const pageDesc = isManager ? 'Manage your employees' : 'Manage team members';
    const addLabel = isManager ? 'Add Employee' : 'Add User';

    const otherUsers = data.users.filter(u => u._id !== currentUser.id);

    content.innerHTML = `
      <div class="page-header"><h2>${pageTitle}</h2><p>${pageDesc}</p></div>
      <div class="actions-bar" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        ${canManage ? `<button class="btn btn-primary btn-sm" onclick="showCreateUserModal()">${addLabel}</button>` : ''}
        ${canManage ? `
          <div id="bulk-actions" style="display:none;gap:8px;align-items:center;margin-left:auto">
            <span id="selected-count" style="font-size:13px;color:var(--text-light)">0 selected</span>
            <button class="btn btn-sm" style="background:#22c55e;color:#fff" onclick="bulkUserAction('activate')">Activate</button>
            <button class="btn btn-sm" style="background:#f59e0b;color:#fff" onclick="bulkUserAction('deactivate')">Deactivate</button>
            <button class="btn btn-danger btn-sm" onclick="bulkUserAction('delete')">Delete</button>
          </div>
        ` : ''}
      </div>
      <div class="card">
        ${otherUsers.length ? `
          <table>
            <thead><tr>
              ${canManage ? '<th style="width:40px"><input type="checkbox" id="select-all-users" onchange="toggleSelectAllUsers()"></th>' : ''}
              <th>Name</th>${mode === 'corporate' ? '<th>Employee ID</th>' : ''}<th>Email / Index</th><th>Role</th><th>Status</th>${canManage ? '<th>Actions</th>' : ''}
            </tr></thead>
            <tbody>${otherUsers.map(u => `
              <tr id="user-row-${u._id}">
                ${canManage ? `<td><input type="checkbox" class="user-checkbox" value="${u._id}" onchange="updateBulkActions()"></td>` : ''}
                <td>${u.name}</td>
                ${mode === 'corporate' ? `<td>${u.employeeId || '-'}</td>` : ''}
                <td>${u.email || u.indexNumber || 'N/A'}</td>
                <td><span class="role-badge role-${u.role}">${u.role}</span></td>
                <td><span class="status-badge ${u.isActive ? 'status-active' : 'status-stopped'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
                ${canManage ? `<td style="white-space:nowrap">
                  ${u.isActive
                    ? `<button class="btn btn-sm" style="background:#f59e0b;color:#fff;font-size:11px" onclick="deactivateUser('${u._id}')">Deactivate</button>`
                    : `<button class="btn btn-sm" style="background:#22c55e;color:#fff;font-size:11px" onclick="activateUser('${u._id}')">Activate</button>`}
                  <button class="btn btn-danger btn-sm" style="font-size:11px" onclick="deleteUserPermanently('${u._id}', '${u.name.replace(/'/g, "\\'")}')">Delete</button>
                </td>` : ''}
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No users found</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

function showCreateUserModal() {
  const mode = currentUser.company?.mode || 'corporate';
  const isManager = currentUser.role === 'manager';

  let roles;
  if (isManager) {
    roles = '<option value="employee">Employee</option>';
  } else if (mode === 'corporate') {
    roles = '<option value="employee">Employee</option><option value="manager">Manager</option>';
  } else {
    roles = '<option value="student">Student</option><option value="lecturer">Lecturer</option>';
  }

  const defaultRole = isManager ? 'employee' : (mode === 'corporate' ? 'employee' : 'student');
  const modalTitle = isManager ? 'Add Employee' : 'Add User';

  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>${modalTitle}</h3>
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="new-user-name" placeholder="Full name">
        </div>
        ${!isManager ? `<div class="form-group">
          <label>Role</label>
          <select id="new-user-role" onchange="toggleUserFields()">${roles}</select>
        </div>` : `<input type="hidden" id="new-user-role" value="${defaultRole}">`}
        <div class="form-group" id="new-user-email-group" ${defaultRole === 'student' ? 'class="hidden"' : ''}>
          <label>Email</label>
          <input type="email" id="new-user-email" placeholder="user@company.com">
        </div>
        <div class="form-group ${defaultRole !== 'student' ? 'hidden' : ''}" id="new-user-index-group">
          <label>Index Number</label>
          <input type="text" id="new-user-index" placeholder="Student index number">
        </div>
        ${defaultRole === 'employee' ? '<p style="font-size:12px;color:var(--text-light);margin-bottom:12px">An Employee ID will be auto-generated.</p>' : ''}
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="new-user-password" placeholder="Min 8 characters">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="createUser()">Create</button>
        </div>
      </div>
    </div>
  `;
  toggleUserFields();
}

function toggleUserFields() {
  const role = document.getElementById('new-user-role').value;
  document.getElementById('new-user-email-group').classList.toggle('hidden', role === 'student');
  document.getElementById('new-user-index-group').classList.toggle('hidden', role !== 'student');
}

async function createUser() {
  try {
    const role = document.getElementById('new-user-role').value;
    const body = {
      name: document.getElementById('new-user-name').value,
      password: document.getElementById('new-user-password').value,
      role,
    };
    if (role === 'student') {
      body.indexNumber = document.getElementById('new-user-index').value;
    } else {
      body.email = document.getElementById('new-user-email').value;
    }
    await api('/api/users', { method: 'POST', body: JSON.stringify(body) });
    closeModal();
    renderUsers();
  } catch (e) {
    alert(e.message);
  }
}

function toggleSelectAllUsers() {
  const selectAll = document.getElementById('select-all-users');
  document.querySelectorAll('.user-checkbox').forEach(cb => cb.checked = selectAll.checked);
  updateBulkActions();
}

function updateBulkActions() {
  const checked = document.querySelectorAll('.user-checkbox:checked');
  const bulkEl = document.getElementById('bulk-actions');
  const countEl = document.getElementById('selected-count');
  if (bulkEl) {
    bulkEl.style.display = checked.length > 0 ? 'flex' : 'none';
    if (countEl) countEl.textContent = `${checked.length} selected`;
  }
}

function getSelectedUserIds() {
  return Array.from(document.querySelectorAll('.user-checkbox:checked')).map(cb => cb.value);
}

async function bulkUserAction(action) {
  const ids = getSelectedUserIds();
  if (ids.length === 0) return;
  const labels = { activate: 'activate', deactivate: 'deactivate', delete: 'permanently delete' };
  if (!confirm(`Are you sure you want to ${labels[action]} ${ids.length} user(s)?${action === 'delete' ? ' This cannot be undone!' : ''}`)) return;
  try {
    const result = await api('/api/users/bulk', { method: 'POST', body: JSON.stringify({ userIds: ids, action }) });
    alert(result.message);
    renderUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function deactivateUser(id) {
  if (!confirm('Deactivate this user?')) return;
  try {
    await api(`/api/users/${id}`, { method: 'DELETE' });
    renderUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function activateUser(id) {
  if (!confirm('Reactivate this user?')) return;
  try {
    await api(`/api/users/${id}/activate`, { method: 'PATCH' });
    renderUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteUserPermanently(id, name) {
  if (!confirm(`Permanently delete "${name}"? This cannot be undone!`)) return;
  try {
    await api(`/api/users/${id}/permanent`, { method: 'DELETE' });
    renderUsers();
  } catch (e) {
    alert(e.message);
  }
}

async function renderMeetings() {
  const content = document.getElementById('main-content');
  if (!content) return;
  try {
    const data = await api('/api/zoom');
    const canCreate = ['manager', 'lecturer', 'admin', 'superadmin'].includes(currentUser.role);
    const canManage = canCreate;

    const statusStyle = (s) => {
      const map = { scheduled: 'background:#3b82f6;color:#fff;', active: 'background:#22c55e;color:#fff;', completed: 'background:#6b7280;color:#fff;', cancelled: 'background:#ef4444;color:#fff;' };
      return map[s] || '';
    };

    content.innerHTML = `
      <div class="page-header"><h2>Meetings</h2><p>Jitsi video meetings for your organization</p></div>
      ${canCreate ? '<div class="actions-bar"><button class="btn btn-primary btn-sm" onclick="showCreateMeetingModal()">Schedule Meeting</button></div>' : ''}
      <div class="card">
        ${data.meetings.length ? `
          <table>
            <thead><tr><th>Title</th><th>Host</th><th>Scheduled</th><th>Duration</th><th>Attendees</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${data.meetings.map(m => {
              const isCreator = m.createdBy?._id === currentUser._id;
              const isAdmin = ['admin', 'superadmin'].includes(currentUser.role);
              const canControl = canManage && (isCreator || isAdmin);
              return `<tr>
                <td><strong>${m.title}</strong>${m.course ? `<div style="font-size:0.85em;color:#6b7280;">${m.course.code || m.course.title}</div>` : ''}</td>
                <td>${m.createdBy?.name || 'Unknown'}</td>
                <td style="font-size:0.85em;">${new Date(m.scheduledStart).toLocaleString()}<br><span style="color:#6b7280;">to ${new Date(m.scheduledEnd).toLocaleString()}</span></td>
                <td>${m.duration} min</td>
                <td>${m.attendees?.length || 0}</td>
                <td><span class="status-badge" style="${statusStyle(m.status)}">${m.status.charAt(0).toUpperCase() + m.status.slice(1)}</span></td>
                <td style="white-space:nowrap;">
                  ${m.status === 'active' || m.status === 'scheduled' ? `<button class="btn btn-success btn-sm" onclick="joinMeeting('${m._id}', '${m.joinUrl}')">Join</button>` : ''}
                  ${canControl && m.status === 'scheduled' ? `<button class="btn btn-primary btn-sm" onclick="startMeeting('${m._id}')" style="margin-left:4px;">Start</button>` : ''}
                  ${canControl && m.status === 'active' ? `<button class="btn btn-danger btn-sm" onclick="endMeeting('${m._id}')" style="margin-left:4px;">End</button>` : ''}
                  ${canControl && (m.status === 'scheduled' || m.status === 'active') ? `<button class="btn btn-secondary btn-sm" onclick="cancelMeeting('${m._id}')" style="margin-left:4px;">Cancel</button>` : ''}
                  <button class="btn btn-secondary btn-sm" onclick="viewMeetingDetail('${m._id}')" style="margin-left:4px;">Details</button>
                </td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No meetings scheduled yet.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

function showCreateMeetingModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:500px;">
        <h3>Schedule Jitsi Meeting</h3>
        <div class="form-group">
          <label>Title *</label>
          <input type="text" id="meeting-title" placeholder="Meeting title" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div class="form-group">
          <label>Start Time *</label>
          <input type="datetime-local" id="meeting-start" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div class="form-group">
          <label>End Time *</label>
          <input type="datetime-local" id="meeting-end" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div id="meeting-error" style="color:#ef4444;margin:8px 0;display:none;"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="createMeeting()">Schedule Meeting</button>
        </div>
      </div>
    </div>
  `;
}

async function createMeeting() {
  const title = document.getElementById('meeting-title').value.trim();
  const start = document.getElementById('meeting-start').value;
  const end = document.getElementById('meeting-end').value;
  const errEl = document.getElementById('meeting-error');

  if (!title || !start || !end) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.style.display = 'block';
    return;
  }

  try {
    await api('/api/zoom', { method: 'POST', body: JSON.stringify({
      title,
      scheduledStart: start,
      scheduledEnd: end,
    }) });
    closeModal();
    renderMeetings();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

async function startMeeting(id) {
  try {
    const data = await api(`/api/zoom/${id}/start`, { method: 'POST' });
    window.open(data.joinUrl, '_blank');
    renderMeetings();
  } catch (e) {
    alert(e.message);
  }
}

function joinMeeting(id, joinUrl) {
  const w = window.open('', '_blank');
  api(`/api/zoom/${id}/join`, { method: 'POST' }).then((data) => {
    const url = data.joinUrl || joinUrl;
    w.location.href = url;
    setTimeout(() => renderMeetings(), 1000);
  }).catch((e) => {
    w.close();
    alert(e.message || 'Failed to join meeting');
  });
}

async function endMeeting(id) {
  if (!confirm('End this meeting? All participants will be marked as left.')) return;
  try {
    await api(`/api/zoom/${id}/end`, { method: 'POST' });
    renderMeetings();
  } catch (e) {
    alert(e.message);
  }
}

async function cancelMeeting(id) {
  if (!confirm('Cancel this meeting?')) return;
  try {
    await api(`/api/zoom/${id}/cancel`, { method: 'POST' });
    renderMeetings();
  } catch (e) {
    alert(e.message);
  }
}

async function viewMeetingDetail(id) {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="card"><p>Loading meeting details...</p></div>';
  try {
    const data = await api(`/api/zoom/${id}`);
    const m = data.meeting;
    const isCreator = m.createdBy?._id === currentUser._id;
    const isAdmin = ['admin', 'superadmin'].includes(currentUser.role);
    const canManage = ['manager', 'lecturer', 'admin', 'superadmin'].includes(currentUser.role) && (isCreator || isAdmin);

    const statusStyle = (s) => {
      const map = { scheduled: 'background:#3b82f6;color:#fff;', active: 'background:#22c55e;color:#fff;', completed: 'background:#6b7280;color:#fff;', cancelled: 'background:#ef4444;color:#fff;' };
      return map[s] || '';
    };

    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">
        <div>
          <h2>${m.title}</h2>
          <p>Hosted by ${m.createdBy?.name || 'Unknown'} <span class="status-badge" style="${statusStyle(m.status)}">${m.status.charAt(0).toUpperCase() + m.status.slice(1)}</span></p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="renderMeetings()">Back to Meetings</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;">
        <div class="card">
          <div class="card-title">Meeting Info</div>
          <p><strong>Start:</strong> ${new Date(m.scheduledStart).toLocaleString()}</p>
          <p><strong>End:</strong> ${new Date(m.scheduledEnd).toLocaleString()}</p>
          <p><strong>Duration:</strong> ${m.duration} minutes</p>
          ${m.course ? `<p><strong>Course:</strong> ${m.course.code} - ${m.course.title}</p>` : ''}
          <p><strong>Join Link:</strong> <a href="${m.joinUrl}" target="_blank" style="color:#3b82f6;word-break:break-all;">${m.joinUrl}</a></p>
          <div style="margin-top:12px;">
            ${m.status === 'active' || m.status === 'scheduled' ? `<button class="btn btn-success btn-sm" onclick="joinMeeting('${m._id}', '${m.joinUrl}')">Join Meeting</button>` : ''}
            ${canManage && m.status === 'active' ? `<button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="endMeeting('${m._id}')">End Meeting</button>` : ''}
          </div>
        </div>
        <div class="card">
          <div class="card-title">Attendees (${m.attendees?.length || 0})</div>
          ${m.attendees && m.attendees.length ? `
            <table>
              <thead><tr><th>Name</th><th>Index No.</th><th>Role</th><th>Joined At</th><th>Status</th></tr></thead>
              <tbody>${m.attendees.map(a => `
                <tr>
                  <td>${a.user?.name || 'Unknown'}</td>
                  <td>${a.user?.indexNumber || '—'}</td>
                  <td>${a.user?.role || '—'}</td>
                  <td style="font-size:0.85em;">${a.joinedAt ? new Date(a.joinedAt).toLocaleString() : '—'}</td>
                  <td><span class="status-badge" style="${a.status === 'joined' ? 'background:#22c55e;color:#fff;' : a.status === 'late' ? 'background:#f59e0b;color:#fff;' : 'background:#ef4444;color:#fff;'}">${a.status}</span></td>
                </tr>
              `).join('')}</tbody>
            </table>
          ` : '<p style="color:#6b7280;">No one has joined yet.</p>'}
        </div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p><button class="btn btn-secondary" onclick="renderMeetings()">Back</button></div>`;
  }
}

async function renderCourses() {
  const content = document.getElementById('main-content');
  if (!content) return;

  if (!isOnline()) {
    const cached = offlineRead('courses');
    if (cached) {
      _renderCoursesHTML(content, cached.courses || [], true);
    } else {
      content.innerHTML = `
        <div class="page-header"><h2>My Courses</h2><p>Your enrolled courses</p></div>
        <div class="card" style="text-align:center;padding:40px">
          <div style="font-size:48px;margin-bottom:12px">📡</div>
          <div style="font-size:18px;font-weight:700">Offline</div>
          <p style="color:var(--text-light);margin-top:8px">Connect once to cache your courses for offline viewing.</p>
        </div>`;
    }
    return;
  }

  try {
    const data = await api('/api/courses');
    offlineCache('courses', data);
    const canCreate = ['lecturer', 'admin', 'superadmin'].includes(currentUser.role);
    const canManageRoster = ['lecturer', 'admin', 'superadmin'].includes(currentUser.role);
    content.innerHTML = `
      <div class="page-header"><h2>Courses</h2><p>Manage academic courses</p></div>
      ${canCreate ? '<div class="actions-bar"><button class="btn btn-primary btn-sm" onclick="showCreateCourseModal()">Create Course</button></div>' : ''}
      <div class="card">
        ${data.courses.length ? `
          <table>
            <thead><tr><th>Code</th><th>Title</th><th>Lecturer</th><th>Roster</th><th>Enrolled</th>${canManageRoster ? '<th>Actions</th>' : ''}</tr></thead>
            <tbody>${data.courses.map(c => `
              <tr>
                <td><strong>${c.code}</strong></td>
                <td>${c.title}</td>
                <td>${c.lecturer?.name || 'N/A'}</td>
                <td><button class="btn btn-sm" style="font-size:11px;background:var(--bg);border:1px solid var(--border)" onclick="viewRoster('${c._id}', '${c.code}')">View Roster</button></td>
                <td>${c.enrolledStudents?.length || 0}</td>
                ${canManageRoster ? `<td style="white-space:nowrap">
                  <button class="btn btn-primary btn-sm" style="font-size:11px" onclick="showUploadRosterModal('${c._id}', '${c.code}')">Upload Students</button>
                </td>` : ''}
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No courses found</p></div>'}
      </div>
    `;
    _renderCoursesHTML(content, data.courses || [], false);
  } catch (e) {
    const cached = offlineRead('courses');
    if (cached) {
      _renderCoursesHTML(content, cached.courses || [], true);
    } else {
      content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
    }
  }
}

function _renderCoursesHTML(content, courses, isOffline) {
  const canCreate = ['lecturer', 'admin', 'superadmin'].includes(currentUser.role);
  const canManageRoster = ['lecturer', 'admin', 'superadmin'].includes(currentUser.role);
  content.innerHTML = `
    <div class="page-header">
      <h2>Courses</h2>
      <p>Manage academic courses${isOffline ? ' <span style="color:#f59e0b;font-weight:600">(Offline — cached)</span>' : ''}</p>
    </div>
    ${canCreate && !isOffline ? '<div class="actions-bar"><button class="btn btn-primary btn-sm" onclick="showCreateCourseModal()">Create Course</button></div>' : ''}
    <div class="card">
      ${courses.length ? `
        <table>
          <thead><tr><th>Code</th><th>Title</th><th>Lecturer</th><th>Roster</th><th>Enrolled</th>${canManageRoster && !isOffline ? '<th>Actions</th>' : ''}</tr></thead>
          <tbody>${courses.map(course => `
            <tr>
              <td><strong>${course.code}</strong></td>
              <td>${course.title}</td>
              <td>${course.lecturer?.name || 'N/A'}</td>
              <td>${!isOffline ? `<button class="btn btn-sm" style="font-size:11px;background:var(--bg);border:1px solid var(--border)" onclick="viewRoster('${course._id}', '${course.code}')">View Roster</button>` : '—'}</td>
              <td>${course.enrolledStudents?.length || 0}</td>
              ${canManageRoster && !isOffline ? `<td><button class="btn btn-primary btn-sm" style="font-size:11px" onclick="showUploadRosterModal('${course._id}', '${course.code}')">Upload Students</button></td>` : ''}
            </tr>
          `).join('')}</tbody>
        </table>
      ` : '<div class="empty-state"><p>No courses found</p></div>'}
    </div>
  `;
}

function showCreateCourseModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Create Course</h3>
        <div class="form-group">
          <label>Course Code</label>
          <input type="text" id="course-code" placeholder="e.g., CS101">
        </div>
        <div class="form-group">
          <label>Course Title</label>
          <input type="text" id="course-title" placeholder="Introduction to Computer Science">
        </div>
        <div class="form-group">
          <label>Description</label>
          <input type="text" id="course-desc" placeholder="Optional description">
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="createCourse()">Create</button>
        </div>
      </div>
    </div>
  `;
}

async function createCourse() {
  try {
    await api('/api/courses', {
      method: 'POST',
      body: JSON.stringify({
        code: document.getElementById('course-code').value,
        title: document.getElementById('course-title').value,
        description: document.getElementById('course-desc').value,
      }),
    });
    closeModal();
    renderCourses();
  } catch (e) {
    alert(e.message);
  }
}

function showUploadRosterModal(courseId, courseCode) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:500px">
        <h3>Upload Student List - ${courseCode}</h3>
        <p style="font-size:13px;color:var(--text-light);margin-bottom:16px">Add student IDs so students can register. Enter one student per line: <strong>StudentID, Full Name</strong></p>
        <div class="form-group">
          <label>Student List</label>
          <textarea id="roster-text" rows="10" placeholder="STU001, John Doe&#10;STU002, Jane Smith&#10;STU003, Alex Johnson" style="width:100%;font-family:monospace;font-size:13px;resize:vertical"></textarea>
        </div>
        <p style="font-size:12px;color:var(--text-light);margin-bottom:12px">Each line should have: StudentID, Name (name is optional)</p>
        <div id="roster-upload-status" style="display:none;padding:10px;border-radius:8px;margin-bottom:12px;font-size:13px"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" id="roster-upload-btn" onclick="uploadRoster('${courseId}')">Upload Students</button>
        </div>
      </div>
    </div>
  `;
}

async function uploadRoster(courseId) {
  const text = document.getElementById('roster-text').value.trim();
  if (!text) return alert('Please enter at least one student');

  const lines = text.split('\\n').filter(l => l.trim());
  const students = lines.map(line => {
    const parts = line.split(',').map(p => p.trim());
    return { studentId: parts[0], name: parts[1] || '' };
  });

  const invalid = students.filter(s => !s.studentId);
  if (invalid.length > 0) return alert('Some lines are missing a Student ID');

  const btn = document.getElementById('roster-upload-btn');
  btn.disabled = true;
  btn.textContent = 'Uploading...';

  try {
    const data = await api(`/api/roster/${courseId}/upload`, {
      method: 'POST',
      body: JSON.stringify({ students }),
    });
    const statusEl = document.getElementById('roster-upload-status');
    statusEl.style.display = 'block';
    statusEl.style.background = '#f0fdf4';
    statusEl.style.color = '#15803d';
    statusEl.textContent = data.message;
    btn.textContent = 'Upload Students';
    btn.disabled = false;
    document.getElementById('roster-text').value = '';
  } catch (e) {
    alert(e.message);
    btn.textContent = 'Upload Students';
    btn.disabled = false;
  }
}

async function viewRoster(courseId, courseCode) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:600px">
        <h3>Student Roster - ${courseCode}</h3>
        <div id="roster-content" style="text-align:center;padding:20px"><p>Loading...</p></div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>
  `;

  try {
    const data = await api(`/api/roster/${courseId}`);
    const rosterEl = document.getElementById('roster-content');
    const canDelete = ['lecturer', 'admin', 'superadmin'].includes(currentUser.role);

    if (data.roster.length === 0) {
      rosterEl.innerHTML = '<div class="empty-state"><p>No students in roster yet. Upload a student list first.</p></div>';
      return;
    }

    const registered = data.roster.filter(r => r.registered).length;
    const pending = data.roster.length - registered;

    rosterEl.innerHTML = `
      <div style="display:flex;gap:12px;margin-bottom:16px">
        <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#16a34a">${registered}</div>
          <div style="font-size:11px;color:#15803d">Registered</div>
        </div>
        <div style="flex:1;background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:10px;text-align:center">
          <div style="font-size:20px;font-weight:700;color:#a16207">${pending}</div>
          <div style="font-size:11px;color:#a16207">Pending</div>
        </div>
      </div>
      <table style="font-size:13px">
        <thead><tr><th>Student ID</th><th>Name</th><th>Status</th>${canDelete ? '<th></th>' : ''}</tr></thead>
        <tbody>${data.roster.map(r => `
          <tr>
            <td style="font-family:monospace;font-weight:600">${r.studentId}</td>
            <td>${r.name || '-'}</td>
            <td><span class="status-badge ${r.registered ? 'status-active' : 'status-stopped'}">${r.registered ? 'Registered' : 'Pending'}</span></td>
            ${canDelete ? `<td><button class="btn btn-danger btn-sm" style="font-size:10px;padding:2px 8px" onclick="removeRosterEntry('${courseId}', '${r._id}', '${courseCode}')">Remove</button></td>` : ''}
          </tr>
        `).join('')}</tbody>
      </table>
    `;
  } catch (e) {
    document.getElementById('roster-content').innerHTML = `<p style="color:var(--danger)">Error: ${e.message}</p>`;
  }
}

async function removeRosterEntry(courseId, rosterId, courseCode) {
  if (!window.confirm('Remove this student from the roster?')) return;
  try {
    await api(`/api/roster/${courseId}/entries/${rosterId}`, { method: 'DELETE' });
    viewRoster(courseId, courseCode);
  } catch (e) {
    alert(e.message);
  }
}

let quizTimerInterval = null;

async function renderQuizzes() {
  const content = document.getElementById('main-content');
  if (!content) return;
  const role = currentUser.role;
  if (role === 'lecturer') {
    await renderLecturerQuizzes(content);
  } else if (role === 'student') {
    await renderStudentQuizzes(content);
  } else if (role === 'admin' || role === 'superadmin') {
    await renderAdminQuizzes(content);
  } else {
    content.innerHTML = '<div class="card"><p>Quizzes are not available for your role.</p></div>';
  }
}

function quizStatusBadge(q) {
  const now = new Date();
  const start = new Date(q.startTime);
  const end = new Date(q.endTime);
  if (now < start) return '<span class="status-badge" style="background:#6b7280;color:#fff;">Upcoming</span>';
  if (now > end) return '<span class="status-badge" style="background:#ef4444;color:#fff;">Closed</span>';
  return '<span class="status-badge" style="background:#22c55e;color:#fff;">Open</span>';
}

function closeQuizModal() {
  const mc = document.getElementById('modal-container');
  if (mc) { mc.classList.add('hidden'); mc.innerHTML = ''; }
}

async function renderLecturerQuizzes(content) {
  try {
    const data = await api('/api/lecturer/quizzes');
    content.innerHTML = `
      <div class="page-header"><h2>Quizzes</h2><p>Manage your quizzes and assessments</p></div>
      <div class="actions-bar"><button class="btn btn-primary btn-sm" onclick="showCreateQuizModal()">Create Quiz</button></div>
      <div class="card">
        ${data.quizzes.length ? `
          <table>
            <thead><tr><th>Title</th><th>Course</th><th>Questions</th><th>Submissions</th><th>Time Range</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${data.quizzes.map(q => `
              <tr>
                <td><strong>${q.title}</strong></td>
                <td>${q.course?.code || 'N/A'}</td>
                <td>${q.questionCount || 0}</td>
                <td>${q.attemptCount || 0}</td>
                <td style="font-size:0.85em;">${new Date(q.startTime).toLocaleString()} — ${new Date(q.endTime).toLocaleString()}</td>
                <td>${quizStatusBadge(q)}</td>
                <td style="white-space:nowrap;">
                  <button class="btn btn-sm btn-secondary" onclick="viewLecturerQuizDetail('${q._id}')">Details</button>
                  <button class="btn btn-sm btn-primary" onclick="showAddQuestionsView('${q._id}')">Questions</button>
                  <button class="btn btn-sm btn-success" onclick="viewQuizResults('${q._id}')">Results</button>
                  <button class="btn btn-sm" style="background:#dc2626;color:#fff;font-weight:700;" onclick="openLiveMonitor('${q._id}')" title="Open Live Proctor Monitor">🔴 Monitor</button>
                  <button class="btn btn-sm" style="background:#0ea5e9;color:#fff;" onclick="copyQuizId('${q._id}')" title="Copy Quiz ID">📋 ID</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteLecturerQuiz('${q._id}')">Delete</button>
                </td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No quizzes found. Create your first quiz!</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function showCreateQuizModal() {
  const mc = document.getElementById('modal-container');
  mc.classList.remove('hidden');
  mc.innerHTML = '<div class="modal-overlay"><div class="modal"><p>Loading courses...</p></div></div>';
  try {
    const coursesData = await api('/api/courses');
    const courses = coursesData.courses || [];
    mc.innerHTML = `
      <div class="modal-overlay" onclick="if(event.target===this)closeQuizModal()">
        <div class="modal" style="max-width:500px;">
          <h3>Create Quiz</h3>
          <div class="form-group"><label>Title *</label><input type="text" id="cq-title" placeholder="Quiz title" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div class="form-group"><label>Description</label><textarea id="cq-desc" placeholder="Optional description" rows="2" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></textarea></div>
          <div class="form-group"><label>Course *</label><select id="cq-course" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
            <option value="">Select a course</option>
            ${courses.map(c => `<option value="${c._id}">${c.code} - ${c.title}</option>`).join('')}
          </select></div>
          <div class="form-group"><label>Time Limit (minutes)</label><input type="number" id="cq-timelimit" value="30" min="1" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div class="form-group"><label>Start Time *</label><input type="datetime-local" id="cq-start" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div class="form-group"><label>End Time *</label><input type="datetime-local" id="cq-end" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div id="cq-error" style="color:#ef4444;margin:8px 0;display:none;"></div>
          <div class="modal-actions">
            <button class="btn btn-secondary" onclick="closeQuizModal()">Cancel</button>
            <button class="btn btn-primary" onclick="submitCreateQuiz()">Create Quiz</button>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    mc.innerHTML = `<div class="modal-overlay" onclick="if(event.target===this)closeQuizModal()"><div class="modal"><p>Error loading courses: ${e.message}</p><div class="modal-actions"><button class="btn btn-secondary" onclick="closeQuizModal()">Close</button></div></div></div>`;
  }
}

async function submitCreateQuiz() {
  const title = document.getElementById('cq-title').value.trim();
  const description = document.getElementById('cq-desc').value.trim();
  const courseId = document.getElementById('cq-course').value;
  const timeLimit = parseInt(document.getElementById('cq-timelimit').value) || 30;
  const startTime = document.getElementById('cq-start').value;
  const endTime = document.getElementById('cq-end').value;
  const errEl = document.getElementById('cq-error');

  if (!title || !courseId || !startTime || !endTime) {
    errEl.textContent = 'Please fill in all required fields.';
    errEl.style.display = 'block';
    return;
  }
  // Prevent double-submit
  const submitBtn = document.querySelector('#create-quiz-modal .btn-primary, #quiz-modal .btn-primary');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating…'; }
  try {
    const data = await api('/api/lecturer/quizzes', {
      method: 'POST',
      body: JSON.stringify({ title, description, courseId, timeLimit, startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString() })
    });
    closeQuizModal();
    showAddQuestionsView(data.quiz._id);
  } catch (e) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Quiz'; }
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

async function showAddQuestionsView(quizId) {
  const content = document.getElementById('main-content');
  if (!content) return;
  if (!content) { console.error('showAddQuestionsView: main-content element not found'); return; }
  content.innerHTML = '<div class="card"><p>Loading quiz...</p></div>';
  try {
    const data = await api(`/api/lecturer/quizzes/${quizId}`);
    const quiz = data.quiz;
    const questions = quiz.questions || [];

    content.innerHTML = `
      <div class="page-header">
        <h2>Questions: ${quiz.title}</h2>
        <p>${quiz.course?.code || ''} — ${quiz.course?.title || ''} | Total Marks: <span id="aq-total-marks">${quiz.totalMarks || 0}</span></p>
      </div>
      <div class="actions-bar" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" onclick="renderQuizzes()">← Back to Quizzes</button>
        <button class="btn btn-sm" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:600;display:flex;align-items:center;gap:5px;border:none" onclick="openAIQuizPanel('${quizId}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          ✨ AI Generate Questions
        </button>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Add New Question</h3>

        <!-- Question Type -->
        <div class="form-group" style="margin-bottom:14px;">
          <label style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;color:#6b7280;">Question Type</label>
          <div style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap;">
            <label id="aq-lbl-single" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;border:2px solid var(--primary);border-radius:8px;background:var(--primary);color:#fff;font-size:13px;font-weight:600;">
              <input type="radio" name="aq-type" value="single" checked onchange="aqToggleType('single')" style="accent-color:#fff"> Single Answer
            </label>
            <label id="aq-lbl-multi" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;border:2px solid #e5e7eb;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;">
              <input type="radio" name="aq-type" value="multiple" onchange="aqToggleType('multiple')" style="accent-color:var(--primary)"> Multiple Answers
            </label>
          </div>
          <p id="aq-type-hint" style="font-size:12px;color:#9ca3af;margin-top:5px;">One correct answer — student picks one option.</p>
        </div>

        <div class="form-group">
          <label>Question Text *</label>
          <textarea id="aq-text" rows="3" placeholder="Enter your question here…" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></textarea>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          ${['A','B','C','D'].map((l,i) => `
          <div class="form-group">
            <label>Option ${l}${i<2?' *':''}</label>
            <input type="text" id="aq-opt-${i}" placeholder="Option ${l}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
          </div>`).join('')}
        </div>

        <!-- Single: radio buttons -->
        <div id="aq-single-wrap" style="margin-bottom:12px;">
          <div class="form-group">
            <label>Correct Answer *</label>
            <div style="display:flex;gap:12px;margin-top:4px;flex-wrap:wrap;">
              ${['A','B','C','D'].map((l,i)=>`<label style="display:flex;align-items:center;gap:4px;cursor:pointer;font-size:14px;"><input type="radio" name="aq-correct" value="${i}"> ${l}</label>`).join('')}
            </div>
          </div>
        </div>

        <!-- Multiple: checkboxes -->
        <div id="aq-multi-wrap" style="display:none;margin-bottom:12px;">
          <div class="form-group">
            <label>Correct Answers * <span style="font-weight:400;color:#9ca3af;font-size:12px;">(check all that apply)</span></label>
            <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap;">
              ${['A','B','C','D'].map((l,i)=>`
              <label id="aq-cblbl-${i}" style="display:flex;align-items:center;gap:5px;padding:6px 12px;border:1.5px solid #e5e7eb;border-radius:7px;cursor:pointer;font-size:13px;font-weight:500;transition:all .15s;">
                <input type="checkbox" value="${i}" id="aq-cb-${i}" name="aq-multi-correct" onchange="aqCbChange(${i})"> ${l}
              </label>`).join('')}
            </div>
          </div>
        </div>

        <div class="form-group" style="display:inline-block;margin-right:16px;">
          <label>Marks</label>
          <input type="number" id="aq-marks" value="1" min="1" style="width:80px;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
        </div>
        <div id="aq-error" style="color:#ef4444;margin:8px 0;display:none;font-size:13px;"></div>
        <div style="margin-top:12px;"><button class="btn btn-primary" onclick="submitAddQuestion('${quizId}')">＋ Add Question</button></div>
      </div>

      <div class="card">
        <h3>Existing Questions (${questions.length})</h3>
        <div id="aq-questions-list">
          ${questions.length ? questions.map((q, i) => {
            const correctSet = new Set(q.correctAnswers?.length ? q.correctAnswers : (q.correctAnswer != null ? [q.correctAnswer] : []));
            const typeLabel = q.questionType === 'multiple'
              ? '<span style="font-size:10px;padding:2px 7px;border-radius:20px;font-weight:600;background:#ede9fe;color:#7c3aed;margin-left:6px;">MULTI</span>'
              : '<span style="font-size:10px;padding:2px 7px;border-radius:20px;font-weight:600;background:#f0f9ff;color:#0369a1;margin-left:6px;">SINGLE</span>';
            return `<div style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="flex:1;">
                  <div style="margin-bottom:6px;"><strong>Q${i+1}.</strong>${typeLabel} ${q.questionText}</div>
                  <div style="display:flex;flex-wrap:wrap;gap:5px;font-size:13px;">
                    ${q.options.map((o,oi)=>`<span style="padding:3px 9px;border-radius:6px;${correctSet.has(oi)?'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;font-weight:700;':'background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb;'}">${String.fromCharCode(65+oi)}) ${o}${correctSet.has(oi)?' ✓':''}</span>`).join('')}
                  </div>
                  <div style="font-size:12px;color:#9ca3af;margin-top:5px;">Marks: ${q.marks}</div>
                </div>
                <button class="btn btn-sm btn-danger" onclick="deleteQuizQuestion('${quizId}','${q._id}')">Delete</button>
              </div>
            </div>`;
          }).join('') : '<p style="color:#9ca3af;">No questions added yet.</p>'}
        </div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

function aqToggleType(type) {
  const isMulti = type === 'multiple';
  document.getElementById('aq-single-wrap').style.display = isMulti ? 'none' : 'block';
  document.getElementById('aq-multi-wrap').style.display  = isMulti ? 'block' : 'none';
  document.getElementById('aq-type-hint').textContent = isMulti
    ? 'Multiple correct answers — student must select all correct options.'
    : 'One correct answer — student picks one option.';
  const primStyle = 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;border:2px solid var(--primary);border-radius:8px;background:var(--primary);color:#fff;font-size:13px;font-weight:600;';
  const secStyle  = 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;border:2px solid #e5e7eb;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;';
  document.getElementById('aq-lbl-single').style.cssText = isMulti ? secStyle  : primStyle;
  document.getElementById('aq-lbl-multi').style.cssText  = isMulti ? primStyle : secStyle;
}

function aqCbChange(i) {
  const cb  = document.getElementById(`aq-cb-${i}`);
  const lbl = document.getElementById(`aq-cblbl-${i}`);
  lbl.style.borderColor = cb.checked ? 'var(--primary)' : '#e5e7eb';
  lbl.style.background  = cb.checked ? '#ede9fe' : '#fff';
  lbl.style.color       = cb.checked ? '#7c3aed' : '#374151';
}

async function submitAddQuestion(quizId) {
  const questionText = document.getElementById('aq-text').value.trim();
  const options = [0,1,2,3].map(i => document.getElementById(`aq-opt-${i}`).value.trim()).filter(o => o);
  const marks   = parseInt(document.getElementById('aq-marks').value) || 1;
  const errEl   = document.getElementById('aq-error');
  const isMulti = document.querySelector('input[name="aq-type"]:checked')?.value === 'multiple';

  errEl.style.display = 'none';
  if (!questionText) { errEl.textContent = 'Question text is required.'; errEl.style.display = 'block'; return; }
  if (options.length < 2) { errEl.textContent = 'At least 2 options are required.'; errEl.style.display = 'block'; return; }

  let body;
  if (isMulti) {
    const correctAnswers = [...document.querySelectorAll('input[name="aq-multi-correct"]:checked')].map(c => parseInt(c.value)).filter(i => i < options.length);
    if (correctAnswers.length === 0) { errEl.textContent = 'Select at least one correct answer.'; errEl.style.display = 'block'; return; }
    body = { questionText, options, questionType: 'multiple', correctAnswers, marks };
  } else {
    const radio = document.querySelector('input[name="aq-correct"]:checked');
    if (!radio) { errEl.textContent = 'Please select the correct answer.'; errEl.style.display = 'block'; return; }
    const correctAnswer = parseInt(radio.value);
    if (correctAnswer >= options.length) { errEl.textContent = 'Correct answer must match a filled option.'; errEl.style.display = 'block'; return; }
    body = { questionText, options, questionType: 'single', correctAnswer, marks };
  }

  const addBtn = document.querySelector(`button[onclick="submitAddQuestion('${quizId}')"]`);
  if (addBtn) { addBtn.disabled = true; addBtn.textContent = 'Adding…'; }
  try {
    await api(`/api/lecturer/quizzes/${quizId}/questions`, { method: 'POST', body: JSON.stringify(body) });
    showAddQuestionsView(quizId);
  } catch (e) {
    if (addBtn) { addBtn.disabled = false; addBtn.textContent = '＋ Add Question'; }
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

async function deleteQuizQuestion(quizId, questionId) {
  if (!confirm('Delete this question?')) return;
  try {
    await api(`/api/lecturer/quizzes/${quizId}/questions/${questionId}`, { method: 'DELETE' });
    showAddQuestionsView(quizId);
  } catch (e) {
    alert(e.message);
  }
}

async function viewLecturerQuizDetail(quizId) {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="card"><p>Loading...</p></div>';
  try {
    const data = await api(`/api/lecturer/quizzes/${quizId}`);
    const q = data.quiz;
    const questions = q.questions || [];
    const attempts = data.attempts || [];
    content.innerHTML = `
      <div class="page-header"><h2>${q.title}</h2><p>${q.description || 'No description'}</p></div>
      <div class="actions-bar"><button class="btn btn-secondary btn-sm" onclick="renderQuizzes()">← Back</button></div>
      <div class="card" style="margin-bottom:16px;background:linear-gradient(135deg,#0f172a,#1e293b);border:1px solid #334155;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:11px;text-transform:uppercase;font-weight:700;letter-spacing:1px;color:#38bdf8;margin-bottom:6px;">📋 Quiz ID — for Live Monitor</div>
            <div style="font-size:14px;font-family:monospace;color:#e2e8f0;background:#0f172a;padding:10px 14px;border-radius:8px;border:1px solid #334155;letter-spacing:1px;word-break:break-all;">${quizId}</div>
            <div style="font-size:12px;color:#64748b;margin-top:6px;">Click Monitor to open the live proctor view, or copy the ID to share</div>
          </div>
          <div style="display:flex;gap:8px;flex-direction:column;">
            <button class="btn btn-sm" style="background:#dc2626;color:#fff;font-weight:700;white-space:nowrap;" onclick="openLiveMonitor('${quizId}')">🔴 Open Live Monitor</button>
            <button class="btn btn-sm" style="background:#0ea5e9;color:#fff;flex-shrink:0;" onclick="copyQuizId('${quizId}')">📋 Copy ID</button>
          </div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Quiz Details</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:8px;">
          <div><strong>Course:</strong> ${q.course?.code || 'N/A'} — ${q.course?.title || ''}</div>
          <div><strong>Time Limit:</strong> ${q.timeLimit || 30} min</div>
          <div><strong>Total Marks:</strong> ${q.totalMarks || 0}</div>
          <div><strong>Questions:</strong> ${questions.length}</div>
          <div><strong>Submissions:</strong> ${attempts.length}</div>
          <div><strong>Start:</strong> ${new Date(q.startTime).toLocaleString()}</div>
          <div><strong>End:</strong> ${new Date(q.endTime).toLocaleString()}</div>
          <div><strong>Status:</strong> ${quizStatusBadge(q)}</div>
        </div>
      </div>
      <div class="card">
        <h3>Questions (${questions.length})</h3>
        ${questions.length ? questions.map((qn, i) => `
          <div style="padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
            <strong>Q${i + 1}.</strong> ${qn.questionText} <span style="color:#9ca3af;">(${qn.marks} marks)</span>
            <div style="margin-top:4px;font-size:0.9em;">
              ${qn.options.map((o, oi) => `<span style="margin-right:10px;${oi === qn.correctAnswer ? 'color:#22c55e;font-weight:bold;' : ''}">${String.fromCharCode(65 + oi)}) ${o}</span>`).join('')}
            </div>
          </div>
        `).join('') : '<p style="color:#9ca3af;">No questions.</p>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

function openLiveMonitor(quizId) {
  window.open('/proctor-dashboard.html?quizId=' + quizId, '_blank');
}

function copyQuizId(id) {
  navigator.clipboard.writeText(id).then(() => {
    // Show a brief toast-style alert
    const el = document.createElement('div');
    el.textContent = '✓ Quiz ID copied — paste it into Live Monitor';
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#0ea5e9;color:#fff;padding:12px 18px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.2);animation:fadeIn .2s ease';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  }).catch(() => {
    prompt('Copy this Quiz ID:', id);
  });
}

async function viewQuizResults(quizId) {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="card"><p>Loading results...</p></div>';
  try {
    const data = await api(`/api/lecturer/quizzes/${quizId}/results`);
    const quiz = data.quiz;
    const stats = data.stats;
    const attempts = data.attempts || [];
    content.innerHTML = `
      <div class="page-header"><h2>Results: ${quiz.title}</h2><p>${quiz.course?.code || ''} — ${quiz.course?.title || ''}</p></div>
      <div class="actions-bar"><button class="btn btn-secondary btn-sm" onclick="renderQuizzes()">← Back</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#3b82f6;">${stats.submitted}</div><div style="color:#6b7280;font-size:0.9em;">Submitted</div></div>
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#22c55e;">${stats.averageScore}</div><div style="color:#6b7280;font-size:0.9em;">Avg Score</div></div>
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#f59e0b;">${stats.passRate}%</div><div style="color:#6b7280;font-size:0.9em;">Pass Rate</div></div>
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#8b5cf6;">${stats.highestScore}/${quiz.totalMarks || 0}</div><div style="color:#6b7280;font-size:0.9em;">Highest</div></div>
      </div>
      <div class="card">
        <h3>Student Submissions</h3>
        ${attempts.length ? `
          <table>
            <thead><tr><th>Student</th><th>ID</th><th>Score</th><th>Percentage</th><th>Submitted At</th></tr></thead>
            <tbody>${attempts.map(a => {
              const pct = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0;
              return `<tr>
                <td>${a.student?.name || 'Unknown'}</td>
                <td>${a.student?.indexNumber || a.student?.email || 'N/A'}</td>
                <td>${a.score}/${a.maxScore}</td>
                <td><span style="color:${pct >= 50 ? '#22c55e' : '#ef4444'};font-weight:bold;">${pct}%</span></td>
                <td>${a.submittedAt ? new Date(a.submittedAt).toLocaleString() : 'N/A'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No submissions yet.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function deleteLecturerQuiz(quizId) {
  if (!confirm('Are you sure you want to delete this quiz? All questions and submissions will be removed.')) return;
  try {
    await api(`/api/lecturer/quizzes/${quizId}`, { method: 'DELETE' });
    renderQuizzes();
  } catch (e) {
    alert(e.message);
  }
}

async function renderStudentQuizzes(content, showAll) {
  try {
    const url = showAll ? '/api/student/quizzes?showAll=true' : '/api/student/quizzes';
    const data = await api(url);
    // Deduplicate: same title + startTime => keep the one with most questions
    const raw = data.quizzes || [];
    const seen = new Map();
    raw.forEach(q => {
      const key = q.title + '_' + new Date(q.startTime).getTime();
      const existing = seen.get(key);
      if (!existing || (q.questionCount||0) > (existing.questionCount||0)) seen.set(key, q);
    });
    const quizzes = Array.from(seen.values());
    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">
        <div><h2>Quizzes</h2><p>Your available quizzes and assessments</p></div>
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9em;">
          <input type="checkbox" ${showAll ? 'checked' : ''} onchange="renderStudentQuizzes(document.getElementById('main-content'), this.checked)">
          Show past & upcoming
        </label>
      </div>
      <div class="card">
        ${quizzes.length ? `
          <table>
            <thead><tr><th>Title</th><th>Course</th><th>Questions</th><th>Time Limit</th><th>Start Time</th><th>End Time</th><th>Status</th><th>Score</th><th>Actions</th></tr></thead>
            <tbody>${quizzes.map(q => {
              const statusColors = { upcoming: 'background:#6b7280;color:#fff;', open: 'background:#22c55e;color:#fff;', closed: 'background:#ef4444;color:#fff;' };
              const statusLabel = q.status ? q.status.charAt(0).toUpperCase() + q.status.slice(1) : 'Unknown';
              return `<tr>
                <td><strong>${q.title}</strong>${q.description ? `<div style="font-size:0.85em;color:#6b7280;">${q.description}</div>` : ''}</td>
                <td>${q.course?.code || 'N/A'}</td>
                <td>${q.questionCount || 0}</td>
                <td>${q.timeLimit || 30} min</td>
                <td style="font-size:0.85em;">${new Date(q.startTime).toLocaleString()}</td>
                <td style="font-size:0.85em;">${new Date(q.endTime).toLocaleString()}</td>
                <td><span class="status-badge" style="${statusColors[q.status] || ''}">${statusLabel}</span></td>
                <td>${q.isSubmitted ? `<strong style="color:#3b82f6;">${q.myScore}/${q.myMaxScore}</strong>` : '—'}</td>
                <td style="white-space:nowrap;">
                  ${q.canAttempt ? `<button class="btn btn-sm btn-primary" onclick="startStudentQuiz('${q._id}')">Take Quiz</button>` : ''}
                  ${q.isSubmitted ? `<button class="btn btn-sm btn-secondary" onclick="viewStudentResult('${q._id}')">View Result</button>` : ''}
                </td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No quizzes available at the moment.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function startStudentQuiz(quizId) {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="card"><p>Loading quiz...</p></div>';
  if (quizTimerInterval) { clearInterval(quizTimerInterval); quizTimerInterval = null; }

  try {
    const data = await api(`/api/student/quizzes/${quizId}/start`, { method: 'POST' });
    const questions = data.questions || [];
    const timeLimit = data.timeLimit || 30;
    const attempt = data.attempt;
    const startedAt = new Date(attempt.startedAt);
    const endTime = new Date(startedAt.getTime() + timeLimit * 60 * 1000);

    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">
        <div><h2>Quiz in Progress</h2><p>${questions.length} questions — ${timeLimit} minutes</p></div>
        <div id="quiz-timer" style="font-size:1.4em;font-weight:bold;color:#ef4444;background:#fef2f2;padding:8px 16px;border-radius:8px;"></div>
      </div>
      <div id="quiz-questions">
        ${questions.map((q, i) => `
          <div class="card" style="margin-bottom:12px;">
            <h4>Question ${i + 1} of ${questions.length} <span style="color:#9ca3af;font-weight:normal;font-size:0.85em;">(${q.marks || 1} marks)</span></h4>
            <p style="margin:8px 0;">${q.questionText}</p>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${q.options.map((opt, oi) => `
                <label style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background=''">
                  <input type="radio" name="sq-${q._id}" value="${oi}" style="accent-color:#3b82f6;">
                  <span><strong>${String.fromCharCode(65 + oi)}.</strong> ${opt}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
      <div style="text-align:center;margin:16px 0;">
        <button class="btn btn-primary" style="padding:12px 32px;font-size:1.1em;" onclick="submitStudentQuiz('${quizId}')">Submit Quiz</button>
        <button class="btn btn-secondary" style="margin-left:8px;" onclick="if(confirm('Go back? Your progress will be lost.'))renderQuizzes()">Cancel</button>
      </div>
    `;

    window._quizQuestions = questions;

    function updateTimer() {
      const now = new Date();
      const remaining = Math.max(0, endTime - now);
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      const timerEl = document.getElementById('quiz-timer');
      if (timerEl) {
        timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')} remaining`;
        if (remaining <= 60000) timerEl.style.color = '#dc2626';
      }
      if (remaining <= 0) {
        clearInterval(quizTimerInterval);
        quizTimerInterval = null;
        submitStudentQuiz(quizId);
      }
    }
    updateTimer();
    quizTimerInterval = setInterval(updateTimer, 1000);

    window._quizTabHandler = function() {
      if (document.hidden && window._quizQuestions && window._quizQuestions.length > 0 && !window._quizSubmitting) {
        window._quizSubmitting = true;
        submitStudentQuiz(quizId);
      }
    };
    document.addEventListener('visibilitychange', window._quizTabHandler);

  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p><button class="btn btn-secondary" onclick="renderQuizzes()">← Back</button></div>`;
  }
}

async function submitStudentQuiz(quizId) {
  if (window._quizTabHandler) {
    document.removeEventListener('visibilitychange', window._quizTabHandler);
    window._quizTabHandler = null;
  }
  window._quizSubmitting = false;
  if (quizTimerInterval) { clearInterval(quizTimerInterval); quizTimerInterval = null; }
  const questions = window._quizQuestions || [];
  const answers = questions.map(q => {
    const selected = document.querySelector(`input[name="sq-${q._id}"]:checked`);
    return { questionId: q._id, selectedAnswer: selected ? parseInt(selected.value) : -1 };
  });

  const content = document.getElementById('main-content');
  if (!content) return;
  try {
    const data = await api(`/api/student/quizzes/${quizId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers })
    });
    const pct = data.percentage || 0;
    content.innerHTML = `
      <div style="max-width:500px;margin:40px auto;text-align:center;">
        <div class="card">
          <div style="font-size:3em;margin-bottom:8px;">${pct >= 50 ? '🎉' : '📝'}</div>
          <h2>Quiz Submitted!</h2>
          <div style="font-size:2.5em;font-weight:bold;color:${pct >= 50 ? '#22c55e' : '#ef4444'};margin:16px 0;">${pct}%</div>
          <p style="font-size:1.1em;color:#6b7280;">Score: ${data.score} / ${data.maxScore}</p>
          <div style="margin-top:20px;">
            <button class="btn btn-primary" onclick="viewStudentResult('${quizId}')">View Detailed Result</button>
            <button class="btn btn-secondary" style="margin-left:8px;" onclick="renderQuizzes()">Back to Quizzes</button>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error submitting quiz: ${e.message}</p><button class="btn btn-secondary" onclick="renderQuizzes()">← Back</button></div>`;
  }
}

async function viewStudentResult(quizId) {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="card"><p>Loading result...</p></div>';
  try {
    const data = await api(`/api/student/quizzes/${quizId}/result`);
    const attempt = data.attempt;
    const answers = data.answers || [];
    const pct = attempt.maxScore > 0 ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;

    content.innerHTML = `
      <div class="page-header">
        <h2>Quiz Result: ${attempt.quiz?.title || 'Quiz'}</h2>
        <p>Score: <strong style="color:${pct >= 50 ? '#22c55e' : '#ef4444'};">${attempt.score}/${attempt.maxScore} (${pct}%)</strong></p>
      </div>
      <div class="actions-bar"><button class="btn btn-secondary btn-sm" onclick="renderQuizzes()">← Back to Quizzes</button></div>
      <div id="result-questions">
        ${answers.map((a, i) => {
          const q = a.question;
          if (!q) return '';
          return `
            <div class="card" style="margin-bottom:12px;border-left:4px solid ${a.isCorrect ? '#22c55e' : '#ef4444'};">
              <h4>Question ${i + 1} <span style="color:#9ca3af;font-weight:normal;font-size:0.85em;">(${q.marks || 1} marks)</span></h4>
              <p style="margin:8px 0;">${q.questionText}</p>
              <div style="display:flex;flex-direction:column;gap:6px;">
                ${q.options.map((opt, oi) => {
                  let style = 'padding:8px 12px;border-radius:6px;border:1px solid #e5e7eb;';
                  if (oi === q.correctAnswer) style += 'background:#f0fdf4;border-color:#22c55e;color:#15803d;';
                  if (oi === a.selectedAnswer && !a.isCorrect) style += 'background:#fef2f2;border-color:#ef4444;color:#dc2626;';
                  return `<div style="${style}">
                    <strong>${String.fromCharCode(65 + oi)}.</strong> ${opt}
                    ${oi === q.correctAnswer ? ' ✓ Correct' : ''}
                    ${oi === a.selectedAnswer && oi !== q.correctAnswer ? ' ✗ Your answer' : ''}
                    ${oi === a.selectedAnswer && oi === q.correctAnswer ? ' ✓ Your answer' : ''}
                  </div>`;
                }).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p><button class="btn btn-secondary" onclick="renderQuizzes()">← Back</button></div>`;
  }
}

async function renderAdminQuizzes(content) {
  try {
    const data = await api('/api/admin/quizzes');
    const quizzes = data.quizzes || [];
    content.innerHTML = `
      <div class="page-header"><h2>All Quizzes</h2><p>Overview of quizzes across all lecturers</p></div>
      <div class="card">
        ${quizzes.length ? `
          <table>
            <thead><tr><th>Title</th><th>Lecturer</th><th>Course</th><th>Questions</th><th>Submissions</th><th>Avg Score</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>${quizzes.map(q => `
              <tr>
                <td><strong>${q.title}</strong></td>
                <td>${q.createdBy?.name || 'Unknown'}</td>
                <td>${q.course?.code || 'N/A'}</td>
                <td>${q.questionCount || 0}</td>
                <td>${q.attemptCount || 0}</td>
                <td>${q.averageScore || 0}</td>
                <td>${quizStatusBadge(q)}</td>
                <td><button class="btn btn-sm btn-secondary" onclick="viewAdminQuizDetail('${q._id}')">View</button></td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No quizzes found.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function viewAdminQuizDetail(quizId) {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="card"><p>Loading...</p></div>';
  try {
    const data = await api(`/api/admin/quizzes/${quizId}`);
    const quiz = data.quiz;
    const questions = data.questions || [];
    const attempts = data.attempts || [];
    const stats = data.stats || {};

    content.innerHTML = `
      <div class="page-header"><h2>${quiz.title}</h2><p>${quiz.description || 'No description'} — by ${quiz.createdBy?.name || 'Unknown'}</p></div>
      <div class="actions-bar"><button class="btn btn-secondary btn-sm" onclick="renderQuizzes()">← Back</button></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:16px;">
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#3b82f6;">${stats.submitted || 0}</div><div style="color:#6b7280;font-size:0.9em;">Submitted</div></div>
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#22c55e;">${stats.averageScore || 0}</div><div style="color:#6b7280;font-size:0.9em;">Avg Score</div></div>
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#f59e0b;">${stats.highestScore || 0}</div><div style="color:#6b7280;font-size:0.9em;">Highest</div></div>
        <div class="card" style="text-align:center;"><div style="font-size:1.8em;font-weight:bold;color:#ef4444;">${stats.lowestScore || 0}</div><div style="color:#6b7280;font-size:0.9em;">Lowest</div></div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Quiz Info</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-top:8px;">
          <div><strong>Course:</strong> ${quiz.course?.code || 'N/A'} — ${quiz.course?.title || ''}</div>
          <div><strong>Time Limit:</strong> ${quiz.timeLimit || 30} min</div>
          <div><strong>Total Marks:</strong> ${quiz.totalMarks || 0}</div>
          <div><strong>Start:</strong> ${new Date(quiz.startTime).toLocaleString()}</div>
          <div><strong>End:</strong> ${new Date(quiz.endTime).toLocaleString()}</div>
          <div><strong>Status:</strong> ${quizStatusBadge(quiz)}</div>
        </div>
      </div>
      <div class="card" style="margin-bottom:16px;">
        <h3>Questions (${questions.length})</h3>
        ${questions.length ? questions.map((qn, i) => `
          <div style="padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
            <strong>Q${i + 1}.</strong> ${qn.questionText} <span style="color:#9ca3af;">(${qn.marks} marks)</span>
            <div style="margin-top:4px;font-size:0.9em;">
              ${qn.options.map((o, oi) => `<span style="margin-right:10px;${oi === qn.correctAnswer ? 'color:#22c55e;font-weight:bold;' : ''}">${String.fromCharCode(65 + oi)}) ${o}</span>`).join('')}
            </div>
          </div>
        `).join('') : '<p style="color:#9ca3af;">No questions.</p>'}
      </div>
      <div class="card">
        <h3>Student Submissions (${attempts.length})</h3>
        ${attempts.length ? `
          <table>
            <thead><tr><th>Student</th><th>ID</th><th>Score</th><th>Percentage</th><th>Submitted</th></tr></thead>
            <tbody>${attempts.map(a => {
              const pct = a.maxScore > 0 ? Math.round((a.score / a.maxScore) * 100) : 0;
              return `<tr>
                <td>${a.student?.name || 'Unknown'}</td>
                <td>${a.student?.indexNumber || a.student?.email || 'N/A'}</td>
                <td>${a.score}/${a.maxScore}</td>
                <td><span style="color:${pct >= 50 ? '#22c55e' : '#ef4444'};font-weight:bold;">${pct}%</span></td>
                <td>${a.submittedAt ? new Date(a.submittedAt).toLocaleString() : 'N/A'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No submissions yet.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p><button class="btn btn-secondary" onclick="renderQuizzes()">← Back</button></div>`;
  }
}

async function renderMyAttendance() {
  const content = document.getElementById('main-content');
  if (!content) return;
  try {
    const data = await api('/api/attendance-sessions/my-attendance');
    content.innerHTML = `
      <div class="page-header"><h2>My Attendance</h2><p>Your attendance history</p></div>
      <div class="actions-bar">
        <button class="btn btn-primary btn-sm" onclick="showMarkAttendanceModal()">Mark Attendance</button>
      </div>
      <div class="card">
        ${data.records.length ? `
          <table>
            <thead><tr><th>Session</th><th>Status</th><th>Method</th><th>Check-in Time</th></tr></thead>
            <tbody>${data.records.map(r => `
              <tr>
                <td>${r.session?.title || 'N/A'}</td>
                <td><span class="status-badge status-${r.status}">${r.status}</span></td>
                <td>${r.method}</td>
                <td>${new Date(r.checkInTime).toLocaleString()}</td>
              </tr>
            `).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No attendance records yet</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function renderMarkAttendance() {
  const content = document.getElementById('main-content');
  if (!content) return;

  // Offline: show queued state and cached session info
  if (!isOnline()) {
    const cachedSession = offlineRead('activeSession');
    const pendingMark = offlineRead('pendingMark');
    const pendingCount = offlineQueueCount();

    content.innerHTML = `
      <div class="page-header"><h2>Mark Attendance</h2><p>Check in to active sessions</p></div>
      <div class="card" style="border-left:4px solid #f59e0b;background:#fffbeb;margin-bottom:16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
          <span style="font-size:20px">📶</span>
          <div>
            <div style="font-weight:700;color:#92400e">You're offline</div>
            <div style="font-size:12px;color:#b45309">Your attendance will be submitted when you reconnect</div>
          </div>
        </div>
        ${pendingCount > 0 ? `<div style="font-size:12px;font-weight:600;color:#92400e;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:6px 12px;margin-top:8px">${pendingCount} pending action${pendingCount!==1?'s':''} will sync automatically</div>` : ''}
      </div>
      ${cachedSession ? `
        <div class="card" style="border-left:4px solid var(--success);background:#f0fdf4;margin-bottom:16px">
          <div style="font-size:12px;text-transform:uppercase;color:var(--success);font-weight:700">Last Known Active Session</div>
          <div style="font-size:18px;font-weight:700;margin-top:4px">${cachedSession.title || 'Untitled Session'}</div>
          <div style="font-size:13px;color:var(--text-light);margin-top:2px">Started ${new Date(cachedSession.startedAt).toLocaleString()}</div>
        </div>
        ${pendingMark ? `
          <div class="card" style="text-align:center;border-left:4px solid var(--primary)">
            <div style="font-size:36px;margin-bottom:8px">⏳</div>
            <div style="font-size:18px;font-weight:700;color:var(--primary)">Attendance Queued</div>
            <p style="font-size:13px;color:var(--text-light);margin-top:4px">Will be submitted when you go back online</p>
          </div>
        ` : `
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">
            <div class="card mark-method-card" onclick="showCodeEntryOffline()" style="cursor:pointer;text-align:center;transition:all 0.2s">
              <div style="font-size:42px;margin-bottom:12px">🔢</div>
              <div style="font-size:16px;font-weight:700">Enter Code</div>
              <p style="font-size:12px;color:var(--text-light);margin-top:4px">Type the 6-digit code — will sync when online</p>
            </div>
          </div>
          <div id="mark-input-area" style="margin-top:16px"></div>
        `}
      ` : `
        <div class="card" style="text-align:center;padding:40px 20px">
          <div style="font-size:48px;margin-bottom:12px">📡</div>
          <div style="font-size:18px;font-weight:700;margin-bottom:8px">No Cached Session</div>
          <p style="font-size:14px;color:var(--text-light)">Go online at least once to load session data for offline use.</p>
        </div>
      `}
    `;
    return;
  }

  let activeSession = null;
  try {
    const data = await api('/api/attendance-sessions/active');
    activeSession = data.session;
    if (activeSession) offlineCache('activeSession', activeSession); // cache for offline
  } catch (e) {}

  const alreadyMarked = activeSession ? await api('/api/attendance-sessions/my-attendance?limit=100')
    .then(d => d.records.some(r => r.session?._id === activeSession._id))
    .catch(() => false) : false;

  content.innerHTML = `
    <div class="page-header">
      <h2>Mark Attendance</h2>
      <p>Check in to active sessions</p>
    </div>
    
    ${activeSession ? `
      <div class="card" style="border-left: 4px solid var(--success); background: #f0fdf4">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:12px;text-transform:uppercase;color:var(--success);font-weight:700;letter-spacing:0.5px">Active Session</div>
            <div style="font-size:18px;font-weight:700;margin-top:4px">${activeSession.title || 'Untitled Session'}</div>
            <div style="font-size:13px;color:var(--text-light);margin-top:2px">Started ${new Date(activeSession.startedAt).toLocaleString()} by ${activeSession.createdBy?.name || 'Unknown'}</div>
            ${activeSession.course ? `<div style="font-size:13px;color:var(--text-light)">Course: ${activeSession.course.title || activeSession.course.code || ''}</div>` : ''}
          </div>
          <span class="status-badge status-active" style="font-size:13px;padding:6px 14px">LIVE</span>
        </div>
      </div>
      
      ${alreadyMarked ? `
        <div class="card" style="text-align:center;border-left:4px solid var(--primary)">
          <div style="font-size:48px;margin-bottom:8px">${svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 48)}</div>
          <div style="font-size:18px;font-weight:700;color:var(--success)">Attendance Already Marked</div>
          <p style="font-size:13px;color:var(--text-light);margin-top:4px">You have already checked in for this session.</p>
        </div>
      ` : `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:16px">
          <div class="card mark-method-card" onclick="showCodeEntry()" style="cursor:pointer;text-align:center;transition:all 0.2s">
            <div style="font-size:36px;margin-bottom:12px">${svgIcon('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 7h.01M7 12h.01M12 7h.01M12 12h.01M17 7h.01M7 17h.01M12 17h.01M17 12h.01M17 17h.01"/>', 42)}</div>
            <div style="font-size:16px;font-weight:700">Enter Code</div>
            <p style="font-size:12px;color:var(--text-light);margin-top:4px">Type the 6-digit code shown by your lecturer</p>
          </div>
          
          <div class="card mark-method-card" onclick="showQrEntry()" style="cursor:pointer;text-align:center;transition:all 0.2s">
            <div style="font-size:36px;margin-bottom:12px">${svgIcon('<rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="4" height="4"/><path d="M18 14h4v4M14 18h4v4"/>', 42)}</div>
            <div style="font-size:16px;font-weight:700">QR Code</div>
            <p style="font-size:12px;color:var(--text-light);margin-top:4px">Enter QR token from your lecturer's screen</p>
          </div>
          
          <div class="card mark-method-card" onclick="markBLE()" style="cursor:pointer;text-align:center;transition:all 0.2s">
            <div style="font-size:36px;margin-bottom:12px">${svgIcon('<path d="M6.5 6.5l11 11M6.5 17.5l11-11M12 2v20"/>', 42)}</div>
            <div style="font-size:16px;font-weight:700">BLE Proximity</div>
            <p style="font-size:12px;color:var(--text-light);margin-top:4px">Auto-detect via Bluetooth proximity</p>
          </div>
          
          <div class="card mark-method-card" onclick="showJitsiJoin()" style="cursor:pointer;text-align:center;transition:all 0.2s">
            <div style="font-size:36px;margin-bottom:12px">${svgIcon('<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>', 42)}</div>
            <div style="font-size:16px;font-weight:700">Join Meeting</div>
            <p style="font-size:12px;color:var(--text-light);margin-top:4px">Mark attendance by joining the session meeting</p>
          </div>
        </div>
        
        <div id="mark-input-area"></div>
      `}
    ` : `
      <div class="card" style="text-align:center;padding:40px 20px">
        <div style="margin-bottom:16px">${svgIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>', 48)}</div>
        <div style="font-size:18px;font-weight:700;margin-bottom:8px">No Active Session</div>
        <p style="font-size:14px;color:var(--text-light)">There are no active attendance sessions right now.</p>
        <p style="font-size:13px;color:var(--text-light);margin-top:8px">Your lecturer will start a session when it's time to mark attendance.</p>
        <button class="btn btn-secondary btn-sm" style="margin-top:16px" onclick="navigateTo('mark-attendance')">Refresh</button>
      </div>
    `}
  `;
}

function showCodeEntry() {
  const area = document.getElementById('mark-input-area');
  if (!area) return;
  area.innerHTML = `
    <div class="card">
      <div class="card-title">Enter Attendance Code</div>
      <div class="form-group">
        <label>6-Digit Code</label>
        <input type="text" id="mark-code-input" placeholder="Enter code" maxlength="6" style="font-size:24px;text-align:center;letter-spacing:8px;font-weight:700" autofocus>
      </div>
      <button class="btn btn-primary" onclick="submitCodeMark()" style="width:100%">Submit Code</button>
    </div>
  `;
  document.getElementById('mark-code-input')?.focus();
}

function showQrEntry() {
  const area = document.getElementById('mark-input-area');
  if (!area) return;
  area.innerHTML = `
    <div class="card">
      <div class="card-title">Enter QR Token</div>
      <div class="form-group">
        <label>QR Token String</label>
        <input type="text" id="mark-qr-input" placeholder="Paste QR token here" autofocus>
      </div>
      <button class="btn btn-primary" onclick="submitQrMark()" style="width:100%">Verify & Check In</button>
    </div>
  `;
  document.getElementById('mark-qr-input')?.focus();
}

async function submitCodeMark() {
  const code = document.getElementById('mark-code-input')?.value;
  if (!code || code.length !== 6) return alert('Please enter a valid 6-digit code');

  if (!isOnline()) {
    offlineEnqueue({
      label: `Mark attendance (code: ${code})`,
      url: '/api/attendance-sessions/mark',
      options: { method: 'POST', body: JSON.stringify({ code, method: 'code_mark' }) }
    });
    offlineCache('pendingMark', { code, method: 'code_mark', queuedAt: Date.now() });
    showToastNotif('📶 Attendance queued — will sync when online', 'warn');
    navigateTo('mark-attendance');
    return;
  }

  try {
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ code, method: 'code_mark' }),
    });
    offlineCache('pendingMark', null); // clear pending flag
    alert('Attendance marked successfully!');
    navigateTo('mark-attendance');
  } catch (e) {
    alert(e.message);
  }
}

// Offline code entry (same as online but available when offline)
function showCodeEntryOffline() {
  const area = document.getElementById('mark-input-area');
  if (!area) return;
  area.innerHTML = `
    <div class="card">
      <div class="card-title">Enter Attendance Code</div>
      <div style="font-size:12px;color:#92400e;background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:6px 12px;margin-bottom:12px">
        📶 Offline — code will be submitted automatically when you reconnect
      </div>
      <div class="form-group">
        <label>6-Digit Code</label>
        <input type="text" id="mark-code-input" placeholder="Enter code" maxlength="6"
          style="font-size:24px;text-align:center;letter-spacing:8px;font-weight:700" autofocus>
      </div>
      <button class="btn btn-primary" onclick="submitCodeMark()" style="width:100%">Queue Attendance</button>
    </div>
  `;
  document.getElementById('mark-code-input')?.focus();
}

async function submitQrMark() {
  const qrToken = document.getElementById('mark-qr-input')?.value;
  if (!qrToken) return alert('Please enter the QR token');

  if (!isOnline()) {
    offlineEnqueue({
      label: 'Mark attendance (QR)',
      url: '/api/attendance-sessions/mark',
      options: { method: 'POST', body: JSON.stringify({ qrToken, method: 'qr_mark' }) }
    });
    offlineCache('pendingMark', { method: 'qr_mark', queuedAt: Date.now() });
    showToastNotif('📶 QR attendance queued — will sync when online', 'warn');
    navigateTo('mark-attendance');
    return;
  }

  try {
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ qrToken, method: 'qr_mark' }),
    });
    offlineCache('pendingMark', null);
    alert('Attendance marked successfully!');
    navigateTo('mark-attendance');
  } catch (e) {
    alert(e.message);
  }
}

async function markBLE() {
  try {
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ method: 'ble_mark' }),
    });
    alert('BLE attendance marked successfully!');
    navigateTo('mark-attendance');
  } catch (e) {
    alert(e.message);
  }
}

async function showJitsiJoin() {
  const area = document.getElementById('mark-input-area');
  if (!area) return;
  let meetingsHtml = '<p style="color:var(--text-light);font-size:13px">Loading meetings...</p>';
  try {
    const data = await api('/api/zoom');
    const available = data.meetings.filter(m => m.status === 'scheduled' || m.status === 'active');
    if (available.length > 0) {
      meetingsHtml = available.map(m => `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px">
          <div>
            <div style="font-weight:600;font-size:14px">${m.title}</div>
            <div style="font-size:12px;color:var(--text-light)">${new Date(m.scheduledStart).toLocaleString()} — ${m.duration} min</div>
            <span class="status-badge" style="${m.status === 'active' ? 'background:#22c55e;color:#fff;' : 'background:#3b82f6;color:#fff;'}font-size:11px;margin-top:4px;">${m.status === 'active' ? 'Live' : 'Scheduled'}</span>
          </div>
          <button class="btn btn-success btn-sm" onclick="submitJitsiJoin('${m._id}', '${m.joinUrl || ''}')">Join & Mark</button>
        </div>
      `).join('');
    } else {
      meetingsHtml = '<p style="color:var(--text-light);font-size:13px">No available meetings found.</p>';
    }
  } catch (e) {
    meetingsHtml = '<p style="color:var(--text-light);font-size:13px">Could not load meetings.</p>';
  }
  area.innerHTML = `
    <div class="card">
      <div class="card-title">Join Meeting to Mark Attendance</div>
      ${meetingsHtml}
    </div>
  `;
}

async function submitJitsiJoin(meetingId, joinUrl) {
  try {
    await api(`/api/zoom/${meetingId}/join`, { method: 'POST' });
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ method: 'jitsi_join', meetingId }),
    });
    alert('Attendance marked via meeting join!');
    if (joinUrl) window.open(joinUrl, '_blank');
    navigateTo('mark-attendance');
  } catch (e) {
    alert(e.message);
  }
}

function showMarkAttendanceModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Mark Attendance</h3>
        <p style="font-size:13px;color:var(--text-light);margin-bottom:16px">Enter the 6-digit code shown by your lecturer or manager.</p>
        <div class="form-group">
          <label>6-Digit Code</label>
          <input type="text" id="attend-code" placeholder="Enter code" maxlength="6" style="font-size:22px;text-align:center;letter-spacing:8px;font-weight:700" autofocus>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="markAttendance()">Submit</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('attend-code')?.focus();
}

async function markAttendance() {
  try {
    const code = document.getElementById('attend-code').value;
    if (!code || code.length < 4) return alert('Please enter a valid code');
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ code, method: 'code_mark' }),
    });
    closeModal();
    alert('Attendance marked successfully!');
    renderMyAttendance();
  } catch (e) {
    alert(e.message);
  }
}

async function renderSubscription() {
  const content = document.getElementById('main-content');
  if (!content) return;
  try {
    const [statusData, plansData] = await Promise.all([
      api('/api/payments/status'),
      api('/api/payments/plans'),
    ]);

    const sub = statusData.subscription || {};
    const trial = statusData.trial || {};
    const trialTimeRemaining = trial.timeRemaining || { days: 0, hours: 0, minutes: 0 };

    content.innerHTML = `
      <div class="page-header"><h2>Subscription</h2><p>Manage your subscription plan</p></div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value" style="color:${statusData.hasAccess ? 'var(--success)' : 'var(--danger)'}">${statusData.hasAccess ? 'Active' : 'Inactive'}</div>
          <div class="stat-label">Access Status</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${sub.active ? sub.plan : trial.active ? 'Trial' : 'None'}</div>
          <div class="stat-label">Current Plan</div>
        </div>
        ${trial.active ? `
          <div class="stat-card">
            <div class="stat-value">${trial.daysRemaining || 0}</div>
            <div class="stat-label">Trial Days Left</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${trialTimeRemaining.days}d ${trialTimeRemaining.hours}h ${trialTimeRemaining.minutes}m</div>
            <div class="stat-label">Time Remaining</div>
          </div>
        ` : ''}
      </div>

      <div class="card">
        <div class="card-title">Available Plans</div>
        <div class="stats-grid">
          ${(plansData.plans || []).map(p => `
            <div class="stat-card">
              <div class="stat-value" style="font-size:18px">${p.name}</div>
              <div style="margin-top:12px">
                <p style="font-size:13px;color:var(--text-light)">Stripe: ${p.stripe ? p.stripe.label : 'N/A'}</p>
                <p style="font-size:13px;color:var(--text-light)">Paystack: ${p.paystack ? p.paystack.label : 'N/A'}</p>
              </div>
              <div style="margin-top:12px">
                <button class="btn btn-primary btn-sm" onclick="subscribePlan('${p.id}', 'stripe')">Pay with Stripe ($)</button>
                <button class="btn btn-success btn-sm" style="margin-top:4px" onclick="subscribePlan('${p.id}', 'paystack')">Pay with Paystack (GHS)</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      ${!trial.active && !sub.active ? `
        <div class="card" style="background:#fef2f2;border-color:#fecaca">
          <p style="color:var(--danger);font-weight:600">Your free trial has ended. Please subscribe via Paystack or Stripe to continue using premium features.</p>
        </div>
      ` : ''}
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

async function subscribePlan(plan, provider) {
  if (provider === 'paystack') {
    try {
      const data = await api('/api/payments/paystack/initialize', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      } else {
        alert('Could not get payment URL. Please try again.');
      }
    } catch (e) {
      alert(e.message);
    }
  } else {
    alert('Stripe is not available. Please use Paystack (GHS).');
  }
}


async function renderSearch() {
  const content = document.getElementById('main-content');
  if (!content) return;
  const mode = currentUser.company?.mode || 'corporate';
  const isAcademic = mode === 'academic';
  const role = currentUser.role;
  const canSeeAdmins = (role === 'admin' || role === 'superadmin');

  // inject filter button styles once
  if (!document.getElementById('search-filter-styles')) {
    const style = document.createElement('style');
    style.id = 'search-filter-styles';
    style.textContent = '.search-filter-btn{padding:6px 14px;border-radius:20px;border:1px solid var(--border);background:var(--bg);color:var(--text-light);font-size:12px;cursor:pointer;transition:all .15s}.search-filter-btn.active,.search-filter-btn:hover{background:var(--primary);color:#fff;border-color:var(--primary)}';
    document.head.appendChild(style);
  }

  let filterBtns = '<button class="search-filter-btn active" onclick="setSearchFilter(\'all\', this)">All</button>';
  if (isAcademic) {
    filterBtns += '<button class="search-filter-btn" onclick="setSearchFilter(\'student\', this)">Students</button>';
    filterBtns += '<button class="search-filter-btn" onclick="setSearchFilter(\'lecturer\', this)">Lecturers</button>';
  } else {
    filterBtns += '<button class="search-filter-btn" onclick="setSearchFilter(\'employee\', this)">Employees</button>';
    filterBtns += '<button class="search-filter-btn" onclick="setSearchFilter(\'manager\', this)">Managers</button>';
  }
  if (canSeeAdmins) {
    filterBtns += '<button class="search-filter-btn" onclick="setSearchFilter(\'admin\', this)">Admins</button>';
  }

  const placeholder = isAcademic
    ? 'Search by name, email, index number...'
    : 'Search by name, email, employee ID...';

  content.innerHTML =
    '<div class="page-header"><h2>Search</h2><p>Find ' + (isAcademic ? 'students, lecturers, or staff' : 'employees or staff') + ' quickly</p></div>' +
    '<div class="card" style="margin-bottom:16px">' +
      '<div style="display:flex;gap:10px;align-items:center">' +
        '<input type="text" id="search-input" placeholder="' + placeholder + '" style="flex:1;padding:12px 16px;border:1px solid var(--border);border-radius:8px;font-size:14px;outline:none" oninput="debounceSearch()" onkeydown="if(event.key===\'Enter\')doSearch()">' +
        '<button class="btn btn-primary" onclick="doSearch()" style="padding:12px 20px">Search</button>' +
      '</div>' +
      '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap" id="search-filters">' + filterBtns + '</div>' +
    '</div>' +
    '<div id="search-results">' +
      '<div class="empty-state" style="padding:40px 20px;text-align:center;color:var(--text-light)">' +
        '<p>Enter a name, email' + (isAcademic ? ', or index number' : ', or employee ID') + ' to search</p>' +
      '</div>' +
    '</div>';
}

let searchFilter = 'all';
let searchDebounceTimer = null;

function setSearchFilter(filter, btn) {
  searchFilter = filter;
  document.querySelectorAll('.search-filter-btn').forEach(function(b) { b.classList.remove('active'); });
  btn.classList.add('active');
  doSearch();
}

function debounceSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(doSearch, 350);
}

async function doSearch() {
  var query = document.getElementById('search-input') ? document.getElementById('search-input').value.trim() : '';
  var resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;

  if (!query || query.length < 2) {
    resultsEl.innerHTML = '<div class="card"><div class="empty-state"><p>Enter at least 2 characters to search</p></div></div>';
    return;
  }

  resultsEl.innerHTML = '<div class="card"><p>Searching...</p></div>';

  try {
    var params = new URLSearchParams({ q: query });
    if (searchFilter !== 'all') params.append('role', searchFilter);
    var data = await api('/api/search?' + params.toString());
    var users = data.users || [];
    var mode = currentUser.company ? currentUser.company.mode || 'corporate' : 'corporate';

    if (users.length === 0) {
      resultsEl.innerHTML = '<div class="card"><div class="empty-state"><p>No users found for "' + query + '"</p></div></div>';
      return;
    }

    var rows = users.map(function(u) {
      var idCol = mode === 'academic'
        ? '<td>' + (u.indexNumber || u.email || '—') + '</td>'
        : '<td>' + (u.email || '—') + '</td><td>' + (u.employeeId || '—') + '</td>';
      var activeClass = u.isActive ? 'status-active' : 'status-stopped';
      var activeLabel = u.isActive ? 'Active' : 'Inactive';
      return '<tr><td style="font-weight:600">' + u.name + '</td>' + idCol +
        '<td><span class="role-badge role-' + u.role + '">' + u.role + '</span></td>' +
        '<td><span class="status-badge ' + activeClass + '">' + activeLabel + '</span></td>' +
        '<td style="font-size:12px;color:var(--text-light)">' + new Date(u.createdAt).toLocaleDateString() + '</td></tr>';
    }).join('');

    var headerCols = mode === 'academic'
      ? '<th>Index / Email</th>'
      : '<th>Email</th><th>Employee ID</th>';

    resultsEl.innerHTML =
      '<div class="card">' +
        '<div class="card-title" style="margin-bottom:12px">' + users.length + ' result' + (users.length !== 1 ? 's' : '') + ' for "<strong>' + query + '</strong>"</div>' +
        '<table><thead><tr><th>Name</th>' + headerCols + '<th>Role</th><th>Status</th><th>Joined</th></tr></thead>' +
        '<tbody>' + rows + '</tbody></table>' +
      '</div>';
  } catch (e) {
    resultsEl.innerHTML = '<div class="card"><p style="color:var(--danger)">Search failed: ' + e.message + '</p></div>';
  }
}


function renderReports() {
  const content = document.getElementById('main-content');
  if (!content) return;
  const role = currentUser.role;
  const mode = currentUser.company?.mode || 'corporate';
  const isAcademic = mode === 'academic';
  const isAdmin = ['admin', 'superadmin'].includes(role);

  if (isAdmin) {
    renderAdminReports(content, isAcademic);
    return;
  }

  let cards = '';
  const isStaff = ['manager', 'lecturer'].includes(role);

  cards += reportCard(
    '#6366f1', '#8b5cf6',
    '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    'Attendance Report',
    isStaff ? 'All attendance records across your sessions' : 'Your personal attendance history',
    'attendance', 'reports'
  );

  if (isStaff) {
    cards += reportCard(
      '#0ea5e9', '#06b6d4',
      '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      'Sessions Report',
      role === 'lecturer' ? 'Summary of your attendance sessions' : 'All sessions in your institution',
      'sessions', 'reports'
    );
  }

  if (isAcademic && (role === 'lecturer' || role === 'student')) {
    cards += reportCard(
      '#f59e0b', '#f97316',
      '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      'Performance Report',
      role === 'student' ? 'Your quiz scores and performance' : 'Quiz scores and student performance',
      'performance', 'reports'
    );
  }

  content.innerHTML = `
    <div class="page-header"><h2>Reports</h2><p>Download reports as PDF with one click</p></div>
    <div class="reports-grid">${cards}</div>
  `;
}

function reportCard(c1, c2, iconPath, title, desc, type, apiBase) {
  const downloadIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  return `
    <div class="report-card" style="--report-gradient:linear-gradient(135deg,${c1},${c2});--report-shadow:${c1}33" onclick="downloadReport('${type}','${apiBase}', event)">
      <div class="report-card-icon">
        ${svgIcon(iconPath, 28)}
      </div>
      <div class="report-card-title">${title}</div>
      <div class="report-card-desc">${desc}</div>
      <button class="report-card-btn" onclick="event.stopPropagation(); downloadReport('${type}','${apiBase}', event)">
        ${downloadIcon} Download PDF
      </button>
    </div>`;
}

function renderAdminReports(content, isAcademic) {
  let cards = '';

  cards += reportCard(
    '#4f46e5', '#6366f1',
    '<path d="M3 3h18v18H3z"/><path d="M3 9h18"/><path d="M9 21V9"/>',
    'Institution Summary',
    'Complete overview: users, attendance, subscription, and academic data',
    'summary', 'admin/reports'
  );

  cards += reportCard(
    '#6366f1', '#8b5cf6',
    '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    'Attendance Overview',
    'Institution-wide attendance with per-session breakdown and individual records',
    'attendance', 'admin/reports'
  );

  cards += reportCard(
    '#0ea5e9', '#06b6d4',
    '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'Session Report',
    'Duration tracking, attendee counts, and suspicious session flagging',
    'sessions', 'admin/reports'
  );

  if (isAcademic) {
    cards += reportCard(
      '#8b5cf6', '#a78bfa',
      '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
      'Performance Report',
      'Quiz analytics: per-course scores, pass rates, and all submissions',
      'performance', 'admin/reports'
    );

    cards += reportCard(
      '#10b981', '#059669',
      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
      'Lecturer Performance',
      'Compare lecturers: sessions, courses, student engagement, and records',
      'lecturers', 'admin/reports'
    );
  }

  cards += reportCard(
    '#f59e0b', '#f97316',
    isAcademic
      ? '<path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 4 3 6 3s6-1 6-3v-5"/>'
      : '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>',
    isAcademic ? 'Student Analytics' : 'Employee Analytics',
    isAcademic
      ? 'Attendance rates, course enrollments, and quiz score averages'
      : 'Attendance rates and participation metrics per employee',
    'students', 'admin/reports'
  );

  content.innerHTML = `
    <div class="page-header">
      <h2>Admin Reports</h2>
      <p>Full institution analytics — click any report card to download as PDF</p>
    </div>
    <div class="reports-grid">${cards}</div>
  `;
}

async function downloadReport(type, apiBase = 'reports', e) {
  const btn = e ? e.target.closest('.report-card-btn') || e.target.closest('.btn') : null;
  const card = btn ? btn.closest('.report-card') : null;
  const originalHTML = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = 'Generating...';
    btn.disabled = true;
    btn.style.opacity = '0.7';
  }
  if (card) card.style.pointerEvents = 'none';
  try {
    const headers = { 'Authorization': `Bearer ${token}` };
    const res = await fetch(`${API}/api/${apiBase}/${type}`, { headers });
    if (!res.ok) {
      let errMsg = 'Failed to generate report';
      try { const err = await res.json(); errMsg = err.error; } catch(e) {}
      throw new Error(errMsg);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-report.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(err.message);
  } finally {
    if (btn) {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
      btn.style.opacity = '';
    }
    if (card) card.style.pointerEvents = '';
  }
}

// ── View who has marked attendance for a session (offline-aware) ──────────────
async function viewAttendees(sessionId, sessionTitle) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:600px;width:95%">
        <h3>Attendees — ${sessionTitle}</h3>
        <div id="attendees-content"><div class="spinner" style="margin:20px auto"></div></div>
        <div class="modal-actions" style="justify-content:space-between">
          <button class="btn btn-sm" style="background:#16a34a;color:#fff" onclick="exportSessionCSV('${sessionId}', '${sessionTitle}')">⬇ Export CSV</button>
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Close</button>
        </div>
      </div>
    </div>`;

  const el = document.getElementById('attendees-content');
  const cacheKey = 'attendees_' + sessionId;

  if (!isOnline()) {
    const cached = offlineRead(cacheKey);
    if (cached) {
      _renderAttendeesHTML(el, cached, true);
    } else {
      el.innerHTML = `<div class="card" style="text-align:center;padding:24px">
        <div style="font-size:36px">📡</div>
        <p style="margin-top:8px;color:var(--text-light)">No cached data. Connect once to view attendees offline.</p>
      </div>`;
    }
    return;
  }

  try {
    const data = await api(`/api/attendance-sessions/${sessionId}/records`);
    offlineCache(cacheKey, data); // cache for offline
    _renderAttendeesHTML(el, data, false);
  } catch (e) {
    const cached = offlineRead(cacheKey);
    if (cached) {
      _renderAttendeesHTML(el, cached, true);
    } else {
      el.innerHTML = `<p style="color:var(--danger)">Error: ${e.message}</p>`;
    }
  }
}

function _renderAttendeesHTML(el, data, isOffline) {
  const records = data.records || [];
  el.innerHTML = `
    ${isOffline ? `<div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:6px;padding:8px 12px;font-size:12px;font-weight:600;color:#92400e;margin-bottom:12px">📶 Showing cached data</div>` : ''}
    <div style="font-size:13px;color:var(--text-light);margin-bottom:12px">${records.length} student${records.length!==1?'s':''} checked in</div>
    ${records.length ? `
      <table>
        <thead><tr><th>Name</th><th>ID</th><th>Method</th><th>Time</th><th>Status</th></tr></thead>
        <tbody>${records.map(r => `
          <tr>
            <td>${r.student?.name || 'N/A'}</td>
            <td style="font-family:monospace;font-size:12px">${r.student?.indexNumber || r.student?.email || '—'}</td>
            <td><span style="background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:2px 6px;font-size:11px">${r.method || '—'}</span></td>
            <td style="font-size:12px">${r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString() : '—'}</td>
            <td><span class="status-badge status-${r.status}">${r.status}</span></td>
          </tr>
        `).join('')}</tbody>
      </table>
    ` : '<div class="empty-state"><p>No one has checked in yet</p></div>'}
  `;
}

function closeModal(event) {
  if (event && event.target !== event.currentTarget) return;
  _stopQrTimers(); // always clean up QR rotation if active
  document.getElementById('modal-container').classList.add('hidden');
  document.getElementById('modal-container').innerHTML = '';
}

if (token) {
  loadUserData();
}



// ══════════════════════════════════════════════════════════════════════════════
//  FEATURE: PROFILE PAGE
// ══════════════════════════════════════════════════════════════════════════════
async function renderProfile() {
  const content = document.getElementById('main-content');
  if (!content) return;
  const u = currentUser;
  content.innerHTML = `
    <div class="page-header"><h2>My Profile</h2><p>Manage your account details</p></div>
    <div class="card" style="max-width:520px">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--border)">
        <div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#6366f1);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:700;color:#fff;flex-shrink:0">
          ${(u.name||'?')[0].toUpperCase()}
        </div>
        <div>
          <div style="font-size:18px;font-weight:700">${u.name || 'N/A'}</div>
          <div style="font-size:13px;color:var(--text-light)">${u.email || u.indexNumber || ''}</div>
          <span class="role-badge role-${u.role}" style="margin-top:4px;display:inline-block">${u.role}</span>
        </div>
      </div>

      <div id="profile-msg" style="display:none;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px"></div>

      <div style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">Update Name</h3>
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="profile-name" value="${u.name || ''}" placeholder="Your full name">
        </div>
      </div>

      <div style="margin-bottom:20px;padding-top:20px;border-top:1px solid var(--border)">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">Change Password</h3>
        <div class="form-group">
          <label>Current Password</label>
          <input type="password" id="profile-current-pw" placeholder="Enter current password">
        </div>
        <div class="form-group">
          <label>New Password</label>
          <input type="password" id="profile-new-pw" placeholder="Min 8 characters">
        </div>
        <div class="form-group">
          <label>Confirm New Password</label>
          <input type="password" id="profile-confirm-pw" placeholder="Repeat new password">
        </div>
      </div>

      <button class="btn btn-primary" onclick="saveProfile()" style="width:100%">Save Changes</button>
    </div>
  `;
}

async function saveProfile() {
  const name = document.getElementById('profile-name').value.trim();
  const currentPassword = document.getElementById('profile-current-pw').value;
  const newPassword = document.getElementById('profile-new-pw').value;
  const confirmPw = document.getElementById('profile-confirm-pw').value;
  const msg = document.getElementById('profile-msg');

  if (newPassword && newPassword !== confirmPw) {
    msg.textContent = 'New passwords do not match'; msg.style.background = '#fef2f2'; msg.style.color = '#dc2626'; msg.style.display = 'block'; return;
  }
  if (newPassword && newPassword.length < 8) {
    msg.textContent = 'Password must be at least 8 characters'; msg.style.background = '#fef2f2'; msg.style.color = '#dc2626'; msg.style.display = 'block'; return;
  }

  const body = {};
  if (name) body.name = name;
  if (newPassword) { body.currentPassword = currentPassword; body.newPassword = newPassword; }

  try {
    const data = await api('/api/auth/profile', { method: 'PUT', body: JSON.stringify(body) });
    if (data.user?.name) { currentUser.name = data.user.name; document.getElementById('user-name').textContent = data.user.name; }
    msg.textContent = '✅ Profile updated successfully!'; msg.style.background = '#f0fdf4'; msg.style.color = '#15803d'; msg.style.display = 'block';
    document.getElementById('profile-current-pw').value = '';
    document.getElementById('profile-new-pw').value = '';
    document.getElementById('profile-confirm-pw').value = '';
    setTimeout(() => { msg.style.display = 'none'; }, 4000);
  } catch(e) {
    msg.textContent = e.message; msg.style.background = '#fef2f2'; msg.style.color = '#dc2626'; msg.style.display = 'block';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  FEATURE: CONTACT / SUPPORT PAGE
// ══════════════════════════════════════════════════════════════════════════════
function renderContact() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = `
    <div class="page-header"><h2>Contact Us</h2><p>Get in touch with KODEX support</p></div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:24px">

      <div class="card" style="text-align:center">
        <div style="font-size:36px;margin-bottom:12px">📧</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:6px">Email</div>
        <p style="font-size:13px;color:var(--text-light);margin-bottom:12px">Send us an email anytime</p>
        <a href="mailto:nelsonkel78@gmail.com" class="btn btn-primary btn-sm" style="display:inline-block;text-decoration:none">nelsonkel78@gmail.com</a>
      </div>

      <div class="card" style="text-align:center">
        <div style="font-size:36px;margin-bottom:12px">📞</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:6px">Phone</div>
        <p style="font-size:13px;color:var(--text-light);margin-bottom:12px">Call us during business hours</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          <a href="tel:+233559545339" class="btn btn-secondary btn-sm" style="text-decoration:none">0559545339</a>
          <a href="tel:+233536143117" class="btn btn-secondary btn-sm" style="text-decoration:none">0536143117</a>
          <a href="tel:+233534707844" class="btn btn-secondary btn-sm" style="text-decoration:none">0534707844</a>
        </div>
      </div>

      <div class="card" style="text-align:center">
        <div style="font-size:36px;margin-bottom:12px">💬</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:6px">WhatsApp</div>
        <p style="font-size:13px;color:var(--text-light);margin-bottom:12px">Chat with us on WhatsApp</p>
        <div style="display:flex;flex-direction:column;gap:6px">
          <a href="https://wa.me/233559545339" target="_blank" class="btn btn-sm" style="background:#25d366;color:#fff;text-decoration:none">0559545339</a>
          <a href="https://wa.me/233536143117" target="_blank" class="btn btn-sm" style="background:#25d366;color:#fff;text-decoration:none">0536143117</a>
          <a href="https://wa.me/233534707844" target="_blank" class="btn btn-sm" style="background:#25d366;color:#fff;text-decoration:none">0534707844</a>
        </div>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:16px">Frequently Asked Questions</h3>
      ${[
        ["How do I reset a student's password?", 'Go to Users, find the student, and use the Reset Password action. The student will receive a reset code.'],
        ["Why can't a student mark attendance?", 'Ensure there is an active session running and the student is enrolled in the correct course roster.'],
        ['How do I add students to a course?', 'Go to Courses, select the course, and use the Upload Students button to add students via CSV or manually.'],
        ['What happens when the subscription expires?', 'Access is suspended after the trial/subscription period. Contact us to renew your subscription.'],
        ['Can students use the system offline?', 'Yes — students can mark attendance offline using a code. It will sync automatically when they reconnect.'],
      ].map(([q, a]) => `
        <div style="padding:14px 0;border-bottom:1px solid var(--border)">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">❓ ${q}</div>
          <div style="font-size:13px;color:var(--text-light)">${a}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════════════
//  FEATURE: ANNOUNCEMENTS / NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════
// Stored in localStorage per company (simple in-app announcements)
function getAnnouncements() {
  try {
    const key = 'announcements_' + (currentUser?.company?._id || currentUser?.company || 'default');
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch(e) { return []; }
}

function saveAnnouncements(list) {
  try {
    const key = 'announcements_' + (currentUser?.company?._id || currentUser?.company || 'default');
    localStorage.setItem(key, JSON.stringify(list));
  } catch(e) {}
}

function renderAnnouncements() {
  const content = document.getElementById('main-content');
  if (!content) return;
  const canPost = ['admin', 'lecturer', 'manager', 'superadmin'].includes(currentUser.role);
  const announcements = getAnnouncements();

  content.innerHTML = `
    <div class="page-header"><h2>Announcements</h2><p>Institution-wide notices and updates</p></div>

    ${canPost ? `
    <div class="card" style="margin-bottom:16px">
      <h3 style="margin-bottom:12px">Post Announcement</h3>
      <div class="form-group">
        <label>Title</label>
        <input type="text" id="ann-title" placeholder="e.g. Class cancelled tomorrow">
      </div>
      <div class="form-group">
        <label>Message</label>
        <textarea id="ann-body" rows="3" placeholder="Enter your announcement..." style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;resize:vertical"></textarea>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select id="ann-type" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--bg-primary);color:var(--text-primary)">
          <option value="info">ℹ️ Info</option>
          <option value="warning">⚠️ Warning</option>
          <option value="success">✅ Good News</option>
          <option value="urgent">🚨 Urgent</option>
        </select>
        <button class="btn btn-primary btn-sm" onclick="postAnnouncement()">Post</button>
      </div>
    </div>
    ` : ''}

    <div id="announcements-list">
      ${announcements.length ? announcements.slice().reverse().map(a => `
        <div class="card" style="margin-bottom:12px;border-left:4px solid ${
          a.type==='warning'?'#f59e0b':a.type==='success'?'#22c55e':a.type==='urgent'?'#ef4444':'var(--primary)'}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px">
            <div style="flex:1">
              <div style="font-weight:700;font-size:15px;margin-bottom:4px">${a.title}</div>
              <div style="font-size:13px;color:var(--text-light);margin-bottom:8px">${a.body}</div>
              <div style="font-size:11px;color:var(--text-light)">
                Posted by ${a.author} · ${new Date(a.ts).toLocaleString()}
              </div>
            </div>
            ${canPost ? `<button onclick="deleteAnnouncement('${a.id}')" style="background:none;border:none;cursor:pointer;color:var(--text-light);font-size:18px;padding:0 4px" title="Delete">×</button>` : ''}
          </div>
        </div>
      `).join('') : '<div class="card"><div class="empty-state"><p>No announcements yet</p></div></div>'}
    </div>
  `;
}

function postAnnouncement() {
  const title = document.getElementById('ann-title').value.trim();
  const body  = document.getElementById('ann-body').value.trim();
  const type  = document.getElementById('ann-type').value;
  if (!title || !body) return alert('Please enter a title and message');

  const list = getAnnouncements();
  list.push({ id: Date.now().toString(), title, body, type, author: currentUser.name || currentUser.role, ts: Date.now() });
  saveAnnouncements(list);
  renderAnnouncements();
}

function deleteAnnouncement(id) {
  const list = getAnnouncements().filter(a => a.id !== id);
  saveAnnouncements(list);
  renderAnnouncements();
}

// ══════════════════════════════════════════════════════════════════════════════
//  FEATURE: SESSION ATTENDANCE CSV EXPORT
// ══════════════════════════════════════════════════════════════════════════════
async function exportSessionCSV(sessionId, sessionTitle) {
  try {
    const data = await api('/api/attendance-sessions/' + sessionId + '/records');
    const records = data.records || [];
    if (!records.length) { alert('No attendance records to export'); return; }

    const rows = [
      ['Name', 'Student ID / Email', 'Method', 'Check-in Time', 'Status'],
      ...records.map(r => [
        r.student?.name || 'N/A',
        r.student?.indexNumber || r.student?.email || 'N/A',
        r.method || 'N/A',
        r.checkInTime ? new Date(r.checkInTime).toLocaleString() : 'N/A',
        r.status || 'N/A',
      ])
    ];

    const csv = rows.map(row => row.map(v => '"' + String(v).replace(/"/g, '""')+'"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (sessionTitle || 'attendance') + '_' + new Date().toISOString().slice(0,10) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch(e) { alert('Export failed: ' + e.message); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  FEATURE: ABOUT / VERSION PAGE
// ══════════════════════════════════════════════════════════════════════════════
function renderAbout() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = `
    <div class="page-header"><h2>About</h2><p>KODEX KODEX Platform</p></div>
    <div class="card" style="max-width:540px;text-align:center;padding:40px 32px">
      <div style="width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,var(--primary),#6366f1);display:flex;align-items:center;justify-content:center;margin:0 auto 20px">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
      </div>
      <div style="font-size:26px;font-weight:800;margin-bottom:4px">KODEX</div>
      <div style="font-size:14px;color:var(--text-light);margin-bottom:4px">KODEX Platform</div>
      <div style="display:inline-block;background:var(--bg);border:1px solid var(--border);border-radius:999px;padding:4px 14px;font-size:12px;font-weight:600;color:var(--text-light);margin-bottom:28px">Version 1.0.0</div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:28px;text-align:left">
        ${[
          ['🎓', 'Academic Mode', 'Courses, lecturers, students & proctored quizzes'],
          ['🏢', 'Corporate Mode', 'Employee attendance, sign-in/out & reporting'],
          ['📶', 'Offline Support', 'Mark & manage attendance without internet'],
          ['🔒', 'Secure Proctoring', 'AI-powered face detection & integrity scoring'],
          ['📊', 'Live Monitoring', 'Real-time attendance dashboard & CSV export'],
          ['🔔', 'Announcements', 'Broadcast messages to your institution'],
        ].map(([icon, title, desc]) => `
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px">
            <div style="font-size:20px;margin-bottom:4px">${icon}</div>
            <div style="font-weight:700;font-size:13px">${title}</div>
            <div style="font-size:12px;color:var(--text-light);margin-top:2px">${desc}</div>
          </div>
        `).join('')}
      </div>

      <div style="font-size:13px;color:var(--text-light);padding-top:20px;border-top:1px solid var(--border)">
        Built by <strong style="color:var(--text-primary)">KODEX</strong> &nbsp;·&nbsp;
        <a href="mailto:nelsonkel78@gmail.com" style="color:var(--primary)">nelsonkel78@gmail.com</a><br>
        <span style="font-size:12px">&copy; 2025 KODEX. All rights reserved.</span>
      </div>
    </div>
  `;
}


// ── Service Worker Registration ───────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('[SW] Registered:', reg.scope))
      .catch(err => console.warn('[SW] Registration failed:', err));
  });
}

// ══════════════════════════════════════════════════════════════════════════════
//  MOBILE UI MODULE
//  - Hamburger sidebar drawer (tablet)
//  - Bottom navigation bar (phone)
// ══════════════════════════════════════════════════════════════════════════════

function toggleMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar || !overlay) return;
  const isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    closeMobileSidebar();
  } else {
    // 'sidebar-force-open' class beats display:none !important via specificity
    sidebar.classList.add('sidebar-force-open');
    requestAnimationFrame(() => {
      sidebar.classList.add('open');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    });
  }
}

function closeMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (sidebar) {
    sidebar.classList.remove('open');
    // Remove force-show class after transition completes
    setTimeout(() => {
      if (!sidebar.classList.contains('open')) {
        sidebar.classList.remove('sidebar-force-open');
      }
    }, 300);
  }
  if (overlay) overlay.classList.remove('active');
  document.body.style.overflow = '';
}

// Close sidebar when a nav item is tapped on mobile
document.addEventListener('click', (e) => {
  const navLink = e.target.closest('.sidebar-nav a');
  if (navLink && window.innerWidth <= 768) {
    closeMobileSidebar();
  }
});

// Close sidebar on resize if screen becomes large
window.addEventListener('resize', () => {
  if (window.innerWidth > 768) closeMobileSidebar();
});

function buildBottomNav(role) {
  const existing = document.getElementById('bottom-nav');
  if (existing) existing.remove();

  // Priority items per role — most-used actions shown directly in bottom bar
  // Everything else is accessible via the sidebar (More button)
  const PRIORITY = {
    admin:      ['dashboard', 'sessions', 'reports', 'subscription'],
    manager:    ['dashboard', 'sessions', 'reports', 'users'],
    lecturer:   ['dashboard', 'sessions', 'quizzes', 'assignments'],
    employee:   ['dashboard', 'sign-in-out', 'my-attendance', 'reports'],
    student:    ['dashboard', 'mark-attendance', 'quizzes', 'assignments'],
    superadmin: ['dashboard', 'sessions', 'quizzes', 'reports'],
  };

  const ICONS = {
    dashboard:       '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>',
    sessions:        '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    quizzes:         '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M9 14l2 2 4-4"/>',
    reports:         '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    subscription:    '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
    users:           '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    'sign-in-out':   '<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    'my-attendance': '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    'mark-attendance':'<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    courses:         '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    approvals:       '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    meetings:        '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
    assignments:     '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    announcements:   '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    search:          '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    profile:         '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  };

  const LABELS = {
    'sign-in-out': 'Sign In/Out', 'my-attendance': 'Attendance',
    'mark-attendance': 'Attendance', subscription: 'Subscribe',
    announcements: 'Notices', assignments: 'Assignments',
  };

  const priority = PRIORITY[role] || ['dashboard', 'sessions', 'reports'];

  const nav = document.createElement('div');
  nav.id = 'bottom-nav';
  nav.className = 'bottom-nav';

  priority.forEach(id => {
    const icon = ICONS[id] || ICONS.dashboard;
    const label = LABELS[id] || (id.charAt(0).toUpperCase() + id.slice(1));
    const btn = document.createElement('button');
    btn.className = 'bottom-nav-item';
    btn.dataset.navId = id;
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg><span>${label}</span>`;
    btn.onclick = () => {
      document.querySelectorAll('.bottom-nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // Trigger the matching sidebar link
      const sidebarLink = document.getElementById('nav-' + id);
      if (sidebarLink) sidebarLink.click();
      else navigateTo(id);
      closeMobileSidebar();
    };
    nav.appendChild(btn);
  });

  // More button — opens full sidebar for everything else
  const moreBtn = document.createElement('button');
  moreBtn.className = 'bottom-nav-item';
  moreBtn.id = 'bottom-nav-more';
  moreBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg><span>More</span>`;
  moreBtn.onclick = () => toggleMobileSidebar();
  nav.appendChild(moreBtn);

  document.body.appendChild(nav);

  // Sync active state when navigation changes
  const observer = new MutationObserver(() => {
    const activeLink = document.querySelector('.sidebar-nav a.active');
    if (!activeLink) return;
    const activeId = activeLink.id?.replace('nav-', '');
    document.querySelectorAll('.bottom-nav-item').forEach(b => {
      b.classList.toggle('active', b.dataset.navId === activeId);
    });
  });
  const sidebarNav = document.getElementById('sidebar-nav');
  if (sidebarNav) observer.observe(sidebarNav, { attributes: true, subtree: true, attributeFilter: ['class'] });
  // Mark dashboard active by default
  const dashBtn = nav.querySelector('[data-nav-id="dashboard"]');
  if (dashBtn) dashBtn.classList.add('active');
}


// Robust JSON extractor — handles LaTeX backslashes and MATHSTART/MATHEND placeholders
function restoreMathPlaceholders(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/MATHSTART/g, '\\(').replace(/MATHEND/g, '\\)')
              .replace(/DISPSTART/g, '\\[').replace(/DISPEND/g, '\\]');
  }
  if (Array.isArray(obj)) return obj.map(restoreMathPlaceholders);
  if (obj && typeof obj === 'object') {
    const out = {};
    for (const k in obj) out[k] = restoreMathPlaceholders(obj[k]);
    return out;
  }
  return obj;
}

function extractAIJson(raw) {
  // Strip markdown fences
  let text = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  // Find the JSON array boundaries
  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON array found in AI response. Try again.');
  text = text.slice(start, end + 1);
  // Try direct parse first
  try { return restoreMathPlaceholders(JSON.parse(text)); } catch(e1) {
    // Fix unescaped backslashes that LaTeX produces
    try {
      const fixed = text.replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
      return restoreMathPlaceholders(JSON.parse(fixed));
    } catch(e2) {
      // Last resort: use Function constructor to evaluate as JS
      try {
        // eslint-disable-next-line no-new-func
        return restoreMathPlaceholders(Function('return ' + text)());
      } catch(e3) {
        throw new Error('Could not parse AI response. Please try again.');
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  AI QUESTION GENERATION — app.js (main dashboard / mobile)
//  Mirrors the same modal in assignments.html but lives here for the
//  main-app quiz flow (showAddQuestionsView → openAIQuizPanel)
// ══════════════════════════════════════════════════════════════════════════════

let _aiQuizQuestions = [];

function openAIQuizPanel(quizId) {
  const existing = document.getElementById('ai-quiz-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ai-quiz-overlay';
  overlay.dataset.quizId = quizId;
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)';
  overlay.innerHTML = `
    <div style="background:var(--card);border-radius:16px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;box-shadow:0 25px 80px rgba(0,0,0,.25);animation:slideIn .25s cubic-bezier(.16,1,.3,1)">
      <div style="padding:18px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:var(--card);z-index:1">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,#7c3aed,#4f46e5);display:flex;align-items:center;justify-content:center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </div>
          <div>
            <h3 style="font-size:16px;font-weight:700;margin:0">AI Question Generator</h3>
            <p style="font-size:12px;color:var(--text-muted);margin:0">Powered by Claude AI</p>
          </div>
        </div>
        <button onclick="document.getElementById('ai-quiz-overlay').remove()" style="width:28px;height:28px;border-radius:7px;border:1px solid var(--border);background:var(--bg);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center">✕</button>
      </div>
      <div style="padding:18px 22px;display:flex;flex-direction:column;gap:14px">
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:6px;display:block">Topic / Subject <span style="color:#dc2626">*</span></label>
          <input id="aiq-topic" placeholder="e.g. Photosynthesis, Newton's laws, Python loops…" style="width:100%;padding:10px 13px;border:1.5px solid var(--border);border-radius:9px;font-size:14px;font-family:inherit;outline:none" onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='var(--border)'"/>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:6px;display:block">Questions</label>
            <select id="aiq-count" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;font-size:14px;font-family:inherit;outline:none">
              <option value="3">3</option><option value="5" selected>5</option><option value="8">8</option><option value="10">10</option><option value="15">15</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:6px;display:block">Difficulty</label>
            <select id="aiq-difficulty" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;font-size:14px;font-family:inherit;outline:none">
              <option value="easy">Easy</option><option value="medium" selected>Medium</option><option value="hard">Hard</option><option value="mixed">Mixed</option>
            </select>
          </div>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:8px;display:block">Question Type</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:7px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-weight:500"><input type="radio" name="aiq-qtype" value="single" checked style="accent-color:var(--primary)"/> Single Answer</label>
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:7px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-weight:500"><input type="radio" name="aiq-qtype" value="multiple" style="accent-color:var(--primary)"/> Multiple Answers</label>
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:7px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-weight:500"><input type="radio" name="aiq-qtype" value="mixed" style="accent-color:var(--primary)"/> Mixed</label>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:90px 1fr;gap:12px;align-items:start">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:6px;display:block">Marks/Q</label>
            <input id="aiq-marks" type="number" value="1" min="1" style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:9px;font-size:14px;font-family:inherit;outline:none"/>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:6px;display:block">Additional Context <span style="font-weight:400;text-transform:none;letter-spacing:0;color:var(--text-muted)">(optional)</span></label>
            <textarea id="aiq-context" rows="2" placeholder="e.g. Year 10 level, focus on cellular respiration…" style="width:100%;padding:10px 13px;border:1.5px solid var(--border);border-radius:9px;font-size:14px;font-family:inherit;resize:vertical;outline:none" onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='var(--border)'"></textarea>
          </div>
        </div>
        <!-- Subject toggle -->
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:8px;display:block">Subject Area</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <label id="aiq-subj-gen" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:7px 14px;border:1.5px solid var(--primary);border-radius:8px;background:var(--primary);color:#fff;font-size:13px;font-weight:600">
              <input type="radio" name="aiq-subject" value="general" checked onchange="aiqToggleSubject('general')" style="accent-color:#fff"/> 📚 General
            </label>
            <label id="aiq-subj-math" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:7px 14px;border:1.5px solid var(--border);border-radius:8px;background:var(--card);color:var(--text-light);font-size:13px;font-weight:600">
              <input type="radio" name="aiq-subject" value="math" onchange="aiqToggleSubject('math')" style="accent-color:var(--primary)"/> 🧮 Mathematics
            </label>
          </div>
        </div>
        <!-- Math options -->
        <div id="aiq-math-opts" style="display:none;flex-direction:column;gap:12px;background:#f5f3ff;border:1.5px solid #e0e7ff;border-radius:10px;padding:14px 16px">
          <div style="font-size:12px;color:#4f46e5;font-weight:600">🧮 Questions will use LaTeX math notation</div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:6px;display:block">Math Branch</label>
            <select id="aiq-math-branch" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;outline:none;background:#fff;font-family:inherit">
              <option value="">Any / Mixed</option>
              <option value="algebra">Algebra</option>
              <option value="calculus">Calculus</option>
              <option value="geometry">Geometry &amp; Trigonometry</option>
              <option value="statistics">Statistics &amp; Probability</option>
              <option value="linear algebra">Linear Algebra &amp; Matrices</option>
              <option value="discrete math">Discrete Mathematics</option>
            </select>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:6px 12px;border:1.5px solid var(--border);border-radius:7px;font-size:12px;background:#fff"><input type="radio" name="aiq-math-style" value="solve" checked style="accent-color:var(--primary)"/> Solve problems</label>
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:6px 12px;border:1.5px solid var(--border);border-radius:7px;font-size:12px;background:#fff"><input type="radio" name="aiq-math-style" value="conceptual" style="accent-color:var(--primary)"/> Conceptual</label>
            <label style="display:flex;align-items:center;gap:5px;cursor:pointer;padding:6px 12px;border:1.5px solid var(--border);border-radius:7px;font-size:12px;background:#fff"><input type="radio" name="aiq-math-style" value="mixed" style="accent-color:var(--primary)"/> Mixed</label>
          </div>
        </div>
        <div id="aiq-error" style="display:none;padding:10px 13px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;color:#dc2626;font-size:13px;font-weight:500"></div>
        <div id="aiq-preview" style="display:none">
          <div style="font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px">
            Preview
            <span id="aiq-preview-count" style="background:#ede9fe;color:#7c3aed;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600"></span>
          </div>
          <div id="aiq-preview-list" style="display:flex;flex-direction:column;gap:9px;max-height:280px;overflow-y:auto;padding-right:3px"></div>
        </div>
      </div>
      <div style="padding:14px 22px;border-top:1px solid var(--border);display:flex;gap:9px;justify-content:flex-end;position:sticky;bottom:0;background:var(--card);border-radius:0 0 16px 16px">
        <button class="btn btn-secondary" onclick="document.getElementById('ai-quiz-overlay').remove()">Cancel</button>
        <button id="aiq-gen-btn" class="btn" style="background:linear-gradient(135deg,#7c3aed,#4f46e5);color:#fff;font-weight:600;display:flex;align-items:center;gap:7px" onclick="runAIQuizGenerate(document.getElementById('ai-quiz-overlay').dataset.quizId)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          Generate Questions
        </button>
        <button id="aiq-add-btn" class="btn btn-primary" style="display:none" onclick="addAIQuizQuestions(document.getElementById('ai-quiz-overlay').dataset.quizId)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add All to Quiz
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

function aiqToggleSubject(subj) {
  const opts  = document.getElementById('aiq-math-opts');
  const gen   = document.getElementById('aiq-subj-gen');
  const math  = document.getElementById('aiq-subj-math');
  if (!opts) return;
  const isMath = subj === 'math';
  opts.style.display = isMath ? 'flex' : 'none';
  const active   = 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:7px 14px;border:1.5px solid var(--primary);border-radius:8px;background:var(--primary);color:#fff;font-size:13px;font-weight:600';
  const inactive = 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:7px 14px;border:1.5px solid var(--border);border-radius:8px;background:var(--card);color:var(--text-light);font-size:13px;font-weight:600';
  if (gen)  gen.style.cssText  = isMath ? inactive : active;
  if (math) math.style.cssText = isMath ? active   : inactive;
}

async function runAIQuizGenerate(quizId) {
  const topic      = document.getElementById('aiq-topic')?.value?.trim();
  const count      = document.getElementById('aiq-count')?.value || '5';
  const difficulty = document.getElementById('aiq-difficulty')?.value || 'medium';
  const qtype      = document.querySelector('input[name="aiq-qtype"]:checked')?.value || 'single';
  const marks      = parseInt(document.getElementById('aiq-marks')?.value) || 1;
  const context    = document.getElementById('aiq-context')?.value?.trim() || '';
  const subject    = document.querySelector('input[name="aiq-subject"]:checked')?.value || 'general';
  const mathBranch = document.getElementById('aiq-math-branch')?.value || '';
  const mathStyle  = document.querySelector('input[name="aiq-math-style"]:checked')?.value || 'solve';
  const isMath     = subject === 'math';

  const errEl      = document.getElementById('aiq-error');
  const btn        = document.getElementById('aiq-gen-btn');
  const previewDiv = document.getElementById('aiq-preview');
  const addBtn     = document.getElementById('aiq-add-btn');

  if (!topic) { errEl.textContent = 'Please enter a topic.'; errEl.style.display = 'block'; return; }
  errEl.style.display = 'none';
  previewDiv.style.display = 'none';
  addBtn.style.display = 'none';
  _aiQuizQuestions = [];

  btn.disabled = true;
  btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Generating…';

  const qtypeDesc = qtype === 'single' ? 'single correct answer (MCQ)' : qtype === 'multiple' ? 'multiple correct answers' : 'a mix of single and multiple correct answer';

  let prompt;
  if (isMath) {
    const branch = mathBranch ? 'Branch: ' + mathBranch + '.' : 'Any math branch relevant to the topic.';
    const styleDesc = mathStyle === 'solve' ? 'calculation/problem-solving questions'
                    : mathStyle === 'conceptual' ? 'conceptual/theory questions about mathematical properties'
                    : 'a mix of calculation problems and conceptual questions';
    prompt = 'You are an expert mathematics educator creating quiz questions for KODEX.\n\nGenerate exactly ' + count + ' ' + difficulty + ' difficulty math MCQ questions about: "' + topic + '". ' + branch + '\n' + (context ? 'Context: ' + context : '') + '\n\nStyle: ' + styleDesc + '. Question type: ' + qtypeDesc + '. Each question has exactly 4 options.\n\nUse LaTeX \\( ... \\) for ALL inline math. Use \\[ ... \\] for display equations.\n\nReturn ONLY a valid JSON array:\n[\n  {\n    "questionText": "Find \\( x \\) if \\( x^2 - 5x + 6 = 0 \\).",\n    "options": ["\\( x = 2, 3 \\)", "\\( x = -2, -3 \\)", "\\( x = 1, 6 \\)", "\\( x = 5, -1 \\)"],\n    "correctAnswers": [0],\n    "questionType": "single",\n    "explanation": "Factorising: \\( (x-2)(x-3)=0 \\)."\n  }\n]';
  } else {
    prompt = 'You are an expert educator creating quiz questions for KODEX.\n\nGenerate exactly ' + count + ' ' + difficulty + ' difficulty MCQ questions about: "' + topic + '".\n' + (context ? 'Context: ' + context : '') + '\nQuestion type: ' + qtypeDesc + '. Each question has exactly 4 options.\n\nReturn ONLY a valid JSON array:\n[\n  {\n    "questionText": "Question here?",\n    "options": ["Option A", "Option B", "Option C", "Option D"],\n    "correctAnswers": [0],\n    "questionType": "single",\n    "explanation": "Why this is correct"\n  }\n]\n\ncorrectAnswers = 0-based indices. questionType = "single" or "multiple". No extra text.';
  }

  try {
    const token = localStorage.getItem('token') || '';
    const response = await fetch('/api/ai/generate-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ prompt, max_tokens: 4000 })
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Server error ' + response.status);
    }
    const data = await response.json();
    const raw   = data.content?.find(c => c.type === 'text')?.text || '';
    const questions = extractAIJson(raw);
    if (!Array.isArray(questions) || !questions.length) throw new Error('No questions generated. Try a different topic.');

    _aiQuizQuestions = questions.map(q => ({
      ...q,
      marks,
      questionType: q.questionType || (q.correctAnswers?.length > 1 ? 'multiple' : 'single'),
      correctAnswers: Array.isArray(q.correctAnswers) ? q.correctAnswers : [q.correctAnswers],
    }));

    const L = ['A','B','C','D'];
    document.getElementById('aiq-preview-count').textContent = _aiQuizQuestions.length + ' questions';
    document.getElementById('aiq-preview-list').innerHTML = _aiQuizQuestions.map((q, i) => `
      <div style="border:1.5px solid var(--border);border-radius:10px;padding:13px;background:var(--bg)">
        <div style="font-size:13px;font-weight:600;margin-bottom:8px;line-height:1.5">
          Q${i+1}
          <span style="font-size:10px;padding:2px 7px;border-radius:20px;font-weight:600;margin-left:6px;${q.questionType==='multiple'?'background:#ede9fe;color:#7c3aed':'background:#f0f9ff;color:#0369a1'}">${q.questionType.toUpperCase()}</span>
          ${q.questionText}
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px">
          ${q.options.map((o, oi) => `<span style="padding:4px 9px;border-radius:6px;font-size:12px;font-weight:500;${q.correctAnswers.includes(oi)?'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0':'background:#fff;color:var(--text-light);border:1px solid var(--border)'}">
            ${L[oi]}) ${o}${q.correctAnswers.includes(oi)?' ✓':''}</span>`).join('')}
        </div>
        ${q.explanation ? `<div style="font-size:11px;color:var(--text-muted);padding:5px 9px;background:#fff;border-radius:6px;border-left:3px solid #7c3aed">💡 ${q.explanation}</div>` : ''}
      </div>
    `).join('');

    previewDiv.style.display = 'block';
    addBtn.style.display = 'flex';

    // Render MathJax if available
    if (window.MathJax && MathJax.typesetPromise) {
      MathJax.typesetPromise([document.getElementById('aiq-preview-list')]).catch(() => {});
    }
  } catch(e) {
    errEl.textContent = 'Generation failed: ' + e.message;
    errEl.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> Regenerate';
  }
}

async function addAIQuizQuestions(quizId) {
  const btn = document.getElementById('aiq-add-btn');
  if (!_aiQuizQuestions.length) return;
  btn.disabled = true; btn.textContent = 'Adding…';
  let added = 0, failed = 0;
  for (const q of _aiQuizQuestions) {
    try {
      const body = {
        questionText: q.questionText,
        options: q.options,
        questionType: q.questionType,
        marks: q.marks || 1,
        explanation: q.explanation || null,
      };
      if (q.questionType === 'multiple') { body.correctAnswers = q.correctAnswers; }
      else { body.correctAnswer = q.correctAnswers[0]; }
      await api('/api/lecturer/quizzes/' + quizId + '/questions', { method: 'POST', body: JSON.stringify(body) });
      added++;
    } catch(e) { failed++; }
  }
  document.getElementById('ai-quiz-overlay')?.remove();
  const msg = added + ' question' + (added !== 1 ? 's' : '') + ' added!' + (failed ? ' (' + failed + ' failed)' : '');
  if (typeof toast === 'function') toast(msg, added > 0 ? 'ok' : 'err');
  else alert(msg);
  await showAddQuestionsView(quizId);
}

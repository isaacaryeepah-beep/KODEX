// Always point to the real server — prevents requests going to ESP32 hotspot
// when users are connected to the classroom device's WiFi network.
const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? ''
  : 'https://kodex.it.com';

// ═══════════════════════════════════════════════════════
// TOAST NOTIFICATION SYSTEM
// Usage: toast('Message')           → info (default)
//        toast('Message', 'success') → green
//        toast('Message', 'error')   → red  
//        toast('Message', 'warning') → amber
//        toastConfirm('Sure?', onConfirm) → replaces confirm()
// ═══════════════════════════════════════════════════════

(function() {
  // Inject toast CSS once
  const style = document.createElement('style');
  style.textContent = `
    #toast-container {
      position: fixed;
      top: 70px;
      right: 18px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
      max-width: min(360px, calc(100vw - 36px));
    }
    .toast {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      border-radius: 10px;
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 13px;
      font-weight: 500;
      line-height: 1.45;
      color: #0f172a;
      background: rgba(255,255,255,0.97);
      border: 1px solid #e2e8f0;
      box-shadow: 0 4px 20px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06);
      pointer-events: all;
      cursor: pointer;
      backdrop-filter: blur(12px);
      transform: translateX(120%);
      opacity: 0;
      transition: transform 0.3s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease;
      max-width: 100%;
      word-break: break-word;
    }
    .toast.toast-in {
      transform: translateX(0);
      opacity: 1;
    }
    .toast.toast-out {
      transform: translateX(120%);
      opacity: 0;
      transition: transform 0.25s cubic-bezier(0.4,0,1,1), opacity 0.25s ease;
    }
    .toast-icon {
      font-size: 15px;
      flex-shrink: 0;
      margin-top: 1px;
    }
    .toast-body { flex: 1; min-width: 0; }
    .toast-title { font-weight: 600; margin-bottom: 1px; }
    .toast-msg { color: #475569; font-size: 12.5px; }
    .toast-close {
      flex-shrink: 0;
      font-size: 16px;
      color: #94a3b8;
      line-height: 1;
      padding: 0 2px;
      cursor: pointer;
      transition: color 0.15s;
      margin-top: -1px;
    }
    .toast-close:hover { color: #64748b; }
    .toast-progress {
      position: absolute;
      bottom: 0; left: 0;
      height: 2px;
      border-radius: 0 0 10px 10px;
      transition: width linear;
    }
    .toast { position: relative; overflow: hidden; }

    /* Types */
    .toast-success { border-left: 3px solid #10b981; }
    .toast-success .toast-progress { background: #10b981; }
    .toast-error   { border-left: 3px solid #ef4444; }
    .toast-error .toast-progress { background: #ef4444; }
    .toast-warning { border-left: 3px solid #f59e0b; }
    .toast-warning .toast-progress { background: #f59e0b; }
    .toast-info    { border-left: 3px solid #6366f1; }
    .toast-info .toast-progress { background: #6366f1; }

    /* Confirm toast */
    .toast-confirm-btns {
      display: flex;
      gap: 6px;
      margin-top: 9px;
    }
    .toast-confirm-btns button {
      flex: 1;
      padding: 5px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      border: none;
      transition: opacity 0.15s;
    }
    .toast-confirm-btns button:hover { opacity: 0.85; }
    .toast-confirm-yes { background: #ef4444; color: white; }
    .toast-confirm-no  { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0 !important; }

    /* Mobile */
    @media (max-width: 540px) {
      #toast-container { top: auto; bottom: 74px; right: 12px; left: 12px; max-width: 100%; }
      .toast { transform: translateY(120%); }
      .toast.toast-in { transform: translateY(0); }
      .toast.toast-out { transform: translateY(120%); }
    }
  `;
  document.head.appendChild(style);

  // Create container
  let container;
  function getContainer() {
    if (!container || !document.body.contains(container)) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  const ICONS = {
    success: '✓',
    error:   '✕',
    warning: '⚠',
    info:    'ℹ',
  };

  const TITLES = {
    success: 'Success',
    error:   'Error',
    warning: 'Warning',
    info:    'Info',
  };

  const DURATIONS = {
    success: 3500,
    error:   5000,
    warning: 4500,
    info:    3500,
  };

  window.toast = function(message, type = 'info', options = {}) {
    if (!message) return;
    const c = getContainer();
    const duration = options.duration || DURATIONS[type] || 3500;
    const t = type in ICONS ? type : 'info';

    const el = document.createElement('div');
    el.className = `toast toast-${t}`;
    el.innerHTML = `
      <span class="toast-icon">${ICONS[t]}</span>
      <div class="toast-body">
        <div class="toast-msg">${message}</div>
      </div>
      <span class="toast-close">×</span>
      <div class="toast-progress" style="width:100%"></div>
    `;

    const close = () => dismiss(el);
    el.querySelector('.toast-close').addEventListener('click', e => { e.stopPropagation(); close(); });
    el.addEventListener('click', close);

    c.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('toast-in')));

    // Progress bar
    const bar = el.querySelector('.toast-progress');
    bar.style.transitionDuration = duration + 'ms';
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = '0%'; }));

    const timer = setTimeout(close, duration);
    el._toastTimer = timer;

    // Pause on hover
    el.addEventListener('mouseenter', () => {
      clearTimeout(el._toastTimer);
      bar.style.transitionDuration = '0ms';
    });
    el.addEventListener('mouseleave', () => {
      const remaining = 1000;
      bar.style.transitionDuration = remaining + 'ms';
      bar.style.width = '0%';
      el._toastTimer = setTimeout(close, remaining);
    });

    return el;
  };

  function dismiss(el) {
    if (!el || el._dismissed) return;
    el._dismissed = true;
    clearTimeout(el._toastTimer);
    el.classList.remove('toast-in');
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 300);
  }

  // Convenience shorthands
  window.toastSuccess = (msg, opts) => window.toast(msg, 'success', opts);
  window.toastError   = (msg, opts) => window.toast(msg, 'error',   opts);
  window.toastWarning = (msg, opts) => window.toast(msg, 'warning', opts);
  window.toastInfo    = (msg, opts) => window.toast(msg, 'info',    opts);

  // Replaces window.confirm() — returns a Promise
  window.toastConfirm = function(message, onConfirm, onCancel, opts = {}) {
    const c = getContainer();
    const el = document.createElement('div');
    el.className = 'toast toast-warning';
    el.innerHTML = `
      <span class="toast-icon">⚠</span>
      <div class="toast-body">
        <div class="toast-msg">${message}</div>
        <div class="toast-confirm-btns">
          <button class="toast-confirm-no">${opts.cancelLabel || 'Cancel'}</button>
          <button class="toast-confirm-yes">${opts.confirmLabel || 'Confirm'}</button>
        </div>
      </div>
    `;

    const dismiss = () => {
      el.classList.remove('toast-in');
      el.classList.add('toast-out');
      setTimeout(() => el.remove(), 300);
    };

    el.querySelector('.toast-confirm-yes').addEventListener('click', () => {
      dismiss();
      if (onConfirm) onConfirm();
    });
    el.querySelector('.toast-confirm-no').addEventListener('click', () => {
      dismiss();
      if (onCancel) onCancel();
    });

    c.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('toast-in')));
  };

})();

let token = localStorage.getItem('token');

// ── Device fingerprint for 6-hour cross-device logout lock ───────────────────
function getDeviceFingerprint() {
  const nav = window.navigator;
  const raw = [
    nav.userAgent,
    nav.language,
    nav.hardwareConcurrency || '',
    screen.width, screen.height, screen.colorDepth,
    nav.platform || '',
    new Date().getTimezoneOffset(),
  ].join('|');
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) - hash + raw.charCodeAt(i)) | 0;
  }
  return 'fp_' + Math.abs(hash).toString(16);
}



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
        department: userData.user.department || null,
        profilePhoto: userData.user.profilePhoto || null,
        lastLoginAt: userData.user.lastLoginAt || null,
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
  const role = credentials.loginRole || 'admin';
  return `${role}::${(credentials.email || '').toLowerCase()}`;
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
// navigator.onLine is true even when connected to an ESP32 hotspot with no
// internet. We do a real server ping so login correctly falls back to offline
// mode when the KODEX server is unreachable (e.g. device is on ESP32 WiFi).
let _serverReachable = null; // null = unknown, true/false = cached result
let _serverCheckTs   = 0;
const SERVER_CHECK_TTL = 8000; // re-check every 8 s

async function checkServerReachable() {
  try {
    const ctrl = new AbortController();
    const tid   = setTimeout(() => ctrl.abort(), 2500); // 2.5s — fast enough for mobile
    const res   = await fetch('https://kodex.it.com/api/health', { method: 'GET', signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(tid);
    return res.ok;
  } catch (_) {
    return false;
  }
}

function isOnline() {
  // Fast path: if browser says offline, trust it immediately
  if (!navigator.onLine) return false;
  // Otherwise return the last known server reachability result.
  // Callers that need a fresh check should use isOnlineAsync().
  return _serverReachable !== false;
}

async function isOnlineAsync() {
  if (!navigator.onLine) { _serverReachable = false; return false; }
  const now = Date.now();
  if (now - _serverCheckTs < SERVER_CHECK_TTL && _serverReachable !== null) {
    return _serverReachable;
  }
  _serverReachable = await checkServerReachable();
  _serverCheckTs   = now;
  return _serverReachable;
}

function offlineCache(key, data) {
  try {
    const store = JSON.parse(localStorage.getItem(OFFLINE_CACHE_KEY) || '{}');
    // Prune old attendees_ entries if we have more than 20 (saves localStorage space)
    const attendeeKeys = Object.keys(store).filter(k => k.startsWith('attendees_'));
    if (attendeeKeys.length > 20) {
      // Remove oldest 10
      attendeeKeys.slice(0, 10).forEach(k => delete store[k]);
    }
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
      const is4xx = e.status >= 400 && e.status < 500 ||
        e.message.includes('400') || e.message.includes('409') || e.message.includes('404');
      if (!is4xx) {
        remaining.push(action);
      } else {
        console.log(`[Offline] Dropping ${action.label || action.url} — rejected by server (${e.status || e.message})`);
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

// Alias used by Corporate Phase 1 functions (shifts, leave)
function toast(msg, type) {
  showToastNotif(msg, type === 'ok' ? 'success' : 'warn');
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
      const err = new Error(data.error || 'Request failed');
      err.status = res.status;
      err.data   = data;
      throw err;
    }
    return data;
  }
  if (!res.ok) throw new Error('Request failed');
  return res;
}

async function apiUpload(urlPath, formData, method = 'POST') {
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API}${urlPath}`, { method, headers, body: formData });
  if (res.headers.get('content-type')?.includes('application/json')) {
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 403 && data.subscriptionRequired) {
        showSubscriptionGate(data.message);
        throw new Error(data.error || 'Subscription required');
      }
      throw new Error(data.error || data.message || 'Request failed');
    }
    return data;
  }
  if (!res.ok) throw new Error('Request failed');
  return res;
}

function showSubscriptionGate(message) {
  // Navigate to subscription page and show a toast if possible
  try {
    if (typeof navigateTo === 'function') navigateTo('subscription');
    const msg = message || 'Your subscription or trial has expired. Please renew to continue.';
    if (typeof toastError === 'function') {
      toastError(msg);
    } else {
      // Fallback if toast not yet available
      const content = document.getElementById('main-content');
      if (content) {
        content.innerHTML = `
          <div class="card" style="max-width:480px;margin:40px auto;text-align:center;padding:32px">
            <div style="font-size:40px;margin-bottom:16px">🔒</div>
            <h3 style="margin-bottom:8px">Subscription Required</h3>
            <p style="color:var(--text-muted);margin-bottom:20px">${msg}</p>
            <button class="btn btn-primary" onclick="navigateTo('subscription')">View Subscription</button>
          </div>`;
      }
    }
  } catch(e) {
    console.warn('showSubscriptionGate:', e.message);
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  if (diff < 604800) return Math.floor(diff/86400) + 'd ago';
  return new Date(dateStr).toLocaleDateString();
}

// ── Date formatting helper ───────────────────────────────────────────────────
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ── HTML escape helper ────────────────────────────────────────────────────────
function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 5000);
}

let selectedPortalType = 'admin-corporate';

// ── Mode selector (Corporate / Academic two-step flow) ────────────────────────
let _selectedMode = null;
function selectMode(mode) {
  const tglCorp  = document.getElementById('mode-tgl-corp');
  const tglAcad  = document.getElementById('mode-tgl-acad');
  const cardsCorp = document.getElementById('portal-cards-corp');
  const cardsAcad = document.getElementById('portal-cards-acad');
  if (!tglCorp || !tglAcad) return;

  // Collapse both first
  if (cardsCorp) cardsCorp.classList.remove('visible');
  if (cardsAcad) cardsAcad.classList.remove('visible');
  tglCorp.classList.remove('active-corp');
  tglAcad.classList.remove('active-acad');

  // Toggle off if same mode tapped again
  if (_selectedMode === mode) { _selectedMode = null; return; }

  const delay = _selectedMode !== null ? 120 : 0;
  _selectedMode = mode;

  setTimeout(() => {
    if (mode === 'corp') {
      tglCorp.classList.add('active-corp');
      if (cardsCorp) cardsCorp.classList.add('visible');
    } else {
      tglAcad.classList.add('active-acad');
      if (cardsAcad) cardsAcad.classList.add('visible');
    }
  }, delay);
}

function selectPortal(type) {
  selectedPortalType = type;
  document.getElementById('portal-selector').classList.add('hidden');
  if (type === 'admin-corporate' || type === 'admin-academic' || type === 'manager') {
    const isAcademic = type === 'admin-academic';
    const isManager  = type === 'manager';
    // Manager uses the same admin login form — override selectedPortalType
    if (isManager) selectedPortalType = 'admin-corporate';
    // Make sure portal-selector is hidden and admin-auth is visible
    const portalSel = document.getElementById('portal-selector');
    if (portalSel) portalSel.classList.add('hidden');
    const adminAuth = document.getElementById('admin-auth');
    if (adminAuth) adminAuth.classList.remove('hidden');
    // Update labels
    const titleEl = document.getElementById('admin-portal-title');
    if (titleEl) titleEl.textContent = isManager ? 'Manager Portal' : isAcademic ? 'Institution Admin' : 'Admin Portal';
    const subtitleEl = document.getElementById('admin-portal-subtitle');
    if (subtitleEl) subtitleEl.textContent = isManager ? 'Corporate Manager Access' : isAcademic ? 'Academic Institution Admin' : 'Corporate Admin Access';
    const labelEl = document.getElementById('admin-reg-company-label');
    if (labelEl) labelEl.textContent = isAcademic ? 'Institution Name' : 'Company Name';
    const placeholderEl = document.getElementById('admin-reg-company');
    if (placeholderEl) placeholderEl.placeholder = isAcademic ? 'Your institution name' : 'Your company name';
  } else if (type === 'lecturer') {
    document.getElementById('lecturer-auth').classList.remove('hidden');
  } else if (type === 'hod') {
    document.getElementById('hod-auth').classList.remove('hidden');
  } else if (type === 'employee') {
    document.getElementById('employee-auth').classList.remove('hidden');
  } else if (type === 'student') {
    document.getElementById('student-auth').classList.remove('hidden');
  } else {
    // Unknown portal type — go back to selector safely
    document.getElementById('portal-selector').classList.remove('hidden');
  }
}

function showPortalSelector() {
  document.getElementById('admin-auth').classList.add('hidden');
  document.getElementById('lecturer-auth').classList.add('hidden');
  document.getElementById('hod-auth').classList.add('hidden');
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

let adminForgotEmail = '', adminForgotEmailAddr = '', adminForgotStep = 'request';
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
    const phone = document.getElementById('admin-forgot-phone').value.trim();
    const email = document.getElementById('admin-forgot-email')?.value?.trim();
    if (!phone && !email) return setAdminForgotMsg('Please enter your phone number or email.', false);
    const btn = document.getElementById('admin-forgot-btn');
    btn.textContent = 'Sending...'; btn.disabled = true;
    try {
      const data = await api('/api/auth/forgot-password-admin', { method: 'POST', body: JSON.stringify({ phone: phone || undefined, email: email || undefined }) });
      adminForgotEmail = phone || ''; adminForgotEmailAddr = email || ''; adminForgotStep = 'reset';
      document.getElementById('admin-reset-code-group').classList.remove('hidden');
      document.getElementById('admin-new-password-group').classList.remove('hidden');
      btn.textContent = 'Reset Password'; btn.disabled = false;
      setAdminForgotMsg('📱 ' + (data.message || 'Reset code sent to your phone via SMS.'), true);
    } catch(e) { btn.textContent = 'Request Reset Code'; btn.disabled = false; setAdminForgotMsg(e.message, false); }
  } else {
    const resetCode = document.getElementById('admin-reset-code').value.trim();
    const newPassword = document.getElementById('admin-new-password').value;
    if (!resetCode || !newPassword) return setAdminForgotMsg('Please enter the reset code and new password', false);
    if (newPassword.length < 8) return setAdminForgotMsg('Password must be at least 8 characters', false);
    const btn = document.getElementById('admin-forgot-btn');
    btn.textContent = 'Resetting...'; btn.disabled = true;
    try {
      await api('/api/auth/reset-password-email', { method: 'POST', body: JSON.stringify({ phone: adminForgotEmail || undefined, email: adminForgotEmailAddr || undefined, resetCode, newPassword }) });
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

let lecturerForgotEmail = '', lecturerForgotIsEmail = false, lecturerForgotStep = 'request';
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
    const institutionCode = document.getElementById('lecturer-forgot-code')?.value.trim().toUpperCase();
    const phone = document.getElementById('lecturer-forgot-phone').value.trim();
    const email = document.getElementById('lecturer-forgot-email')?.value?.trim();
    if (!institutionCode) return setLecturerForgotMsg('Please enter your institution code', false);
    if (!phone && !email) return setLecturerForgotMsg('Please enter your phone number or email', false);
    const btn = document.getElementById('lecturer-forgot-btn');
    btn.textContent = 'Sending...'; btn.disabled = true;
    try {
      const data = await api('/api/auth/forgot-password-email', { method: 'POST', body: JSON.stringify({ phone: phone || undefined, email: email || undefined, institutionCode }) });
      lecturerForgotEmail = phone || email || ''; lecturerForgotIsEmail = !phone && !!email; lecturerForgotStep = 'reset';
      document.getElementById('lecturer-reset-code-group').classList.remove('hidden');
      document.getElementById('lecturer-new-password-group').classList.remove('hidden');
      btn.textContent = 'Reset Password'; btn.disabled = false;
      setLecturerForgotMsg('✅ ' + (data.message || 'Reset code sent.'), true);
    } catch(e) { btn.textContent = 'Request Reset Code'; btn.disabled = false; setLecturerForgotMsg(e.message, false); }
  } else {
    const resetCode = document.getElementById('lecturer-reset-code').value.trim();
    const newPassword = document.getElementById('lecturer-new-password').value;
    if (!resetCode || !newPassword) return setLecturerForgotMsg('Please enter the reset code and new password', false);
    if (newPassword.length < 8) return setLecturerForgotMsg('Password must be at least 8 characters', false);
    const btn = document.getElementById('lecturer-forgot-btn');
    btn.textContent = 'Resetting...'; btn.disabled = true;
    try {
      await api('/api/auth/reset-password-email', { method: 'POST', body: JSON.stringify({ phone: lecturerForgotIsEmail ? undefined : lecturerForgotEmail, email: lecturerForgotIsEmail ? lecturerForgotEmail : undefined, resetCode, newPassword }) });
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
  const authMap = {
    lecturer: 'lecturer-auth',
    student: 'student-auth',
    employee: 'employee-auth',
    'admin-corporate': 'admin-auth',
    'admin-academic': 'admin-auth',
  };
  const errorMap = {
    lecturer: 'lecturer-auth-error',
    student: 'student-auth-error',
    employee: 'employee-auth-error',
    'admin-corporate': 'admin-auth-error',
    'admin-academic': 'admin-auth-error',
  };
  const authEl = authMap[selectedPortalType] || 'admin-auth';
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
    // loginRole 'admin' allows both admin and manager roles (PORTAL_ALLOWED_ROLES.admin = ['admin','manager'])
    const credentials = { email, password, loginRole: 'admin', portalMode, deviceId: getDeviceFingerprint() };

    let data;
    if (!(await isOnlineAsync())) {
      showOfflineLoginNotice('admin-login-form');
      data = await attemptOfflineLogin(credentials);
    } else {
      removeOfflineLoginNotice();
      data = await initiate2FA(credentials);
      await saveOfflineProfile(credentials, data);
    }

    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showDashboard(data);
    requestPushPermission().catch(() => {});
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
    } else if (m.includes('invalid credentials') || m.includes('wrong') || m.includes('not authorized')) {
      const portalLabel = selectedPortalType === 'admin-academic' ? 'Academic Admin' : 'Corporate Admin';
      showAdminError(`Wrong email or password for the ${portalLabel} portal. Make sure you are using the correct portal for your role.`);
    } else {
      showAdminError(msg || 'Wrong email or password. Please check your credentials.');
    }
  }
}

async function handleAdminRegister() {
  try {
    const name = document.getElementById('admin-reg-name').value;
    const email = document.getElementById('admin-reg-email').value;
    const phone = document.getElementById('admin-reg-phone').value.trim();
    const password = document.getElementById('admin-reg-password').value;
    const companyName = document.getElementById('admin-reg-company').value;
    const mode = selectedPortalType === 'admin-academic' ? 'academic' : 'corporate';
    if (!name || !email || !phone || !password || !companyName) {
      return showAdminError('Please fill in all fields');
    }
    if (password.length < 8) {
      return showAdminError('Password must be at least 8 characters');
    }
    const body = { name, email, phone, password, companyName, mode };
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
    const credentials = { email, password, loginRole: 'lecturer', portalMode: 'academic', deviceId: getDeviceFingerprint() };

    let data;
    if (!(await isOnlineAsync())) {
      // ── OFFLINE PATH ──
      showOfflineLoginNotice('lecturer-login-form');
      data = await attemptOfflineLogin(credentials);
    } else {
      // ── ONLINE PATH ──
      removeOfflineLoginNotice();
      data = await initiate2FA(credentials);
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
    } else if (m.includes('invalid credentials') || m.includes('not authorized')) {
      showLecturerError('Wrong email or password for the Lecturer portal. If you are an admin or HOD, please use the correct portal.');
    } else {
      showLecturerError(msg || 'Wrong email or password. Please check your credentials.');
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
    const phone = document.getElementById('lecturer-reg-phone')?.value?.trim();
    let body = { name, email, password };
    if (dept) body.department = dept;
    if (phone) body.phone = phone;
    if (regMode === 'join' && !dept) {
      return showLecturerError('Department is required when joining an institution.');
    }
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
    hint.textContent = 'Your account will need HOD and admin approval before you can access the system.';
    // Load departments for this institution when code is entered
    const codeInput = document.getElementById('lecturer-reg-code');
    if (codeInput && !codeInput._hodListener) {
      codeInput._hodListener = true;
      codeInput.addEventListener('blur', () => loadDeptDropdown(
        codeInput.value.trim().toUpperCase(),
        'lecturer-reg-dept',
        'Department (must match an existing HOD)'
      ));
    }
  }
}

async function loadDeptDropdown(institutionCode, targetId, placeholder) {
  if (!institutionCode) return;
  try {
    const data = await api('/api/auth/departments?institutionCode=' + institutionCode);
    const depts = data.departments || [];
    const el = document.getElementById(targetId);
    if (!el) return;
    if (depts.length === 0) {
      el.placeholder = 'No departments set up yet — contact your admin';
      return;
    }
    // Replace input with select
    const sel = document.createElement('select');
    sel.id = targetId;
    sel.style.cssText = el.style.cssText || 'width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px';
    sel.innerHTML = '<option value="">— Select Department —</option>' +
      depts.map(d => `<option value="${d}">${d}</option>`).join('');
    el.parentNode.replaceChild(sel, el);
  } catch(e) {
    console.warn('Could not load departments:', e.message);
  }
}

function showEmployeeRegister() {
  document.getElementById('employee-login-form').classList.add('hidden');
  document.getElementById('employee-register-form').classList.remove('hidden');
}

function showEmployeeForgot() {
  document.getElementById('employee-login-form').classList.add('hidden');
  document.getElementById('employee-register-form').classList.add('hidden');
  const f = document.getElementById('employee-forgot-form');
  if (f) f.classList.remove('hidden');
  document.getElementById('employee-auth-error').textContent = '';
  employeeForgotStep = 'request';
  const btn = document.getElementById('employee-forgot-btn');
  if (btn) btn.textContent = 'Request Reset Code';
}

function showEmployeeLogin() {
  const f = document.getElementById('employee-forgot-form');
  if (f) f.classList.add('hidden');
  document.getElementById('employee-register-form').classList.add('hidden');
  document.getElementById('employee-login-form').classList.remove('hidden');
}

let employeeForgotStep = 'request';
let employeeForgotEmail = '';
let employeeForgotEmailType = 'phone';
let employeeForgotCode = '';

async function handleEmployeeForgotPassword() {
  const errEl = document.getElementById('employee-auth-error');
  function setMsg(msg, ok) {
    errEl.textContent = msg;
    errEl.style.display = 'block';
    errEl.style.background = ok ? '#f0fdf4' : '#fef2f2';
    errEl.style.color = ok ? '#15803d' : '#dc2626';
  }
  if (employeeForgotStep === 'request') {
    const institutionCode = document.getElementById('employee-forgot-code')?.value.trim().toUpperCase();
    const phone = document.getElementById('employee-forgot-phone')?.value.trim();
    const email = document.getElementById('employee-forgot-email')?.value?.trim();
    if (!institutionCode) return setMsg('Please enter your institution code', false);
    if (!phone && !email) return setMsg('Please enter your phone number or email', false);
    const btn = document.getElementById('employee-forgot-btn');
    btn.textContent = 'Sending...'; btn.disabled = true;
    try {
      const data = await api('/api/auth/forgot-password-email', { method: 'POST', body: JSON.stringify({ phone: phone || undefined, email: email || undefined, institutionCode }) });
      employeeForgotEmail = phone || email || ''; employeeForgotEmailType = phone ? 'phone' : 'email';
      employeeForgotCode = institutionCode; employeeForgotStep = 'reset';
      document.getElementById('employee-reset-code-group').classList.remove('hidden');
      document.getElementById('employee-new-password-group').classList.remove('hidden');
      btn.textContent = 'Reset Password'; btn.disabled = false;
      setMsg('📱 ' + (data.message || 'Reset code sent to your phone via SMS.'), true);
    } catch(e) { btn.textContent = 'Request Reset Code'; btn.disabled = false; setMsg(e.message, false); }
  } else {
    const resetCode = document.getElementById('employee-reset-code')?.value.trim();
    const newPassword = document.getElementById('employee-new-password')?.value;
    if (!resetCode || !newPassword) return setMsg('Please enter the reset code and new password', false);
    if (newPassword.length < 8) return setMsg('Password must be at least 8 characters', false);
    const btn = document.getElementById('employee-forgot-btn');
    btn.textContent = 'Resetting...'; btn.disabled = true;
    try {
      await api('/api/auth/reset-password-email', { method: 'POST', body: JSON.stringify({ phone: employeeForgotEmailType === 'phone' ? employeeForgotEmail : undefined, email: employeeForgotEmailType === 'email' ? employeeForgotEmail : undefined, institutionCode: employeeForgotCode, resetCode, newPassword }) });
      employeeForgotStep = 'request';
      setMsg('✅ Password reset! Redirecting to sign in...', true);
      setTimeout(() => { showEmployeeLogin(); }, 1800);
    } catch(e) { btn.textContent = 'Reset Password'; btn.disabled = false; setMsg(e.message, false); }
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  HOD AUTH
// ════════════════════════════════════════════════════════════════════════════
function showHodLogin() {
  document.getElementById('hod-login-form').classList.remove('hidden');
  document.getElementById('hod-forgot-form').classList.add('hidden');
  const regForm = document.getElementById('hod-register-form');
  if (regForm) regForm.classList.add('hidden');
}

function showHodRegister() {
  document.getElementById('hod-login-form').classList.add('hidden');
  document.getElementById('hod-forgot-form').classList.add('hidden');
  const regForm = document.getElementById('hod-register-form');
  if (regForm) regForm.classList.remove('hidden');
}

async function handleHodRegister() {
  const name     = document.getElementById('hod-reg-name')?.value?.trim();
  const email    = document.getElementById('hod-reg-email')?.value?.trim();
  const password = document.getElementById('hod-reg-password')?.value;
  const code     = document.getElementById('hod-reg-code')?.value?.trim().toUpperCase();
  const dept     = document.getElementById('hod-reg-dept')?.value?.trim();
  const phone    = document.getElementById('hod-reg-phone')?.value?.trim();
  const errEl    = document.getElementById('hod-auth-error');

  function setErr(msg) {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.display = 'block';
    errEl.style.background = '#fef2f2';
    errEl.style.color = '#dc2626';
  }

  if (!name)     return setErr('Please enter your full name.');
  if (!email)    return setErr('Please enter your email.');
  if (!password) return setErr('Please enter a password.');
  if (password.length < 8) return setErr('Password must be at least 8 characters.');
  if (!code)     return setErr('Please enter your institution code.');
  if (!dept)     return setErr('Please enter your department.');

  const btn = document.querySelector('#hod-register-form button[type="submit"]');
  if (btn) { btn.textContent = 'Registering…'; btn.disabled = true; }

  try {
    const data = await api('/api/auth/register-hod', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, institutionCode: code, department: dept, phone: phone || undefined }),
    });

    if (errEl) {
      errEl.textContent = data.message || 'Registration successful! Your account is pending admin approval.';
      errEl.style.display = 'block';
      errEl.style.background = '#f0fdf4';
      errEl.style.color = '#15803d';
    }
    showHodLogin();
  } catch(e) {
    setErr(e.message || 'Registration failed');
    if (btn) { btn.textContent = 'Register'; btn.disabled = false; }
  }
}
function showHodForgot() {
  document.getElementById('hod-login-form').classList.add('hidden');
  document.getElementById('hod-forgot-form').classList.remove('hidden');
}
function showHodError(msg) {
  const el = document.getElementById('hod-auth-error');
  if (!el) return;
  el.textContent = msg; el.style.display = 'block';
}

async function handleHodLogin() {
  const btn = document.querySelector('#hod-login-form button[type="submit"]');
  try {
    const email    = document.getElementById('hod-login-email').value.trim();
    const password = document.getElementById('hod-login-password').value;
    if (!email)    return showHodError('Please enter your email.');
    if (!password) return showHodError('Please enter your password.');
    if (btn) { btn.textContent = 'Signing in…'; btn.disabled = true; }

    const credentials = { email, password, loginRole: 'hod', portalMode: 'academic', deviceId: getDeviceFingerprint() };
    let data;
    if (!(await isOnlineAsync())) {
      showOfflineLoginNotice('hod-login-form');
      data = await attemptOfflineLogin(credentials);
    } else {
      removeOfflineLoginNotice();
      data = await initiate2FA(credentials);
      await saveOfflineProfile(credentials, data);
    }
    token = data.token;
    localStorage.setItem('token', token);
    currentUser = data.user;
    showDashboard(data);
  } catch (e) {
    if (btn) { btn.textContent = 'Sign In'; btn.disabled = false; }
    showHodError(friendlyError(e.message) || 'Wrong Email or Password.');
  }
}

let hodForgotPhone = '';
let hodForgotCode  = '';
async function handleHodForgotPassword() {
  const btn = document.getElementById('hod-forgot-btn');
  const codeGroup = document.getElementById('hod-reset-code-group');
  const pwGroup   = document.getElementById('hod-new-password-group');
  const setMsg = (msg, ok) => {
    const el = document.getElementById('hod-auth-error');
    el.textContent = msg; el.style.display = 'block';
    el.style.background = ok ? '#f0fdf4' : '#fef2f2';
    el.style.color = ok ? '#15803d' : '#991b1b';
  };
  try {
    btn.disabled = true;
    const phone = document.getElementById('hod-forgot-phone').value.trim();
    const email = document.getElementById('hod-forgot-email')?.value?.trim();
    const institutionCode = document.getElementById('hod-forgot-code').value.trim().toUpperCase();
    const resetCode = document.getElementById('hod-reset-code').value.trim();
    const newPassword = document.getElementById('hod-new-password').value;

    if (!codeGroup.classList.contains('hidden') && !pwGroup.classList.contains('hidden')) {
      const hodIsEmail = hodForgotPhone.includes('@');
      await api('/api/auth/reset-password-email', { method: 'POST', body: JSON.stringify({ phone: hodIsEmail ? undefined : hodForgotPhone, email: hodIsEmail ? hodForgotPhone : undefined, resetCode, newPassword, institutionCode: hodForgotCode }) });
      setMsg('Password reset! You can now sign in.', true);
      setTimeout(showHodLogin, 2000);
    } else if (!codeGroup.classList.contains('hidden')) {
      pwGroup.classList.remove('hidden');
      btn.textContent = 'Reset Password';
      setMsg('Enter the code from your SMS/email and a new password.', true);
    } else {
      if (!phone && !email) { btn.disabled = false; return setMsg('Phone number or email is required.', false); }
      if (!institutionCode) { btn.disabled = false; return setMsg('Institution code is required.', false); }
      hodForgotPhone = phone || email || ''; hodForgotCode = institutionCode;
      const data = await api('/api/auth/forgot-password-email', { method: 'POST', body: JSON.stringify({ phone: phone || undefined, email: email || undefined, institutionCode }) });
      codeGroup.classList.remove('hidden');
      btn.textContent = 'Continue';
      setMsg((data.message || 'Reset code sent.'), true);
    }
  } catch(e) { btn.textContent = 'Request Reset Code'; setMsg(e.message, false); }
  finally { btn.disabled = false; }
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
    const credentials = { email, password, institutionCode, loginRole: 'employee', deviceId: getDeviceFingerprint() };

    let data;
    if (!(await isOnlineAsync())) {
      // ── OFFLINE PATH ──
      showOfflineLoginNotice('employee-login-form');
      data = await attemptOfflineLogin(credentials);
    } else {
      // ── ONLINE PATH ──
      removeOfflineLoginNotice();
      data = await initiate2FA(credentials);
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
    } else if (m2.includes('invalid credentials') || m2.includes('not authorized')) {
      showEmployeeError('Wrong email or password for the Employee portal. If you are a manager or admin, please use the correct portal.');
    } else {
      showEmployeeError(msg2 || 'Wrong email or password. Please check your credentials.');
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
    const phone = document.getElementById('employee-reg-phone')?.value?.trim();
    const data = await api('/api/auth/register-employee', { method: 'POST', body: JSON.stringify({ name, email, phone, password, institutionCode }) });
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
    const indexNumber = document.getElementById('student-login-index').value.trim().toUpperCase();
    const institutionCode = document.getElementById('student-login-code').value.trim().toUpperCase();
    const password = document.getElementById('student-login-password').value;
    if (!indexNumber) return showStudentError('Please enter your student ID');
    if (!institutionCode) return showStudentError('Please enter your institution code');
    if (!password) return showStudentError('Please enter your password');
    if (btn) { btn.textContent = 'Signing in…'; btn.disabled = true; }
    const credentials = { indexNumber, password, institutionCode, loginRole: 'student', deviceId: getDeviceFingerprint() };

    let data;
    if (!(await isOnlineAsync())) {
      // ── OFFLINE PATH ──
      showOfflineLoginNotice('student-login-form');
      data = await attemptOfflineLogin(credentials);
    } else {
      // ── ONLINE PATH ──
      removeOfflineLoginNotice();
      data = await initiate2FA(credentials);
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
    } else if (m3.includes('device') || m3.includes('another device')) {
      showStudentError('This account is active on another device. Contact your admin to unlock it.');
    } else if (m3.includes('network') || m3.includes('fetch')) {
      showStudentError('Network error. Please check your connection and try again.');
    } else if (m3.includes('invalid credentials') || m3.includes('not authorized')) {
      showStudentError('Wrong Student ID or password. If you are a lecturer or admin, please use the correct portal.');
    } else {
      showStudentError(msg3 || 'Wrong Student ID or password. Please check your credentials.');
    }
  }
}

async function handleStudentRegister() {
  try {
    const name = document.getElementById('student-reg-name').value.trim();
    const indexNumber = document.getElementById('student-reg-index').value.trim().toUpperCase();
    const institutionCode = document.getElementById('student-reg-code').value.trim();
    const password = document.getElementById('student-reg-password').value;
    const confirm = document.getElementById('student-reg-confirm').value;
    if (!name) return showStudentError('Please enter your full name.');
    if (!indexNumber) return showStudentError('Student ID / Index Number is required. Enter the ID given to you by your institution.');
    if (indexNumber.length < 3) return showStudentError('Student ID looks too short. Please check and enter your full index number.');
    if (!institutionCode) return showStudentError('Please enter your Institution Code.');
    if (!password) return showStudentError('Please enter a password.');
    if (password.length < 8) return showStudentError('Password must be at least 8 characters.');
    if (password !== confirm) return showStudentError('Passwords do not match.');
    const phone = document.getElementById('student-reg-phone')?.value?.trim();
    if (!department) return showStudentError('Please enter your department.');
    const data = await api('/api/auth/register-student', { method: 'POST', body: JSON.stringify({ name, indexNumber, phone, password, institutionCode, department }) });
    if (data.token) {
      token = data.token;
      localStorage.setItem('token', token);
      currentUser = data.user;
      showDashboard(data);
      if (data.departmentNote) toastWarning(data.departmentNote);
    } else {
      const el = document.getElementById('student-auth-error');
      el.textContent = data.message || 'Registration successful!';
      el.style.display = 'block';
      el.style.background = '#f0fdf4';
      el.style.color = '#15803d';
      showStudentLogin();
      document.getElementById('student-auth-error').style.display = 'block';
      if (data.departmentNote) {
        const warn = document.createElement('div');
        warn.style.cssText = 'margin-top:8px;padding:10px 14px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;font-size:12px;color:#92400e;';
        warn.textContent = data.departmentNote;
        el.after(warn);
      }
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
    const indexNumber = document.getElementById('student-forgot-index').value.trim().toUpperCase();
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
      // If resetCode returned, show it (no email on account) — give to lecturer
      const codeHint = data.resetCode ? ' Code: ' + data.resetCode + ' (give this to your lecturer to pass to you)' : '';
      el.textContent = (data.message || 'Reset code generated.') + codeHint;
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
  resetBranding();
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

  // If loaded from superadmin.html, redirect back to it
  if (window.__superadminMode) {
    window.location.href = '/superadmin';
    return;
  }
  showPortalSelector();
}

async function loadUserData() {
  // Check for superadmin impersonation token in URL
  const urlParams = new URLSearchParams(window.location.search);
  const impToken = urlParams.get('impersonate');
  if (impToken) {
    localStorage.setItem('token', impToken);
    token = impToken;
    // Clean URL without reload
    window.history.replaceState({}, '', '/');
    // Show impersonation banner
    const banner = document.createElement('div');
    banner.id = 'impersonate-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#7c3aed;color:#fff;text-align:center;padding:8px 16px;font-size:13px;font-weight:600;';
    banner.innerHTML = '🔑 Superadmin Impersonation Mode · <span style="opacity:.8;font-weight:400;">1 hour session</span> · <button onclick="exitImpersonation()" style="margin-left:12px;background:rgba(255,255,255,.2);border:none;color:#fff;padding:3px 10px;border-radius:6px;cursor:pointer;font-weight:700;">Exit</button>';
    document.body.prepend(banner);
  }

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
    hod: 'HOD Portal',
    employee: 'Employee Portal',
    student: 'Student Portal',
    admin: 'Admin Portal',
    superadmin: 'Admin Portal'
  };
  return names[role] || 'KODEX';
}

function getPortalAttr(role) {
  if (role === 'superadmin' || role === 'admin' || role === 'manager') return 'admin';
  return role;
}

// ── Apply company white-label branding ────────────────────────────────────────
async function applyBranding() {
  try {
    const mode = currentUser?.company?.mode;
    if (mode !== 'corporate') return; // academic portals use default branding

    const { branding, companyName } = await api('/api/advanced/branding');
    if (!branding) return;

    const root = document.documentElement;

    // Apply primary color CSS variables
    if (branding.primaryColor) {
      root.style.setProperty('--primary', branding.primaryColor);
      root.style.setProperty('--primary-dark', branding.accentColor || branding.primaryColor);
      // Generate a light version for hover/backgrounds
      root.style.setProperty('--primary-light', branding.primaryColor + '20');
    }

    // Inject logo into topbar if provided
    if (branding.logoUrl) {
      const topbarLeft = document.querySelector('.topbar-left');
      if (topbarLeft) {
        // Insert logo before the portal name h2
        const h2 = topbarLeft.querySelector('h2');
        if (h2 && !document.getElementById('brand-logo')) {
          const img = document.createElement('img');
          img.id = 'brand-logo';
          img.src = branding.logoUrl;
          img.alt = companyName || 'Logo';
          img.style.cssText = 'height:28px;width:auto;border-radius:4px;margin-right:4px;vertical-align:middle';
          img.onerror = () => img.remove(); // silently hide if URL broken
          topbarLeft.insertBefore(img, h2);
        }
      }
    }

    // Update page title with company name
    if (companyName) {
      document.title = `${companyName} | KODEX`;
    }

    // Store branding for re-use (e.g. preview in settings)
    window._kodexBranding = branding;

  } catch (e) {
    // Branding is non-critical — fail silently
    console.warn('[Branding] Could not apply branding:', e.message);
  }
}

// ── Reset branding to defaults on logout ──────────────────────────────────────
function resetBranding() {
  const root = document.documentElement;
  root.style.removeProperty('--primary');
  root.style.removeProperty('--primary-dark');
  root.style.removeProperty('--primary-light');
  document.getElementById('brand-logo')?.remove();
  document.title = 'KODEX';
  window._kodexBranding = null;
}

function showForceChangePassword() {
  // Hide auth, show a full-screen forced change overlay
  document.getElementById('auth-page').style.display = 'none';
  const dashPage = document.getElementById('dashboard-page');
  dashPage.classList.remove('hidden');

  // Build a minimal locked UI
  const mc = document.getElementById('main-content');
  const sidebar = document.getElementById('sidebar-nav');
  if (sidebar) sidebar.innerHTML = '';
  const topbarLeft = document.querySelector('.topbar-left');
  if (topbarLeft) topbarLeft.innerHTML = `<h2 style="font-size:16px;font-weight:700">KODEX</h2>`;

  if (mc) mc.innerHTML = `
    <div style="min-height:80vh;display:flex;align-items:center;justify-content:center;padding:24px">
      <div style="background:#fff;border-radius:20px;padding:40px 36px;max-width:420px;width:100%;box-shadow:0 8px 40px rgba(99,102,241,0.12);text-align:center;border:1.5px solid #ede9fe">
        <div style="width:64px;height:64px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:28px">🔐</div>
        <h2 style="font-size:22px;font-weight:800;margin-bottom:8px;color:#1e1b4b">Set Your New Password</h2>
        <p style="color:#6b7280;font-size:14px;margin-bottom:28px;line-height:1.6">Your account has been assigned a temporary password by your administrator.<br>Please set a new password to continue.</p>

        <div id="force-change-error" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px"></div>

        <div style="text-align:left;margin-bottom:14px">
          <label style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;display:block;margin-bottom:6px">New Password</label>
          <input id="force-new-password" type="password" placeholder="At least 8 characters"
            style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box"
            onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#e5e7eb'">
        </div>
        <div style="text-align:left;margin-bottom:24px">
          <label style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;display:block;margin-bottom:6px">Confirm Password</label>
          <input id="force-confirm-password" type="password" placeholder="Repeat your new password"
            style="width:100%;padding:11px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;outline:none;box-sizing:border-box"
            onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#e5e7eb'">
        </div>

        <button onclick="submitForceChangePassword()"
          style="width:100%;padding:13px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;letter-spacing:.3px">
          Set New Password →
        </button>
        <p style="font-size:12px;color:#9ca3af;margin-top:16px">You cannot access the portal until you set a new password.</p>
      </div>
    </div>
  `;
}

async function submitForceChangePassword() {
  const newPassword = document.getElementById('force-new-password')?.value;
  const confirmPassword = document.getElementById('force-confirm-password')?.value;
  const errEl = document.getElementById('force-change-error');

  function showErr(msg) {
    errEl.textContent = msg; errEl.style.display = 'block';
  }

  if (!newPassword || !confirmPassword) return showErr('Please fill in both fields.');
  if (newPassword.length < 8) return showErr('Password must be at least 8 characters.');
  if (newPassword !== confirmPassword) return showErr('Passwords do not match.');

  try {
    await api('/api/users/change-password-after-reset', { method: 'POST', body: JSON.stringify({ newPassword }) });
    currentUser.mustChangePassword = false;
    toast('✅ Password updated! Welcome to KODEX.', 'ok');
    // Re-fetch user data and show dashboard properly
    const data = await api('/api/auth/me');
    currentUser = data.user;
    showDashboard(data);
  } catch(e) {
    showErr(e.message || 'Failed to update password. Please try again.');
  }
}

function showDashboard(data) {
  // If admin forced a password reset, intercept and show change screen
  if (currentUser?.mustChangePassword) {
    showForceChangePassword();
    return;
  }
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
      ${role === 'hod' && currentUser.department ? `<span class="mode-badge" style="background:#ecfeff;color:#0891b2;border:1px solid #a5f3fc;">${currentUser.department}</span>` : `<span class="mode-badge">${mode}</span>`}
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
    // ── Per-user subscription banner (lecturer / manager / admin) ──────────
    // userTrial comes from authController and is always based on the individual
    // user's trialEndDate + subscriptionExpiry — NOT the company trial.
    const PAID_FE = ['lecturer', 'manager', 'admin'];
    const isSubRole = (role === 'employee' || role === 'student' || role === 'hod');
    const userTrial = data.userTrial || null;

    const _bannerEl   = document.getElementById('trial-banner');
    const _expiredEl  = document.getElementById('trial-expired-banner');
    const _hideBoth   = () => { _bannerEl.style.display = 'none'; _expiredEl.style.display = 'none'; };
    const _dayLabel   = n => `${n} day${n !== 1 ? 's' : ''}`;

    if (isSubRole) {
      _hideBoth();
    } else if (PAID_FE.includes(role) && userTrial) {
      const daysLeft = userTrial.daysLeft || 0;
      const status   = userTrial.status;

      if (status === 'active') {
        _expiredEl.style.display = 'none';
        _bannerEl.className = 'trial-banner sub--active';
        _bannerEl.innerHTML = `
          <div class="sub-banner-left">
            <div class="sub-banner-icon sub-banner-icon--active">✓</div>
            <div class="sub-banner-text">
              <span class="sub-banner-title">Subscription Active</span>
              <span class="sub-banner-sep">·</span>
              <span class="sub-banner-detail">${_dayLabel(daysLeft)} remaining</span>
            </div>
          </div>
          <div class="sub-banner-right">
            <div class="sub-banner-pill">Active</div>
          </div>`;
        _bannerEl.style.display = 'flex';

      } else if (status === 'trial' && daysLeft > 0) {
        const urgent = daysLeft <= 3;
        _expiredEl.style.display = 'none';
        _bannerEl.className = `trial-banner ${urgent ? 'sub--urgent' : 'sub--trial'}`;
        _bannerEl.innerHTML = `
          <div class="sub-banner-left">
            <div class="sub-banner-icon sub-banner-icon--${urgent ? 'urgent' : 'trial'}">${urgent ? '⚠' : '⏳'}</div>
            <div class="sub-banner-text">
              <span class="sub-banner-title">${urgent ? 'Trial Ending Soon' : 'Free Trial'}</span>
              <span class="sub-banner-sep">·</span>
              <span class="sub-banner-detail">${_dayLabel(daysLeft)} remaining</span>
            </div>
          </div>
          <div class="sub-banner-right">
            <div class="sub-banner-pill">${urgent ? 'Expiring' : 'Trial'}</div>
            <button class="sub-banner-cta" onclick="navigateTo('subscription')">${urgent ? 'Upgrade Now' : 'Upgrade'}</button>
          </div>`;
        _bannerEl.style.display = 'flex';

      } else {
        const _mode  = currentUser?.company?.mode || 'academic';
        const _label = _mode === 'corporate' ? 'GHS 150 / mo' : 'GHS 300 / semester';
        _bannerEl.style.display = 'none';
        _expiredEl.className = 'trial-expired-banner';
        _expiredEl.innerHTML = `
          <div class="sub-banner-left">
            <div class="sub-banner-icon sub-banner-icon--expired">✕</div>
            <div class="sub-banner-text">
              <span class="sub-banner-title">Trial Expired</span>
              <span class="sub-banner-sep">·</span>
              <span class="sub-banner-detail">Subscribe to continue — ${_label} via Paystack</span>
            </div>
          </div>
          <div class="sub-banner-right">
            <button class="sub-banner-cta" onclick="paySubscription()">Subscribe Now</button>
          </div>`;
        _expiredEl.style.display = 'flex';
      }

    } else if (trial && trial.active) {
      const tr = trial.timeRemaining || {};
      _expiredEl.style.display = 'none';
      _bannerEl.className = 'trial-banner sub--trial';
      _bannerEl.innerHTML = `
        <div class="sub-banner-left">
          <div class="sub-banner-icon sub-banner-icon--trial">⏳</div>
          <div class="sub-banner-text">
            <span class="sub-banner-title">Company Trial</span>
            <span class="sub-banner-sep">·</span>
            <span class="sub-banner-detail">${trial.daysRemaining} days remaining (${tr.days || 0}d ${tr.hours || 0}h ${tr.minutes || 0}m)</span>
          </div>
        </div>
        <div class="sub-banner-right"><div class="sub-banner-pill">Trial</div></div>`;
      _bannerEl.style.display = 'flex';

    } else {
      _hideBoth();
    }

    buildSidebar();
  loadAnnBadge();
    applyBranding(); // async — applies colors/logo in background
    // If student arrived via QR scan link, go straight to mark-attendance to auto-submit
    if (new URLSearchParams(window.location.search).get('qr_token')) {
      navigateTo('mark-attendance');
    } else {
      navigateTo('dashboard');
    }
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
        links.push({ id: 'gradebook', label: 'Grade Book', icon: svgIcon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>') });
        links.push({ id: 'announcements', label: 'Announcements', icon: svgIcon('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') });
        links.push({ id: 'programmes', label: 'Programmes', icon: svgIcon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>') });
      }
      if (currentUser.company?.mode === 'corporate') {
        links.push({ id: 'sign-in-out', label: 'Sign In / Out', icon: attendanceIcon() });
        links.push({ id: 'shifts', label: 'Shifts', icon: svgIcon('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>') });
        links.push({ id: 'leave-requests', label: 'Leave Requests', icon: svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>') });
        links.push({ id: 'payroll', label: 'Payroll', icon: svgIcon('<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>') });
        links.push({ id: 'audit-logs', label: 'Audit Logs', icon: svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="10" y2="9"/>') });
      }
      links.push({ id: 'messages', label: 'Messages', icon: svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      links.push({ id: 'faq-center', label: 'FAQ Center', icon: svgIcon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>') });
      links.push({ id: 'subscription', label: 'Subscription', icon: subscriptionIcon() });
      break;
    case 'manager':
      links.push({ id: 'approvals', label: 'Approvals', icon: approvalsIcon() });
      links.push({ id: 'sessions', label: 'Sessions', icon: sessionsIcon() });
      links.push({ id: 'users', label: 'Users', icon: usersIcon() });
      if (currentUser.company?.mode === 'corporate') {
        links.push({ id: 'sign-in-out', label: 'Sign In / Out', icon: attendanceIcon() });
        links.push({ id: 'shifts', label: 'Shifts', icon: svgIcon('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>') });
        links.push({ id: 'leave-requests', label: 'Leave Requests', icon: svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>') });
        links.push({ id: 'payroll', label: 'Payroll', icon: svgIcon('<rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>') });
      }
      links.push({ id: 'messages', label: 'Messages', icon: svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      links.push({ id: 'faq-center', label: 'FAQ Center', icon: svgIcon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>') });
      break;
    case 'hod':
      links.push({ id: 'hod-overview',     label: 'Overview',       icon: svgIcon('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>') });
      links.push({ id: 'hod-sessions',     label: 'Sessions',       icon: sessionsIcon() });
      links.push({ id: 'hod-courses',      label: 'Courses',        icon: coursesIcon() });
      links.push({ id: 'hod-lecturers',    label: 'Lecturers',      icon: svgIcon('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>') });
      links.push({ id: 'hod-students',     label: 'Students',       icon: usersIcon() });
      links.push({ id: 'meetings',         label: 'Meetings',       icon: meetingsIcon() });
      links.push({ id: 'hod-reports',      label: 'Reports',        icon: reportsIcon() });
      links.push({ id: 'approvals',           label: 'Approvals',        icon: approvalsIcon() });
      links.push({ id: 'hod-course-approvals',label: 'Course Approvals', icon: svgIcon('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>') });
      links.push({ id: 'hod-unlock-students', label: 'Locked Students',  icon: svgIcon('<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>') });
      links.push({ id: 'announcements',    label: 'Announcements',  icon: svgIcon('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') });
      links.push({ id: 'messages',         label: 'Messages',       icon: svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') });
      links.push({ id: 'faq-center',       label: 'FAQ Center',     icon: svgIcon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>') });
      break;
    case 'lecturer':
      links.push({ id: 'sessions', label: 'Sessions', icon: sessionsIcon() });
      links.push({ id: 'search', label: 'Search', icon: svgIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>') });
      links.push({ id: 'courses', label: 'Courses', icon: coursesIcon() });
      links.push({ id: 'quizzes', label: 'Quizzes', icon: quizzesIcon() });
      links.push({ id: 'timetable', label: 'Schedule', icon: svgIcon('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>') });
      links.push({ id: 'question-bank', label: 'Question Bank', icon: svgIcon('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>') });
      links.push({ id: 'assignments', label: 'Assignments / Quiz', icon: assignmentsIcon() });
      links.push({ id: 'gradebook', label: 'Grade Book', icon: svgIcon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>') });
      links.push({ id: 'messages', label: 'Messages', icon: svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'lecturer-performance', label: 'Performance', icon: svgIcon('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>') });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      links.push({ id: 'announcements', label: 'Announcements', icon: svgIcon('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') });
      links.push({ id: 'faq-center', label: 'FAQ Center', icon: svgIcon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>') });
      links.push({ id: 'subscription', label: 'Subscription', icon: subscriptionIcon() });
      break;
    case 'employee':
      links.push({ id: 'sign-in-out', label: 'Clock In / Out', icon: attendanceIcon() });
      links.push({ id: 'my-attendance', label: 'My Attendance', icon: sessionsIcon() });
      links.push({ id: 'my-shift', label: 'My Shift', icon: svgIcon('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>') });
      links.push({ id: 'my-leaves', label: 'Leave', icon: svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>') });
      links.push({ id: 'messages', label: 'Messages', icon: svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'support', label: 'Support', icon: svgIcon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>') });
      links.push({ id: 'faq-center', label: 'FAQ Center', icon: svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="12" y1="7" x2="12" y2="13"/>') });
      links.push({ id: 'reports', label: 'Reports', icon: reportsIcon() });
      break;
    case 'student':
      links.push({ id: 'mark-attendance', label: 'Mark Attendance', icon: attendanceIcon() });
      links.push({ id: 'my-attendance', label: 'My Attendance', icon: sessionsIcon() });
      links.push({ id: 'courses', label: 'My Courses', icon: coursesIcon() });
      links.push({ id: 'quizzes', label: 'Quizzes', icon: quizzesIcon() });
      links.push({ id: 'timetable', label: 'Schedule', icon: svgIcon('<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>') });
      links.push({ id: 'quiz-history', label: 'My Results', icon: svgIcon('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>') });
      links.push({ id: 'assignments', label: 'Assignments / Quiz', icon: assignmentsIcon() });
      links.push({ id: 'gradebook', label: 'My Grades', icon: svgIcon('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>') });
      links.push({ id: 'messages', label: 'Messages', icon: svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>') });
      links.push({ id: 'meetings', label: 'Meetings', icon: meetingsIcon() });
      links.push({ id: 'support', label: 'Support', icon: svgIcon('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>') });
      links.push({ id: 'faq-center', label: 'FAQ Center', icon: svgIcon('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/><line x1="12" y1="7" x2="12" y2="13"/>') });
      links.push({ id: 'announcements', label: 'Announcements', icon: svgIcon('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>') });
      break;
    case 'superadmin':
      links.push({ id: 'superadmin-platform', label: 'Platform',   icon: svgIcon('<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>') });
      links.push({ id: 'approvals',            label: 'Approvals',  icon: approvalsIcon() });
      links.push({ id: 'search',               label: 'Search',     icon: svgIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>') });
      break;
  }

  // Universal links shown for all roles
  const universalLinks = [
    { id: 'profile',  label: 'My Profile',  icon: svgIcon('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>') },
    { id: 'contact',  label: 'Contact Us',  icon: svgIcon('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 13a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.06 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 21 17z"/>') },
    { id: 'about',    label: 'About',       icon: svgIcon('<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>') },
  ];

  // Inject divider below logo if not already present
  const sidebar = document.querySelector('.sidebar');
  if (sidebar && !sidebar.querySelector('.sidebar-divider-line')) {
    const divider = document.createElement('div');
    divider.className = 'sidebar-divider-line';
    const logo = sidebar.querySelector('.sidebar-logo');
    if (logo) logo.after(divider);
  }

  nav.innerHTML =
    [...links, ...universalLinks].map(l => `<a onclick="navigateTo('${l.id}')" id="nav-${l.id}" data-tooltip="${l.label}">${l.id==='announcements'?'<div class="ann-line"></div>':''} ${l.icon}<span>${l.label}</span>${l.id==='announcements'?'<span id="ann-badge" style="display:none;position:absolute;top:4px;right:4px;background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:20px;min-width:14px;text-align:center;line-height:14px;"></span>':''}</a>`).join('');
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
    case 'quiz-history': renderStudentQuizHistory(); break;
    case 'lecturer-performance': renderLecturerPerformance(); break;
    case 'timetable': currentUser.role === 'student' ? renderStudentTimetable() : renderLecturerTimetable(); break;
    case 'question-bank': renderQuestionBank(); break;
    case 'my-attendance': renderMyAttendance(); break;
    case 'mark-attendance': renderMarkAttendance(); break;
    case 'sign-in-out': renderSignInOut(); break;
    case 'subscription': renderSubscription(); break;
    case 'reports': renderReports(); break;
    case 'shifts': renderShifts(); break;
    case 'leave-requests': renderLeaveRequests(); break;
    case 'my-shift': renderMyShift(); break;
    case 'my-leaves': renderMyLeaves(); break;
    case 'approvals': renderApprovals(); break;
    case 'search': renderSearch(); break;
    case 'assignments': location.href='/assignments.html'; return;
    case 'profile':     renderProfile(); break;
    case 'contact':     renderContact(); break;
    case 'about':       renderAbout(); break;
    case 'superadmin-platform': renderSuperadminDashboard(document.getElementById('main-content')); break;
    case 'hod-overview':         renderHodDashboard(document.getElementById('main-content')); break;
    case 'hod-courses':          renderHodCourses(); break;
    case 'hod-sessions':         renderHodSessions(); break;
    case 'hod-lecturers':        renderHodLecturers(); break;
    case 'hod-students':         renderHodStudents(); break;
    case 'hod-reports':          renderHodReports(); break;

    case 'hod-course-approvals': renderHodCourseApprovals(); break;
    case 'hod-unlock-students':  renderHodUnlockStudents(); break;
    case 'announcements': renderAnnouncements(); break;
    case 'gradebook': renderGradeBook(); break;
    case 'training':       renderTraining(); break;
    case 'my-training':    renderMyTraining(); break;
    case 'performance':
      if (currentUser.role === 'lecturer') renderLecturerPerformance();
      else if (currentUser.role === 'student') renderStudentQuizHistory();
      else renderPerformance();
      break;
    case 'my-performance':
      if (currentUser.role === 'lecturer') renderLecturerPerformance();
      else if (currentUser.role === 'student') renderStudentQuizHistory();
      else renderPerformance();
      break;
    case 'timesheets':     renderTimesheets(); break;
    case 'my-timesheet':   renderMyTimesheet(); break;
    case 'expenses-mgr':   renderExpensesMgr(); break;
    case 'my-expenses':    renderMyExpenses(); break;
    case 'assets':         renderAssets(); break;
    case 'my-assets':      renderMyAssets(); break;
    case 'messages':      renderMessages(); break;
    case 'faq-center':    _safeRender(content, renderFAQCenter,    'FAQ Center');    break;
    case 'support':       _safeRender(content, renderSupport,      'Support');       break;
    case 'payroll':       _safeRender(content, renderPayroll,      'Payroll');       break;
    case 'audit-logs':    _safeRender(content, renderAuditLogs,    'Audit Logs');    break;
    case 'programmes':    _safeRender(content, renderProgrammes,   'Programmes');    break;
    case 'calendar-events': _safeRender(content, renderCalendarEvents, 'Calendar'); break;
    case 'forums':        _safeRender(content, renderForums,       'Forums');        break;
    case 'badges':        _safeRender(content, renderBadges,       'Badges');        break;
    case 'transcripts':   _safeRender(content, renderTranscripts,  'Transcripts');   break;
    case 'evaluations':   _safeRender(content, renderEvaluations,  'Evaluations');   break;
    default: renderDashboard();
  }
}

/** Call a render function from an external module file safely.
 *  If the function is not yet defined (module not loaded) or throws synchronously,
 *  display a graceful error card instead of leaving the page on "Loading…".
 */
function _safeRender(content, fn, label) {
  try {
    if (typeof fn !== 'function') throw new Error(`${label} module not loaded yet — please refresh the page.`);
    fn();
  } catch (e) {
    if (content) content.innerHTML = `
      <div class="card" style="margin-top:20px;border-left:4px solid var(--danger)">
        <div style="font-size:14px;font-weight:700;color:var(--danger);margin-bottom:6px">${label} failed to load</div>
        <div style="font-size:13px;color:var(--text-secondary)">${e.message || 'Unknown error'}</div>
        <button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="navigateTo('dashboard')">← Back to Dashboard</button>
      </div>`;
  }
}

async function renderDashboard() {
  const content = document.getElementById('main-content');
  if (!content) return;
  const role = currentUser.role;

  // Clear immediately so stale content from a previous role never flashes
  content.innerHTML = `<div class="dashboard-skeleton">
    <div class="skeleton-header"></div>
    <div class="skeleton-cards">
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
      <div class="skeleton-card"></div>
    </div>
    <div class="skeleton-body"></div>
  </div>`;

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
      case 'hod':
        await renderHodDashboard(content);
        break;
      case 'employee':
        await renderEmployeeDashboard(content);
        break;
      case 'student':
        await renderStudentDashboard(content);
        break;
      case 'superadmin':
        await renderSuperadminDashboard(content);
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
    const isHod = currentUser.role === 'hod';

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Pending Approvals</h2>
          <p>${isHod ? `Lecturer approval requests for <strong>${currentUser.department || 'your department'}</strong>` : 'Review and approve registration requests'}</p>
        </div>
      </div>
      <div class="card">
        ${pending.length ? `
          <table>
            <thead><tr><th>Name</th><th>Email / ID</th><th>Role</th>${!isHod ? '<th>Department</th>' : ''}<th>Registered</th><th>Actions</th></tr></thead>
            <tbody>${pending.map(u => `
              <tr>
                <td style="font-weight:500">${u.name}</td>
                <td>${u.email || u.IndexNumber || u.indexNumber || 'N/A'}</td>
                <td><span class="status-badge status-active">${u.role}</span></td>
                ${!isHod ? `<td>${u.department ? `<span style="font-size:11px;padding:2px 7px;border-radius:20px;background:#ecfeff;color:#0891b2;font-weight:600;">${u.department}</span>` : '—'}</td>` : ''}
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
    toastError(e.message);
  }
}

async function rejectUser(userId) {
  if (!confirm('Reject and remove this user? This cannot be undone.')) return;
  try {
    await api(`/api/approvals/${userId}/reject`, { method: 'DELETE' });
    renderApprovals();
  } catch (e) {
    toastError(e.message);
  }
}

function exitImpersonation() {
  localStorage.removeItem('token');
  token = null;
  currentUser = null;
  window.location.href = '/superadmin';
}

async function superadminToggleCompany(id, currentlyActive) {
  const action = currentlyActive ? 'deactivate' : 'activate';
  if (!confirm('Are you sure you want to ' + action + ' this institution?')) return;
  try {
    await api('/api/superadmin/companies/' + id + '/toggle', { method: 'PATCH' });
    toastSuccess('Institution ' + (currentlyActive ? 'deactivated' : 'activated') + ' ✓');
    renderSuperadminDashboard(document.getElementById('main-content'));
  } catch(e) { toastError(e.message); }
}

async function superadminExtendTrial(id, name) {
  const days = prompt('Extend trial for "' + name + '"\nHow many days to add?', '14');
  if (!days || isNaN(days) || parseInt(days) < 1) return;
  try {
    const data = await api('/api/superadmin/companies/' + id + '/extend-trial', {
      method: 'PATCH',
      body: JSON.stringify({ days: parseInt(days) })
    });
    toastSuccess(data.message || 'Trial extended ✓');
    renderSuperadminDashboard(document.getElementById('main-content'));
  } catch(e) { toastError(e.message); }
}

async function superadminImpersonate(companyId, name) {
  if (!confirm('Login as admin of "' + name + '"?\n\nThis gives you full admin access for 1 hour. A separate tab will open.')) return;
  try {
    const data = await api('/api/superadmin/impersonate/' + companyId, { method: 'POST' });
    // Open a new tab with the impersonation token
    const url = '/?impersonate=' + encodeURIComponent(data.token) + '&company=' + encodeURIComponent(name);
    window.open(url, '_blank');
    toastSuccess('Impersonation tab opened · expires in 1 hour');
  } catch(e) { toastError(e.message); }
}

async function superadminShowPayments() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading payment history…</div>';
  try {
    const data = await api('/api/superadmin/payments');
    const payments = data.payments || [];
    const total = data.totalRevenue || 0;
    content.innerHTML = `
      <div class="page-header">
        <div><h2>Payment History</h2><p>GHS ${total.toLocaleString()} total revenue · ${payments.length} payments</p></div>
        <button class="btn btn-secondary btn-sm" onclick="renderSuperadminDashboard(document.getElementById('main-content'))">← Back</button>
      </div>
      <div class="card">
        ${payments.length === 0 ? '<div class="empty-state"><p>No payments recorded yet. Payments appear here after Paystack webhook fires.</p></div>' :
          `<div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead><tr style="border-bottom:2px solid var(--border);">
                <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Institution</th>
                <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Amount</th>
                <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Plan</th>
                <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Reference</th>
                <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Date</th>
              </tr></thead>
              <tbody>
                ${payments.map(p => `
                  <tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:10px 12px;font-weight:600;">${p.company?.name || '—'}<br><span style="font-size:11px;color:var(--text-muted);font-family:monospace;">${p.company?.institutionCode || ''}</span></td>
                    <td style="padding:10px 12px;font-weight:700;color:#16a34a;">GHS ${(p.amount || 0).toLocaleString()}</td>
                    <td style="padding:10px 12px;"><span class="tag ${p.plan === 'yearly' ? 'tag-blue' : 'tag-green'}">${p.plan || 'unknown'}</span></td>
                    <td style="padding:10px 12px;font-size:11px;font-family:monospace;color:var(--text-muted);">${p.reference || '—'}</td>
                    <td style="padding:10px 12px;color:var(--text-muted);font-size:12px;">${fmtDate(p.paidAt)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}
      </div>`;
  } catch(e) {
    content.innerHTML = '<div class="card"><p style="color:#ef4444;">' + e.message + '</p></div>';
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  HOD — DASHBOARD & VIEWS
// ════════════════════════════════════════════════════════════════════════════
async function renderHodDashboard(content) {
  if (!content) content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading overview…</div>';

  // Warn if HOD has no department assigned
  if (!currentUser.department) {
    content.innerHTML = `
      <div class="page-header"><div><h2>Department Overview</h2></div></div>
      <div style="padding:16px 18px;background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;margin-bottom:18px;display:flex;gap:12px;align-items:center;">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div>
          <div style="font-weight:700;font-size:13px;color:#92400e;">No Department Assigned</div>
          <div style="font-size:12px;color:#b45309;margin-top:2px;">Your account has no department set. Please ask your institution admin to update your profile with your department name. Until then you will see all data in the institution.</div>
        </div>
      </div>`;
    // Continue loading without department filter
  }

  try {
    const [sessData, userStats] = await Promise.all([
      api('/api/attendance-sessions?limit=5'),
      api('/api/users/stats')
    ]);
    const sessions   = sessData.sessions   || [];
    const stats      = userStats           || {};
    const lecturers  = stats.lecturers     || 0;
    const students   = stats.students      || 0;
    const hods       = stats.hods          || 0;
    const activeSess = sessions.filter(s => s.active).length;

    content.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Department Overview</h2>
          <p>Welcome back, ${currentUser.name} · <strong style="color:#0891b2;">${currentUser.department || 'No Department Assigned'}</strong> — ${currentUser.company?.name || ''}</p>
        </div>
      </div>
      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card" onclick="navigateTo('hod-lecturers')" style="cursor:pointer">
          <div class="stat-value" style="color:#0891b2">${lecturers}</div>
          <div class="stat-label">LECTURERS</div>
        </div>
        <div class="stat-card" onclick="navigateTo('hod-students')" style="cursor:pointer">
          <div class="stat-value" style="color:#0891b2">${students}</div>
          <div class="stat-label">STUDENTS</div>
        </div>
        <div class="stat-card" onclick="navigateTo('hod-sessions')" style="cursor:pointer">
          <div class="stat-value" style="color:#0891b2">${sessions.length}</div>
          <div class="stat-label">SESSIONS (RECENT)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:${activeSess > 0 ? '#16a34a' : '#9ca3af'}">${activeSess}</div>
          <div class="stat-label">LIVE NOW</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;flex-wrap:wrap;">
        <div class="card">
          <div style="font-size:13px;font-weight:700;margin-bottom:12px;">Recent Sessions</div>
          ${sessions.length === 0 ? '<p style="color:var(--text-muted);font-size:13px;">No sessions yet.</p>' :
            sessions.slice(0,5).map(s => `
              <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
                <div>
                  <div style="font-size:13px;font-weight:600;">${s.title || s.courseName || 'Untitled'}</div>
                  <div style="font-size:11px;color:var(--text-muted);">${s.createdBy?.name || '—'} · ${timeAgo(s.createdAt)}</div>
                </div>
                <span class="tag ${s.active ? 'tag-green' : 'tag-gray'}">${s.active ? 'Live' : 'Ended'}</span>
              </div>`).join('')
          }
          <button class="btn btn-secondary btn-sm" style="margin-top:12px;width:100%;" onclick="navigateTo('hod-sessions')">View All Sessions →</button>
        </div>

        <div class="card">
          <div style="font-size:13px;font-weight:700;margin-bottom:12px;">Quick Actions</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button class="btn btn-secondary" onclick="navigateTo('hod-lecturers')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              View Lecturers
            </button>
            <button class="btn btn-secondary" onclick="navigateTo('hod-students')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              View Students
            </button>
            <button class="btn btn-secondary" onclick="navigateTo('hod-reports')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Department Reports
            </button>
            <button class="btn btn-primary" onclick="navigateTo('announcements')">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              Post Announcement
            </button>
            <button class="btn btn-secondary" onclick="navigateTo('approvals')" id="hod-approvals-btn">Pending Approvals</button>
            <button class="btn btn-secondary" onclick="navigateTo('hod-course-approvals')" id="hod-course-approvals-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
              Course Approvals
            </button>
            <button class="btn btn-secondary" onclick="navigateTo('hod-unlock-students')" id="hod-locked-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Locked Students
            </button>
            <div style="border-top:1px solid var(--border);padding-top:8px;margin-top:4px;">
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);margin-bottom:6px;">Export</div>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn btn-xs btn-secondary" onclick="hodExportCSV('students')">Students CSV</button>
                <button class="btn btn-xs btn-secondary" onclick="hodExportCSV('lecturers')">Lecturers CSV</button>
                <button class="btn btn-xs btn-secondary" onclick="hodExportCSV('attendance')">Attendance CSV</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
    api('/api/approvals/pending').then(d => {
      const count = (d.pending || []).length;
      const btn = document.getElementById('hod-approvals-btn');
      if (btn && count > 0) btn.innerHTML += ' <span style="background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:20px;margin-left:4px;">' + count + '</span>';
    }).catch(() => {});
    api('/api/hod/pending-courses').then(d => {
      const count = (d.courses || []).length;
      const btn = document.getElementById('hod-course-approvals-btn');
      if (btn && count > 0) btn.innerHTML += ' <span style="background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:20px;margin-left:4px;">' + count + '</span>';
    }).catch(() => {});
    api('/api/hod/locked-students').then(d => {
      const count = (d.students || []).length;
      const btn = document.getElementById('hod-locked-btn');
      if (btn && count > 0) btn.innerHTML += ' <span style="background:#ef4444;color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:20px;margin-left:4px;">' + count + '</span>';
    }).catch(() => {});
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">Error loading dashboard: ${e.message}</p></div>`;
  }
}

async function renderHodSessions() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading sessions…</div>';
  try {
    const dept = currentUser.department ? '&department=' + encodeURIComponent(currentUser.department) : '';
    const data = await api('/api/attendance-sessions?limit=100' + dept);
    const sessions = data.sessions || [];
    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
        <div><h2>All Sessions</h2><p>Department-wide attendance sessions — ${sessions.length} total</p></div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid var(--border);">
              <th style="text-align:left;padding:10px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Session</th>
              <th style="text-align:left;padding:10px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Lecturer</th>
              <th style="text-align:left;padding:10px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Attendance</th>
              <th style="text-align:left;padding:10px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Date</th>
              <th style="text-align:left;padding:10px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${sessions.length === 0 ? '<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--text-muted);">No sessions yet.</td></tr>' :
              sessions.map(s => `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:10px 12px;font-weight:600;">${s.title || s.courseName || 'Session'}</td>
                  <td style="padding:10px 12px;color:var(--text-muted);">${s.createdBy?.name || '—'}</td>
                  <td style="padding:10px 12px;">${s.attendanceCount ?? s.records?.length ?? '—'}</td>
                  <td style="padding:10px 12px;color:var(--text-muted);font-size:12px;">${fmtDate(s.createdAt)}</td>
                  <td style="padding:10px 12px;"><span class="tag ${s.active ? 'tag-green' : 'tag-gray'}">${s.active ? 'Live' : 'Ended'}</span></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">${e.message}</p></div>`;
  }
}

async function renderHodLecturers() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading lecturers…</div>';
  try {
    const dept = currentUser.department ? '&department=' + encodeURIComponent(currentUser.department) : '';
    const data = await api('/api/users?role=lecturer&limit=200' + dept);
    const lecturers = data.users || [];
    content.innerHTML = `
      <div class="page-header">
        <div><h2>Lecturers</h2><p>${lecturers.length} lecturer${lecturers.length !== 1 ? 's' : ''} in your institution</p></div>
        <button class="btn btn-secondary btn-sm" onclick="hodExportCSV('lecturers')">Export CSV</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;">
        ${lecturers.length === 0 ? '<div class="empty-state"><p>No lecturers found.</p></div>' :
          lecturers.map(u => `
            <div class="card" style="display:flex;align-items:center;gap:12px;padding:14px 16px;">
              <div style="width:38px;height:38px;border-radius:50%;background:#ecfeff;color:#0891b2;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:15px;flex-shrink:0;">
                ${(u.name||'?')[0].toUpperCase()}
              </div>
              <div style="min-width:0;flex:1;">
                <div style="font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.name}</div>
                <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${u.email}</div>
                <div style="display:flex;gap:6px;align-items:center;margin-top:4px;flex-wrap:wrap;">
                  <span class="tag ${u.isApproved ? 'tag-green' : 'tag-amber'}">${u.isApproved ? 'Active' : 'Pending'}</span>
                  ${u.department ? `<span style="font-size:10px;padding:2px 6px;border-radius:20px;background:#ecfeff;color:#0891b2;font-weight:600;">${u.department}</span>` : ''}
                  
                </div>
              </div>
            </div>`).join('')}
      </div>`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">${e.message}</p></div>`;
  }
}

async function renderHodStudents() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading students…</div>';
  try {
    const dept = currentUser.department ? '&department=' + encodeURIComponent(currentUser.department) : '';
    const data = await api('/api/users?role=student&limit=500' + dept);
    const students = data.users || [];
    content.innerHTML = `
      <div class="page-header">
        <div><h2>Students</h2><p>${students.length} student${students.length !== 1 ? 's' : ''} enrolled</p></div>
        <div style="display:flex;gap:8px;align-items:center;">
          <button class="btn btn-secondary btn-sm" onclick="hodExportCSV('students')">Export CSV</button>
          <input id="hod-stu-search" placeholder="Search students…" oninput="hodFilterStudents()" style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;min-width:200px;">
        </div>
      </div>
      <div id="hod-stu-list" style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid var(--border);">
              <th style="text-align:left;padding:10px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Name</th>
              <th style="text-align:left;padding:10px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Index No.</th>
              <th style="text-align:left;padding:10px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Programme</th>
              <th style="text-align:left;padding:10px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Level / Group</th>
              <th style="text-align:left;padding:10px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Session</th>
              <th style="text-align:left;padding:10px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Status</th>
              <th style="text-align:left;padding:10px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;"></th>
            </tr>
          </thead>
          <tbody id="hod-stu-tbody">
            ${students.length === 0 ? '<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--text-muted);">No students found.</td></tr>' :
              students.map(u => `
                <tr class="hod-stu-row" data-name="${(u.name||'').toLowerCase()}" data-index="${(u.indexNumber||'').toLowerCase()}" style="border-bottom:1px solid var(--border);">
                  <td style="padding:10px 12px;font-weight:600;">${u.name}</td>
                  <td style="padding:10px 12px;color:var(--text-muted);font-family:monospace;">${u.IndexNumber || u.indexNumber || '—'}</td>
                  <td style="padding:10px 12px;">${u.programme ? `<span style="background:#ede9fe;color:#7c3aed;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700">${esc(u.programme)}</span>` : '—'}</td>
                  <td style="padding:10px 12px;">
                    ${u.studentLevel ? `<span style="background:#dbeafe;color:#1d4ed8;padding:2px 7px;border-radius:20px;font-size:11px;font-weight:700;margin-right:3px">L${esc(u.studentLevel)}</span>` : ''}
                    ${u.studentGroup ? `<span style="background:#ecfdf5;color:#059669;padding:2px 7px;border-radius:20px;font-size:11px;font-weight:700">Grp ${esc(u.studentGroup)}</span>` : ''}
                    ${!u.studentLevel && !u.studentGroup ? '—' : ''}
                  </td>
                  <td style="padding:10px 12px;">
                    ${u.sessionType ? `<span style="background:#fff7ed;color:#c2410c;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600">${esc(u.sessionType)}</span>` : '—'}
                    ${u.semester ? `<span style="font-size:11px;color:var(--text-muted);margin-left:4px">Sem ${esc(u.semester)}</span>` : ''}
                  </td>
                  <td style="padding:10px 12px;"><span class="tag ${u.isApproved ? 'tag-green' : 'tag-amber'}">${u.isApproved ? 'Active' : 'Pending'}</span></td>
                  <td style="padding:10px 12px;"><button class="btn btn-xs btn-secondary" onclick="hodViewStudentAttendance('${u._id}','${u.name.replace(/'/g,"\\'")}')">Attendance</button></td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">${e.message}</p></div>`;
  }
}

function hodFilterStudents() {
  const q = (document.getElementById('hod-stu-search')?.value || '').toLowerCase();
  document.querySelectorAll('.hod-stu-row').forEach(row => {
    const match = row.dataset.name.includes(q) || row.dataset.index.includes(q);
    row.style.display = match ? '' : 'none';
  });
}

async function renderHodReports() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading reports…</div>';
  try {
    const hodDept = currentUser.department ? '&department=' + encodeURIComponent(currentUser.department) : '';
    const [sessData, userStats] = await Promise.all([
      api('/api/attendance-sessions?limit=200' + hodDept),
      api('/api/users/stats' + (currentUser.department ? '?department=' + encodeURIComponent(currentUser.department) : ''))
    ]);
    const sessions  = sessData.sessions || [];
    const stats     = userStats || {};
    const ended     = sessions.filter(s => !s.active);
    const totalAtt  = ended.reduce((sum, s) => sum + (s.attendanceCount ?? s.records?.length ?? 0), 0);
    const avgAtt    = ended.length ? Math.round(totalAtt / ended.length) : 0;

    // Group sessions by lecturer
    const byLecturer = {};
    sessions.forEach(s => {
      const name = s.createdBy?.name || 'Unknown';
      if (!byLecturer[name]) byLecturer[name] = { sessions: 0, attendance: 0 };
      byLecturer[name].sessions++;
      byLecturer[name].attendance += s.attendanceCount ?? s.records?.length ?? 0;
    });
    const lecRows = Object.entries(byLecturer).sort((a,b) => b[1].sessions - a[1].sessions);

    // Group sessions by course for attendance rate
    const byCourse = {};
    sessions.forEach(s => {
      const name = s.courseName || s.title || 'Unknown Course';
      if (!byCourse[name]) byCourse[name] = { sessions: 0, attendance: 0, enrolled: s.enrolledCount || 0 };
      byCourse[name].sessions++;
      byCourse[name].attendance += s.attendanceCount ?? s.records?.length ?? 0;
      if (s.enrolledCount > byCourse[name].enrolled) byCourse[name].enrolled = s.enrolledCount;
    });
    const courseRows = Object.entries(byCourse).sort((a,b) => b[1].sessions - a[1].sessions);

    content.innerHTML = `
      <div class="page-header"><div><h2>Department Reports</h2><p>Attendance and activity overview</p></div></div>

      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card"><div class="stat-value" style="color:#0891b2">${sessions.length}</div><div class="stat-label">TOTAL SESSIONS</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#0891b2">${totalAtt}</div><div class="stat-label">TOTAL ATTENDANCE</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#0891b2">${avgAtt}</div><div class="stat-label">AVG ATTENDANCE</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#0891b2">${stats.lecturers || 0}</div><div class="stat-label">LECTURERS</div></div>
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:14px;">Attendance Rate by Course</div>
        ${courseRows.length === 0 ? '<p style="color:var(--text-muted);font-size:13px;">No data yet.</p>' : `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid var(--border);">
              <th style="text-align:left;padding:8px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Course</th>
              <th style="text-align:left;padding:8px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Sessions</th>
              <th style="text-align:left;padding:8px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Total Attendance</th>
              <th style="text-align:left;padding:8px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Avg / Session</th>
              <th style="text-align:left;padding:8px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Rate</th>
            </tr>
          </thead>
          <tbody>
            ${courseRows.map(([name, d]) => {
              const avg = d.sessions ? Math.round(d.attendance / d.sessions) : 0;
              const rate = d.enrolled > 0 ? Math.round((avg / d.enrolled) * 100) : null;
              const rateColor = rate === null ? '#9ca3af' : rate >= 75 ? '#16a34a' : rate >= 50 ? '#d97706' : '#dc2626';
              return `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:9px 12px;font-weight:600;">${name}</td>
                <td style="padding:9px 12px;">${d.sessions}</td>
                <td style="padding:9px 12px;">${d.attendance}</td>
                <td style="padding:9px 12px;">${avg}</td>
                <td style="padding:9px 12px;">
                  ${rate !== null
                    ? `<span style="font-weight:700;color:${rateColor}">${rate}%</span>
                       <div style="height:4px;background:var(--border);border-radius:2px;margin-top:3px;width:80px;">
                         <div style="height:4px;background:${rateColor};border-radius:2px;width:${Math.min(rate,100)}%"></div>
                       </div>`
                    : '<span style="color:var(--text-muted)">—</span>'
                  }
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>

      <div class="card" style="margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:14px;">Attendance by Lecturer</div>
        ${lecRows.length === 0 ? '<p style="color:var(--text-muted);font-size:13px;">No data yet.</p>' : `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid var(--border);">
              <th style="text-align:left;padding:8px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Lecturer</th>
              <th style="text-align:left;padding:8px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Sessions</th>
              <th style="text-align:left;padding:8px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Total Attendance</th>
              <th style="text-align:left;padding:8px 12px;font-weight:700;color:var(--text-muted);font-size:11px;text-transform:uppercase;">Avg / Session</th>
            </tr>
          </thead>
          <tbody>
            ${lecRows.map(([name, d]) => `
              <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:9px 12px;font-weight:600;">${name}</td>
                <td style="padding:9px 12px;">${d.sessions}</td>
                <td style="padding:9px 12px;">${d.attendance}</td>
                <td style="padding:9px 12px;color:var(--text-muted);">${d.sessions ? Math.round(d.attendance / d.sessions) : 0}</td>
              </tr>`).join('')}
          </tbody>
        </table>`}
      </div>

      <div class="card">
        <div style="font-size:13px;font-weight:700;margin-bottom:14px;">Attendance Trend (Last 30 Days)</div>
        <canvas id="hod-trend-chart" height="120"></canvas>
      </div>`;

    // Build trend chart — group sessions by date
    const trendMap = {};
    const now = Date.now();
    const days30 = 30 * 24 * 60 * 60 * 1000;
    sessions.filter(s => !s.active && new Date(s.createdAt) > now - days30).forEach(s => {
      const d = new Date(s.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      trendMap[d] = (trendMap[d] || 0) + (s.attendanceCount ?? s.records?.length ?? 0);
    });
    const trendLabels = Object.keys(trendMap).slice(-14);
    const trendData   = trendLabels.map(k => trendMap[k]);

    if (trendLabels.length > 0) {
      const loadChart = async () => {
        if (!window.Chart) {
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
            s.onload = res; s.onerror = rej; document.head.appendChild(s);
          });
        }
        const ctx = document.getElementById('hod-trend-chart');
        if (!ctx) return;
        const existingHod = Chart.getChart(ctx);
        if (existingHod) existingHod.destroy();
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: trendLabels,
            datasets: [{
              label: 'Attendance',
              data: trendData,
              borderColor: '#0891b2',
              backgroundColor: 'rgba(8,145,178,0.1)',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
              pointRadius: 4,
              pointBackgroundColor: '#0891b2',
            }]
          },
          options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
              y: { beginAtZero: true, ticks: { stepSize: 1 } },
              x: { grid: { display: false } }
            }
          }
        });
      };
      setTimeout(loadChart, 50);
    }
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">${e.message}</p></div>`;
  }
}


// ── HOD: View student attendance record ────────────────────────────────────
async function hodViewStudentAttendance(userId, name) {
  try {
    const data = await api('/api/attendance-sessions/my-attendance?userId=' + userId);
    const records = data.records || [];
    const existing = document.getElementById('hod-att-overlay');
    if (existing) existing.remove();
    const ol = document.createElement('div');
    ol.id = 'hod-att-overlay';
    ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px);';
    ol.innerHTML = `<div style="background:var(--card);border-radius:14px;width:100%;max-width:560px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--card);z-index:1;">
        <div>
          <h3 style="font-size:15px;font-weight:700;margin:0;">Attendance — ${name}</h3>
          <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${records.length} session${records.length !== 1 ? 's' : ''} attended</div>
        </div>
        <button onclick="document.getElementById('hod-att-overlay').remove()" style="width:28px;height:28px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer;font-size:14px;">✕</button>
      </div>
      <div style="padding:16px 20px;">
        ${records.length === 0
          ? '<div class="empty-state"><p>No attendance records found.</p></div>'
          : `<table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead><tr style="border-bottom:2px solid var(--border);">
                <th style="text-align:left;padding:8px 10px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Session</th>
                <th style="text-align:left;padding:8px 10px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Date</th>
                <th style="text-align:left;padding:8px 10px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Status</th>
              </tr></thead>
              <tbody>${records.map(r => `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:9px 10px;font-weight:500;">${r.session?.title || r.session?.courseName || 'Session'}</td>
                  <td style="padding:9px 10px;color:var(--text-muted);font-size:12px;">${fmtDate(r.markedAt || r.createdAt)}</td>
                  <td style="padding:9px 10px;"><span class="tag ${r.status === 'present' || r.status === 'joined' ? 'tag-green' : r.status === 'late' ? 'tag-amber' : 'tag-gray'}">${r.status || 'present'}</span></td>
                </tr>`).join('')}
              </tbody>
            </table>`}
      </div>
    </div>`;
    document.body.appendChild(ol);
  } catch(e) { toastError('Could not load attendance: ' + e.message); }
}

// ── HOD: Department quizzes overview ───────────────────────────────────────
async function renderHodQuizzes() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading quizzes…</div>';
  try {
    const dept = currentUser.department ? '?department=' + encodeURIComponent(currentUser.department) : '';
    const data = await api('/api/lecturer/quizzes' + dept);
    const quizzes = data.quizzes || [];

    const now = new Date();
    const live     = quizzes.filter(q => new Date(q.startTime) <= now && new Date(q.endTime) >= now);
    const upcoming = quizzes.filter(q => new Date(q.startTime) > now);
    const closed   = quizzes.filter(q => new Date(q.endTime) < now);

    content.innerHTML = `
      <div class="page-header">
        <div><h2>Department Quizzes</h2><p>All quizzes in the ${currentUser.department || 'department'}</p></div>
      </div>

      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card"><div class="stat-value" style="color:#22c55e">${live.length}</div><div class="stat-label">LIVE NOW</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#0891b2">${upcoming.length}</div><div class="stat-label">UPCOMING</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#6b7280">${closed.length}</div><div class="stat-label">CLOSED</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#7c3aed">${quizzes.length}</div><div class="stat-label">TOTAL</div></div>
      </div>

      ${quizzes.length === 0
        ? '<div class="card"><div class="empty-state"><p>No quizzes in this department yet.</p></div></div>'
        : `<div class="card">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="border-bottom:2px solid var(--border);">
                  <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Title</th>
                  <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Lecturer</th>
                  <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Course</th>
                  <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Questions</th>
                  <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Duration</th>
                  <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Status</th>
                  <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);">Date</th>
                </tr>
              </thead>
              <tbody>
                ${quizzes.map(q => {
                  const start = new Date(q.startTime);
                  const end   = new Date(q.endTime);
                  const isLive     = now >= start && now <= end;
                  const isUpcoming = now < start;
                  const badge = isLive
                    ? '<span style="background:#dcfce7;color:#166534;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;">LIVE</span>'
                    : isUpcoming
                    ? '<span style="background:#dbeafe;color:#1e40af;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;">UPCOMING</span>'
                    : '<span style="background:#f3f4f6;color:#6b7280;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;">CLOSED</span>';
                  const duration = q.durationMinutes ? q.durationMinutes + ' min' : '—';
                  return `<tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:9px 12px;font-weight:600;">${q.title || 'Untitled'}</td>
                    <td style="padding:9px 12px;color:var(--text-muted);">${q.createdBy?.name || '—'}</td>
                    <td style="padding:9px 12px;color:var(--text-muted);">${q.course?.name || q.courseName || '—'}</td>
                    <td style="padding:9px 12px;">${q.questions?.length ?? q.questionCount ?? '—'}</td>
                    <td style="padding:9px 12px;">${duration}</td>
                    <td style="padding:9px 12px;">${badge}</td>
                    <td style="padding:9px 12px;color:var(--text-muted);font-size:12px;">${start.toLocaleDateString()}</td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>`
      }`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">Error loading quizzes: ${e.message}</p></div>`;
  }
}

// ── HOD: Export department data to CSV ─────────────────────────────────────
async function hodExportCSV(type) {
  try {
    const dept = currentUser.department ? '&department=' + encodeURIComponent(currentUser.department) : '';
    let rows = [], headers = [], filename = '';

    if (type === 'students') {
      const d = await api('/api/users?role=student&limit=500' + dept);
      headers = ['Name', 'Index Number', 'Email', 'Department', 'Status'];
      rows = (d.users || []).map(u => [u.name, u.indexNumber || '', u.email || '', u.department || '', u.isApproved ? 'Active' : 'Pending']);
      filename = 'KODEX_Students_' + (currentUser.department || 'All') + '.csv';
    } else if (type === 'lecturers') {
      const d = await api('/api/users?role=lecturer&limit=200' + dept);
      headers = ['Name', 'Email', 'Department', 'Status'];
      rows = (d.users || []).map(u => [u.name, u.email || '', u.department || '', u.isApproved ? 'Active' : 'Pending']);
      filename = 'KODEX_Lecturers_' + (currentUser.department || 'All') + '.csv';
    } else if (type === 'attendance') {
      const hodDept = currentUser.department ? '&department=' + encodeURIComponent(currentUser.department) : '';
      const d = await api('/api/attendance-sessions?limit=200' + hodDept);
      headers = ['Session', 'Lecturer', 'Date', 'Attendance', 'Status'];
      rows = (d.sessions || []).map(s => [s.title || s.courseName || 'Session', s.createdBy?.name || '', fmtDate(s.createdAt), s.attendanceCount ?? s.records?.length ?? 0, s.active ? 'Live' : 'Ended']);
      filename = 'KODEX_Attendance_' + (currentUser.department || 'All') + '.csv';
    }

    const csv = [headers, ...rows].map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toastSuccess('CSV exported ✓');
  } catch(e) { toastError('Export failed: ' + e.message); }
}


// ── FEATURE 3: HOD — Courses view ──────────────────────────────────────────
async function renderHodCourses() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading courses…</div>';
  try {
    const dept = currentUser.department ? '&department=' + encodeURIComponent(currentUser.department) : '';
    const [coursesData, pendingData] = await Promise.all([
      api('/api/courses?limit=200' + dept),
      api('/api/hod/pending-courses').catch(() => ({ courses: [] })),
    ]);
    const courses = coursesData.courses || [];
    const pending = pendingData.courses || [];
    const approvalBadge = s => {
      if (s === 'pending')  return '<span style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;">⏳ PENDING APPROVAL</span>';
      if (s === 'rejected') return '<span style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;">✕ REJECTED</span>';
      return '';
    };
    content.innerHTML = `
      <div class="page-header">
        <div><h2>Courses</h2><p>${courses.length} course${courses.length !== 1 ? 's' : ''} in ${currentUser.department || 'your department'}</p></div>
        ${pending.length > 0 ? `<button class="btn btn-primary btn-sm" onclick="navigateTo('hod-course-approvals')">⚠ ${pending.length} Pending Approval${pending.length > 1 ? 's' : ''}</button>` : ''}
      </div>
      ${courses.length === 0 ? '<div class="empty-state"><p>No courses found for this department.</p></div>' :
        `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;">
          ${courses.map(c => `
            <div class="card" style="padding:16px 18px;${c.approvalStatus === 'rejected' ? 'border-left:3px solid #ef4444;' : c.approvalStatus === 'pending' ? 'border-left:3px solid #f59e0b;' : ''}">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">
                <div>
                  <div style="font-weight:700;font-size:14px;">${c.title}</div>
                  <div style="font-size:11px;font-family:monospace;color:var(--text-muted);margin-top:2px;">${c.code}</div>
                </div>
                <span class="tag tag-blue">${c.enrolledStudents?.length || 0} students</span>
              </div>
              <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">
                👨‍🏫 ${c.lecturerId?.name || 'Unassigned'}
              </div>
              ${c.needsApproval ? `<div style="margin-top:6px;">${approvalBadge(c.approvalStatus)}</div>` : ''}
              ${c.approvalNote ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;font-style:italic;">"${esc(c.approvalNote)}"</div>` : ''}
              ${c.description ? `<div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-top:6px;">${c.description}</div>` : ''}
            </div>`).join('')}
        </div>`}`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">${e.message}</p></div>`;
  }
}

// ── FEATURE 3b: HOD — Course Approval Queue ────────────────────────────────
async function renderHodCourseApprovals() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading pending courses…</div>';
  try {
    const data = await api('/api/hod/pending-courses');
    const courses = data.courses || [];
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Course Approvals</h2>
          <p>${courses.length} course${courses.length !== 1 ? 's' : ''} awaiting your review · ${currentUser.department || 'All departments'}</p>
        </div>
      </div>
      ${courses.length === 0
        ? `<div class="card"><div class="empty-state"><p style="color:var(--text-muted);font-size:13px;">No courses pending approval. All caught up!</p></div></div>`
        : `<div style="display:flex;flex-direction:column;gap:14px;">
            ${courses.map(c => `
              <div class="card" style="padding:18px 20px;border-left:3px solid #f59e0b;">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:10px;">
                  <div>
                    <div style="font-weight:700;font-size:15px;">${esc(c.title)}</div>
                    <div style="font-size:11px;font-family:monospace;color:var(--text-muted);margin-top:2px;">${esc(c.code)}</div>
                  </div>
                  <span style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap;">⏳ Pending Approval</span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px;font-size:12px;color:var(--text-muted);margin-bottom:12px;">
                  <div>👨‍🏫 <strong>${esc(c.lecturerId?.name || c.createdBy?.name || 'Unknown')}</strong></div>
                  ${c.academicYear ? `<div>📅 ${esc(c.academicYear)} · Sem ${esc(c.semester || '—')}</div>` : ''}
                  ${c.level       ? `<div>🎓 Level ${esc(c.level)}${c.group ? ` · Group ${esc(c.group)}` : ''}</div>` : ''}
                  ${c.departmentId? `<div>🏛 ${esc(c.departmentId)}</div>` : ''}
                  <div>📅 Submitted ${timeAgo(c.createdAt)}</div>
                </div>
                ${c.description ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.55;margin-bottom:12px;border-left:3px solid var(--border);padding-left:10px;">${esc(c.description)}</div>` : ''}
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                  <button class="btn btn-primary btn-sm" onclick="hodApproveCourse('${c._id}','${esc(c.title).replace(/'/g,"\\'")}')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Approve
                  </button>
                  <button class="btn btn-sm" style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;" onclick="hodRejectCourse('${c._id}','${esc(c.title).replace(/'/g,"\\'")}')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Reject
                  </button>
                </div>
              </div>`).join('')}
          </div>`}`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">${e.message}</p></div>`;
  }
}

async function hodApproveCourse(id, title) {
  const note = prompt(`Approve course: "${title}"\n\nOptional note for the lecturer:`) ;
  if (note === null) return; // cancelled
  try {
    await api(`/api/hod/courses/${id}/approve`, { method: 'PATCH', body: JSON.stringify({ note: note.trim() || undefined }) });
    toastSuccess(`"${title}" approved and published.`);
    renderHodCourseApprovals();
  } catch(e) { toastError(e.message || 'Failed to approve course'); }
}

async function hodRejectCourse(id, title) {
  const note = prompt(`Reject course: "${title}"\n\nReason for rejection (required):`);
  if (note === null || !note.trim()) { toastWarning('Rejection reason is required.'); return; }
  try {
    await api(`/api/hod/courses/${id}/reject`, { method: 'PATCH', body: JSON.stringify({ note: note.trim() }) });
    toastSuccess(`"${title}" rejected. Lecturer has been notified.`);
    renderHodCourseApprovals();
  } catch(e) { toastError(e.message || 'Failed to reject course'); }
}

// ── FEATURE 3c: HOD — Unlock Locked Students ───────────────────────────────
async function renderHodUnlockStudents() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading locked accounts…</div>';
  try {
    const data = await api('/api/hod/locked-students');
    const students = data.students || [];
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Locked Student Accounts</h2>
          <p>${students.length} locked account${students.length !== 1 ? 's' : ''} in ${currentUser.department || 'your institution'} · Accounts are locked after 5 failed login attempts</p>
        </div>
      </div>
      ${students.length === 0
        ? `<div class="card"><div class="empty-state"><p style="color:var(--text-muted);font-size:13px;">No locked student accounts. All clear!</p></div></div>`
        : `<div style="overflow-x:auto;" class="card" style="padding:0">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="border-bottom:2px solid var(--border);">
                  <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Student</th>
                  <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Index No.</th>
                  <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Department</th>
                  <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Lock Reason</th>
                  <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Locked</th>
                  <th style="text-align:left;padding:10px 16px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Attempts</th>
                  <th style="padding:10px 16px;"></th>
                </tr>
              </thead>
              <tbody>
                ${students.map(s => `
                  <tr style="border-bottom:1px solid var(--border);" id="locked-row-${s._id}">
                    <td style="padding:10px 16px;font-weight:600;">${esc(s.name)}</td>
                    <td style="padding:10px 16px;font-family:monospace;color:var(--text-muted);">${esc(s.IndexNumber || '—')}</td>
                    <td style="padding:10px 16px;">
                      ${s.department ? `<span style="background:#ecfeff;color:#0891b2;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;">${esc(s.department)}</span>` : '—'}
                    </td>
                    <td style="padding:10px 16px;font-size:12px;color:var(--text-muted);max-width:220px;">${esc(s.lockReason || '—')}</td>
                    <td style="padding:10px 16px;font-size:12px;color:var(--text-muted);white-space:nowrap;">${s.lockedAt ? timeAgo(s.lockedAt) : '—'}</td>
                    <td style="padding:10px 16px;text-align:center;">
                      <span style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">${s.failedLoginAttempts || 0}</span>
                    </td>
                    <td style="padding:10px 16px;white-space:nowrap;">
                      <button class="btn btn-sm btn-primary" onclick="hodUnlockStudent('${s._id}','${esc(s.name).replace(/'/g,"\\'")}')">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
                        Unlock
                      </button>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`}`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">${e.message}</p></div>`;
  }
}

async function hodUnlockStudent(userId, name) {
  const note = prompt(`Unlock account for: ${name}\n\nOptional note (reason for unlock):`);
  if (note === null) return; // cancelled
  try {
    await api(`/api/hod/unlock/${userId}`, { method: 'PATCH', body: JSON.stringify({ note: note.trim() || undefined }) });
    toastSuccess(`${name}'s account has been unlocked.`);
    // Remove row from table
    document.getElementById(`locked-row-${userId}`)?.remove();
  } catch(e) { toastError(e.message || 'Failed to unlock account'); }
}

// ── FEATURE 4: HOD — Edit lecturer department ───────────────────────────────
function hodEditLecturerDept(lecturerId, lecturerName, currentDept) {
  const newDept = prompt(`Change department for ${lecturerName}:

Current: ${currentDept || 'None'}`, currentDept || '');
  if (newDept === null) return;
  if (!newDept.trim()) { toastWarning('Department cannot be empty.'); return; }
  api('/api/users/' + lecturerId, {
    method: 'PATCH',
    body: JSON.stringify({ department: newDept.trim() })
  }).then(() => {
    toastSuccess('Department updated to "' + newDept.trim() + '"');
    renderHodLecturers();
  }).catch(e => toastError(e.message || 'Failed to update department'));
}


// ════════════════════════════════════════════════════════════════════════════
//  SUPERADMIN DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
async function renderSuperadminDashboard(content) {
  if (!content) content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading platform overview…</div>';
  try {
    const data = await api('/api/superadmin/overview').catch(() => null);
    const companies = data?.companies || [];
    const totalCompanies = companies.length;
    const academic   = companies.filter(c => c.mode === 'academic').length;
    const corporate  = companies.filter(c => c.mode === 'corporate').length;
    const active     = companies.filter(c => c.isActive).length;
    const onTrial    = companies.filter(c => c.isTrialActive).length;
    const subscribed = companies.filter(c => c.subscriptionStatus === 'active').length;
    const totalRevenue = data?.totalRevenue || 0;
    const totalPayments = data?.totalPayments || 0;

    content.innerHTML = `
      <div class="page-header">
        <div><h2>Platform Overview</h2><p>KODEX Superadmin · All institutions</p></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="superadminShowPayments()">💳 Payment History</button>
        </div>
      </div>

      <div class="stats-grid" style="margin-bottom:20px;">
        <div class="stat-card"><div class="stat-value">${totalCompanies}</div><div class="stat-label">INSTITUTIONS</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#16a34a">${active}</div><div class="stat-label">ACTIVE</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#d97706">${onTrial}</div><div class="stat-label">ON TRIAL</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#2563eb">${subscribed}</div><div class="stat-label">SUBSCRIBED</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#16a34a;font-size:20px;">GHS ${totalRevenue.toLocaleString()}</div><div class="stat-label">TOTAL REVENUE</div></div>
        <div class="stat-card"><div class="stat-value">${totalPayments}</div><div class="stat-label">PAYMENTS</div></div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px;">
          <div style="font-size:13px;font-weight:700;">All Institutions</div>
          <div style="display:flex;gap:6px;">
            <span class="tag tag-blue">Academic: ${academic}</span>
            <span class="tag tag-green">Corporate: ${corporate}</span>
          </div>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:13px;">
            <thead><tr style="border-bottom:2px solid var(--border);">
              <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Institution</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Users</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Mode</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Status</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Subscription</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Revenue</th>
              <th style="text-align:left;padding:9px 12px;font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;">Actions</th>
            </tr></thead>
            <tbody>
              ${companies.length === 0 ? '<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--text-muted);">No institutions yet.</td></tr>' :
                companies.map(c => `
                <tr style="border-bottom:1px solid var(--border);">
                  <td style="padding:10px 12px;">
                    <div style="font-weight:700;">${c.name}</div>
                    <div style="font-size:11px;color:var(--text-muted);font-family:monospace;">${c.institutionCode || '—'}</div>
                  </td>
                  <td style="padding:10px 12px;">
                    <div style="font-weight:600;">${c.userCount || 0}</div>
                    ${c.roleCounts && c.mode === 'academic' ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">${c.roleCounts.lecturer||0}L · ${c.roleCounts.hod||0}H · ${c.roleCounts.student||0}S</div>` : ''}
                  </td>
                  <td style="padding:10px 12px;"><span class="tag ${c.mode === 'academic' ? 'tag-blue' : 'tag-green'}">${c.mode}</span></td>
                  <td style="padding:10px 12px;"><span class="tag ${c.isActive ? 'tag-green' : 'tag-red'}">${c.isActive ? 'Active' : 'Inactive'}</span></td>
                  <td style="padding:10px 12px;">
                    <span class="tag ${c.subscriptionStatus === 'active' ? 'tag-blue' : c.isTrialActive ? 'tag-amber' : 'tag-gray'}">
                      ${c.subscriptionStatus === 'active' ? 'Subscribed' : c.isTrialActive ? 'Trial (' + (c.trialDaysRemaining || 0) + 'd)' : 'Expired'}
                    </span>
                  </td>
                  <td style="padding:10px 12px;font-size:12px;font-weight:600;color:${c.revenue > 0 ? '#16a34a' : 'var(--text-muted)'};">
                    ${c.revenue > 0 ? 'GHS ' + c.revenue.toLocaleString() : '—'}
                  </td>
                  <td style="padding:10px 12px;white-space:nowrap;display:flex;gap:4px;flex-wrap:wrap;">
                    <button class="btn btn-xs" style="background:#6366f1;color:#fff;font-size:11px;" onclick="superadminImpersonate('${c._id}','${c.name.replace(/'/g,"\\'")}')" title="Login as admin">🔑 Login</button>
                    <button class="btn btn-xs btn-secondary" style="font-size:11px;" onclick="superadminExtendTrial('${c._id}','${c.name.replace(/'/g,"\\'")}')">+Trial</button>
                    <button class="btn btn-xs" style="${c.isActive ? 'background:#f59e0b' : 'background:#22c55e'};color:#fff;font-size:11px;" onclick="superadminToggleCompany('${c._id}',${c.isActive})">
                      ${c.isActive ? 'Off' : 'On'}
                    </button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch(e) {
    await renderAdminDashboard(content);
  }
}


async function renderLecturerDashboard(content) {
  const [sessionsData, coursesData, quizzesData, meetingsData] = await Promise.all([
    api('/api/attendance-sessions?limit=5').catch(() => ({ sessions: [], pagination: { total: 0 } })),
    api('/api/courses').catch(() => ({ courses: [] })),
    api('/api/lecturer/quizzes').catch(() => ({ quizzes: [] })),
    api('/api/meetings?limit=10').catch(() => ({ data: [] })),
  ]);

  const totalStudents  = coursesData.courses.reduce((sum, c) => sum + (c.enrolledStudents?.length || 0), 0);
  const activeCourses  = coursesData.courses.length;
  const quizzesCreated = quizzesData.quizzes.length;

  const now = Date.now();
  const upcomingMeetings = (meetingsData.data || [])
    .filter(m => m.status === 'scheduled' || m.status === 'live')
    .sort((a, b) => new Date(a.scheduledStart) - new Date(b.scheduledStart))
    .slice(0, 5);

  const _fmtMeetingDate = iso => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  };
  const _fmtTime = iso => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const _joinUrl  = m => `https://meet.jit.si/${m.roomName}`;

  const _meetingStatusMeta = m => {
    if (m.status === 'live') return { label: 'Live', cls: 'sched-status--live' };
    const diffMs  = new Date(m.scheduledStart) - now;
    const diffMin = Math.round(diffMs / 60000);
    if (diffMin < 0)   return { label: 'Overdue', cls: 'sched-status--overdue' };
    if (diffMin < 60)  return { label: `In ${diffMin}m`, cls: 'sched-status--soon' };
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24)   return { label: `In ${diffHr}h`, cls: 'sched-status--today' };
    return { label: 'Scheduled', cls: 'sched-status--scheduled' };
  };

  content.innerHTML = `
    <div class="page-header">
      <h2>Welcome back, ${currentUser.name.split(' ')[0]}</h2>
      <p>Here's an overview of your workspace at ${currentUser.company?.name || 'your institution'}
        ${currentUser.department ? ` · <span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:#fffbeb;border:1px solid #fde68a;border-radius:20px;font-size:12px;font-weight:700;color:#b45309;">${currentUser.department}</span>` : ''}
      </p>
    </div>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${totalStudents}</div><div class="stat-label">Students</div></div>
      <div class="stat-card"><div class="stat-value">${activeCourses}</div><div class="stat-label">Courses</div></div>
      <div class="stat-card"><div class="stat-value">${sessionsData.pagination.total}</div><div class="stat-label">Sessions</div></div>
      <div class="stat-card"><div class="stat-value">${quizzesCreated}</div><div class="stat-label">Quizzes</div></div>
    </div>
    <div class="quick-actions">
      <button class="btn btn-primary btn-sm" onclick="navigateTo('sessions'); showStartSessionModal()">${sessionsIcon()} Start Session</button>
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

    <div class="card" style="margin-top:0">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
        <div>
          <div class="card-title" style="margin-bottom:2px">Scheduled Meetings</div>
          <div style="font-size:12px;color:var(--text-muted)">Upcoming and live Jitsi meetings</div>
        </div>
        <button class="btn btn-primary btn-sm" onclick="navigateTo('meetings')"
          style="gap:6px;font-size:12px">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          View All
        </button>
      </div>
      ${upcomingMeetings.length ? `
        <div class="sched-meetings-list">
          ${upcomingMeetings.map(m => {
            const meta = _meetingStatusMeta(m);
            return `
            <div class="sched-meeting-row">
              <div class="sched-meeting-indicator ${m.status === 'live' ? 'sched-ind--live' : 'sched-ind--scheduled'}"></div>
              <div class="sched-meeting-info">
                <div class="sched-meeting-title">${m.title || 'Untitled Meeting'}</div>
                <div class="sched-meeting-meta">
                  <span>${_fmtMeetingDate(m.scheduledStart)}</span>
                  <span class="sched-dot">·</span>
                  <span>${_fmtTime(m.scheduledStart)}${m.scheduledEnd ? ' – ' + _fmtTime(m.scheduledEnd) : ''}</span>
                  ${m.linkedCourseId ? `<span class="sched-dot">·</span><span>${m.linkedCourseId.code || m.linkedCourseId.name || ''}</span>` : ''}
                  ${m.creatorId?.name ? `<span class="sched-dot">·</span><span>${m.creatorId.name}</span>` : ''}
                </div>
              </div>
              <div class="sched-meeting-actions">
                <span class="sched-status ${meta.cls}">${meta.label}</span>
                <a class="btn btn-primary btn-sm sched-join-btn" href="${_joinUrl(m)}" target="_blank" rel="noopener"
                  style="gap:5px;font-size:11.5px">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                  Join
                </a>
              </div>
            </div>`;
          }).join('')}
        </div>
      ` : `
        <div class="empty-state" style="padding:28px 0">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:10px;opacity:.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          <p style="margin:0 0 12px">No upcoming meetings</p>
          <button class="btn btn-primary btn-sm" onclick="navigateTo('meetings')">Schedule a Meeting</button>
        </div>`}
    </div>
  `;
}

async function renderEmployeeDashboard(content) {
  const today     = new Date().toISOString().slice(0, 10);
  const sevenAgo  = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const [todayData, recentData, meetingsData] = await Promise.all([
    api(`/api/corporate-attendance/my?from=${today}&to=${today}`).catch(() => ({ records: [] })),
    api(`/api/corporate-attendance/my?from=${sevenAgo}&to=${today}`).catch(() => ({ records: [] })),
    api('/api/zoom').catch(() => ({ meetings: [] })),
  ]);

  const todayRecord  = todayData.records[0] || null;
  const isClockedIn  = !!(todayRecord?.clockIn?.time && !todayRecord?.clockOut?.time);
  const isClockedOut = !!(todayRecord?.clockIn?.time && todayRecord?.clockOut?.time);
  const clockInTime  = todayRecord?.clockIn?.time  ? new Date(todayRecord.clockIn.time)  : null;
  const isLate       = todayRecord?.clockIn?.isLate || todayRecord?.status === 'late' || false;
  const lateMin      = todayRecord?.clockIn?.lateMinutes || todayRecord?.lateMinutes || 0;
  const workedHrs    = todayRecord?.hoursWorked != null ? todayRecord.hoursWorked : null;

  const recentRecords  = recentData.records || [];
  const presentDays    = recentRecords.filter(r => r.status === 'present' || r.status === 'late').length;
  const attendanceRate = recentRecords.length > 0 ? Math.round((presentDays / recentRecords.length) * 100) : 0;
  const upcomingMeetings = meetingsData.meetings.filter(m => m.status === 'scheduled');

  const statusColor = isClockedIn ? 'var(--success)' : (isClockedOut ? 'var(--primary)' : 'var(--text-light)');

  content.innerHTML = `
    <div class="page-header">
      <h2>Welcome back, ${currentUser.name.split(' ')[0]}</h2>
      <p>${currentUser.company?.name || 'Your company'}${currentUser.employeeId ? ` · ID: ${currentUser.employeeId}` : ''}</p>
    </div>

    <div class="card" style="border-left:4px solid ${statusColor};background:${isClockedIn ? 'linear-gradient(135deg,#f0fdf4,#ecfdf5)' : 'linear-gradient(135deg,#eef2ff,#e0e7ff)'}">
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px">
        <div>
          <div style="font-size:12px;text-transform:uppercase;font-weight:700;letter-spacing:.5px;color:${statusColor}">
            ${isClockedIn ? '● Currently Clocked In' : (isClockedOut ? '✓ Clocked Out' : '○ Not Clocked In')}
          </div>
          <div style="font-size:18px;font-weight:700;margin-top:4px">
            ${isClockedIn ? 'You are clocked in' : (isClockedOut ? 'Work day complete' : 'Ready to start your day?')}
          </div>
          ${clockInTime ? `<div style="font-size:12px;color:var(--text-light);margin-top:2px">
            Clocked in at ${clockInTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}
            ${isLate ? `<span style="color:#ef4444;margin-left:6px">(${lateMin}m late)</span>` : ''}
          </div>` : ''}
          ${isClockedOut && workedHrs != null ? `<div style="font-size:12px;color:var(--text-light);margin-top:2px">Worked ${workedHrs}h today</div>` : ''}
        </div>
        <div style="display:flex;gap:10px">
          ${!isClockedIn && !isClockedOut ? `
            <button class="btn btn-success" onclick="employeeSignIn()" style="gap:8px;font-size:14px;padding:12px 24px">
              ${svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 16)} Clock In
            </button>` : isClockedIn ? `
            <button class="btn btn-danger" onclick="employeeSignOut()" style="gap:8px;font-size:14px;padding:12px 24px">
              ${svgIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', 16)} Clock Out
            </button>` : `
            <button class="btn btn-sm" style="background:var(--border)" onclick="navigateTo('sign-in-out')">View Details</button>`}
        </div>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card"><div class="stat-value">${attendanceRate}%</div><div class="stat-label">7-Day Rate</div></div>
      <div class="stat-card"><div class="stat-value">${presentDays}</div><div class="stat-label">Days Present</div></div>
      <div class="stat-card"><div class="stat-value">${upcomingMeetings.length}</div><div class="stat-label">Meetings</div></div>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <div class="card-title" style="margin:0">This Week</div>
        <a onclick="navigateTo('my-attendance')" style="font-size:12px;color:var(--primary);cursor:pointer">View all →</a>
      </div>
      ${recentRecords.length ? `
        <table>
          <thead><tr><th>Date</th><th>Status</th><th>Time In</th><th>Time Out</th><th>Worked</th></tr></thead>
          <tbody>${recentRecords.slice(0, 7).map(r => {
            const ci  = r.clockIn?.time  ? new Date(r.clockIn.time)  : null;
            const co  = r.clockOut?.time ? new Date(r.clockOut.time) : null;
            const statusColors = { present:'#16a34a', late:'#d97706', absent:'#dc2626', half_day:'#7c3aed', on_leave:'#0284c7', remote:'#0891b2' };
            const sc = statusColors[r.status] || 'var(--text-light)';
            return `<tr>
              <td style="font-size:13px">${r.date ? new Date(r.date).toLocaleDateString('en-GB', {weekday:'short',day:'2-digit',month:'short'}) : '—'}</td>
              <td><span style="background:${sc}20;color:${sc};border:1px solid ${sc}40;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;text-transform:capitalize">${r.status || '—'}</span></td>
              <td style="font-size:13px">${ci ? ci.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</td>
              <td style="font-size:13px">${co ? co.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : (ci ? '<span style="color:#f59e0b;font-size:11px">Active</span>' : '—')}</td>
              <td style="font-size:13px">${r.hoursWorked != null ? r.hoursWorked+'h' : '—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      ` : '<div class="empty-state"><p>No attendance records this week. Click Clock In to start.</p></div>'}
    </div>
  `;
}

async function employeeSignIn() {
  // If ESP32 configured, attempt BLE ping — warn if not detected but do NOT block
  if (esp32IP) {
    const detected = await discoverESP32();
    if (!detected) {
      toastWarning('Office device not detected — clocking in via web.');
    } else {
      // Also notify the ESP32 (fire-and-forget)
      esp32Api('/sign-in', {
        method: 'POST',
        body: JSON.stringify({ userId: currentUser.id, name: currentUser.name })
      }).catch(e => console.warn('[ESP32] ping failed:', e.message));
    }
  }
  try {
    const data = await api('/api/corporate-attendance/clock-in', {
      method: 'POST',
      body: JSON.stringify({ method: 'web' }),
    });
    toastSuccess(data.message || 'Clocked in successfully!');
    renderSignInOut();
  } catch (e) {
    toastError(e.message || 'Clock-in failed');
  }
}

async function employeeSignOut() {
  if (!confirm('Are you sure you want to clock out?')) return;
  // If ESP32 configured, attempt BLE ping — warn if not detected but do NOT block
  if (esp32IP) {
    const detected = await discoverESP32();
    if (!detected) {
      toastWarning('Office device not detected — clocking out via web.');
    } else {
      esp32Api('/sign-out', {
        method: 'POST',
        body: JSON.stringify({ userId: currentUser.id, name: currentUser.name })
      }).catch(e => console.warn('[ESP32] ping failed:', e.message));
    }
  }
  try {
    const data = await api('/api/corporate-attendance/clock-out', {
      method: 'POST',
      body: JSON.stringify({ method: 'web' }),
    });
    const hrs = data.hoursWorked != null ? ` · ${data.hoursWorked}h worked` : '';
    toastSuccess((data.message || 'Clocked out successfully!') + hrs);
    renderSignInOut();
  } catch (e) {
    toastError(e.message || 'Clock-out failed');
  }
}

async function renderSignInOut() {
  const content = document.getElementById('main-content');
  if (!content) return;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

    const [todayData, historyData] = await Promise.all([
      api(`/api/corporate-attendance/my?from=${today}&to=${today}`).catch(() => ({ records: [] })),
      api(`/api/corporate-attendance/my?from=${thirtyAgo}&to=${today}`).catch(() => ({ records: [] })),
    ]);

    const todayRecord = todayData.records[0] || null;
    const isClockedIn  = !!(todayRecord?.clockIn?.time && !todayRecord?.clockOut?.time);
    const isClockedOut = !!(todayRecord?.clockIn?.time && todayRecord?.clockOut?.time);
    const clockInTime  = todayRecord?.clockIn?.time  ? new Date(todayRecord.clockIn.time)  : null;
    const clockOutTime = todayRecord?.clockOut?.time ? new Date(todayRecord.clockOut.time) : null;
    const shiftName    = todayRecord?.shift?.name || null;
    const isLate       = todayRecord?.clockIn?.isLate || todayRecord?.status === 'late' || false;
    const lateMin      = todayRecord?.clockIn?.lateMinutes || todayRecord?.lateMinutes || 0;
    const workedHrs    = todayRecord?.hoursWorked != null ? todayRecord.hoursWorked : null;
    const overtimeHrs  = todayRecord?.overtimeHours || 0;

    // Live elapsed time if currently clocked in
    let elapsedLabel = '';
    if (isClockedIn && clockInTime) {
      const elapsedMs  = Date.now() - clockInTime.getTime();
      const elapsedH   = Math.floor(elapsedMs / 3600000);
      const elapsedM   = Math.floor((elapsedMs % 3600000) / 60000);
      elapsedLabel = `${elapsedH}h ${elapsedM}m elapsed`;
    }

    const statusColor = isClockedIn ? 'var(--success)' : (isClockedOut ? 'var(--primary)' : 'var(--text-light)');
    const statusText  = isClockedIn ? 'Currently Clocked In' : (isClockedOut ? 'Clocked Out Today' : 'Not Clocked In');

    content.innerHTML = `
      <div class="page-header">
        <h2>Clock In / Clock Out</h2>
        <p>Track your daily attendance · ${new Date().toLocaleDateString('en-GB', {weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
      </div>

      ${esp32IP ? `
      <div class="card" style="padding:10px 16px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px">${bleDetected ? '🟢 Office device detected' : '🔴 Office device not reachable — you may still clock in via web'}</span>
        <button class="btn btn-sm" style="font-size:10px;padding:3px 8px;background:var(--border)" onclick="configureESP32()">Configure</button>
      </div>` : `
      <div class="card" style="padding:10px 16px;margin-bottom:8px;display:flex;align-items:center;justify-content:space-between">
        <span style="font-size:12px;color:var(--text-muted)">⚪ No office device configured — clock in/out via web</span>
        <button class="btn btn-sm" style="font-size:10px;padding:3px 8px;background:var(--border)" onclick="configureESP32()">Set up ESP32</button>
      </div>`}

      <div class="card" style="text-align:center;padding:40px 24px;border-left:4px solid ${statusColor}">
        <div style="font-size:48px;margin-bottom:12px">
          ${isClockedIn ? svgIcon('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', 48) : svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 48)}
        </div>
        <div style="font-size:20px;font-weight:800;color:${statusColor}">${statusText}</div>
        ${shiftName ? `<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Shift: ${shiftName}${todayRecord?.shift?.startTime ? ' · '+todayRecord.shift.startTime+'–'+todayRecord.shift.endTime : ''}</div>` : ''}
        ${clockInTime ? `<div style="font-size:13px;color:var(--text-light);margin-top:6px">Time in: <strong>${clockInTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</strong>${isLate ? ` <span style="color:#ef4444;font-size:11px">(${lateMin}m late)</span>` : ''}</div>` : ''}
        ${clockOutTime ? `<div style="font-size:13px;color:var(--text-light);margin-top:4px">Time out: <strong>${clockOutTime.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</strong></div>` : ''}
        ${isClockedIn && elapsedLabel ? `<div style="font-size:13px;color:var(--success);font-weight:600;margin-top:4px">${elapsedLabel}</div>` : ''}
        ${isClockedOut && workedHrs != null ? `<div style="font-size:13px;color:var(--text-light);margin-top:4px">Worked: <strong>${workedHrs}h</strong>${overtimeHrs > 0 ? ` <span style="color:#8b5cf6;font-size:11px">(+${overtimeHrs}h overtime)</span>` : ''}</div>` : ''}
        <div style="margin-top:28px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
          ${!isClockedIn && !isClockedOut ? `
            <button class="btn btn-success" onclick="employeeSignIn()" style="gap:10px;font-size:16px;padding:14px 32px;width:auto">
              ${svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 18)} Clock In
            </button>
          ` : isClockedIn ? `
            <button class="btn btn-danger" onclick="employeeSignOut()" style="gap:10px;font-size:16px;padding:14px 32px;width:auto">
              ${svgIcon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>', 18)} Clock Out
            </button>
          ` : `
            <div style="font-size:13px;color:var(--text-muted);padding:14px 0">Attendance recorded for today.</div>
          `}
        </div>
      </div>

      <div class="card">
        <div class="card-title">Attendance History (Last 30 Days)</div>
        ${historyData.records.length ? `
          <div style="overflow-x:auto">
          <table>
            <thead><tr><th>Date</th><th>Status</th><th>Time In</th><th>Time Out</th><th>Worked</th><th>Overtime</th><th>Lateness</th></tr></thead>
            <tbody>${historyData.records.map(r => {
              const ci = r.clockIn?.time  ? new Date(r.clockIn.time)  : null;
              const co = r.clockOut?.time ? new Date(r.clockOut.time) : null;
              const dateStr = r.date ? new Date(r.date).toLocaleDateString('en-GB', {day:'2-digit',month:'short',year:'numeric'}) : '—';
              const statusColors = { present:'#16a34a', late:'#d97706', absent:'#dc2626', half_day:'#7c3aed', on_leave:'#0284c7', remote:'#0891b2', overtime:'#8b5cf6' };
              const sc = statusColors[r.status] || 'var(--text-light)';
              return `<tr>
                <td style="font-size:13px;font-weight:600">${dateStr}</td>
                <td><span class="status-badge" style="background:${sc}20;color:${sc};border:1px solid ${sc}40;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;text-transform:capitalize">${r.status || '—'}</span></td>
                <td style="font-size:13px">${ci ? ci.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                <td style="font-size:13px">${co ? co.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : (ci ? '<span style="color:#f59e0b;font-size:11px;font-weight:600">Active</span>' : '—')}</td>
                <td style="font-size:13px">${r.hoursWorked != null ? r.hoursWorked+'h' : '—'}</td>
                <td style="font-size:13px">${r.overtimeHours > 0 ? '<span style="color:#8b5cf6;font-weight:600">+'+r.overtimeHours+'h</span>' : '—'}</td>
                <td style="font-size:13px">${(r.clockIn?.isLate||r.status==='late') ? '<span style="color:#ef4444">'+(r.clockIn?.lateMinutes||r.lateMinutes||0)+'m late</span>' : '<span style="color:#16a34a">On time</span>'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
          </div>
        ` : '<div class="empty-state"><p>No attendance records yet. Clock in to start tracking.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error loading attendance: ${e.message}</p></div>`;
  }
}


// ── Lecturer: Student Performance across all quizzes in a course ──────────────
async function renderLecturerPerformance() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading performance data…</div>';
  try {
    const [coursesData, quizzesData] = await Promise.all([
      api('/api/courses').catch(() => ({ courses: [] })),
      api('/api/lecturer/quizzes').catch(() => ({ quizzes: [] })),
    ]);
    const courses = coursesData.courses || [];
    const quizzes = quizzesData.quizzes || [];

    content.innerHTML = `
      <div class="page-header">
        <h2>Student Performance</h2>
        <p>Overview of student results across all your quizzes</p>
      </div>
      ${quizzes.length === 0 ? '<div class="card"><div class="empty-state"><p>No quizzes yet. Create a quiz to see performance data.</p></div></div>' : `
      <div class="card">
        <table>
          <thead><tr><th>Quiz</th><th>Course</th><th>Submissions</th><th>Avg Score</th><th>Pass Rate</th><th>Highest</th><th>Lowest</th></tr></thead>
          <tbody>${quizzes.map(q => {
            const stats = q.stats || {};
            const avg = stats.averageScore || 0;
            const passRate = stats.passRate || 0;
            const color = avg >= 70 ? '#16a34a' : avg >= 50 ? '#d97706' : '#dc2626';
            return `<tr>
              <td><strong>${esc(q.title)}</strong></td>
              <td style="font-size:12px;color:var(--text-muted)">${esc(q.course?.title || '—')}</td>
              <td>${stats.totalAttempts || 0}</td>
              <td><strong style="color:${color}">${avg.toFixed(1)}%</strong></td>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div style="flex:1;height:6px;background:#e5e7eb;border-radius:3px;min-width:60px">
                    <div style="width:${passRate}%;height:100%;background:${color};border-radius:3px"></div>
                  </div>
                  <span style="font-size:12px;color:${color};font-weight:600">${passRate.toFixed(0)}%</span>
                </div>
              </td>
              <td style="color:#16a34a;font-weight:600">${stats.highestScore?.toFixed(1) || '—'}%</td>
              <td style="color:#dc2626;font-weight:600">${stats.lowestScore?.toFixed(1) || '—'}%</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`}
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger)">Error: ${e.message}</p></div>`;
  }
}

// ── Student Quiz Results History ─────────────────────────────────────────────
async function renderStudentQuizHistory() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading quiz history…</div>';
  try {
    const data = await api('/api/student/quizzes');
    const quizzes = data.quizzes || [];
    const attempted = quizzes.filter(q => q.myAttempt);
    const avgScore = attempted.length
      ? Math.round(attempted.reduce((s, q) => s + (q.myAttempt?.percentageScore || 0), 0) / attempted.length)
      : 0;

    content.innerHTML = `
      <div class="page-header"><h2>My Quiz Results</h2><p>Your performance across all quizzes</p></div>
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-value">${attempted.length}</div><div class="stat-label">Completed</div></div>
        <div class="stat-card"><div class="stat-value">${quizzes.length - attempted.length}</div><div class="stat-label">Pending</div></div>
        <div class="stat-card"><div class="stat-value" style="color:${avgScore>=70?'#16a34a':avgScore>=50?'#d97706':'#dc2626'}">${avgScore}%</div><div class="stat-label">Avg Score</div></div>
      </div>
      <div class="card">
        ${attempted.length ? `
          <table>
            <thead><tr><th>Quiz</th><th>Course</th><th>Score</th><th>Grade</th><th>Date</th><th></th></tr></thead>
            <tbody>${attempted.map(q => {
              const pct = q.myAttempt?.percentageScore || 0;
              const grade = pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
              const color = pct >= 70 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
              return `<tr>
                <td><strong>${q.title}</strong></td>
                <td style="font-size:12px;color:var(--text-muted)">${q.course?.title || '—'}</td>
                <td><strong style="color:${color}">${q.myAttempt.score}/${q.myAttempt.totalMarks} (${pct}%)</strong></td>
                <td><span style="background:${color}20;color:${color};padding:2px 10px;border-radius:20px;font-size:12px;font-weight:700">${grade}</span></td>
                <td style="font-size:12px">${fmtDate(q.myAttempt.submittedAt)}</td>
                <td><button class="btn btn-sm" style="font-size:11px" onclick="viewStudentQuizResult('${q._id}')">View</button></td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        ` : '<div class="empty-state"><p>No quizzes completed yet.</p></div>'}
      </div>
      ${quizzes.filter(q => !q.myAttempt).length ? `
        <div class="card" style="margin-top:16px">
          <div class="card-title">Pending Quizzes</div>
          ${quizzes.filter(q => !q.myAttempt).map(q => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
              <div>
                <div style="font-weight:600">${q.title}</div>
                <div style="font-size:12px;color:var(--text-muted)">${q.course?.title || ''} · Due ${fmtDate(q.endTime)}</div>
              </div>
              <span style="background:#fef3c7;color:#92400e;padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">Pending</span>
            </div>
          `).join('')}
        </div>
      ` : ''}
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger)">Error: ${e.message}</p></div>`;
  }
}

async function viewStudentQuizResult(quizId) {
  try {
    const data = await api(`/api/student/quizzes/${quizId}/result`);
    navigateTo('quizzes');
    // Show result in modal
    const modal = document.getElementById('modal-container');
    if (!modal) return;
    modal.classList.remove('hidden');
    const pct = data.attempt?.percentageScore || 0;
    const color = pct >= 70 ? '#16a34a' : pct >= 50 ? '#d97706' : '#dc2626';
    modal.innerHTML = `
      <div class="modal-overlay" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()" style="max-width:600px;max-height:80vh;overflow-y:auto">
          <h3>${data.quiz?.title || 'Quiz Result'}</h3>
          <div style="text-align:center;margin:20px 0;padding:20px;background:${color}10;border-radius:12px">
            <div style="font-size:48px;font-weight:800;color:${color}">${pct}%</div>
            <div style="color:var(--text-muted);margin-top:4px">${data.attempt?.score}/${data.attempt?.totalMarks} marks</div>
          </div>
          ${data.feedback ? `<div style="padding:12px 16px;background:#f5f3ff;border-radius:8px;margin-bottom:16px;font-size:13px"><strong>Feedback:</strong> ${esc(data.feedback)}</div>` : ''}
          <div class="modal-actions"><button class="btn btn-secondary btn-sm" onclick="closeModal()">Close</button></div>
        </div>
      </div>`;
  } catch(e) { showToastNotif('Could not load result: ' + e.message, 'error'); }
}

async function renderStudentDashboard(content) {
  const [attendance, coursesData, quizzesData, meetingsData, activeSessionData] = await Promise.all([
    api('/api/attendance-sessions/my-attendance?limit=5').catch(() => ({ records: [], pagination: { total: 0 } })),
    api('/api/courses').catch(() => ({ courses: [] })),
    api('/api/student/quizzes').catch(() => ({ quizzes: [] })),
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
      <button class="btn btn-secondary btn-sm" onclick="generateAttendanceReportCard()">📋 Report Card</button>
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
  const [sessionsData, usersData, pendingData, announcementsData] = await Promise.all([
    api('/api/attendance-sessions?limit=5').catch(() => ({ sessions: [], pagination: { total: 0 } })),
    api('/api/users').catch(() => ({ users: [] })),
    api('/api/approvals/pending').catch(() => ({ pending: [] })),
    api('/api/announcements').catch(() => ({ announcements: [] })),
  ]);

  const activeSessions = sessionsData.sessions.filter(s => s.status === 'active').length;
  // Auto-refresh every 30s if there are active sessions
  if (activeSessions > 0) {
    clearTimeout(window._dashRefreshTimer);
    window._dashRefreshTimer = setTimeout(() => { if (currentView === 'dashboard') renderDashboard(); }, 30000);
  }
  const totalUsers     = usersData.users.length;
  const pendingCount   = pendingData.pending.length;
  const announcements  = announcementsData.announcements || [];
  const instCode       = currentUser.company?.institutionCode || currentUser.company?.code || 'N/A';
  const mode           = currentUser.company?.mode || currentUser.mode || (document.getElementById('dashboard-page')?.dataset?.mode) || 'corporate';
  const isAcademic     = mode === 'academic';
  const firstName      = currentUser.name.split(' ')[0];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const sessionRows = sessionsData.sessions.length
    ? sessionsData.sessions.map(s => {
        const isLive = s.status === 'active';
        return `
          <div class="session-row">
            <div class="session-indicator ${isLive ? 'live' : 'ended'}"></div>
            <div class="session-row-info">
              <div class="session-row-title">${s.title || 'Untitled'}</div>
              <div class="session-row-sub">${s.createdBy?.name || ''}</div>
            </div>
            <span class="session-row-time ${isLive ? 'live' : 'ended'}">${isLive ? 'Live' : timeAgo(s.startedAt)}</span>
          </div>`;
      }).join('')
    : `<div class="empty-state"><p>No sessions yet</p></div>`;

  const typeColors = { info: '#3b82f6', warning: '#f59e0b', success: '#10b981', urgent: '#ef4444' };
  const annRows = announcements.length
    ? announcements.slice(0, 5).map(a => `
        <div class="ann-row">
          <div class="ann-dot" style="background:${typeColors[a.type] || '#94a3b8'}"></div>
          <div>
            <div class="ann-title">${a.title}</div>
            <div class="ann-meta">${a.audience === 'all' ? 'Everyone' : a.audience.charAt(0).toUpperCase()+a.audience.slice(1)} · ${timeAgo(a.createdAt)}</div>
          </div>
        </div>`).join('')
    : `<div class="empty-state"><p>No announcements yet</p></div>`;

  content.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">

      <!-- Welcome row -->
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
        <div class="dashboard-welcome">
          <h2>${greeting}, ${firstName} 👋</h2>
          <p>Here's what's happening at ${currentUser.company?.name || 'your institution'} today.</p>
        </div>
        <div class="inst-code-card">
          <div class="inst-code-label">Institution code</div>
          <div class="inst-code-value">${instCode}</div>
          <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${instCode}').then(()=>toastSuccess('Code copied!'))">Copy</button>
        </div>
      </div>

      <!-- Stat cards -->
      <div class="stats-grid" style="margin:0">
        <div class="stat-card-v2" onclick="navigateTo('users')">
          <div class="stat-top-bar" style="background:#3b82f6"></div>
          <div class="stat-header">
            <span class="stat-label">Total users</span>
            <div class="stat-icon" style="background:#eff6ff">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            </div>
          </div>
          <div class="stat-value">${totalUsers}</div>
          <div class="stat-trend">${isAcademic ? 'Students, lecturers & staff' : 'Employees & managers'}</div>
        </div>

        <div class="stat-card-v2" onclick="navigateTo('sessions')">
          <div class="stat-top-bar" style="background:var(--success)"></div>
          <div class="stat-header">
            <span class="stat-label">Active sessions</span>
            <div class="stat-icon" style="background:#f0fdf4">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
          </div>
          <div class="stat-value">${activeSessions}</div>
          <div class="stat-trend" style="color:${activeSessions > 0 ? 'var(--success)' : 'var(--text-muted)'}">
            ${activeSessions > 0 ? '<span class="stat-live-dot"></span> Live now' : 'No active sessions'}
          </div>
        </div>

        <div class="stat-card-v2" onclick="navigateTo('sessions')">
          <div class="stat-top-bar" style="background:#f59e0b"></div>
          <div class="stat-header">
            <span class="stat-label">Total sessions</span>
            <div class="stat-icon" style="background:#fffbeb">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
            </div>
          </div>
          <div class="stat-value">${sessionsData.pagination?.total || sessionsData.sessions.length}</div>
          <div class="stat-trend">All time</div>
        </div>

        <div class="stat-card-v2" style="${pendingCount > 0 ? 'border-color:#ddd6fe' : ''}" onclick="navigateTo('approvals')">
          <div class="stat-top-bar" style="background:#7c3aed"></div>
          <div class="stat-header">
            <span class="stat-label">Pending approvals</span>
            <div class="stat-icon" style="background:#f5f3ff">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
          </div>
          <div class="stat-value" style="color:${pendingCount > 0 ? '#7c3aed' : 'var(--text)'}">${pendingCount}</div>
          <div class="stat-trend" style="color:${pendingCount > 0 ? '#7c3aed' : 'var(--text-muted)'}">${pendingCount > 0 ? 'Action needed' : 'All clear'}</div>
        </div>
      </div>

      <!-- Quick actions -->
      <div class="quick-actions-bar">
        <div class="section-label">Quick actions</div>
        <div class="actions-row">
          <button class="action-chip blue" onclick="navigateTo('sessions')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Start session
          </button>
          <button class="action-chip green" onclick="navigateTo('users')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
            Add user
          </button>
          ${pendingCount > 0 ? `
          <button class="action-chip purple" onclick="navigateTo('approvals')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Review approvals (${pendingCount})
          </button>` : ''}
          <button class="action-chip amber" onclick="navigateTo('announcements')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            Post announcement
          </button>
          <button class="action-chip slate" onclick="navigateTo('reports')">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            View reports
          </button>
        </div>
      </div>

      <!-- Bottom panels -->
      <div class="dashboard-panels">
        <div class="dashboard-panel">
          <div class="panel-header">
            <span class="panel-title">Recent sessions</span>
            <span class="panel-link" onclick="navigateTo('sessions')">View all →</span>
          </div>
          ${sessionRows}
        </div>

        <div class="dashboard-panel">
          <div class="panel-header">
            <span class="panel-title">Announcements</span>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('announcements')">+ Post</button>
          </div>
          ${annRows}
        </div>
      </div>

      <!-- Analytics Charts -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:4px">
        <div class="card" style="min-width:0">
          <div style="font-size:13px;font-weight:700;margin-bottom:12px">Attendance Trend (Last 14 Days)</div>
          <div style="position:relative;height:180px;width:100%">
            <canvas id="admin-attendance-chart"></canvas>
          </div>
        </div>
        <div class="card" style="min-width:0">
          <div style="font-size:13px;font-weight:700;margin-bottom:12px">Users by Role</div>
          <div style="position:relative;height:180px;width:100%">
            <canvas id="admin-role-chart"></canvas>
          </div>
        </div>
      </div>

    </div>
  `;

  // Load Chart.js and render analytics
  _renderAdminCharts(sessionsData, usersData);
}

async function _renderAdminCharts(sessionsData, usersData) {
  try {
    if (!window.Chart) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
        s.onload = res; s.onerror = rej;
        document.head.appendChild(s);
      });
    }
    // Destroy any existing chart instances before reusing canvas
    ['admin-attendance-chart', 'admin-role-chart'].forEach(id => {
      const canvas = document.getElementById(id);
      if (canvas) {
        const existing = Chart.getChart(canvas);
        if (existing) existing.destroy();
      }
    });

    // Attendance trend — group all sessions by date over last 14 days
    const allSessions = await api('/api/attendance-sessions?limit=200').catch(() => ({ sessions: [] }));
    const now = Date.now();
    const days14 = 14 * 86400000;
    const trendMap = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      trendMap[d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })] = 0;
    }
    (allSessions.sessions || []).filter(s => s.startedAt && (now - new Date(s.startedAt)) < days14).forEach(s => {
      const key = new Date(s.startedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      if (key in trendMap) trendMap[key] += s.attendanceCount || 0;
    });
    const trendLabels = Object.keys(trendMap);
    const trendData   = Object.values(trendMap);

    const attCtx = document.getElementById('admin-attendance-chart');
    if (attCtx) {
      new Chart(attCtx, {
        type: 'line',
        data: {
          labels: trendLabels,
          datasets: [{ label: 'Attendance', data: trendData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.1)', borderWidth: 2, fill: true, tension: 0.4, pointRadius: 3 }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, ticks: { stepSize: 1, maxTicksLimit: 4 } },
            x: { ticks: { maxTicksLimit: 5, maxRotation: 0, autoSkip: true } }
          }
        }
      });
    }

    // Users by role
    const users = usersData.users || [];
    const roleCount = {};
    users.forEach(u => { roleCount[u.role] = (roleCount[u.role] || 0) + 1; });
    const roleLabels = Object.keys(roleCount);
    const roleData   = Object.values(roleCount);
    const roleColors = ['#6366f1','#10b981','#f59e0b','#ef4444','#0ea5e9','#8b5cf6'];

    const roleCtx = document.getElementById('admin-role-chart');
    if (roleCtx && roleLabels.length > 0) {
      new Chart(roleCtx, {
        type: 'doughnut',
        data: {
          labels: roleLabels.map(r => r.charAt(0).toUpperCase() + r.slice(1)),
          datasets: [{ data: roleData, backgroundColor: roleColors.slice(0, roleLabels.length), borderWidth: 2, borderColor: '#fff' }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'bottom',
              labels: { boxWidth: 10, font: { size: 10 }, padding: 8 }
            }
          }
        }
      });
    }
  } catch(e) {
    console.error('Admin charts error:', e.message);
  }
}


// Track selected course filter for sessions page
let _sessionsFilterCourseId = '';
let _sessionsFilterCourseTitle = '';

async function renderSessions(courseId, courseTitle) {
  // Allow passing a courseId to pre-filter (e.g. from course page)
  if (courseId) { _sessionsFilterCourseId = courseId; _sessionsFilterCourseTitle = courseTitle || ''; }
  const content = document.getElementById('main-content');
  if (!content) return;

  // Offline: render from cache immediately
  if (!isOnline()) {
    const cached = offlineRead('sessions');
    _renderSessionsHTML(content, cached?.sessions || [], true);
    return;
  }

  try {
    const qs = _sessionsFilterCourseId ? `?courseId=${_sessionsFilterCourseId}` : '';
    const data = await api('/api/attendance-sessions' + qs);
    offlineCache('sessions', data);
    _renderSessionsHTML(content, data.sessions || [], false);
  } catch (e) {
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
  const canStart = ['lecturer', 'manager'].includes(currentUser.role);
  const isLecturer = currentUser.role === 'lecturer';

  const filterPill = _sessionsFilterCourseId
    ? `<div style="display:flex;align-items:center;gap:6px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:20px;padding:3px 10px 3px 8px;font-size:12px;color:#1e40af;font-weight:600;">
        📚 ${esc(_sessionsFilterCourseTitle || 'Course filter')}
        <button onclick="_sessionsFilterCourseId='';_sessionsFilterCourseTitle='';renderSessions()" style="background:none;border:none;cursor:pointer;color:#6b7280;font-size:15px;line-height:1;padding:0 0 0 2px;" title="Clear filter">×</button>
      </div>`
    : '';

  content.innerHTML = `
    <div class="page-header">
      <h2>Attendance Sessions</h2>
      <p>Manage attendance sessions${isOffline ? ' <span style="color:#f59e0b;font-weight:600">(Offline — showing cached data)</span>' : ''}</p>
    </div>
    <div class="actions-bar" style="margin-bottom:14px;">
      ${canStart ? `<button class="btn btn-primary btn-sm" onclick="showStartSessionModal()">Start New Session</button>` : ''}
      ${filterPill}
      ${pendingCount > 0 ? `<span style="background:#fef3c7;color:#92400e;border:1px solid #fbbf24;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:600">${pendingCount} action${pendingCount!==1?'s':''} pending sync</span>` : ''}
    </div>
    <div class="card">
      ${sessions.length ? `
        <table>
          <thead><tr>
            <th>Title</th>
            ${isLecturer ? '<th>Course</th>' : ''}
            <th>Status</th><th>Started</th><th>Stopped</th><th>Actions</th>
          </tr></thead>
          <tbody>${sessions.map((s, i) => `
            <tr>
              <td>${s.title || 'Untitled'}</td>
              ${isLecturer ? `<td><span style="font-size:11px;font-weight:600;color:#6366f1;">${s.course ? esc(s.course.code || s.course.title || '') : '—'}</span></td>` : ''}
              <td><span class="status-badge status-${s.status}">${s.status}</span></td>
              <td>${new Date(s.startedAt).toLocaleString()}</td>
              <td>${s.stoppedAt ? new Date(s.stoppedAt).toLocaleString() : '-'}</td>
              <td>${s.status === 'active' && canStart ? `
                <button class="btn btn-danger btn-sm" onclick="stopSession('${s._id}')">Stop</button>
                ${!isOffline ? `<button class="btn btn-success btn-sm" onclick="generateQR('${s._id}')">QR Code</button>` : ''}
                ${!isOffline ? `<button class="btn btn-sm" style="background:#7c3aed;color:#fff;font-size:11px" onclick="generateVerbalCode('${s._id}')">Verbal Code</button>` : ''}
                <button class="btn btn-sm" style="font-size:11px;background:var(--bg);border:1px solid var(--border)" onclick="viewAttendees('${s._id}', '${(s.title||'Session').replace(/['\''\'']/g,'')}')">Attendees</button>
              ` : s.status === 'active' ? `
                <button class="btn btn-sm" style="font-size:11px;background:var(--bg);border:1px solid var(--border)" onclick="viewAttendees('${s._id}', '${(s.title||'Session').replace(/['\''\'']/g,'')}')">Attendees</button>
              ` : ''}</td>
            </tr>
          `).join('')}</tbody>
        </table>
      ` : `<div class="empty-state"><p>${_sessionsFilterCourseId ? 'No sessions for this course yet.' : 'No sessions found'}</p></div>`}
    </div>
  `;
}


async function showStartSessionModal() {
  // Wait for modal-container to be in DOM (it may not exist if called too early)
  let container = document.getElementById('modal-container');
  if (!container) {
    await new Promise(r => setTimeout(r, 150));
    container = document.getElementById('modal-container');
  }
  if (!container) { toastError('Page not ready. Please wait and try again.'); return; }

  container.classList.remove('hidden');
  container.innerHTML = `<div class="modal-overlay"><div class="modal"><p style="color:var(--text-muted);text-align:center;padding:8px 0">📡 Checking classroom device…</p></div></div>`;

  // Proximity is enforced at attendance time via BLE token scanning.
  // Session start only requires the ESP32 device to be online (heartbeat check below).
  // ── End proximity check ───────────────────────────────────

  // ── STRICT device check — always required, no skip ────────
  let deviceStatus = null;
  let checkError   = false;

  try {
    deviceStatus = await api('/api/esp32/device-status');
  } catch(e) {
    checkError = true;
  }

  // Device not registered yet
  if (!checkError && deviceStatus && !deviceStatus.hasDevice) {
    container.innerHTML = `
      <div class="modal-overlay" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()" style="text-align:center;max-width:400px">
          <div style="font-size:40px;margin-bottom:12px">📟</div>
          <h3 style="margin-bottom:8px">Device Not Set Up</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;line-height:1.6">
            No classroom device is registered for this institution.<br>
            Power on the KODEX device and send <strong>REGISTER</strong> via serial monitor.
          </p>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary btn-sm" onclick="showStartSessionModal()">↻ Retry</button>
          </div>
        </div>
      </div>`;
    return;
  }

  // Device registered but offline
  if (!checkError && deviceStatus && deviceStatus.hasDevice && !deviceStatus.deviceOnline) {
    const lastSeen = deviceStatus.lastSeenAt
      ? `Last seen: ${new Date(deviceStatus.lastSeenAt).toLocaleString()}`
      : 'Last seen: Never';
    container.innerHTML = `
      <div class="modal-overlay" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()" style="text-align:center;max-width:400px">
          <div style="font-size:40px;margin-bottom:12px">📟</div>
          <h3 style="margin-bottom:8px">Device is Offline</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;line-height:1.6">
            The <strong>KODEX classroom device</strong> is not responding.<br>
            Power it on, wait a few seconds, then try again.
          </p>
          <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;font-size:12px;color:#92400e;margin-bottom:20px;text-align:left">
            <strong>${lastSeen}</strong><br>
            Status: Offline — no heartbeat in last 20s
          </div>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary btn-sm" onclick="showStartSessionModal()">↻ Retry</button>
          </div>
        </div>
      </div>`;
    return;
  }

  // Device check failed — network error or server unreachable.
  // BLOCK — never silently proceed. Show retry screen.
  if (checkError) {
    container.innerHTML = `
      <div class="modal-overlay" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()" style="text-align:center;max-width:400px">
          <div style="font-size:40px;margin-bottom:12px">⚠️</div>
          <h3 style="margin-bottom:8px">Cannot Verify Device</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;line-height:1.6">
            Could not reach the server to check whether the classroom device is online.<br><br>
            Make sure you have internet access, then try again.
          </p>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary btn-sm" onclick="showStartSessionModal()">↻ Retry</button>
          </div>
        </div>
      </div>`;
    return;
  }
  // ── Device confirmed online — show session form ────────────

  // Fetch courses — always from kodex.it.com (hardcoded in API constant)
  // If this fails, it means the server is unreachable — show clear error.
  let courses = [];
  let courseLoadError = false;
  try {
    const d = await api('/api/courses');
    courses = d.courses || d || [];
  } catch(e) {
    courseLoadError = true;
    console.error('[showStartSessionModal] Failed to load courses:', e.message);
  }

  if (courseLoadError || courses.length === 0) {
    container.innerHTML = `
      <div class="modal-overlay" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()" style="text-align:center;max-width:400px">
          <div style="font-size:40px;margin-bottom:12px">📡</div>
          <h3 style="margin-bottom:8px">${courseLoadError ? 'Connection Error' : 'No Courses Found'}</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;line-height:1.6">
            ${courseLoadError
              ? 'Could not reach the KODEX server. Make sure your device has internet access (not just classroom WiFi).'
              : 'No courses are assigned to you yet. Please contact your admin.'}
          </p>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary btn-sm" onclick="showStartSessionModal()">↻ Retry</button>
          </div>
        </div>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Start New Session</h3>
        <div class="form-group">
          <label>Course <span style="color:red">*</span></label>
          <select id="session-course" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
            <option value="">— Select Course —</option>
            ${courses
                .filter(c => !c.needsApproval || c.approvalStatus === 'approved')
                .map(c => `<option value="${c._id}">${esc(c.title)}${c.level?' · L'+c.level:''}${c.group?' · Grp '+c.group:''}</option>`).join('')}
          </select>
          ${courses.some(c => c.needsApproval && c.approvalStatus !== 'approved') ? `<p style="font-size:11px;color:#b45309;margin-top:4px">Some courses are hidden because they are pending approval or rejected.</p>` : ''}
        </div>
        <div class="form-group">
          <label>Session Title <span style="font-weight:400;color:var(--text-muted);font-size:12px">(optional)</span></label>
          <input type="text" id="session-title" placeholder="e.g., Week 5 Lecture">
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
  const title    = document.getElementById('session-title')?.value?.trim();
  const courseId = document.getElementById('session-course')?.value;

  if (!courseId) { toastWarning('Please select a course.'); return; }

  // Don't close modal yet — keep it open so we can show errors in it
  const container = document.getElementById('modal-container');
  if (container) {
    container.innerHTML = `<div class="modal-overlay"><div class="modal"><p style="color:var(--text-muted);text-align:center;padding:16px 0">⏳ Starting session…</p></div></div>`;
  }

  // Sessions cannot be started offline — device check requires live server
  if (!(await isOnlineAsync())) {
    if (container) container.innerHTML = `
      <div class="modal-overlay" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()" style="text-align:center;max-width:400px">
          <div style="font-size:40px;margin-bottom:12px">📶</div>
          <h3 style="margin-bottom:8px">No Internet</h3>
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px;line-height:1.6">
            You need an internet connection to start a session.<br>The device check requires the server.
          </p>
          <div style="display:flex;gap:8px;justify-content:center">
            <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary btn-sm" onclick="showStartSessionModal()">↻ Retry</button>
          </div>
        </div>
      </div>`;
    return;
  }

  try {
    const hotspotKey = sessionStorage.getItem('kodex_esp32_hotspot_key') || '';
    await api('/api/attendance-sessions/start', {
      method: 'POST',
      headers: hotspotKey ? { 'x-esp32-hotspot-key': hotspotKey } : {},
      body: JSON.stringify({ title, courseId }),
    });
    closeModal();
    renderSessions();
  } catch (e) {
    // Device offline or not registered — show in-modal block screen
    if (e.status === 503) {
      const msg = e.data?.message || 'The classroom device is not responding. Power it on and try again.';
      if (container) container.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
          <div class="modal" onclick="event.stopPropagation()" style="text-align:center;max-width:400px">
            <div style="font-size:40px;margin-bottom:12px">📟</div>
            <h3 style="margin-bottom:8px">Device is Offline</h3>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;line-height:1.6">${esc(msg)}</p>
            <div style="display:flex;gap:8px;justify-content:center">
              <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
              <button class="btn btn-primary btn-sm" onclick="showStartSessionModal()">↻ Retry</button>
            </div>
          </div>
        </div>`;
    } else {
      if (container) container.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
          <div class="modal" onclick="event.stopPropagation()" style="text-align:center;max-width:400px">
            <div style="font-size:40px;margin-bottom:12px">❌</div>
            <h3 style="margin-bottom:8px">Could Not Start Session</h3>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px">${esc(e.message)}</p>
            <div style="display:flex;gap:8px;justify-content:center">
              <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
              <button class="btn btn-primary btn-sm" onclick="showStartSessionModal()">↻ Retry</button>
            </div>
          </div>
        </div>`;
    }
  }
}

async function stopSession(id) {
  if (!confirm('Stop this session?')) return;

  // Sessions cannot be stopped offline — requires live server connection
  if (!(await isOnlineAsync())) {
    toastError('No internet connection. You need internet access to stop a session.');
    return;
  }

  try {
    await api(`/api/attendance-sessions/${id}/stop`, { method: 'POST' });
    renderSessions();
  } catch (e) {
    toastError(e.message);
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
      const { code, token } = data.qrToken;
      // Encode the token into the QR so students scan → auto-submit
      // QR encodes a deep link — scanning opens browser → auto-marks attendance
      const qrDeepLink = `${window.location.origin}${window.location.pathname}?qr_token=${token}&qr_code=${code}`;
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrDeepLink)}&bgcolor=ffffff&color=000000&margin=10`;

      container.innerHTML = `
        <div class="modal-overlay" onclick="_stopQrTimers();closeModal(event)">
          <div class="modal" onclick="event.stopPropagation()" style="text-align:center;max-width:400px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <h3 style="margin:0">Attendance QR Code</h3>
              <button onclick="_stopQrTimers();closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-light)">×</button>
            </div>
            <p style="color:var(--text-light);font-size:12px;margin-bottom:16px">${currentUser.company?.mode === "corporate" ? "Employees" : "Students"} scan this with their phone camera to mark attendance</p>

            <!-- QR Code Image -->
            <div id="qr-code-display" style="position:relative;display:inline-block;margin-bottom:12px">
              <img src="${qrImageUrl}" id="qr-img" width="240" height="240"
                style="border-radius:12px;border:3px solid var(--primary);display:block"
                onerror="this.style.display='none';document.getElementById('qr-fallback').style.display='block'"/>
              <!-- Fallback: show text code if image fails -->
              <div id="qr-fallback" style="display:none;width:240px;height:240px;border-radius:12px;border:3px solid var(--primary);display:flex;align-items:center;justify-content:center;background:#f8f9ff">
                <span style="font-size:48px;font-weight:900;color:var(--primary);letter-spacing:8px;font-family:monospace">${code}</span>
              </div>
              <!-- Refresh overlay when expiring -->
              <div id="qr-overlay" style="display:none;position:absolute;inset:0;background:rgba(255,255,255,0.85);border-radius:12px;align-items:center;justify-content:center;flex-direction:column;gap:8px">
                <div style="font-size:28px">🔄</div>
                <div style="font-size:13px;font-weight:700;color:var(--primary)">Refreshing…</div>
              </div>
            </div>

            <!-- Code text below QR for manual fallback -->
            <div style="font-size:13px;color:var(--text-light);margin-bottom:8px">
              Or enter code manually: <span style="font-weight:800;color:var(--primary);font-family:monospace;letter-spacing:4px">${code}</span>
            </div>

            <!-- Countdown ring -->
            <div style="display:flex;align-items:center;justify-content:center;gap:12px;margin-bottom:12px">
              <div style="position:relative;width:64px;height:64px">
                <svg width="64" height="64" style="transform:rotate(-90deg)">
                  <circle cx="32" cy="32" r="27" fill="none" stroke="#e5e7eb" stroke-width="5"/>
                  <circle id="qr-ring" cx="32" cy="32" r="27" fill="none" stroke="var(--primary)" stroke-width="5"
                    stroke-linecap="round"
                    stroke-dasharray="170"
                    stroke-dashoffset="0"
                    style="transition:stroke-dashoffset 1s linear,stroke 0.3s"/>
                </svg>
                <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
                  <span id="qr-countdown" style="font-size:16px;font-weight:800;color:var(--primary)">${QR_EXPIRY_SECONDS}</span>
                </div>
              </div>
              <div id="qr-status" style="display:inline-flex;align-items:center;gap:6px;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:999px;padding:5px 14px;font-size:12px;font-weight:600;color:#16a34a">
                <span style="width:7px;height:7px;border-radius:50%;background:#16a34a;display:inline-block;animation:pulse-green 1.5s infinite"></span>
                Live · Auto-refreshes every ${QR_EXPIRY_SECONDS}s
              </div>
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
      const circumference = 170;

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
          // Show overlay over QR image
          const overlay = document.getElementById('qr-overlay');
          if (overlay) overlay.style.display = 'flex';
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

async function generateVerbalCode(sessionId) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');

  async function _fetchAndShow() {
    try {
      const data = await api('/api/qr-tokens/generate', {
        method: 'POST',
        body: JSON.stringify({ sessionId, codeType: 'verbal', expiryMinutes: 5 })
      });
      const { code, expiresAt } = data.qrToken;
      const expiry = new Date(expiresAt);
      const totalSecs = Math.round((expiry - Date.now()) / 1000);

      container.innerHTML = `
        <div class="modal-overlay" onclick="closeModal(event)">
          <div class="modal" onclick="event.stopPropagation()" style="text-align:center;max-width:380px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <h3 style="margin:0">Verbal Attendance Code</h3>
              <button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-light)">×</button>
            </div>
            <p style="color:var(--text-light);font-size:12px;margin-bottom:16px">Read this code out loud. All ${currentUser.company?.mode === 'corporate' ? 'employees' : 'students'} can use it within the time window.</p>
            <div style="font-size:64px;font-weight:900;color:#7c3aed;letter-spacing:12px;margin-bottom:8px;font-family:monospace">${code}</div>
            <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:999px;padding:5px 14px;font-size:12px;font-weight:600;color:#7c3aed;margin-bottom:6px">
              <span style="width:7px;height:7px;border-radius:50%;background:#7c3aed;display:inline-block;animation:pulse-green 1.5s infinite"></span>
              Multi-use · All ${currentUser.company?.mode === 'corporate' ? 'employees' : 'students'} can enter this code
            </div>
            <p style="color:var(--text-light);font-size:12px;margin-bottom:4px">Expires in: <span id="verbal-countdown" style="font-weight:700;color:#7c3aed">${Math.floor(totalSecs/60)}m ${totalSecs%60}s</span></p>
            <p style="color:var(--text-muted);font-size:11px;margin-bottom:20px">Expires at ${expiry.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</p>
            <div class="modal-actions" style="justify-content:center;gap:8px">
              <button class="btn btn-sm" style="background:#7c3aed;color:#fff" onclick="generateVerbalCode('${sessionId}')">New Code</button>
              <button class="btn btn-primary btn-sm" onclick="closeModal()">Close</button>
            </div>
          </div>
        </div>
      `;

      // Countdown timer
      let secs = totalSecs;
      const countEl = () => document.getElementById('verbal-countdown');
      const timer = setInterval(() => {
        secs--;
        if (secs <= 0) { clearInterval(timer); if (countEl()) countEl().textContent = 'Expired'; return; }
        if (countEl()) countEl().textContent = Math.floor(secs/60) + 'm ' + (secs%60) + 's';
      }, 1000);

    } catch(e) {
      const msg = e.message || 'Failed to generate code';
      const isSubError = msg.toLowerCase().includes('subscription') || msg.toLowerCase().includes('trial');
      container.innerHTML = `<div class="modal-overlay" onclick="closeModal(event)"><div class="modal" onclick="event.stopPropagation()" style="text-align:center;padding:24px">
        <div style="font-size:36px;margin-bottom:12px">${isSubError ? '🔒' : '⚠️'}</div>
        <p style="color:red;font-weight:600;margin-bottom:8px">${msg}</p>
        ${isSubError ? '<p style="font-size:13px;color:var(--text-light)">Go to <b>Subscription</b> to activate your plan.</p>' : ''}
        <button class="btn btn-primary btn-sm" onclick="closeModal()" style="margin-top:12px">Close</button>
      </div></div>`;
    }
  }

  await _fetchAndShow();
}


async function renderUsers(filterRole='', filterDept='', filterSearch='') {
  const content = document.getElementById('main-content');
  if (!content) return;
  try {
    let url = '/api/users';
    const params = [];
    if (filterRole) params.push('role=' + encodeURIComponent(filterRole));
    if (filterDept) params.push('department=' + encodeURIComponent(filterDept));
    if (params.length) url += '?' + params.join('&');

    const data = await api(url);
    const mode = currentUser.company?.mode || 'corporate';
    const isManager = currentUser.role === 'manager';
    const canManage = ['manager', 'admin', 'superadmin'].includes(currentUser.role);
    const pageTitle = isManager ? 'Employees' : 'Users';
    const pageDesc = isManager ? 'Manage your employees' : 'Manage team members';
    const addLabel = isManager ? 'Add Employee' : 'Add User';

    let otherUsers = data.users.filter(u => u._id !== currentUser.id);
    if (filterSearch) {
      const q = filterSearch.toLowerCase();
      otherUsers = otherUsers.filter(u =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.indexNumber?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    }

    // Collect unique departments for filter dropdown
    const allDepts = [...new Set((data.users || []).map(u => u.department).filter(Boolean))].sort();

    content.innerHTML = `
      <div class="page-header"><h2>${pageTitle}</h2><p>${pageDesc} · ${otherUsers.length} shown</p></div>
      <div class="actions-bar" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
        ${canManage ? `<button class="btn btn-primary btn-sm" onclick="showCreateUserModal()">${addLabel}</button>` : ''}
        ${['admin','superadmin'].includes(currentUser.role) && mode === 'academic' ? `<button class="btn btn-sm btn-secondary" onclick="showBulkImportModal()">📥 Bulk Import Students</button>` : ''}
        ${['admin','superadmin'].includes(currentUser.role) ? `<button class="btn btn-sm" style="background:#f59e0b;color:#fff" onclick="renderResetLogs()">🔐 Password Reset Log</button>` : ''}
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-left:auto;">
          <input id="user-search-input" placeholder="Search name / email / ID…" value="${filterSearch}"
            oninput="renderUsers(document.getElementById('user-role-filter').value, document.getElementById('user-dept-filter').value, this.value)"
            style="padding:7px 11px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;min-width:180px;">
          <select id="user-role-filter" onchange="renderUsers(this.value, document.getElementById('user-dept-filter').value, document.getElementById('user-search-input').value)"
            style="padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
            <option value="" ${!filterRole?'selected':''}>All Roles</option>
            ${mode === 'academic'
              ? `<option value="admin" ${filterRole==='admin'?'selected':''}>Admin</option>
                 <option value="hod" ${filterRole==='hod'?'selected':''}>HOD</option>
                 <option value="lecturer" ${filterRole==='lecturer'?'selected':''}>Lecturer</option>
                 <option value="student" ${filterRole==='student'?'selected':''}>Student</option>`
              : `<option value="admin" ${filterRole==='admin'?'selected':''}>Admin</option>
                 <option value="manager" ${filterRole==='manager'?'selected':''}>Manager</option>
                 <option value="employee" ${filterRole==='employee'?'selected':''}>Employee</option>`}
          </select>
          ${mode === 'academic' && allDepts.length > 0 ? `
          <select id="user-dept-filter" onchange="renderUsers(document.getElementById('user-role-filter').value, this.value, document.getElementById('user-search-input').value)"
            style="padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
            <option value="" ${!filterDept?'selected':''}>All Departments</option>
            ${allDepts.map(d => `<option value="${d}" ${filterDept===d?'selected':''}>${d}</option>`).join('')}
          </select>` : `<select id="user-dept-filter" style="display:none;"></select>`}
          ${filterRole || filterDept || filterSearch ? `<button class="btn btn-xs btn-secondary" onclick="renderUsers()">✕ Clear</button>` : ''}
        </div>
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
              <th>Name</th>${mode === 'corporate' ? '<th>Employee ID</th>' : ''}<th>Email / Index</th><th>Role</th>${mode !== 'corporate' ? '<th>Classification</th>' : ''}<th>Status</th>${canManage ? '<th>Actions</th>' : ''}
            </tr></thead>
            <tbody>${otherUsers.map(u => `
              <tr id="user-row-${u._id}">
                ${canManage ? `<td><input type="checkbox" class="user-checkbox" value="${u._id}" onchange="updateBulkActions()"></td>` : ''}
                <td>${u.name}</td>
                ${mode === 'corporate' ? `<td>${u.employeeId || '-'}</td>` : ''}
                <td>${u.email || u.IndexNumber || u.indexNumber || 'N/A'}</td>
                <td><span class="role-badge role-${u.role}">${u.role}</span>${u.department ? `<span style="font-size:10px;margin-left:5px;padding:2px 6px;border-radius:20px;background:#ecfeff;color:#0891b2;font-weight:600;">${u.department}</span>` : ''}</td>
                ${mode !== 'corporate' ? `<td style="font-size:11px;white-space:nowrap">
                  ${u.role === 'student' ? `
                    ${u.programme ? `<span style="background:#ede9fe;color:#7c3aed;padding:1px 6px;border-radius:20px;font-weight:700;margin-right:2px">${esc(u.programme)}</span>` : ''}
                    ${u.studentLevel ? `<span style="background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:20px;font-weight:700;margin-right:2px">L${esc(u.studentLevel)}</span>` : ''}
                    ${u.studentGroup ? `<span style="background:#ecfdf5;color:#059669;padding:1px 6px;border-radius:20px;font-weight:700;margin-right:2px">Grp ${esc(u.studentGroup)}</span>` : ''}
                    ${u.sessionType ? `<span style="background:#fff7ed;color:#c2410c;padding:1px 6px;border-radius:20px;font-weight:600;margin-right:2px">${esc(u.sessionType)}</span>` : ''}
                    ${u.semester ? `<span style="color:var(--text-muted)">Sem ${esc(u.semester)}</span>` : ''}
                    ${!u.programme && !u.studentLevel ? '<span style="color:var(--text-muted)">—</span>' : ''}
                  ` : '<span style="color:var(--text-muted)">—</span>'}
                </td>` : ''}
                <td><span class="status-badge ${u.isActive ? 'status-active' : 'status-stopped'}">${u.isActive ? 'Active' : 'Inactive'}</span></td>
                ${canManage ? `<td style="white-space:nowrap">
                  ${u.isActive
                    ? `<button class="btn btn-sm" style="background:#f59e0b;color:#fff;font-size:11px" onclick="deactivateUser('${u._id}')">Deactivate</button>`
                    : `<button class="btn btn-sm" style="background:#22c55e;color:#fff;font-size:11px" onclick="activateUser('${u._id}')">Activate</button>`}
                  <button class="btn btn-sm" style="background:#6366f1;color:#fff;font-size:11px" onclick="adminResetStudentPassword('${u._id}', this)">🔑 Reset</button>
                  ${u.role === 'student' && u.deviceId ? `<button class="btn btn-sm" style="background:#f97316;color:#fff;font-size:11px" onclick="clearStudentDeviceLock('${u._id}', this)">🔓 Unlock</button>` : ''}
                  <button class="btn btn-danger btn-sm" style="font-size:11px" onclick="deleteUserPermanently('${u._id}', this)">Delete</button>
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

async function renderResetLogs() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading reset logs…</div>';
  try {
    const { logs } = await api('/api/users/reset-logs/all');
    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div><h2>🔐 Password Reset Log</h2><p>All password resets across your institution</p></div>
        <button class="btn btn-secondary btn-sm" onclick="renderUsers()">← Back to Users</button>
      </div>
      <div class="card" style="padding:0;overflow:hidden">
        ${!logs.length ? `
          <div style="text-align:center;padding:48px;color:#6b7280">
            <div style="font-size:36px;margin-bottom:10px">🔒</div>
            <div style="font-weight:600">No password resets recorded yet</div>
          </div>
        ` : `
          <table>
            <thead><tr>
              <th>User</th>
              <th>Role</th>
              <th>Email / ID</th>
              <th>Reset At</th>
              <th>IP Address</th>
              <th>Method</th>
              <th>Device</th>
            </tr></thead>
            <tbody>
              ${logs.map(l => `
                <tr>
                  <td style="font-weight:600">${l.userName}</td>
                  <td><span class="role-badge role-${l.userRole}">${l.userRole}</span></td>
                  <td style="font-size:12px;color:#6b7280">${l.userEmail}</td>
                  <td style="font-size:12px;white-space:nowrap">${new Date(l.resetAt).toLocaleString()}</td>
                  <td style="font-size:12px;font-family:monospace">${l.ipAddress || '—'}</td>
                  <td><span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:${l.method === 'admin' ? '#fef3c7' : '#f0f9ff'};color:${l.method === 'admin' ? '#92400e' : '#0369a1'}">${l.method === 'admin' ? '👮 Admin' : '👤 Self'}</span></td>
                  <td style="font-size:11px;color:#9ca3af;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${l.userAgent}">${l.userAgent ? l.userAgent.split(' ').slice(0,3).join(' ') : '—'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

function onCreateUserRoleChange() {
  const role = document.getElementById('new-user-role')?.value;
  const deptWrap = document.getElementById('new-user-dept-wrap');
  if (!deptWrap) return;

  if (role === 'hod') {
    // HOD sets their own new department — free text input
    deptWrap.innerHTML = `
      <label>Department <span style="font-size:11px;color:var(--text-light)">(this will become a new department)</span></label>
      <input type="text" id="new-user-dept" placeholder="e.g. Computer Science" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">`;
  } else if (role === 'student' || role === 'lecturer') {
    // Must pick from HOD departments - fetch from current user list
    const hods = Array.from(document.querySelectorAll('#users-table-body tr'))
      .map(tr => {
        const cells = tr.querySelectorAll('td');
        return cells.length > 2 ? { role: cells[1]?.textContent?.trim(), dept: cells[2]?.textContent?.trim() } : null;
      })
      .filter(u => u && u.role === 'hod' && u.dept && u.dept !== 'N/A');

    // Also try from window cached user list
    const cachedDepts = (window._hodDepts || []);
    const allDepts = [...new Set([...hods.map(h => h.dept), ...cachedDepts])].filter(Boolean).sort();

    const opts = allDepts.length
      ? allDepts.map(d => `<option value="${d}">${d}</option>`).join('')
      : '';

    deptWrap.innerHTML = allDepts.length
      ? `<label>Department <span style="font-size:11px;color:#dc2626">*must match an existing HOD</span></label>
         <select id="new-user-dept" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
           <option value="">— Select Department —</option>
           ${opts}
         </select>`
      : `<label>Department</label>
         <input type="text" id="new-user-dept" placeholder="No HODs set up yet — create a HOD first" disabled
           style="background:#f3f4f6;cursor:not-allowed;width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
         <p style="font-size:11px;color:#dc2626;margin-top:4px">⚠️ No departments set up. Select HOD role above to create one first.</p>`;
  } else {
    // Employee / manager — no dept restriction
    deptWrap.innerHTML = `
      <label>Department / Branch <span style="font-weight:400;color:var(--text-light)">(optional)</span></label>
      <input type="text" id="new-user-dept" placeholder="e.g. Engineering" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">`;
  }
}

async function showCreateUserModal() {
  const mode = currentUser.company?.mode || 'corporate';
  const isManager = currentUser.role === 'manager';
  const isAcademic = mode === 'academic';

  let roles;
  if (isManager) {
    roles = '<option value="employee">Employee</option>';
  } else if (!isAcademic) {
    roles = '<option value="employee">Employee</option><option value="manager">Manager</option>';
  } else {
    roles = `<option value="student">Student</option><option value="lecturer">Lecturer</option><option value="hod">Head of Department (HOD)</option>`;
  }

  // Fetch approved HODs to build department list
  let hodDepts = [];
  try {
    const usersData = await api('/api/users');
    hodDepts = (usersData.users || [])
      .filter(u => u.role === 'hod' && u.department && u.isApproved)
      .map(u => u.department)
      .filter((d, i, a) => a.indexOf(d) === i) // unique
      .sort();
    window._hodDepts = hodDepts; // cache for onCreateUserRoleChange
  } catch(e) { hodDepts = []; }

  const defaultRole = isManager ? 'employee' : (isAcademic ? 'student' : 'employee');
  const modalTitle = isManager ? 'Add Employee' : 'Add User';

  // For academic: department MUST come from approved HODs
  // If no HODs yet, warn admin before they can add students/lecturers
  const noHodWarning = isAcademic && hodDepts.length === 0
    ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:10px 12px;margin-bottom:12px;font-size:13px;color:#92400e">
        ⚠️ <strong>No departments set up yet.</strong> You must create a HOD account first before adding students or lecturers. Select "Head of Department (HOD)" above to add one now.
       </div>`
    : '';

  const deptDropdownOptions = hodDepts.length
    ? hodDepts.map(d => `<option value="${d}">${d}</option>`).join('')
    : '';

  const deptField = isAcademic
    ? (deptDropdownOptions
        ? `<select id="new-user-dept" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
            <option value="">— Select Department —</option>
            ${deptDropdownOptions}
           </select>`
        : `<input type="text" id="new-user-dept" placeholder="Department (set up a HOD first)" disabled
            style="background:#f3f4f6;cursor:not-allowed">`)
    : `<input type="text" id="new-user-dept" placeholder="e.g. Engineering">`;

  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>${modalTitle}</h3>
        ${noHodWarning}
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="new-user-name" placeholder="Full name">
        </div>
        ${!isManager ? `<div class="form-group">
          <label>Role</label>
          <select id="new-user-role" onchange="toggleUserFields(); onCreateUserRoleChange();">${roles}</select>
        </div>` : `<input type="hidden" id="new-user-role" value="${defaultRole}">`}
        <div class="form-group" id="new-user-email-group" ${defaultRole === 'student' ? 'class="hidden"' : ''}>
          <label>Email</label>
          <input type="email" id="new-user-email" placeholder="user@company.com">
        </div>
        <div class="form-group ${defaultRole !== 'student' ? 'hidden' : ''}" id="new-user-index-group">
          <label>Student ID / Index Number <span style="color:red">*</span></label>
          <input type="text" id="new-user-index" placeholder="e.g. UCC/CS/23/0001" style="text-transform:uppercase" autocomplete="off">
          <p style="font-size:11px;color:var(--text-light);margin-top:4px">Must be unique — each student has their own index number assigned by the institution.</p>
        </div>
        ${defaultRole === 'employee' ? '<p style="font-size:12px;color:var(--text-light);margin-bottom:12px">An Employee ID will be auto-generated.</p>' : ''}
        <div class="form-group">
          <label>Password</label>
          <input type="password" id="new-user-password" placeholder="Min 8 characters">
        </div>
        <div class="form-group" id="new-user-dept-group" style="display:none">
          <label>Department <span id="new-user-dept-req" style="color:red;display:none">*</span></label>
          ${deptField}
          <p id="new-user-dept-hint" style="font-size:12px;color:var(--text-light);margin-top:4px"></p>
        </div>

        <!-- Student classification fields — shown only when role = student -->
        <div id="new-user-student-fields" style="display:none">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="form-group">
              <label>Programme <span style="color:red">*</span></label>
              <select id="new-user-programme" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
                <option value="">— Select —</option>
                <option value="BSc">BSc</option>
                <option value="HND">HND</option>
                <option value="Diploma">Diploma</option>
                <option value="BTech">BTech</option>
                <option value="Top-Up">Top-Up</option>
                <option value="Masters">Masters</option>
                <option value="PhD">PhD</option>
                <option value="Certificate">Certificate</option>
              </select>
            </div>
            <div class="form-group">
              <label>Level <span style="color:red">*</span></label>
              <select id="new-user-level" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
                <option value="">— Select —</option>
                <option value="100">Level 100</option>
                <option value="200">Level 200</option>
                <option value="300">Level 300</option>
                <option value="400">Level 400</option>
                <option value="500">Level 500</option>
                <option value="600">Level 600</option>
              </select>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
            <div class="form-group">
              <label>Group <span style="color:red">*</span></label>
              <input type="text" id="new-user-group" placeholder="e.g. A, B, C"
                style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;text-transform:uppercase"
                oninput="this.value=this.value.toUpperCase()">
            </div>
            <div class="form-group">
              <label>Session Type <span style="color:red">*</span></label>
              <select id="new-user-session-type" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
                <option value="">— Select —</option>
                <option value="Regular">Regular</option>
                <option value="Evening">Evening</option>
                <option value="Weekend">Weekend</option>
              </select>
            </div>
            <div class="form-group">
              <label>Semester <span style="color:red">*</span></label>
              <select id="new-user-semester" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
                <option value="">— Select —</option>
                <option value="1">Semester 1</option>
                <option value="2">Semester 2</option>
              </select>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Phone Number <span style="color:red">*</span></label>
          <input type="tel" id="new-user-phone" placeholder="e.g. 0241234567" required>
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
  const deptGroup  = document.getElementById('new-user-dept-group');
  const deptReq    = document.getElementById('new-user-dept-req');
  const deptHint   = document.getElementById('new-user-dept-hint');
  if (!deptGroup) return;
  const showDept = ['lecturer','hod','student'].includes(role);
  deptGroup.style.display = showDept ? 'block' : 'none';
  if (deptReq)  deptReq.style.display  = ['lecturer','hod','student'].includes(role) ? 'inline' : 'none';
  if (deptHint) {
    if (role === 'hod')           deptHint.textContent = 'Each department can only have one HOD.';
    else if (role === 'lecturer') deptHint.textContent = 'Lecturer will only be visible to the HOD of this department.';
    else if (role === 'student')  deptHint.textContent = 'Student will be visible to the HOD of this department.';
    else                          deptHint.textContent = '';
  }
  // Show/hide student classification fields
  const studentFields = document.getElementById('new-user-student-fields');
  if (studentFields) studentFields.style.display = role === 'student' ? 'block' : 'none';
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
      const idx = document.getElementById('new-user-index').value.trim().toUpperCase();
      if (!idx) { toastWarning('Student ID / Index Number is required.'); return; }
      if (idx.length < 3) { toastWarning('Student ID looks too short. Please enter the full index number.'); return; }
      body.IndexNumber = idx;  // must match backend field name
      // Student classification — all mandatory
      const programme   = document.getElementById('new-user-programme')?.value;
      const studentLevel= document.getElementById('new-user-level')?.value;
      const studentGroup= document.getElementById('new-user-group')?.value?.trim().toUpperCase();
      const sessionType = document.getElementById('new-user-session-type')?.value;
      const semester    = document.getElementById('new-user-semester')?.value;
      if (!programme)    { toastWarning('Please select the student\'s programme (e.g. BSc, HND).'); return; }
      if (!studentLevel) { toastWarning('Please select the student\'s level.'); return; }
      if (!studentGroup) { toastWarning('Please enter the student\'s group (e.g. A, B, C).'); return; }
      if (!sessionType)  { toastWarning('Please select the session type (Morning, Evening etc.).'); return; }
      if (!semester)     { toastWarning('Please select the semester.'); return; }
      body.programme    = programme;
      body.studentLevel = studentLevel;
      body.studentGroup = studentGroup;
      body.sessionType  = sessionType;
      body.semester     = semester;
    } else {
      body.email = document.getElementById('new-user-email').value;
    }
    const phone = document.getElementById('new-user-phone').value.trim();
    if (!phone) { toastWarning('Phone number is required.'); return; }
    body.phone = phone;
    const dept = document.getElementById('new-user-dept')?.value?.trim();
    if (['lecturer','hod','student'].includes(role) && !dept) {
      const label = role === 'hod' ? 'HOD' : role === 'lecturer' ? 'Lecturer' : 'Student';
      toastWarning('Department is required for ' + label + '.');
      return;
    }
    if (dept) body.department = dept;
    await api('/api/users', { method: 'POST', body: JSON.stringify(body) });
    closeModal();
    renderUsers();
  } catch (e) {
    toastError(e.message);
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
    toastSuccess(result.message);
    renderUsers();
  } catch (e) {
    toastError(e.message);
  }
}

async function clearStudentDeviceLock(userId, btnOrName) {
  const userName = (btnOrName && typeof btnOrName === 'object')
    ? (btnOrName.closest('tr')?.querySelector('td')?.textContent?.trim() || 'this user')
    : (btnOrName || 'this user');
  if (!confirm(`Unlock device for ${userName}? They will be able to log in from a new device.`)) return;
  try {
    await api(`/api/users/${userId}/clear-device-lock`, { method: 'POST' });
    showToastNotif(`✅ Device unlocked for ${userName}`);
    renderUsers();
  } catch(e) {
    showToastNotif(`❌ ${e.message || 'Failed to unlock device'}`, 'error');
  }
}


async function adminResetStudentPassword(userId, btnOrName) {
  const userName = (btnOrName && typeof btnOrName === 'object')
    ? (btnOrName.closest('tr')?.querySelector('td')?.textContent?.trim() || 'this user')
    : (btnOrName || 'this user');
  if (!confirm(`Reset password for ${userName}?\n\nThis will generate a temporary password that they must change on next login.`)) return;
  try {
    const data = await api(`/api/users/${userId}/admin-reset-password`, { method: 'POST' });
    // Show styled modal with the temp password
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
    overlay.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:32px;max-width:420px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center">
        <div style="width:56px;height:56px;background:#ede9fe;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px">🔑</div>
        <h3 style="font-size:18px;font-weight:800;margin-bottom:6px">Temporary Password Ready</h3>
        <p style="color:#6b7280;font-size:13px;margin-bottom:20px">Give this password to <strong>${data.userName}</strong>. They will be required to change it on first login.</p>
        <div style="background:#f5f3ff;border:2px dashed #8b5cf6;border-radius:10px;padding:16px;margin-bottom:20px">
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#7c3aed;margin-bottom:8px">Temporary Password</p>
          <p id="temp-pw-display" style="font-size:24px;font-weight:800;font-family:monospace;letter-spacing:3px;color:#4f46e5;margin:0">${data.tempPassword}</p>
        </div>
        <div style="display:flex;gap:10px;justify-content:center">
          <button onclick="navigator.clipboard.writeText('${data.tempPassword}').then(()=>this.textContent='✅ Copied!')" 
            style="padding:10px 20px;background:#6366f1;color:#fff;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px">
            📋 Copy Password
          </button>
          <button onclick="this.closest('[style*=fixed]').remove()" 
            style="padding:10px 20px;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:14px">
            Done
          </button>
        </div>
        <p style="font-size:11px;color:#9ca3af;margin-top:16px">⚠️ This password will not be shown again</p>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  } catch(e) {
    toast('Failed to reset password: ' + e.message, 'err');
  }
}

async function deactivateUser(id) {
  if (!confirm('Deactivate this user?')) return;
  try {
    await api(`/api/users/${id}`, { method: 'DELETE' });
    renderUsers();
  } catch (e) {
    toastError(e.message);
  }
}

async function activateUser(id) {
  if (!confirm('Reactivate this user?')) return;
  try {
    await api(`/api/users/${id}/activate`, { method: 'PATCH' });
    renderUsers();
  } catch (e) {
    toastError(e.message);
  }
}

async function deleteUserPermanently(id, btnOrName) {
  const name = (btnOrName && typeof btnOrName === 'object')
    ? (btnOrName.closest('tr')?.querySelector('td')?.textContent?.trim() || 'this user')
    : (btnOrName || 'this user');
  if (!confirm(`Permanently delete "${name}"? This cannot be undone!`)) return;
  try {
    await api(`/api/users/${id}/permanent`, { method: 'DELETE' });
    renderUsers();
  } catch (e) {
    toastError(e.message);
  }
}

async function renderMeetings() {
  const content = document.getElementById('main-content');
  if (!content) return;
  try {
    const data = await api('/api/zoom');
    // Admin can see/manage meetings but CANNOT create them — only lecturers and managers can create
    const canCreate = ['manager', 'lecturer'].includes(currentUser.role);
    const canManageExisting = ['manager', 'lecturer', 'admin', 'superadmin', 'hod'].includes(currentUser.role);
    const canManage = canManageExisting;

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
                <td><strong>${m.title}</strong>${m.course ? `<div style="font-size:0.85em;color:#7c3aed;font-weight:600;">${esc(m.course.title||'')}${m.course.level?' · L'+m.course.level:''}${m.course.group?' · Grp '+m.course.group:''}</div>` : ''}</td>
                <td>${m.createdBy?.name || 'Unknown'}</td>
                <td style="font-size:0.85em;">${new Date(m.scheduledStart).toLocaleString()}<br><span style="color:#6b7280;">to ${new Date(m.scheduledEnd).toLocaleString()}</span></td>
                <td>${m.duration} min</td>
                <td>${m.attendees?.length || 0}</td>
                <td><span class="status-badge" style="${statusStyle(m.status)}">${m.status.charAt(0).toUpperCase() + m.status.slice(1)}</span></td>
                <td style="white-space:nowrap;">
                  ${m.status === 'active' || m.status === 'scheduled' ? `<button class="btn btn-success btn-sm" onclick="joinMeeting('${m._id}', '${m.joinUrl}')">Join</button>` : ''}
                  ${canControl && m.status === 'scheduled' ? `<button class="btn btn-primary btn-sm" onclick="startMeeting('${m._id}')" style="margin-left:4px;">▶ Start Now</button>` : ''}
                  ${canControl ? `<button class="btn btn-sm" style="margin-left:4px;background:#0ea5e9;color:#fff;font-size:11px" onclick="showInviteLinkForm('${m._id}', \`${m.inviteLink || ''}\`)">🔗 Invite Link</button>` : ''}
                  ${m.inviteLink ? `<a href="${m.inviteLink}" target="_blank" class="btn btn-sm" style="margin-left:4px;background:#f0fdf4;color:#16a34a;border:1px solid #86efac;font-size:11px">▶ Join via Link</a>` : ''}
                  ${canControl && m.status === 'active' ? `<button class="btn btn-danger btn-sm" onclick="endMeeting('${m._id}')" style="margin-left:4px;">End</button>` : ''}
                  ${canControl && (m.status === 'scheduled' || m.status === 'active') ? `<button class="btn btn-secondary btn-sm" onclick="cancelMeeting('${m._id}')" style="margin-left:4px;">Cancel</button>` : ''}
                  <button class="btn btn-secondary btn-sm" onclick="viewMeetingDetail('${m._id}')" style="margin-left:4px;">Details</button>
                  ${canControl && m.status === 'completed' ? `<button class="btn btn-sm" style="margin-left:4px;background:#7c3aed;color:#fff" onclick="viewMeetingAttendance('${m._id}', '${m.title}')">Attendance</button>` : ''}
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

async function showCreateMeetingModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');

  let courses = [];
  try {
    const d = await api('/api/courses');
    courses = d.courses || d || [];
  } catch(e) { courses = []; }

  const courseOptions = `<option value="">— No specific course —</option>` +
    courses.map(c => `<option value="${c._id}">${esc(c.title)}${c.level?' · L'+c.level:''}${c.group?' · Grp '+c.group:''}</option>`).join('');
  // default scheduled start = now+5min, end = now+65min
  const now = new Date();
  const pad = n => String(n).padStart(2,'0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const defStart = fmt(new Date(now.getTime() + 5*60000));
  const defEnd   = fmt(new Date(now.getTime() + 65*60000));

  container.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:460px;">
        <h3 style="margin:0 0 4px;">Schedule a Meeting</h3>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:18px;">Fill in the details below. Start Now skips the schedule and opens immediately.</p>

        <div class="form-group">
          <label>Meeting Title *</label>
          <input type="text" id="meeting-title" placeholder="e.g. Week 5 Lecture" autofocus>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Start Date &amp; Time *</label>
            <input type="datetime-local" id="meeting-start" value="${defStart}">
          </div>
          <div class="form-group">
            <label>End Date &amp; Time *</label>
            <input type="datetime-local" id="meeting-end" value="${defEnd}">
          </div>
        </div>

        <div class="form-group">
          <label>Description <span style="color:var(--text-muted);font-weight:400;">(optional)</span></label>
          <textarea id="meeting-desc" rows="2" placeholder="What is this meeting about?" style="resize:vertical;"></textarea>
        </div>

        <div class="form-group">
          <label>Course <span style="color:var(--text-muted);font-weight:400;font-size:12px">(optional)</span></label>
          <select id="meeting-course" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
            ${courseOptions}
          </select>
        </div>

        <div id="meeting-error" style="color:#ef4444;margin:8px 0;display:none;font-size:13px;"></div>

        <div class="modal-actions" style="gap:8px;margin-top:18px;">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-success" id="start-meeting-btn" onclick="createAndStartMeeting()" style="gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Start Now
          </button>
          <button class="btn btn-primary" onclick="createMeeting()" style="gap:6px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            Schedule
          </button>
        </div>
      </div>
    </div>
  `;
}

async function createMeeting() {
  const title = document.getElementById('meeting-title')?.value.trim();
  const start = document.getElementById('meeting-start')?.value;
  const end   = document.getElementById('meeting-end')?.value;
  const desc  = document.getElementById('meeting-desc')?.value.trim();
  const courseId = document.getElementById('meeting-course')?.value || undefined;
  const errEl = document.getElementById('meeting-error');

  if (!title) { errEl.textContent = 'Please enter a meeting title.'; errEl.style.display = 'block'; return; }
  if (!start || !end) { errEl.textContent = 'Please set a start and end time.'; errEl.style.display = 'block'; return; }
  if (new Date(end) <= new Date(start)) { errEl.textContent = 'End time must be after start time.'; errEl.style.display = 'block'; return; }

  const schedBtn = document.querySelector('.modal .btn-primary');
  if (schedBtn) { schedBtn.textContent = 'Scheduling…'; schedBtn.disabled = true; }

  try {
    await api('/api/zoom', { method: 'POST', body: JSON.stringify({
      title,
      scheduledStart: start,
      scheduledEnd: end,
      description: desc || undefined,
      courseId: courseId || undefined,
    }) });
    closeModal();
    renderMeetings();
    toastSuccess('Meeting scheduled!');
  } catch (e) {
    if (schedBtn) { schedBtn.textContent = 'Schedule'; schedBtn.disabled = false; }
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

async function createAndStartMeeting() {
  const title = document.getElementById('meeting-title').value.trim();
  const errEl = document.getElementById('meeting-error');
  const btn   = document.getElementById('start-meeting-btn');
  if (!title) {
    errEl.textContent = 'Please enter a meeting title.';
    errEl.style.display = 'block';
    return;
  }
  if (btn) { btn.textContent = 'Starting…'; btn.disabled = true; }
  const now = new Date();
  const end = new Date(now.getTime() + 60 * 60 * 1000);
  try {
    const data = await api('/api/zoom', { method: 'POST', body: JSON.stringify({
      title,
      scheduledStart: now.toISOString().slice(0,16),
      scheduledEnd: end.toISOString().slice(0,16),
    }) });
    closeModal();
    await startMeeting(data.meeting._id);
  } catch(e) {
    if (btn) { btn.textContent = '🎥 Start Meeting'; btn.disabled = false; }
    errEl.textContent = e.message;
    errEl.style.display = 'block';
  }
}

async function startMeeting(id) {
  try {
    const data = await api(`/api/zoom/${id}/start`, { method: 'POST' });
    const joinUrl = data.joinUrl;

    // Record host as an attendee
    await api(`/api/zoom/${id}/join`, { method: 'POST' }).catch(() => {});

    // Open Jitsi meeting immediately in new tab
    window.open(joinUrl, '_blank');

    // Show share modal
    const container = document.getElementById('modal-container');
    container.classList.remove('hidden');
    container.innerHTML = `
      <div class="modal-overlay" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()" style="max-width:460px;text-align:center">
          <div style="font-size:48px;margin-bottom:10px">🎥</div>
          <h3 style="margin:0 0 6px">Meeting is Live!</h3>
          <p style="font-size:13px;color:var(--text-light);margin-bottom:20px">
            Your meeting opened in a new tab. Share the link below so others can join.
          </p>
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:10px;padding:14px;margin-bottom:20px;text-align:left">
            <div style="font-size:11px;font-weight:700;color:#15803d;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">🔗 Invite Link</div>
            <div style="font-size:13px;word-break:break-all;color:#1d4ed8;font-weight:600;margin-bottom:10px">${joinUrl}</div>
            <button class="btn btn-primary" style="width:100%;font-size:14px;padding:10px;" onclick="
              navigator.clipboard.writeText('${joinUrl}').then(() => {
                this.textContent = '✅ Link Copied!';
                this.style.background = '#16a34a';
                setTimeout(() => { this.textContent = '📋 Copy Link'; this.style.background = ''; }, 3000);
              }).catch(() => { prompt('Copy this link:', '${joinUrl}'); })
            ">📋 Copy Link</button>
          </div>
          <div style="display:flex;gap:8px;justify-content:center;">
            <button class="btn btn-success" onclick="window.open('${joinUrl}', '_blank')">🎥 Rejoin</button>
            <button class="btn btn-secondary" onclick="closeModal();renderMeetings()">Done</button>
          </div>
        </div>
      </div>
    `;

    renderMeetings();
  } catch (e) {
    toastError(e.message);
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
    toastError(e.message || 'Failed to join meeting');
  });
}

async function endMeeting(id) {
  if (!confirm('End this meeting? All participants will be marked as left.')) return;
  try {
    await api(`/api/zoom/${id}/end`, { method: 'POST' });
    renderMeetings();
  } catch (e) {
    toastError(e.message);
  }
}

async function cancelMeeting(id) {
  if (!confirm('Cancel this meeting?')) return;
  try {
    await api(`/api/zoom/${id}/cancel`, { method: 'POST' });
    renderMeetings();
  } catch (e) {
    toastError(e.message);
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
          ${m.inviteLink ? `<p><strong>Invite Link:</strong> <a href="${m.inviteLink}" target="_blank" style="color:#16a34a;word-break:break-all;font-weight:600">▶ ${m.inviteLink}</a></p>` : ''}
          ${canManage ? `<button class="btn btn-sm" style="background:#0ea5e9;color:#fff;margin-top:4px" onclick="showInviteLinkForm('${m._id}', \`${m.inviteLink || ''}\`)">🔗 ${m.inviteLink ? 'Update' : 'Add'} Invite Link</button>` : ''}
          <div style="margin-top:12px;">
            ${m.status === 'active' || m.status === 'scheduled' ? `<button class="btn btn-success btn-sm" onclick="joinMeeting('${m._id}', '${m.joinUrl}')">Join Meeting</button>` : ''}
            ${canManage && m.status === 'active' ? `<button class="btn btn-danger btn-sm" style="margin-left:4px;" onclick="endMeeting('${m._id}')">End Meeting</button>` : ''}
          </div>
        </div>
        <div class="card">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div class="card-title" style="margin:0">Attendees (${m.attendees?.length || 0})</div>
            ${m.status === 'completed' && canManage ? `
              <div style="display:flex;gap:8px">
                <button class="btn btn-sm" style="background:#22c55e;color:#fff" onclick="viewMeetingAttendance('${m._id}', '${m.title.replace(/'/g,"\\'")}')">📋 Full Report</button>
                <button class="btn btn-sm" style="background:#7c3aed;color:#fff" onclick="printMeetingAttendance('${m._id}', '${m.title.replace(/'/g,"\\'")}')">🖨 PDF</button>
              </div>` : ''}
          </div>
          ${m.attendees && m.attendees.length ? `
            <table>
              <thead><tr><th>Name</th><th>Index No.</th><th>Role</th><th>Joined At</th><th>Status</th></tr></thead>
              <tbody>${m.attendees.map(a => `
                <tr>
                  <td>${a.user?.name || 'Unknown'}</td>
                  <td>${a.user?.IndexNumber || a.user?.indexNumber || '—'}</td>
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

function showInviteLinkForm(meetingId, currentLink) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:480px">
        <h3 style="margin:0 0 6px">Meeting Invite Link</h3>
        <p style="font-size:13px;color:var(--text-light);margin-bottom:16px">
          Paste an external meeting link (Google Meet, Zoom, Teams, etc). 
          Students/employees will see a tap-to-join button in their Meetings page.
        </p>
        <div class="form-group">
          <label>Invite Link</label>
          <input type="url" id="invite-link-input" placeholder="https://meet.google.com/abc-defg-hij"
            value="${currentLink}" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:8px;font-size:14px">
        </div>
        <div id="invite-link-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          ${currentLink ? `<button class="btn btn-danger btn-sm" onclick="saveInviteLink('${meetingId}', '')">Remove</button>` : ''}
          <button class="btn btn-primary" onclick="saveInviteLink('${meetingId}', document.getElementById('invite-link-input').value)">Save Link</button>
        </div>
      </div>
    </div>
  `;
  setTimeout(() => document.getElementById('invite-link-input')?.focus(), 100);
}

async function saveInviteLink(meetingId, link) {
  const errEl = document.getElementById('invite-link-error');
  try {
    await api('/api/zoom/' + meetingId + '/invite-link', {
      method: 'PATCH',
      body: JSON.stringify({ inviteLink: link.trim() })
    });
    closeModal();
    renderMeetings();
  } catch(e) {
    if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
    else toastError(e.message);
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
          <thead><tr><th>Code</th><th>Title</th><th>Level / Group</th><th>Lecturer</th><th>Status</th><th>Roster</th><th>Enrolled</th>${canManageRoster && !isOffline ? '<th>Actions</th>' : currentUser.role === 'student' ? '<th></th>' : ''}</tr></thead>
          <tbody>${courses.map(course => `
            <tr>
              <td><strong>${course.code}</strong></td>
              <td>${course.title}</td>
              <td>
                ${course.level ? `<span style="font-size:11px;padding:2px 7px;border-radius:20px;background:#ede9fe;color:#7c3aed;font-weight:700;margin-right:4px">L${course.level}</span>` : ''}
                ${course.group ? `<span style="font-size:11px;padding:2px 7px;border-radius:20px;background:#ecfdf5;color:#059669;font-weight:600">${esc(course.group)}</span>` : ''}
                ${!course.level && !course.group ? '<span style="color:var(--text-muted);font-size:12px">—</span>' : ''}
              </td>
              <td>${course.lecturerId?.name || 'N/A'}</td>
              <td>${course.needsApproval
                ? (course.approvalStatus === 'pending'
                    ? '<span style="background:#fef3c7;color:#b45309;border:1px solid #fde68a;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap;">⏳ Pending</span>'
                  : course.approvalStatus === 'rejected'
                    ? '<span style="background:#fee2e2;color:#b91c1c;border:1px solid #fca5a5;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap;">✕ Rejected</span>'
                    : '<span style="background:#dcfce7;color:#166534;border:1px solid #bbf7d0;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap;">✓ Approved</span>')
                : '<span style="color:var(--text-muted);font-size:11px;">—</span>'}</td>
              <td>${!isOffline ? `<button class="btn btn-sm" style="font-size:11px;background:var(--bg);border:1px solid var(--border)" onclick="viewRoster('${course._id}', '${course.code}')">View Roster</button>` : '—'}</td>
              <td>${course.enrolledStudents?.length || 0}</td>
              ${canManageRoster && !isOffline ? `<td style="white-space:nowrap">${
                (course.needsApproval && course.approvalStatus !== 'approved')
                  ? `<span style="font-size:11px;color:var(--text-muted);font-style:italic">${course.approvalStatus === 'pending' ? 'Awaiting approval' : 'Rejected — contact HOD'}</span>`
                  : `<button class="btn btn-primary btn-sm" style="font-size:11px" onclick="showUploadRosterModal('${course._id}', '${course.code}')">Upload Students</button>`
              } <button class="btn btn-sm" style="font-size:11px;background:#6366f1;color:#fff" onclick="openBulkEmailModal('${course._id}', '${course.title}')">✉️ Email</button> <button class="btn btn-sm" style="font-size:11px;background:#10b981;color:#fff" onclick="openBulkSmsModal('${course._id}', '${course.title}')">💬 SMS</button></td>` : currentUser.role === 'student' ? `<td><button class="btn btn-sm" style="font-size:11px;background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0" onclick="generateCertificate('${course._id}','${course.title}')">🎓 Certificate</button></td>` : ''}
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
          <label>Course Code <span style="color:red">*</span></label>
          <input type="text" id="course-code" placeholder="e.g., CS101" style="text-transform:uppercase">
        </div>
        <div class="form-group">
          <label>Course Title <span style="color:red">*</span></label>
          <input type="text" id="course-title" placeholder="Introduction to Computer Science">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label>Level <span style="color:red">*</span></label>
            <select id="course-level" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
              <option value="">— Select Level —</option>
              <option value="100">Level 100</option>
              <option value="200">Level 200</option>
              <option value="300">Level 300</option>
              <option value="400">Level 400</option>
              <option value="500">Level 500 (Postgrad)</option>
              <option value="600">Level 600 (Postgrad)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Group <span style="color:red">*</span></label>
            <input type="text" id="course-group" placeholder="e.g. A, B, C"
              style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;text-transform:uppercase"
              oninput="this.value=this.value.toUpperCase()">
            <p style="font-size:11px;color:var(--text-muted);margin-top:3px">Use letters: A, B, C etc.</p>
          </div>
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
    const code  = document.getElementById('course-code').value.trim().toUpperCase();
    const title = document.getElementById('course-title').value.trim();
    const desc  = document.getElementById('course-desc').value.trim();
    const level = document.getElementById('course-level').value.trim();
    const group = document.getElementById('course-group').value.trim();

    if (!code || !title) { toastWarning('Course code and title are required.'); return; }
    if (!level) { toastWarning('Please select a level.'); return; }
    if (!group) { toastWarning('Please enter a group (e.g. A, B, C).'); return; }

    await api('/api/courses/create', {
      method: 'POST',
      body: JSON.stringify({
        code,
        title,
        description: desc,
        level:  level || undefined,
        group:  group || undefined,
      }),
    });
    toastSuccess(currentUser.role === 'lecturer'
      ? 'Course submitted for HOD approval. It will be active once approved.'
      : 'Course created successfully!');
    closeModal();
    renderCourses();
  } catch (e) {
    toastError(e.message || 'Failed to create course');
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
          <button class="btn btn-secondary btn-sm" onclick="openExcelImportModal('${courseId}','${(courseCode||courseName||courseTitle||'Course')}')">📊 Import Excel</button>
        </div>
      </div>
    </div>
  `;
}

async function uploadRoster(courseId) {
  const text = document.getElementById('roster-text').value.trim();
  if (!text) { toastWarning('Please enter at least one student'); return; };

  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const students = lines.map(line => {
    const parts = line.split(',').map(p => p.trim());
    return { studentId: parts[0], name: parts[1] || '' };
  });

  const invalid = students.filter(s => !s.studentId);
  if (invalid.length > 0) { toastWarning('Some lines are missing a Student ID'); return; };

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
    toastError(e.message);
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
        <thead><tr><th>Student ID</th><th>Name</th><th>Programme</th><th>Level / Grp</th><th>Session</th><th>Status</th>${canDelete ? '<th></th>' : ''}</tr></thead>
        <tbody>${data.roster.map(r => `
          <tr>
            <td style="font-family:monospace;font-weight:600">${r.studentId}</td>
            <td>${r.name || '-'}</td>
            <td>${r.user?.programme ? `<span style="background:#ede9fe;color:#7c3aed;padding:1px 6px;border-radius:20px;font-size:11px;font-weight:700">${esc(r.user.programme)}</span>` : '—'}</td>
            <td style="white-space:nowrap">
              ${r.user?.studentLevel ? `<span style="background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:20px;font-size:11px;font-weight:700">L${esc(r.user.studentLevel)}</span>` : ''}
              ${r.user?.studentGroup ? `<span style="background:#ecfdf5;color:#059669;padding:1px 6px;border-radius:20px;font-size:11px;font-weight:700">Grp ${esc(r.user.studentGroup)}</span>` : ''}
              ${!r.user?.studentLevel && !r.user?.studentGroup ? '—' : ''}
            </td>
            <td>${r.user?.sessionType ? `<span style="background:#fff7ed;color:#c2410c;padding:1px 6px;border-radius:20px;font-size:11px;font-weight:600">${esc(r.user.sessionType)}</span>` : '—'}</td>
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
  toastConfirm('Remove this student from the roster?', async () => {
    try {
      await api(`/api/roster/${courseId}/entries/${rosterId}`, { method: 'DELETE' });
      viewRoster(courseId, courseCode);
    } catch (e) {
      toastError(e.message);
    }
  });
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
  if (!isOnline()) {
    const cached = offlineRead('quizzes_lecturer');
    if (cached) {
      content.innerHTML = '<div style="background:#fef3c7;color:#92400e;padding:10px 16px;border-radius:8px;font-size:13px;margin-bottom:16px">📡 Offline — showing cached quizzes</div>' + (content.innerHTML || '');
      _renderLecturerQuizzesHTML(content, cached);
    } else {
      content.innerHTML = '<div class="card" style="text-align:center;padding:32px"><div style="font-size:36px">📡</div><p style="margin-top:8px;color:var(--text-light)">No cached data. Connect once to view quizzes offline.</p></div>';
    }
    return;
  }
  try {
    const data = await api('/api/lecturer/quizzes');
    offlineCache('quizzes_lecturer', data);
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
            ${courses.map(c => `<option value="${c._id}">${esc(c.title)}${c.level?' · L'+c.level:''}${c.group?' · Grp '+c.group:''}</option>`).join('')}
          </select></div>
          <div class="form-group"><label>Time Limit (minutes)</label><input type="number" id="cq-timelimit" value="30" min="1" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div class="form-group"><label>Start Time *</label><input type="datetime-local" id="cq-start" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div class="form-group"><label>End Time *</label><input type="datetime-local" id="cq-end" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;"></div>
          <div class="form-group">
            <label>Max Attempts <span style="font-weight:400;color:#9ca3af;font-size:11px;">(0 = unlimited)</span></label>
            <input type="number" id="cq-max-attempts" value="1" min="0" max="10" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
          </div>
          <div class="form-group">
            <label>Score to Record</label>
            <select id="cq-score-policy" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
              <option value="best">Best Score</option>
              <option value="last">Last Attempt Score</option>
            </select>
          </div>
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
  const maxAttempts = parseInt(document.getElementById('cq-max-attempts')?.value ?? '1');
  const scorePolicy = document.getElementById('cq-score-policy')?.value || 'best';
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
      body: JSON.stringify({ title, description, courseId, timeLimit, startTime: new Date(startTime).toISOString(), endTime: new Date(endTime).toISOString(), maxAttempts: isNaN(maxAttempts) ? 1 : maxAttempts, scorePolicy })
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
        <button class="btn btn-sm btn-secondary" onclick="openImportFromBankModal('${quizId}')">📚 Import from Bank</button>
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
            <label id="aq-lbl-fill" style="display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;border:2px solid #e5e7eb;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;">
              <input type="radio" name="aq-type" value="fill" onchange="aqToggleType('fill')" style="accent-color:var(--primary)"> Fill In
            </label>
          </div>
          <p id="aq-type-hint" style="font-size:12px;color:#9ca3af;margin-top:5px;">One correct answer — student picks one option.</p>
        </div>

        <div class="form-group">
          <label>Question Text *</label>
          ${getMathToolbar('aq-text')}
          <textarea id="aq-text" rows="3" placeholder="Enter your question here…" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;" oninput="updateMathPreview('aq-text','aq-math-preview')"></textarea>
          <div id="aq-math-preview" style="display:none;margin-top:6px;padding:8px 12px;background:#f5f3ff;border:1px solid #e0e7ff;border-radius:6px;font-size:13px;color:#374151;min-height:32px"></div>
        </div>

        <div id="aq-options-section">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
          ${['A','B','C','D'].map((l,i) => `
          <div class="form-group">
            <label>Option ${l}${i<2?' *':''}</label>
            <input type="text" id="aq-opt-${i}" placeholder="Option ${l}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;">
          </div>`).join('')}
        </div>
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

        <!-- Fill-in: text answer -->
        <div id="aq-fill-wrap" style="display:none;margin-bottom:12px;">
          <div class="form-group">
            <label>Correct Answer * <span style="font-weight:400;color:#9ca3af;font-size:12px;">(case-insensitive)</span></label>
            <input type="text" id="aq-fill-answer" placeholder="e.g. Photosynthesis" style="width:100%;padding:9px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:13px;">
          </div>
          <div class="form-group">
            <label>Also Accept <span style="font-weight:400;color:#9ca3af;font-size:12px;">(one per line, optional)</span></label>
            <textarea id="aq-fill-alts" rows="2" placeholder="photo synthesis&#10;photosynthesis process" style="width:100%;padding:8px 12px;border:1.5px solid #d1d5db;border-radius:8px;font-size:12px;font-family:inherit;resize:vertical;"></textarea>
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
            const isFillQ = q.questionType === 'fill';
            const typeLabel = q.questionType === 'multiple'
              ? '<span style="font-size:10px;padding:2px 7px;border-radius:20px;font-weight:600;background:#ede9fe;color:#7c3aed;margin-left:6px;">MULTI</span>'
              : isFillQ
                ? '<span style="font-size:10px;padding:2px 7px;border-radius:20px;font-weight:600;background:#fef3c7;color:#92400e;margin-left:6px;">FILL IN</span>'
                : '<span style="font-size:10px;padding:2px 7px;border-radius:20px;font-weight:600;background:#f0f9ff;color:#0369a1;margin-left:6px;">SINGLE</span>';
            return `<div style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="flex:1;">
                  <div class="math-content" style="margin-bottom:6px;"><strong>Q${i+1}.</strong>${typeLabel} ${q.questionText}</div>
                  ${isFillQ
                    ? `<div style="font-size:13px;color:#166534;background:#f0fdf4;border:1px solid #bbf7d0;padding:4px 10px;border-radius:6px;display:inline-block;">✓ ${q.correctAnswerText}${q.acceptedAnswers?.length ? ` <span style="color:#6b7280;font-weight:400;">(also: ${q.acceptedAnswers.join(', ')})</span>` : ''}</div>`
                    : `<div style="display:flex;flex-wrap:wrap;gap:5px;font-size:13px;">${q.options.map((o,oi)=>`<span style="padding:3px 9px;border-radius:6px;${correctSet.has(oi)?'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;font-weight:700;':'background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb;'}">${String.fromCharCode(65+oi)}) ${o}${correctSet.has(oi)?' ✓':''}</span>`).join('')}</div>`}
                  <div style="font-size:12px;color:#9ca3af;margin-top:5px;">Marks: ${q.marks}</div>
                </div>
                <div style="display:flex;gap:5px;flex-shrink:0;">
                  <button class="btn btn-sm btn-secondary" title="Save to Question Bank" onclick="saveQuestionToBank('${quizId}','${q._id}')">💾 Save</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteQuizQuestion('${quizId}','${q._id}')">Delete</button>
                </div>
              </div>
            </div>`;
          }).join('') : '<p style="color:#9ca3af;">No questions added yet.</p>'}
        </div>
      </div>
    `;
    setTimeout(() => renderMath(content), 150);
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

function aqToggleType(type) {
  const isMulti = type === 'multiple';
  const isFill  = type === 'fill';
  document.getElementById('aq-single-wrap').style.display = (!isMulti && !isFill) ? 'block' : 'none';
  document.getElementById('aq-multi-wrap').style.display  = isMulti ? 'block' : 'none';
  document.getElementById('aq-fill-wrap').style.display   = isFill  ? 'block' : 'none';
  // Options section — hide for fill-in
  const optsEl = document.getElementById('aq-options-section');
  if (optsEl) optsEl.style.display = isFill ? 'none' : 'block';
  document.getElementById('aq-type-hint').textContent = isMulti
    ? 'Multiple correct answers — student must select all correct options.'
    : isFill
      ? 'Fill in the blank — student types their answer.'
      : 'One correct answer — student picks one option.';
  const primStyle = 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;border:2px solid var(--primary);border-radius:8px;background:var(--primary);color:#fff;font-size:13px;font-weight:600;';
  const secStyle  = 'display:flex;align-items:center;gap:6px;cursor:pointer;padding:8px 16px;border:2px solid #e5e7eb;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;';
  document.getElementById('aq-lbl-single').style.cssText = (!isMulti && !isFill) ? primStyle : secStyle;
  document.getElementById('aq-lbl-multi').style.cssText  = isMulti ? primStyle : secStyle;
  document.getElementById('aq-lbl-fill').style.cssText   = isFill  ? primStyle : secStyle;
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
  const marks   = parseInt(document.getElementById('aq-marks').value) || 1;
  const errEl   = document.getElementById('aq-error');
  const qType   = document.querySelector('input[name="aq-type"]:checked')?.value || 'single';
  const isMulti = qType === 'multiple';
  const isFill  = qType === 'fill';

  errEl.style.display = 'none';
  if (!questionText) { errEl.textContent = 'Question text is required.'; errEl.style.display = 'block'; return; }

  let body;
  if (isFill) {
    const correctAnswerText = document.getElementById('aq-fill-answer').value.trim();
    if (!correctAnswerText) { errEl.textContent = 'Please enter the correct answer.'; errEl.style.display = 'block'; return; }
    const altsRaw = document.getElementById('aq-fill-alts').value.trim();
    const acceptedAnswers = altsRaw ? altsRaw.split('\n').map(s => s.trim()).filter(Boolean) : [];
    body = { questionText, questionType: 'fill', correctAnswerText, acceptedAnswers, marks };
  } else {
    const options = [0,1,2,3].map(i => document.getElementById(`aq-opt-${i}`).value.trim()).filter(o => o);
    if (options.length < 2) { errEl.textContent = 'At least 2 options are required.'; errEl.style.display = 'block'; return; }
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
    toastError(e.message);
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
          <div><strong>Max Attempts:</strong> ${q.maxAttempts === 0 ? 'Unlimited' : (q.maxAttempts || 1)}</div>
          <div><strong>Score Policy:</strong> ${q.scorePolicy === 'last' ? 'Last attempt' : 'Best score'}</div>
          <div><strong>Start:</strong> ${new Date(q.startTime).toLocaleString()}</div>
          <div><strong>End:</strong> ${new Date(q.endTime).toLocaleString()}</div>
          <div><strong>Status:</strong> ${quizStatusBadge(q)}</div>
        </div>
      </div>
      <div class="card">
        <h3>Questions (${questions.length})</h3>
        ${questions.length ? questions.map((qn, i) => `
          <div style="padding:10px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;">
            <strong>Q${i + 1}.</strong> <span class="math-content">${qn.questionText}</span> <span style="color:#9ca3af;">(${qn.marks} marks)</span>
            <div style="margin-top:4px;font-size:0.9em;">
              ${qn.options.map((o, oi) => `<span class="math-content" style="margin-right:10px;${oi === qn.correctAnswer ? 'color:#22c55e;font-weight:bold;' : ''}">${String.fromCharCode(65 + oi)}) ${o}</span>`).join('')}
            </div>
          </div>
        `).join('') : '<p style="color:#9ca3af;">No questions.</p>'}
      </div>
    `;
    setTimeout(() => renderMath(content), 150);
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
    const qd = data.questionDifficulty || [];

    const pctColor = (p) => p >= 70 ? '#22c55e' : p >= 50 ? '#f59e0b' : '#ef4444';
    const diffLabel = (r) => r === null ? 'N/A' : r >= 70 ? '😊 Easy' : r >= 40 ? '😐 Medium' : '😰 Hard';
    const diffColor = (r) => r === null ? '#9ca3af' : r >= 70 ? '#22c55e' : r >= 40 ? '#f59e0b' : '#ef4444';

    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
        <div>
          <h2>📊 Results: ${quiz.title}</h2>
          <p>${quiz.course?.code || ''} — ${quiz.course?.title || ''} &nbsp;|&nbsp; ${quiz.totalMarks || 0} marks total</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="viewLecturerQuizDetail('${quizId}')">← Back to Quiz</button>
          <button class="btn btn-sm" style="background:#059669;color:#fff;" onclick="exportQuizResultsCSV('${quizId}')">⬇ Export CSV</button>
        </div>
      </div>

      <!-- Stats row -->
      <div class="stats-grid" style="margin-bottom:16px;">
        <div class="stat-card">
          <div class="stat-value">${stats.submitted}</div>
          <div class="stat-label">Submitted</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:#6b7280;">${stats.notSubmitted}</div>
          <div class="stat-label">Not Submitted</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${stats.averageScore}/${quiz.totalMarks||0}</div>
          <div class="stat-label">Average Score</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:${pctColor(stats.passRate)};">${stats.passRate}%</div>
          <div class="stat-label">Pass Rate (≥50%)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:#22c55e;">${stats.highestScore}</div>
          <div class="stat-label">Highest</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color:#ef4444;">${stats.lowestScore}</div>
          <div class="stat-label">Lowest</div>
        </div>
      </div>

      <!-- Score distribution bar -->
      ${attempts.length ? (() => {
        const buckets = [0,0,0,0,0]; // 0-19, 20-39, 40-59, 60-79, 80-100
        attempts.forEach(a => {
          const p = a.percentage;
          const i = p >= 80 ? 4 : p >= 60 ? 3 : p >= 40 ? 2 : p >= 20 ? 1 : 0;
          buckets[i]++;
        });
        const max = Math.max(...buckets, 1);
        const labels = ['0–19%','20–39%','40–59%','60–79%','80–100%'];
        const colors = ['#ef4444','#f97316','#f59e0b','#84cc16','#22c55e'];
        return `<div class="card" style="margin-bottom:16px;">
          <div class="card-title">Score Distribution</div>
          <div style="display:flex;align-items:flex-end;gap:8px;height:90px;padding:0 4px;">
            ${buckets.map((n,i) => `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
                <span style="font-size:11px;font-weight:700;color:${n>0?colors[i]:'#9ca3af'};">${n}</span>
                <div style="width:100%;background:${colors[i]};border-radius:4px 4px 0 0;height:${Math.max(4, Math.round((n/max)*70))}px;opacity:${n>0?'1':'0.15'};transition:height .3s;"></div>
                <span style="font-size:10px;color:#9ca3af;">${labels[i]}</span>
              </div>`).join('')}
          </div>
        </div>`;
      })() : ''}

      <!-- Student submissions table -->
      <div class="card" style="margin-bottom:16px;">
        <div class="card-title" style="justify-content:space-between;">
          <span>Student Submissions (${attempts.length})</span>
          ${attempts.length ? `<input type="text" id="results-search" placeholder="Search student…"
            oninput="filterResultsTable(this.value)"
            style="padding:5px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:12px;width:180px;">` : ''}
        </div>
        ${attempts.length ? `
          <div class="table-scroll">
          <table id="results-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Student</th>
                <th>Index / ID</th>
                <th>Score</th>
                <th>%</th>
                <th>Status</th>
                <th>Submitted</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${attempts.map((a, i) => `
                <tr data-name="${(a.student?.name||'').toLowerCase()}" data-id="${(a.student?.indexNumber||a.student?.email||'').toLowerCase()}">
                  <td style="color:#9ca3af;">${i+1}</td>
                  <td style="font-weight:500;">${a.student?.name || 'Unknown'}</td>
                  <td style="font-family:monospace;font-size:12px;">${a.student?.IndexNumber || a.student?.indexNumber || a.student?.email || '—'}</td>
                  <td><strong>${a.score}/${a.maxScore}</strong></td>
                  <td><span style="font-weight:700;color:${pctColor(a.percentage)};">${a.percentage}%</span></td>
                  <td><span class="status-badge ${a.percentage >= 50 ? 'status-present' : 'status-absent'}">${a.percentage >= 50 ? 'Pass' : 'Fail'}</span></td>
                  <td style="font-size:12px;color:#9ca3af;">${a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '—'}</td>
                  <td><button class="btn btn-sm btn-secondary" onclick="viewStudentQuizAnswers('${quizId}','${a._id}','${a.student?.name||'Student'}')">View</button></td>
                </tr>`).join('')}
            </tbody>
          </table>
          </div>
        ` : '<div class="empty-state"><p>No submissions yet.</p></div>'}
      </div>

      <!-- Question difficulty analysis -->
      ${qd.length ? `
      <div class="card">
        <div class="card-title">Question Analysis</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${qd.map((q,i) => `
            <div style="padding:10px 12px;border:1px solid #e5e7eb;border-radius:8px;">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;">
                <div style="flex:1;min-width:200px;">
                  <span style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;">Q${i+1} · ${q.marks} mark${q.marks>1?'s':''}</span>
                  <div class="math-content" style="font-size:13px;margin-top:2px;">${q.questionText}</div>
                </div>
                <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
                  <span style="font-size:12px;color:#64748b;">${q.correct}/${q.total} correct</span>
                  <span style="font-size:12px;font-weight:700;color:${diffColor(q.successRate)};">${diffLabel(q.successRate)}</span>
                  ${q.successRate !== null ? `<div style="width:80px;height:6px;background:#f1f5f9;border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${q.successRate}%;background:${diffColor(q.successRate)};border-radius:3px;"></div>
                  </div>` : ''}
                </div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}
    `;

    // Store data for CSV export and search
    window._quizResultsData = { quiz, stats, attempts, quizId };
    setTimeout(() => renderMath(content), 150);
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

function filterResultsTable(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('#results-table tbody tr').forEach(row => {
    const name = row.dataset.name || '';
    const id   = row.dataset.id   || '';
    row.style.display = (!q || name.includes(q) || id.includes(q)) ? '' : 'none';
  });
}

async function viewStudentQuizAnswers(quizId, attemptId, studentName) {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="card"><p>Loading…</p></div>';
  try {
    const data = await api(`/api/lecturer/quizzes/${quizId}/results/${attemptId}`);
    const attempt = data.attempt;
    const answers = data.answers || [];
    const pct = attempt.percentage;

    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
        <div>
          <h2>${studentName}'s Answers</h2>
          <p>Score: <strong style="color:${pct>=50?'#22c55e':'#ef4444'};">${attempt.score}/${attempt.maxScore} (${pct}%)</strong>
          &nbsp;·&nbsp; ${attempt.submittedAt ? new Date(attempt.submittedAt).toLocaleString() : ''}</p>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="viewQuizResults('${quizId}')">← Back to Results</button>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${answers.map((a, i) => {
          const q = a.question;
          if (!q) return '';
          const isFill = q.questionType === 'fill';
          return `
            <div class="card" style="border-left:4px solid ${a.isCorrect ? '#22c55e' : '#ef4444'};">
              <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                <div>
                  <span style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;">Q${i+1} · ${q.marks} mark${q.marks>1?'s':''}</span>
                  <div class="math-content" style="font-size:14px;font-weight:500;margin-top:2px;">${q.questionText}</div>
                </div>
                <span class="status-badge ${a.isCorrect ? 'status-present' : 'status-absent'}" style="flex-shrink:0;">${a.isCorrect ? '✓ Correct' : '✗ Wrong'}</span>
              </div>
              ${isFill
                ? `<div style="display:flex;flex-direction:column;gap:6px;font-size:13px;">
                    <div style="padding:7px 12px;border-radius:6px;border:1px solid ${a.isCorrect?'#22c55e':'#ef4444'};background:${a.isCorrect?'#f0fdf4':'#fef2f2'};color:${a.isCorrect?'#15803d':'#dc2626'};">
                      ${a.isCorrect?'✓':'✗'} Student wrote: <strong>${a.selectedAnswerText || '(no answer)'}</strong>
                    </div>
                    ${!a.isCorrect ? `<div style="padding:7px 12px;border-radius:6px;border:1px solid #22c55e;background:#f0fdf4;color:#15803d;">✓ Correct: <strong>${q.correctAnswerText||''}</strong></div>` : ''}
                  </div>`
                : `<div style="display:flex;flex-direction:column;gap:5px;font-size:13px;">
                    ${(q.options||[]).map((opt,oi) => {
                      const isSelected = oi === a.selectedAnswer;
                      const isCorrect = oi === q.correctAnswer;
                      let bg = '#f9fafb', border = '#e5e7eb', color = '#374151';
                      if (isCorrect)  { bg = '#f0fdf4'; border = '#22c55e'; color = '#15803d'; }
                      if (isSelected && !a.isCorrect) { bg = '#fef2f2'; border = '#ef4444'; color = '#dc2626'; }
                      return `<div style="padding:7px 12px;border-radius:6px;border:1px solid ${border};background:${bg};color:${color};">
                        <strong>${String.fromCharCode(65+oi)}.</strong> ${opt}
                        ${isSelected && a.isCorrect ? ' ✓ Correct answer' : ''}
                        ${isSelected && !a.isCorrect ? ' ✗ Student chose this' : ''}
                        ${!isSelected && isCorrect ? ' ← Correct answer' : ''}
                      </div>`;
                    }).join('')}
                  </div>`}
            </div>`;
        }).join('')}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error: ${e.message}</p></div>`;
  }
}

function exportQuizResultsCSV(quizId) {
  const d = window._quizResultsData;
  if (!d || d.quizId !== quizId) { toastWarning('Load the results first.'); return; }
  const rows = [['#','Name','Index/ID','Score','Max Score','Percentage','Status','Submitted At']];
  d.attempts.forEach((a,i) => {
    rows.push([
      i+1,
      a.student?.name || 'Unknown',
      a.student?.indexNumber || a.student?.email || '',
      a.score,
      a.maxScore,
      a.percentage + '%',
      a.percentage >= 50 ? 'Pass' : 'Fail',
      a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '',
    ]);
  });
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${d.quiz.title.replace(/[^a-zA-Z0-9]/g,'_')}_results.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toastSuccess('CSV downloaded!');
}

async function deleteLecturerQuiz(quizId) {
  toastConfirm('Delete this quiz? All questions and submissions will be removed.', async () => {
    try {
      await api(`/api/lecturer/quizzes/${quizId}`, { method: 'DELETE' });
      renderQuizzes();
      toastSuccess('Quiz deleted.');
    } catch (e) {
      toastError(e.message);
    }
  });
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
                <td>
                  ${q.isSubmitted
                    ? `<strong style="color:#3b82f6;">${q.myScore}/${q.myMaxScore}</strong>${q.scorePolicy==='best'&&q.attemptCount>1?' <span style="font-size:10px;color:#9ca3af;">(best)</span>':''}`
                    : '—'}
                  ${q.maxAttempts !== 1 && q.isSubmitted
                    ? `<br><span style="font-size:10px;color:#9ca3af;">${q.maxAttempts===0?'Unlimited retakes':q.attemptsLeft===0?'No retakes left':(q.attemptsLeft+' retake'+(q.attemptsLeft!==1?'s':'')+' left')}</span>`
                    : ''}
                </td>
                <td style="white-space:nowrap;">
                  ${q.canContinue ? `<button class="btn btn-sm btn-primary" onclick="startStudentQuiz('${q._id}')">Continue</button>` : ''}
                  ${q.canAttempt && !q.canContinue ? `<button class="btn btn-sm btn-primary" onclick="startStudentQuiz('${q._id}')">${q.attemptCount>0?'Retake':'Take Quiz'}</button>` : ''}
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
            <p class="math-content" style="margin:8px 0;">${q.questionText}</p>
            ${q.questionType === 'fill'
              ? `<div style="margin-top:6px;">
                  <input type="text" id="sq-fill-${q._id}" placeholder="Type your answer here…"
                    style="width:100%;padding:11px 14px;border:1.5px solid #d1d5db;border-radius:8px;font-size:14px;font-family:inherit;outline:none;transition:border-color .15s;"
                    onfocus="this.style.borderColor='#6366f1'" onblur="this.style.borderColor='#d1d5db'">
                  <p style="font-size:11px;color:#9ca3af;margin-top:5px;">Spelling counts — answer is not case-sensitive.</p>
                </div>`
              : `<div style="display:flex;flex-direction:column;gap:8px;">
              ${q.options.map((opt, oi) => `
                <label style="display:flex;align-items:center;gap:8px;padding:10px;border:1px solid #e5e7eb;border-radius:8px;cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background=''">
                  <input type="radio" name="sq-${q._id}" value="${oi}" style="accent-color:#3b82f6;">
                  <span><strong>${String.fromCharCode(65 + oi)}.</strong> ${opt}</span>
                </label>
              `).join('')}
            </div>`}
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
    if (q.questionType === 'fill') {
      const input = document.getElementById(`sq-fill-${q._id}`);
      return { questionId: q._id, selectedAnswer: null, selectedAnswerText: input ? input.value.trim() : '' };
    }
    const selected = document.querySelector(`input[name="sq-${q._id}"]:checked`);
    return { questionId: q._id, selectedAnswer: selected ? parseInt(selected.value) : -1, selectedAnswerText: null };
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
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
        <div>
          <h2>Quiz Result: ${attempt.quiz?.title || 'Quiz'}</h2>
          <p>Score: <strong style="color:${pct >= 50 ? '#22c55e' : '#ef4444'};">${attempt.score}/${attempt.maxScore} (${pct}%)</strong>
          ${attempt.attemptNumber > 1 ? ` &nbsp;·&nbsp; Attempt ${attempt.attemptNumber}` : ''}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary btn-sm" onclick="renderQuizzes()">← Back to Quizzes</button>
        </div>
      </div>
      <div id="result-questions">
        ${answers.map((a, i) => {
          const q = a.question;
          if (!q) return '';
          return `
            <div class="card" style="margin-bottom:12px;border-left:4px solid ${a.isCorrect ? '#22c55e' : '#ef4444'};">
              <h4>Question ${i + 1} <span style="color:#9ca3af;font-weight:normal;font-size:0.85em;">(${q.marks || 1} marks)</span></h4>
              <p style="margin:8px 0;">${q.questionText}</p>
              ${q.questionType === 'fill'
                ? `<div style="display:flex;flex-direction:column;gap:6px;font-size:13px;">
                    <div style="padding:8px 12px;border-radius:6px;border:1px solid ${a.isCorrect ? '#22c55e' : '#ef4444'};background:${a.isCorrect ? '#f0fdf4' : '#fef2f2'};color:${a.isCorrect ? '#15803d' : '#dc2626'};">
                      ${a.isCorrect ? '✓' : '✗'} Your answer: <strong>${a.selectedAnswerText || '(no answer)'}</strong>
                    </div>
                    ${!a.isCorrect ? `<div style="padding:8px 12px;border-radius:6px;border:1px solid #22c55e;background:#f0fdf4;color:#15803d;">← Correct answer: <strong>${q.correctAnswerText || ''}</strong></div>` : ''}
                  </div>`
                : `<div style="display:flex;flex-direction:column;gap:6px;">
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
              </div>`}
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

      <!-- Duplicate finder tool -->
      <div class="card" style="margin-bottom:16px;border:2px solid #fde68a;background:#fffbeb">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div>
            <div style="font-size:14px;font-weight:700;margin-bottom:2px">🔍 Duplicate Quiz Finder</div>
            <div style="font-size:12px;color:#92400e">Find and remove quizzes with the same title</div>
          </div>
          <button class="btn btn-primary" style="background:#f59e0b;border-color:#f59e0b" onclick="findDuplicateQuizzes()">Scan for Duplicates</button>
        </div>
        <div id="duplicates-result" style="margin-top:12px"></div>
      </div>

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
                <td style="display:flex;gap:6px">
                  <button class="btn btn-sm btn-secondary" onclick="viewAdminQuizDetail('${q._id}')">View</button>
                  <button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-size:11px" onclick="adminDeleteQuiz('${q._id}','${q.title.replace(/'/g,"\\'")}')">Delete</button>
                </td>
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

async function findDuplicateQuizzes() {
  const el = document.getElementById('duplicates-result');
  if (!el) return;
  el.innerHTML = '<p style="font-size:13px;color:#92400e">Scanning…</p>';
  try {
    const { duplicates } = await api('/api/admin/quizzes/utils/duplicates');
    if (!duplicates.length) {
      el.innerHTML = '<p style="font-size:13px;color:#16a34a;font-weight:600">✅ No duplicate quizzes found.</p>';
      return;
    }
    el.innerHTML = `
      <div style="font-size:13px;font-weight:700;color:#92400e;margin-bottom:10px">
        Found ${duplicates.length} group(s) of duplicates:
      </div>
      ${duplicates.map(group => `
        <div style="border:1px solid #fde68a;border-radius:8px;padding:12px;margin-bottom:10px;background:#fff">
          <div style="font-weight:700;margin-bottom:8px">
            "${group._id.title}" — ${group.count} copies
          </div>
          <table style="width:100%;font-size:12px;border-collapse:collapse">
            <thead><tr style="color:#6b7280">
              <th style="text-align:left;padding:4px 8px">Title</th>
              <th style="text-align:left;padding:4px 8px">Created By</th>
              <th style="text-align:left;padding:4px 8px">Date</th>
              <th style="text-align:left;padding:4px 8px">Type</th>
              <th style="padding:4px 8px">Action</th>
            </tr></thead>
            <tbody>
              ${group.quizzes.map((q, i) => `
                <tr style="border-top:1px solid #f3f4f6;${i === 0 ? 'background:#f0fdf4' : ''}">
                  <td style="padding:6px 8px;font-weight:${i===0?'700':'400'}">${q.title} ${i===0 ? '<span style="font-size:10px;color:#16a34a;font-weight:600">(keep)</span>' : ''}</td>
                  <td style="padding:6px 8px">${q.createdByName || '—'}</td>
                  <td style="padding:6px 8px">${new Date(q.createdAt).toLocaleDateString()}</td>
                  <td style="padding:6px 8px">${q.type || '—'}</td>
                  <td style="padding:6px 8px;text-align:center">
                    ${i === 0
                      ? '<span style="color:#16a34a;font-size:11px">✓ Keep</span>'
                      : `<button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-size:11px" onclick="adminDeleteQuiz('${q.id}','${q.title.replace(/'/g,"\\'")}', true)">Delete</button>`
                    }
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('')}
    `;
  } catch(e) {
    el.innerHTML = `<p style="color:#ef4444;font-size:13px">Error: ${e.message}</p>`;
  }
}

async function adminDeleteQuiz(id, title, fromDuplicates = false) {
  if (!confirm(`Delete quiz "${title}"?\n\nThis will permanently remove all questions and submissions.`)) return;
  try {
    await api(`/api/admin/quizzes/${id}`, { method: 'DELETE' });
    toast(`Quiz "${title}" deleted`, 'ok');
    if (fromDuplicates) {
      findDuplicateQuizzes(); // re-scan
    } else {
      const content = document.getElementById('main-content');
      if (content) await renderAdminQuizzes(content);
    }
  } catch(e) {
    toast(e.message || 'Failed to delete quiz', 'err');
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
                <td>${a.student?.IndexNumber || a.student?.indexNumber || a.student?.email || 'N/A'}</td>
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

  // Corporate employees use the rich CorporateAttendance system
  if (currentUser.company?.mode === 'corporate') {
    return renderMyCorporateAttendance(content);
  }

  // Academic students use the session-based system
  if (!isOnline()) {
    const cached = offlineRead('my_attendance');
    if (cached) {
      content.innerHTML = '<div style="background:#fef3c7;color:#92400e;padding:10px 16px;border-radius:8px;font-size:13px;margin-bottom:16px">📡 Offline — showing cached attendance</div>';
      _renderMyAttendanceHTML(content, cached);
    } else {
      content.innerHTML = '<div class="card" style="text-align:center;padding:32px"><div style="font-size:36px">📡</div><p style="margin-top:8px;color:var(--text-light)">No cached data. Connect once to view attendance offline.</p></div>';
    }
    return;
  }
  try {
    const data = await api('/api/attendance-sessions/my-attendance');
    offlineCache('my_attendance', data);
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

async function renderMyCorporateAttendance(content) {
  try {
    // Fetch current month by default
    const now       = new Date();
    const fromDate  = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const toDate    = now.toISOString().slice(0, 10);

    const data = await api(`/api/corporate-attendance/my?from=${fromDate}&to=${toDate}`);
    const records = data.records || [];

    // Summary stats
    const totalDays    = records.length;
    const presentDays  = records.filter(r => r.status === 'present' || r.status === 'late').length;
    const lateDays     = records.filter(r => r.status === 'late').length;
    const totalWorked  = records.reduce((s, r) => s + (r.hoursWorked || 0), 0);
    const totalOvertime = records.reduce((s, r) => s + (r.overtimeHours || 0), 0);
    const attendanceRate = totalDays > 0 ? Math.round((presentDays / totalDays) * 100) : 0;

    const statusColors = { present:'#16a34a', late:'#d97706', absent:'#dc2626', half_day:'#7c3aed', on_leave:'#0284c7', remote:'#0891b2' };

    content.innerHTML = `
      <div class="page-header">
        <h2>My Attendance</h2>
        <p>${now.toLocaleString('en-GB', {month:'long', year:'numeric'})}</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card"><div class="stat-value">${attendanceRate}%</div><div class="stat-label">Attendance Rate</div></div>
        <div class="stat-card"><div class="stat-value">${presentDays}</div><div class="stat-label">Days Present</div></div>
        <div class="stat-card"><div class="stat-value">${Math.round(totalWorked * 10) / 10}h</div><div class="stat-label">Hours Worked</div></div>
        <div class="stat-card"><div class="stat-value">${lateDays}</div><div class="stat-label">Late Arrivals</div></div>
        ${totalOvertime > 0 ? `<div class="stat-card"><div class="stat-value" style="color:#8b5cf6">+${Math.round(totalOvertime*10)/10}h</div><div class="stat-label">Overtime</div></div>` : ''}
      </div>

      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <div class="card-title" style="margin:0">Attendance Records</div>
          <button class="btn btn-primary btn-sm" onclick="navigateTo('sign-in-out')">
            ${svgIcon('<polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', 14)} Clock In / Out
          </button>
        </div>
        ${records.length ? `
          <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Status</th><th>Shift</th>
                <th>Time In</th><th>Time Out</th>
                <th>Worked</th><th>Overtime</th><th>Lateness</th>
              </tr>
            </thead>
            <tbody>${records.map(r => {
              const ci  = r.clockIn?.time  ? new Date(r.clockIn.time)  : null;
              const co  = r.clockOut?.time ? new Date(r.clockOut.time) : null;
              const dateStr = r.date ? new Date(r.date).toLocaleDateString('en-GB', {day:'2-digit',month:'short'}) : '—';
              const sc  = statusColors[r.status] || 'var(--text-light)';
              return `<tr>
                <td style="font-size:13px;font-weight:600;white-space:nowrap">${dateStr}</td>
                <td><span style="background:${sc}20;color:${sc};border:1px solid ${sc}40;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;text-transform:capitalize;white-space:nowrap">${r.status || '—'}</span></td>
                <td style="font-size:12px;color:var(--text-muted)">${r.shift?.name || '—'}</td>
                <td style="font-size:13px">${ci ? ci.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—'}</td>
                <td style="font-size:13px">${co ? co.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : (ci ? '<span style="color:#f59e0b;font-size:11px;font-weight:600">Active</span>' : '—')}</td>
                <td style="font-size:13px">${r.hoursWorked != null ? r.hoursWorked+'h' : '—'}</td>
                <td style="font-size:13px">${r.overtimeHours > 0 ? '<span style="color:#8b5cf6;font-weight:600">+'+r.overtimeHours+'h</span>' : '—'}</td>
                <td style="font-size:13px">${r.clockIn?.isLate ? '<span style="color:#ef4444">'+r.clockIn.lateMinutes+'m late</span>' : (ci ? '<span style="color:#16a34a">On time</span>' : '—')}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
          </div>
        ` : '<div class="empty-state"><p>No attendance records this month. Use Clock In / Out to start.</p></div>'}
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p>Error loading attendance: ${e.message}</p></div>`;
  }
}




// ══════════════════════════════════════════════════════════════════════════════
// BULK STUDENT IMPORT
// ══════════════════════════════════════════════════════════════════════════════

async function showBulkImportModal() {
  const existing = document.getElementById('bulk-import-overlay');
  if (existing) existing.remove();

  // Load courses for the optional enroll-in dropdown
  let courses = [];
  try {
    const data = await api('/api/courses');
    courses = (data.courses || []).filter(c => c.isActive);
  } catch(_) {}

  const ol = document.createElement('div');
  ol.id = 'bulk-import-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)';
  ol.innerHTML = `
    <div style="background:var(--card);border-radius:14px;width:100%;max-width:560px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--card);z-index:1;border-radius:14px 14px 0 0;">
        <div>
          <h3 style="font-size:15px;font-weight:700;margin:0">📥 Bulk Import Students</h3>
          <p style="font-size:12px;color:var(--text-muted);margin:3px 0 0;">Upload a CSV file to create multiple student accounts at once</p>
        </div>
        <button onclick="document.getElementById('bulk-import-overlay').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer;font-size:13px;">✕</button>
      </div>
      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px;">

        <!-- Template download -->
        <div style="padding:12px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:9px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <div>
            <div style="font-size:13px;font-weight:600;color:#0369a1;">CSV Format</div>
            <div style="font-size:12px;color:#0284c7;margin-top:2px;">Required: <strong>name, indexNumber, programme, level, group, sessionType, semester</strong> &nbsp;·&nbsp; Optional: phone, courseCode, department</div>
          </div>
          <button class="btn btn-sm" style="background:#0ea5e9;color:#fff;white-space:nowrap;" onclick="downloadImportTemplate()">⬇ Template</button>
        </div>

        <!-- File upload -->
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:6px;display:block;">CSV File *</label>
          <label for="bi-csv-file" id="bi-drop-label" style="display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px;border:2px dashed var(--border);border-radius:9px;cursor:pointer;background:var(--bg);transition:border-color .2s" onmouseover="this.style.borderColor='#7c3aed'" onmouseout="this.style.borderColor='var(--border)'">
            <span style="font-size:22px;">📄</span>
            <span style="font-size:13px;font-weight:600;">Click to upload CSV</span>
            <span style="font-size:11px;color:var(--text-muted);">Max 2 MB</span>
            <input type="file" id="bi-csv-file" accept=".csv,text/csv" style="display:none;" onchange="biPreviewCSV(this)">
          </label>
          <div id="bi-file-name" style="display:none;margin-top:7px;padding:6px 11px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;color:#166534;font-weight:500;"></div>
        </div>

        <!-- Optional: enroll in course -->
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:6px;display:block;">Enroll in Course <span style="font-weight:400;text-transform:none;">(optional)</span></label>
          <select id="bi-course" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
            <option value="">— None (or use courseCode column in CSV) —</option>
            ${courses.map(c => `<option value="${c._id}">${c.title} (${c.code})</option>`).join('')}
          </select>
        </div>

        <!-- Preview -->
        <div id="bi-preview" style="display:none;">
          <div style="font-size:13px;font-weight:700;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
            Preview
            <span id="bi-preview-count" style="background:#ede9fe;color:#7c3aed;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;"></span>
          </div>
          <div style="overflow-x:auto;border:1px solid var(--border);border-radius:8px;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
              <thead>
                <tr style="background:var(--bg);">
                  <th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:700;">Name</th>
                  <th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:700;">Index No.</th>
                  <th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:700;">Programme</th>
                  <th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:700;">Level</th>
                  <th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:700;">Group</th>
                  <th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:700;">Session</th>
                  <th style="padding:7px 10px;text-align:left;border-bottom:1px solid var(--border);font-weight:700;">Sem</th>
                </tr>
              </thead>
              <tbody id="bi-preview-body"></tbody>
            </table>
          </div>
        </div>

        <div id="bi-err" style="display:none;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:7px;color:#dc2626;font-size:12px;font-weight:500;"></div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;position:sticky;bottom:0;background:var(--card);border-radius:0 0 14px 14px;">
        <button class="btn btn-secondary" onclick="document.getElementById('bulk-import-overlay').remove()">Cancel</button>
        <button id="bi-import-btn" class="btn btn-primary" onclick="runBulkImport()">Import Students</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
}

let _biRows = [];

function biPreviewCSV(input) {
  const file = input.files?.[0];
  if (!file) return;
  const nameEl = document.getElementById('bi-file-name');
  if (nameEl) { nameEl.textContent = '📄 ' + file.name; nameEl.style.display = 'block'; }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { showBiErr('CSV must have a header row and at least one data row.'); return; }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z]/g, ''));
      const nameIdx        = headers.findIndex(h => h === 'name' || h === 'fullname' || h === 'studentname');
      const idxIdx         = headers.findIndex(h => h === 'indexnumber' || h === 'studentid' || h === 'id' || h === 'index');
      const phoneIdx       = headers.findIndex(h => h === 'phone' || h === 'phonenumber' || h === 'mobile');
      const courseIdx      = headers.findIndex(h => h === 'coursecode' || h === 'course' || h === 'code');
      const deptIdx        = headers.findIndex(h => h === 'department' || h === 'dept' || h === 'faculty');
      const programmeIdx   = headers.findIndex(h => h === 'programme' || h === 'program');
      const levelIdx       = headers.findIndex(h => h === 'level');
      const groupIdx       = headers.findIndex(h => h === 'group');
      const sessionTypeIdx = headers.findIndex(h => h === 'sessiontype' || h === 'session');
      const semesterIdx    = headers.findIndex(h => h === 'semester' || h === 'sem');

      if (nameIdx === -1 || idxIdx === -1) {
        showBiErr("CSV must have 'name' and 'indexNumber' columns.");
        return;
      }

      _biRows = [];
      for (let i = 1; i < lines.length && i <= 501; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
        if (!cols[nameIdx] && !cols[idxIdx]) continue;
        _biRows.push({
          name:        cols[nameIdx]        || '',
          indexNumber: cols[idxIdx]         || '',
          phone:       phoneIdx >= 0       ? (cols[phoneIdx]       || '') : '',
          courseCode:  courseIdx >= 0      ? (cols[courseIdx]      || '') : '',
          department:  deptIdx >= 0        ? (cols[deptIdx]        || '') : '',
          programme:   programmeIdx >= 0   ? (cols[programmeIdx]   || '') : '',
          studentLevel:levelIdx >= 0       ? (cols[levelIdx]       || '') : '',
          studentGroup:groupIdx >= 0       ? (cols[groupIdx]       || '').toUpperCase() : '',
          sessionType: sessionTypeIdx >= 0 ? (cols[sessionTypeIdx] || '') : '',
          semester:    semesterIdx >= 0    ? (cols[semesterIdx]    || '') : '',
        });
      }

      const tbody = document.getElementById('bi-preview-body');
      const previewDiv = document.getElementById('bi-preview');
      const countEl = document.getElementById('bi-preview-count');
      if (tbody && previewDiv) {
        tbody.innerHTML = _biRows.slice(0, 5).map(r => `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border);">${r.name}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border);font-family:monospace;">${r.indexNumber}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border);">${r.programme ? `<span style="background:#ede9fe;color:#7c3aed;padding:1px 6px;border-radius:20px;font-size:11px;font-weight:700">${r.programme}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border);">${r.studentLevel ? `<span style="background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:20px;font-size:11px;font-weight:700">L${r.studentLevel}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border);">${r.studentGroup ? `<span style="background:#ecfdf5;color:#059669;padding:1px 6px;border-radius:20px;font-size:11px;font-weight:700">Grp ${r.studentGroup}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border);">${r.sessionType ? `<span style="background:#fff7ed;color:#c2410c;padding:1px 6px;border-radius:20px;font-size:11px;font-weight:600">${r.sessionType}</span>` : '<span style="color:var(--text-muted)">—</span>'}</td>
            <td style="padding:6px 10px;border-bottom:1px solid var(--border);color:var(--text-muted);">${r.semester || '—'}</td>
          </tr>`).join('') +
          (_biRows.length > 5 ? `<tr><td colspan="7" style="padding:6px 10px;color:var(--text-muted);font-style:italic;">…and ${_biRows.length - 5} more</td></tr>` : '');
        if (countEl) countEl.textContent = _biRows.length + ' rows';
        previewDiv.style.display = 'block';
        document.getElementById('bi-err')?.style && (document.getElementById('bi-err').style.display = 'none');
      }
    } catch(e) { showBiErr('Could not parse CSV: ' + e.message); }
  };
  reader.readAsText(file);
}

function showBiErr(msg) {
  const el = document.getElementById('bi-err');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

function downloadImportTemplate() {
  const csv = [
    'name,indexNumber,phone,department,programme,level,group,sessionType,semester,courseCode',
    'John Mensah,CS/0001/23,0244123456,Computer Science,BSc,100,A,Regular,1,CS101',
    'Akosua Boateng,CS/0002/23,0244123457,Computer Science,HND,100,B,Evening,1,CS101',
    'Kwame Asante,IT/0001/23,0244123458,Information Technology,Diploma,200,A,Weekend,2,',
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'kodex_student_import_template.csv';
  a.click();
}

async function runBulkImport() {
  const fileInput = document.getElementById('bi-csv-file');
  const courseId  = document.getElementById('bi-course')?.value || '';
  const btn = document.getElementById('bi-import-btn');
  const errEl = document.getElementById('bi-err');

  if (!fileInput?.files?.[0]) { showBiErr('Please select a CSV file.'); return; }

  btn.disabled = true;
  btn.textContent = 'Importing…';
  if (errEl) errEl.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('csv', fileInput.files[0]);
    if (courseId) formData.append('courseId', courseId);

    const token = localStorage.getItem('token') || '';
    const resp = await fetch('/api/users/bulk-import', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData,
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || 'Import failed');

    document.getElementById('bulk-import-overlay')?.remove();
    toastSuccess(data.message);

    // Download results CSV with generated passwords
    if (data.students?.length) {
      const rows = [['Name','Index Number','Email','Temp Password','Course','Status']];
      data.students.forEach(s => rows.push([s.name, s.indexNumber, s.email, s.tempPassword, s.course, s.status]));
      const csvContent = rows.map(r => r.map(v => `"${(v||'').replace(/"/g,'""')}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'kodex_import_results_' + new Date().toISOString().slice(0,10) + '.csv';
      a.click();
    }

    renderUsers();
  } catch(e) {
    showBiErr(e.message || 'Import failed');
    btn.disabled = false;
    btn.textContent = 'Import Students';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// QUESTION BANK
// ══════════════════════════════════════════════════════════════════════════════

let _bankQuestions = [];   // cache for import modal
let _bankTopics    = [];

async function renderQuestionBank() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading question bank…</div>';
  try {
    const data = await api('/api/lecturer/question-bank?limit=200');
    _bankQuestions = data.questions || [];
    _bankTopics    = data.topics || [];

    const L = ['A','B','C','D'];
    const typeColors = { single:'#0369a1', multiple:'#7c3aed', fill:'#059669', explain:'#b45309' };
    const typeBg    = { single:'#f0f9ff', multiple:'#f5f3ff', fill:'#f0fdf4', explain:'#fffbeb' };

    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
        <div>
          <h2>Question Bank</h2>
          <p>Save and reuse questions across quizzes — ${data.total || 0} total</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-secondary" id="bank-pdf-btn" onclick="exportBankToPDF()" style="display:none;">⬇ Save PDF (<span id="bank-sel-count">0</span>)</button>
          <button class="btn btn-primary" onclick="openAddToBankModal()">＋ Add Question</button>
        </div>
      </div>

      <!-- Filters -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;">
          <input type="checkbox" id="bank-select-all" onchange="bankSelectAll(this.checked)" style="accent-color:var(--primary);width:15px;height:15px;"> Select All
        </label>
        <input id="bank-search" placeholder="Search questions…" oninput="filterBankList()"
          style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;flex:1;min-width:180px;">
        <select id="bank-topic-filter" onchange="filterBankList()"
          style="padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
          <option value="">All Topics</option>
          ${_bankTopics.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>

      <div id="bank-list">
        ${_bankQuestions.length === 0
          ? `<div class="empty-state"><p>No questions yet. Add your first question or save questions from a quiz.</p></div>`
          : _bankQuestions.map((q, i) => bankQuestionCard(q, i, L, typeColors, typeBg)).join('')}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">Error: ${e.message}</p></div>`;
  }
}

function bankQuestionCard(q, i, L, typeColors, typeBg) {
  const type = q.questionType || 'single';
  const isExplain = type === 'explain';
  return `
    <div id="bq-${q._id}" style="border:1.5px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:10px;background:var(--card);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <label style="display:flex;align-items:flex-start;gap:10px;flex:1;min-width:0;cursor:pointer;">
          <input type="checkbox" class="bank-q-check" data-id="${q._id}" onchange="bankSelectionChanged()" style="accent-color:var(--primary);width:16px;height:16px;margin-top:2px;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
            <span style="font-size:11px;padding:2px 8px;border-radius:20px;font-weight:700;background:${(typeBg||{})[type]||'#f3f4f6'};color:${(typeColors||{})[type]||'#374151'}">${type.toUpperCase()}</span>
            ${q.topic ? `<span style="font-size:11px;padding:2px 8px;border-radius:20px;background:#fef3c7;color:#92400e;font-weight:600;">${q.topic}</span>` : ''}
            <span style="font-size:11px;color:var(--text-muted);">${q.marks} mark${q.marks !== 1 ? 's' : ''}</span>
            ${q.useCount > 0 ? `<span style="font-size:11px;color:#9ca3af;">Used ${q.useCount}×</span>` : ''}
          </div>
          <div class="math-content" style="font-size:13px;font-weight:600;margin-bottom:8px;line-height:1.5;">${q.questionText}</div>
          ${q.imageAttachment ? `<div style="margin-bottom:8px;"><img src="${q.imageAttachment.fileUrl}?token=${typeof token !== 'undefined' ? token : ''}" alt="${q.imageAttachment.originalName}" style="max-width:100%;max-height:180px;border-radius:8px;border:1px solid var(--border);object-fit:contain;cursor:pointer;" onclick="window.open('${q.imageAttachment.fileUrl}?token=${typeof token !== 'undefined' ? token : ''}','_blank')"></div>` : ''}
          ${type === 'fill'
            ? `<div style="font-size:12px;color:#059669;padding:4px 10px;background:#f0fdf4;border-radius:6px;display:inline-block;">✓ ${q.correctAnswerText}${q.acceptedAnswers?.length ? ` (+${q.acceptedAnswers.length} alt)` : ''}</div>`
            : type === 'explain'
            ? `<div style="font-size:12px;color:#92400e;padding:6px 10px;background:#fffbeb;border-radius:6px;border:1px solid #fde68a;"><strong>Model Answer:</strong> ${q.modelAnswer || '<em>No model answer provided</em>'}</div>`
            : `<div style="display:flex;flex-wrap:wrap;gap:5px;">${(q.options||[]).map((o,oi) => {
                const isCorrect = type === 'multiple' ? (q.correctAnswers||[]).includes(oi) : q.correctAnswer === oi;
                return `<span style="padding:3px 9px;border-radius:6px;font-size:12px;${isCorrect?'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;font-weight:600':'background:var(--bg);color:var(--text-light);border:1px solid var(--border)'}">${L[oi]}) ${o}${isCorrect?' ✓':''}</span>`;
              }).join('')}</div>`}
        </div>
        </div>
        </label>
        <div style="display:flex;gap:6px;flex-shrink:0;">
          <button class="btn btn-sm btn-secondary" onclick="editBankQuestion('${q._id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteBankQuestion('${q._id}')">Delete</button>
        </div>
      </div>
    </div>`;
}

function filterBankList() {
  const search = document.getElementById('bank-search')?.value?.toLowerCase() || '';
  const topic  = document.getElementById('bank-topic-filter')?.value || '';
  const L = ['A','B','C','D'];
  const typeColors = { single:'#0369a1', multiple:'#7c3aed', fill:'#059669', explain:'#b45309' };
  const typeBg    = { single:'#f0f9ff', multiple:'#f5f3ff', fill:'#f0fdf4', explain:'#fffbeb' };
  const filtered = _bankQuestions.filter(q =>
    (!search || q.questionText.toLowerCase().includes(search)) &&
    (!topic  || q.topic === topic)
  );
  const list = document.getElementById('bank-list');
  if (!list) return;
  list.innerHTML = filtered.length === 0
    ? '<div class="empty-state"><p>No questions match your filters.</p></div>'
    : filtered.map((q, i) => bankQuestionCard(q, i, L, typeColors, typeBg)).join('');
  setTimeout(() => renderMath(list), 150);
}

// ── Add Question to Bank modal ───────────────────────────────────────────────
function openAddToBankModal(prefill) {
  const existing = document.getElementById('add-bank-overlay');
  if (existing) existing.remove();
  const ol = document.createElement('div');
  ol.id = 'add-bank-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)';
  const p = prefill || {};
  ol.innerHTML = `
    <div style="background:var(--card);border-radius:14px;width:100%;max-width:540px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--card);z-index:1;">
        <h3 style="font-size:15px;font-weight:700;margin:0">${p._id ? 'Edit' : 'Add'} Bank Question</h3>
        <button onclick="document.getElementById('add-bank-overlay').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer;font-size:13px;">✕</button>
      </div>
      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:13px;">
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Question Text *</label>
          ${getMathToolbar('bm-text')}
          <textarea id="bm-text" rows="3" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none;">${p.questionText||''}</textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Type</label>
            <select id="bm-type" onchange="bmToggleType()" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
              <option value="single" ${p.questionType==='single'?'selected':''}>Single</option>
              <option value="multiple" ${p.questionType==='multiple'?'selected':''}>Multiple</option>
              <option value="fill" ${p.questionType==='fill'?'selected':''}>Fill In</option>
              <option value="explain" ${p.questionType==='explain'?'selected':''}>Explain</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Marks</label>
            <input id="bm-marks" type="number" value="${p.marks||1}" min="1" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Topic Tag</label>
            <input id="bm-topic" placeholder="e.g. Biology" value="${p.topic||''}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
          </div>
        </div>
        <!-- Image attachment -->
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:6px;display:block;">Question Image <span style="font-weight:400;text-transform:none;">(optional diagram or figure)</span></label>
          ${p.imageAttachment ? `
            <div id="bm-img-existing" style="margin-bottom:8px;">
              <img src="${p.imageAttachment.fileUrl}?token=${typeof token !== 'undefined' ? token : ''}" style="max-width:100%;max-height:140px;border-radius:8px;border:1px solid var(--border);object-fit:contain;display:block;margin-bottom:6px;">
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:11px;color:var(--text-muted);">Current: ${p.imageAttachment.originalName}</span>
                <button type="button" onclick="bmClearExistingImage()" style="font-size:11px;padding:2px 8px;border:1px solid #fecaca;background:#fef2f2;color:#dc2626;border-radius:5px;cursor:pointer;">Remove</button>
              </div>
            </div>` : ''}
          <input type="hidden" id="bm-remove-image" value="false">
          <input type="file" id="bm-image-input" accept=".jpg,.jpeg,.png,.webp,.gif" style="display:none" onchange="bmPreviewImage(this)">
          <div style="display:flex;align-items:center;gap:8px;">
            <button type="button" onclick="document.getElementById('bm-image-input').click()" style="display:flex;align-items:center;gap:6px;padding:7px 13px;border:1.5px dashed var(--border);border-radius:8px;background:var(--bg);cursor:pointer;font-size:12px;font-weight:600;color:var(--text-light);transition:.15s" onmouseover="this.style.borderColor='var(--primary)';this.style.color='var(--primary)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-light)'">
              🖼 ${p.imageAttachment ? 'Replace Image' : 'Upload Image'}
            </button>
            <span id="bm-img-name" style="font-size:12px;color:var(--text-muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
            <button id="bm-img-clear" type="button" onclick="bmClearNewImage()" style="display:none;background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;padding:2px 5px;">×</button>
          </div>
          <div id="bm-img-preview" style="margin-top:8px;display:none;"></div>
        </div>
        <!-- Options (MCQ) -->
        <div id="bm-options-wrap">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:6px;display:block;">Options & Correct Answer</label>
          ${[0,1,2,3].map(i => {
            const isCorrect = p.questionType === 'multiple'
              ? (p.correctAnswers||[]).includes(i)
              : (p.correctAnswer === i);
            return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
              <input type="${p.questionType==='multiple'?'checkbox':'radio'}" name="bm-correct" id="bm-opt-check-${i}" value="${i}" ${isCorrect?'checked':''} style="accent-color:var(--primary);width:16px;height:16px;flex-shrink:0;">
              <input id="bm-opt-${i}" placeholder="Option ${String.fromCharCode(65+i)}" value="${(p.options||[])[i]||''}" style="flex:1;padding:7px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;font-family:inherit;outline:none;">
            </div>`;
          }).join('')}
          <p style="font-size:11px;color:var(--text-muted);margin:0;">Check the correct answer(s).</p>
        </div>
        <!-- Fill wrap -->
        <div id="bm-fill-wrap" style="display:none;">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Correct Answer *</label>
          <input id="bm-fill-answer" placeholder="Primary correct answer" value="${p.correctAnswerText||''}" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;margin-bottom:6px;">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Alternate Accepted Answers <span style="font-weight:400;text-transform:none;">(optional, one per line)</span></label>
          <textarea id="bm-fill-alts" rows="2" placeholder="alternative 1&#10;alternative 2" style="width:100%;padding:8px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none;">${(p.acceptedAnswers||[]).join('\n')}</textarea>
        </div>
        <!-- Explain wrap -->
        <div id="bm-explain-wrap" style="display:none;">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Model Answer <span style="font-weight:400;text-transform:none;">(for lecturer reference, not shown to students)</span></label>
          <textarea id="bm-model-answer" rows="4" placeholder="Write the expected/ideal answer here…" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none;">${p.modelAnswer||''}</textarea>
        </div>
        <div id="bm-err" style="display:none;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:7px;color:#dc2626;font-size:12px;font-weight:500;"></div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;position:sticky;bottom:0;background:var(--card);border-radius:0 0 14px 14px;">
        <button class="btn btn-secondary" onclick="document.getElementById('add-bank-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="submitBankQuestion(${p._id ? `'${p._id}'` : 'null'})">${p._id ? 'Save Changes' : 'Add to Bank'}</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
  if (p.questionType === 'fill' || p.questionType === 'explain') bmToggleType();
}

function bmPreviewImage(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('bm-img-name').textContent = file.name;
  document.getElementById('bm-img-clear').style.display = 'inline';
  const url = URL.createObjectURL(file);
  const preview = document.getElementById('bm-img-preview');
  if (preview) {
    preview.innerHTML = `<img src="${url}" style="max-width:100%;max-height:140px;border-radius:8px;border:1px solid var(--border);object-fit:contain;">`;
    preview.style.display = 'block';
  }
}

function bmClearNewImage() {
  const input = document.getElementById('bm-image-input');
  if (input) input.value = '';
  document.getElementById('bm-img-name').textContent = '';
  document.getElementById('bm-img-clear').style.display = 'none';
  const preview = document.getElementById('bm-img-preview');
  if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
}

function bmClearExistingImage() {
  const existing = document.getElementById('bm-img-existing');
  if (existing) existing.remove();
  const removeFlag = document.getElementById('bm-remove-image');
  if (removeFlag) removeFlag.value = 'true';
}

function bmToggleType() {
  const type = document.getElementById('bm-type')?.value;
  const optWrap     = document.getElementById('bm-options-wrap');
  const fillWrap    = document.getElementById('bm-fill-wrap');
  const explainWrap = document.getElementById('bm-explain-wrap');
  if (!optWrap || !fillWrap) return;
  optWrap.style.display     = 'none';
  fillWrap.style.display    = 'none';
  if (explainWrap) explainWrap.style.display = 'none';
  if (type === 'fill') {
    fillWrap.style.display = 'block';
  } else if (type === 'explain') {
    if (explainWrap) explainWrap.style.display = 'block';
  } else {
    optWrap.style.display = 'block';
    document.querySelectorAll('input[name="bm-correct"]').forEach(el => {
      el.type = type === 'multiple' ? 'checkbox' : 'radio';
    });
  }
}

async function submitBankQuestion(existingId) {
  const type  = document.getElementById('bm-type')?.value || 'single';
  const text  = document.getElementById('bm-text')?.value?.trim();
  const marks = parseInt(document.getElementById('bm-marks')?.value) || 1;
  const topic = document.getElementById('bm-topic')?.value?.trim() || '';
  const imageFile   = document.getElementById('bm-image-input')?.files?.[0] || null;
  const removeImage = document.getElementById('bm-remove-image')?.value === 'true';
  const errEl = document.getElementById('bm-err');

  if (!text) { errEl.textContent = 'Question text is required.'; errEl.style.display = 'block'; return; }

  const fields = { questionText: text, questionType: type, marks, topic };

  if (type === 'fill') {
    const ans = document.getElementById('bm-fill-answer')?.value?.trim();
    if (!ans) { errEl.textContent = 'Correct answer is required for fill-in questions.'; errEl.style.display = 'block'; return; }
    fields.correctAnswerText = ans;
    fields.acceptedAnswers = JSON.stringify((document.getElementById('bm-fill-alts')?.value || '').split('\n').map(s=>s.trim()).filter(Boolean));
    fields.options = JSON.stringify([]);
  } else if (type === 'explain') {
    fields.modelAnswer = document.getElementById('bm-model-answer')?.value?.trim() || '';
    fields.options = JSON.stringify([]);
  } else {
    const opts = [0,1,2,3].map(i => document.getElementById('bm-opt-'+i)?.value?.trim() || '');
    if (opts.filter(Boolean).length < 2) { errEl.textContent = 'At least 2 options required.'; errEl.style.display = 'block'; return; }
    const checked = [...document.querySelectorAll('input[name="bm-correct"]:checked')].map(el => parseInt(el.value));
    if (!checked.length) { errEl.textContent = 'Please mark the correct answer(s).'; errEl.style.display = 'block'; return; }
    fields.options = JSON.stringify(opts);
    if (type === 'multiple') { fields.correctAnswers = JSON.stringify(checked); }
    else { fields.correctAnswer = checked[0]; }
  }

  if (removeImage) fields.removeImage = 'true';

  try {
    if (imageFile) {
      const fd = new FormData();
      Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
      fd.append('image', imageFile);
      if (existingId) {
        await apiUpload('/api/lecturer/question-bank/' + existingId, fd, 'PUT');
      } else {
        await apiUpload('/api/lecturer/question-bank', fd);
      }
    } else {
      // Parse back JSON strings for non-file path
      const body = { ...fields };
      if (body.options && typeof body.options === 'string') body.options = JSON.parse(body.options);
      if (body.acceptedAnswers && typeof body.acceptedAnswers === 'string') body.acceptedAnswers = JSON.parse(body.acceptedAnswers);
      if (body.correctAnswers && typeof body.correctAnswers === 'string') body.correctAnswers = JSON.parse(body.correctAnswers);
      if (existingId) {
        await api('/api/lecturer/question-bank/' + existingId, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/api/lecturer/question-bank', { method: 'POST', body: JSON.stringify(body) });
      }
    }
    toastSuccess(existingId ? 'Question updated' : 'Question added to bank');
    document.getElementById('add-bank-overlay')?.remove();
    renderQuestionBank();
  } catch(e) {
    errEl.textContent = e.message || 'Failed to save question';
    errEl.style.display = 'block';
  }
}

async function editBankQuestion(id) {
  const q = _bankQuestions.find(q => q._id === id);
  if (q) { openAddToBankModal(q); return; }
  // Fallback: fetch from server
  try {
    const data = await api('/api/lecturer/question-bank?limit=1');
    const found = (data.questions || []).find(q => q._id === id);
    if (found) openAddToBankModal(found);
  } catch(e) { toastError('Could not load question'); }
}

async function deleteBankQuestion(id) {
  toastConfirm('Delete this question from the bank?', async () => {
    try {
      await api('/api/lecturer/question-bank/' + id, { method: 'DELETE' });
      _bankQuestions = _bankQuestions.filter(q => q._id !== id);
      document.getElementById('bq-'+id)?.remove();
      toastSuccess('Deleted from bank');
    } catch(e) { toastError('Delete failed'); }
  });
}

// ── Selection & PDF Export ──────────────────────────────────────────────────
function bankSelectionChanged() {
  const checks = document.querySelectorAll('.bank-q-check:checked');
  const count = checks.length;
  const btn = document.getElementById('bank-pdf-btn');
  const countEl = document.getElementById('bank-sel-count');
  if (btn) btn.style.display = count > 0 ? 'inline-flex' : 'none';
  if (countEl) countEl.textContent = count;
}

function bankSelectAll(checked) {
  document.querySelectorAll('.bank-q-check').forEach(cb => {
    cb.checked = checked;
  });
  bankSelectionChanged();
}

async function exportBankToPDF() {
  const checks = [...document.querySelectorAll('.bank-q-check:checked')];
  if (!checks.length) { toastError('Select at least one question'); return; }
  const ids = checks.map(c => c.dataset.id);
  const selected = _bankQuestions.filter(q => ids.includes(q._id));

  // Load jsPDF if not already loaded
  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, margin = 18, lineW = pageW - margin * 2;
  let y = margin;

  const addText = (text, fontSize, bold, color, indent) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    if (color) doc.setTextColor(...color); else doc.setTextColor(30, 30, 30);
    const lines = doc.splitTextToSize(String(text || ''), lineW - (indent||0));
    lines.forEach(line => {
      if (y > 275) { doc.addPage(); y = margin; }
      doc.text(line, margin + (indent||0), y);
      y += fontSize * 0.45;
    });
    y += 1.5;
  };

  // Title
  doc.setFillColor(13, 17, 23);
  doc.rect(0, 0, 210, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('KODEX — Question Bank Export', margin, 14);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`${selected.length} question${selected.length !== 1 ? 's' : ''} · ${new Date().toLocaleDateString()}`, margin, 19);
  y = 32;

  const L = ['A', 'B', 'C', 'D'];
  const typeLabel = { single: 'MCQ (Single)', multiple: 'MCQ (Multiple)', fill: 'Fill In', explain: 'Explain' };
  const typeColor = { single: [3, 105, 161], multiple: [124, 58, 237], fill: [5, 150, 105], explain: [180, 83, 9] };

  selected.forEach((q, idx) => {
    const type = q.questionType || 'single';
    if (y > 260) { doc.addPage(); y = margin; }

    // Question number + type badge
    const col = typeColor[type] || [60, 60, 60];
    doc.setFillColor(...col);
    doc.roundedRect(margin, y - 3.5, 28, 5.5, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(typeLabel[type] || type.toUpperCase(), margin + 1.5, y + 0.5);

    if (q.topic) {
      doc.setFillColor(254, 243, 199);
      doc.roundedRect(margin + 30, y - 3.5, doc.getTextWidth(q.topic) + 5, 5.5, 1.5, 1.5, 'F');
      doc.setTextColor(146, 64, 14);
      doc.text(q.topic, margin + 32.5, y + 0.5);
    }

    const marksText = `${q.marks || 1} mark${(q.marks || 1) !== 1 ? 's' : ''}`;
    doc.setTextColor(100, 100, 100);
    doc.setFontSize(8);
    doc.text(marksText, pageW - margin - doc.getTextWidth(marksText), y + 0.5);

    y += 8;

    // Question text
    doc.setTextColor(20, 20, 20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    const qLines = doc.splitTextToSize(`Q${idx + 1}. ${q.questionText}`, lineW);
    qLines.forEach(line => {
      if (y > 275) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 5.5;
    });
    y += 2;

    if (type === 'fill') {
      addText(`Answer: ${q.correctAnswerText}`, 9.5, false, [5, 150, 105], 2);
      if (q.acceptedAnswers?.length) addText(`Also accepted: ${q.acceptedAnswers.join(', ')}`, 8.5, false, [100, 100, 100], 2);
    } else if (type === 'explain') {
      addText('Model Answer:', 9, true, [180, 83, 9], 2);
      addText(q.modelAnswer || '—', 9, false, [60, 60, 60], 4);
    } else {
      (q.options || []).forEach((opt, oi) => {
        if (!opt) return;
        const isCorrect = type === 'multiple' ? (q.correctAnswers||[]).includes(oi) : q.correctAnswer === oi;
        if (isCorrect) doc.setFillColor(240, 253, 244); else doc.setFillColor(248, 250, 252);
        const optLines = doc.splitTextToSize(`${L[oi]}) ${opt}`, lineW - 6);
        const boxH = optLines.length * 5 + 4;
        if (y + boxH > 275) { doc.addPage(); y = margin; }
        doc.roundedRect(margin + 2, y - 3, lineW - 4, boxH, 1.5, 1.5, 'F');
        if (isCorrect) { doc.setDrawColor(187, 247, 208); doc.roundedRect(margin + 2, y - 3, lineW - 4, boxH, 1.5, 1.5, 'S'); }
        doc.setTextColor(isCorrect ? 22 : 55, isCorrect ? 101 : 65, isCorrect ? 52 : 81);
        doc.setFont('helvetica', isCorrect ? 'bold' : 'normal');
        doc.setFontSize(10);
        optLines.forEach((line, li) => { doc.text(line, margin + 5, y + li * 5); });
        if (isCorrect) { doc.setTextColor(22, 101, 52); doc.text('✓', pageW - margin - 6, y); }
        y += boxH + 2;
      });
    }

    // Divider
    y += 4;
    if (idx < selected.length - 1) {
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y, pageW - margin, y);
      y += 6;
    }
  });

  doc.save(`KODEX_QuestionBank_${new Date().toISOString().slice(0,10)}.pdf`);
  toastSuccess(`PDF saved with ${selected.length} question${selected.length !== 1 ? 's' : ''} ✓`);
}

// ── Save a quiz question to the bank ────────────────────────────────────────
async function saveQuestionToBank(quizId, questionId) {
  const topic = window.prompt('Save this question to your bank.\n\nTopic tag (optional, e.g. "Biology"):') ?? null;
  if (topic === null) return;
  try {
    await api('/api/lecturer/question-bank/save-from-quiz', {
      method: 'POST',
      body: JSON.stringify({ questionIds: [questionId], topic: topic.trim() }),
    });
    toastSuccess('Question saved to bank ✓');
  } catch(e) { toastError(e.message || 'Failed to save to bank'); }
}

// ── Import from Bank modal (inside showAddQuestionsView) ─────────────────────
async function openImportFromBankModal(quizId) {
  const existing = document.getElementById('import-bank-overlay');
  if (existing) existing.remove();

  try {
    const data = await api('/api/lecturer/question-bank?limit=200');
    _bankQuestions = data.questions || [];
    _bankTopics    = data.topics || [];
  } catch(e) { toastError('Failed to load question bank'); return; }

  if (!_bankQuestions.length) {
    toastInfo('Your question bank is empty. Add questions from the Question Bank page or save questions from quizzes.');
    return;
  }

  const L = ['A','B','C','D'];
  const ol = document.createElement('div');
  ol.id = 'import-bank-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)';
  ol.innerHTML = `
    <div style="background:var(--card);border-radius:14px;width:100%;max-width:600px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--card);z-index:1;border-radius:14px 14px 0 0;">
        <div>
          <h3 style="font-size:15px;font-weight:700;margin:0">Import from Question Bank</h3>
          <p style="font-size:12px;color:var(--text-muted);margin:2px 0 0;">Select questions to add to this quiz</p>
        </div>
        <button onclick="document.getElementById('import-bank-overlay').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer;font-size:13px;">✕</button>
      </div>
      <!-- Search + filter -->
      <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;">
        <input id="ibm-search" placeholder="Search…" oninput="filterImportList()" style="flex:1;min-width:150px;padding:7px 11px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;font-family:inherit;outline:none;">
        <select id="ibm-topic" onchange="filterImportList()" style="padding:7px 11px;border:1.5px solid var(--border);border-radius:7px;font-size:13px;font-family:inherit;outline:none;">
          <option value="">All Topics</option>
          ${_bankTopics.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
        <span id="ibm-sel-count" style="font-size:12px;color:var(--primary);font-weight:600;align-self:center;">0 selected</span>
      </div>
      <!-- List -->
      <div id="ibm-list" style="flex:1;overflow-y:auto;padding:12px 20px;display:flex;flex-direction:column;gap:8px;">
        ${_bankQuestions.map(q => importBankCard(q, L)).join('')}
      </div>
      <!-- Footer -->
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;background:var(--card);border-radius:0 0 14px 14px;">
        <button class="btn btn-secondary" onclick="document.getElementById('import-bank-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmImportFromBank('${quizId}')">Import Selected</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
}

function importBankCard(q, L) {
  const type = q.questionType || 'single';
  const typeColors = { single:'#0369a1', multiple:'#7c3aed', fill:'#059669' };
  const typeBg    = { single:'#f0f9ff', multiple:'#f5f3ff', fill:'#f0fdf4' };
  return `
    <label style="display:flex;gap:10px;padding:11px 13px;border:1.5px solid var(--border);border-radius:9px;cursor:pointer;background:var(--bg);" onclick="updateImportCount()">
      <input type="checkbox" class="ibm-check" value="${q._id}" style="accent-color:var(--primary);width:16px;height:16px;flex-shrink:0;margin-top:2px;">
      <div style="flex:1;min-width:0;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;flex-wrap:wrap;">
          <span style="font-size:10px;padding:1px 7px;border-radius:20px;font-weight:700;background:${typeBg[type]||'#f3f4f6'};color:${typeColors[type]||'#374151'}">${type.toUpperCase()}</span>
          ${q.topic ? `<span style="font-size:10px;padding:1px 7px;border-radius:20px;background:#fef3c7;color:#92400e;font-weight:600;">${q.topic}</span>` : ''}
          <span style="font-size:10px;color:var(--text-muted);">${q.marks} mark${q.marks!==1?'s':''}</span>
        </div>
        <div class="math-content" style="font-size:13px;font-weight:500;line-height:1.4;">${q.questionText}</div>
      </div>
    </label>`;
}

function filterImportList() {
  const search = document.getElementById('ibm-search')?.value?.toLowerCase() || '';
  const topic  = document.getElementById('ibm-topic')?.value || '';
  const L = ['A','B','C','D'];
  const filtered = _bankQuestions.filter(q =>
    (!search || q.questionText.toLowerCase().includes(search)) &&
    (!topic  || q.topic === topic)
  );
  const list = document.getElementById('ibm-list');
  if (list) list.innerHTML = filtered.map(q => importBankCard(q, L)).join('');
  updateImportCount();
}

function updateImportCount() {
  const count = document.querySelectorAll('.ibm-check:checked').length;
  const el = document.getElementById('ibm-sel-count');
  if (el) el.textContent = count + ' selected';
}

async function confirmImportFromBank(quizId) {
  const checked = [...document.querySelectorAll('.ibm-check:checked')].map(el => el.value);
  if (!checked.length) { toastWarning('No questions selected.'); return; }
  try {
    const data = await api('/api/lecturer/question-bank/import-to-quiz', {
      method: 'POST',
      body: JSON.stringify({ bankQuestionIds: checked, quizId }),
    });
    document.getElementById('import-bank-overlay')?.remove();
    toastSuccess(data.message || checked.length + ' question(s) imported');
    await showAddQuestionsView(quizId);
  } catch(e) { toastError(e.message || 'Import failed'); }
}

// ══════════════════════════════════════════════════════════════════════════════
// ESP32 BLE Integration
// ══════════════════════════════════════════════════════════════════════════════

const ESP32_BLE_PREFIX   = 'ATT_';
const ESP32_LOCAL_PORT   = 80;
let   esp32IP            = localStorage.getItem('kodex_esp32_ip') || null;
let   bleDetected        = false;
let   bleScanInterval    = null;

// Save ESP32 IP when found
function setEsp32IP(ip) {
  esp32IP = ip;
  localStorage.setItem('kodex_esp32_ip', ip);
}

// Call ESP32 local HTTP API
async function esp32Api(path, options = {}) {
  if (!esp32IP) throw new Error('ESP32 not found. Make sure you are connected to the same network as the classroom device.');
  const url = `http://${esp32IP}${path}`;
  const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  // Capture the device token served by the ESP32 captive portal.
  // We forward this as X-ESP32-Hotspot-Key on ble-verify requests so the
  // server can confirm proximity even when Android routes via mobile data.
  const hotspotKey = res.headers.get('x-esp32-device-token');
  if (hotspotKey) sessionStorage.setItem('kodex_esp32_hotspot_key', hotspotKey);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'ESP32 request failed');
  return data;
}

// Try to find ESP32 on local network
async function discoverESP32() {
  // Always try 192.168.4.1 — the fixed AP gateway IP of the ESP32.
  // Works in Median app (allows HTTP from HTTPS WebView).
  // Two-step: first /token (gets key in JSON body), then /status (confirms device).
  const candidates = ['192.168.4.1'];
  if (esp32IP && esp32IP !== '192.168.4.1') candidates.push(esp32IP);

  for (const ip of candidates) {
    try {
      // Step 1: fetch /token — returns { token: "..." } in JSON body.
      // This is more reliable than reading response headers in a WebView.
      const tokenRes = await fetch(`http://${ip}/token`, { cache: 'no-store' });
      if (tokenRes.ok) {
        const tokenData = await tokenRes.json();
        if (tokenData.token) {
          sessionStorage.setItem('kodex_esp32_hotspot_key', tokenData.token);
          setEsp32IP(ip);
          bleDetected = true;
          return true;
        }
      }
    } catch(e) { /* try /status fallback */ }

    try {
      // Step 2 fallback: /status — reads token from response header
      esp32IP = ip;
      const status = await esp32Api('/status');
      if (status.device === 'KODEX-ESP32') {
        setEsp32IP(ip);
        bleDetected = true;
        return true;
      }
    } catch(e) { /* not reachable on this IP */ }
  }
  return false;
}

// Check BLE presence via Web Bluetooth API
async function checkBLEPresence() {
  if (!navigator.bluetooth) return false;
  try {
    // We don't need to connect — just check if device is advertising
    // Web Bluetooth requires user gesture for full scan, so we rely on ESP32 HTTP discovery
    return await discoverESP32();
  } catch(e) {
    return false;
  }
}

// Start session on ESP32 (offline)
async function startOfflineSession() {
  const title = prompt('Session title:', 'Attendance Session');
  if (!title) return;
  try {
    const data = await esp32Api('/session/start', {
      method: 'POST',
      body: JSON.stringify({ title })
    });
    showToastNotif(`✅ Session started! Verbal code: ${data.verbalCode}`);
    renderSessions();
  } catch(e) {
    toastError('Could not start session on ESP32: ' + e.message);
  }
}

// Stop session on ESP32
async function stopOfflineSession() {
  if (!confirm('Stop the current ESP32 session?')) return;
  try {
    await esp32Api('/session/stop', { method: 'POST' });
    showToastNotif('✅ Session stopped');
    renderSessions();
  } catch(e) {
    toastError(e.message);
  }
}

// Generate new verbal code on ESP32
async function esp32NewCode() {
  try {
    const data = await esp32Api('/session/new-code', { method: 'POST' });
    showToastNotif(`New code: ${data.verbalCode}`);
    renderMarkAttendance();
  } catch(e) {
    toastError(e.message);
  }
}

// Submit attendance to ESP32 locally
async function submitToESP32(code) {
  const user = currentUser;
  const body = {
    code,
    indexNumber: user.indexNumber || user.employeeId || user.email,
    userId: user.id
  };
  return await esp32Api('/mark', { method: 'POST', body: JSON.stringify(body) });
}

// Configure ESP32 IP address
function configureESP32() {
  const ip = prompt('Enter ESP32 IP address (shown on ESP32 serial monitor):', esp32IP || '192.168.1.100');
  if (ip) {
    setEsp32IP(ip);
    showToastNotif('✅ ESP32 IP saved: ' + ip);
    renderMarkAttendance();
  }
}

// Read ?esp32key= from URL — set when browser is redirected from the ESP32 hotspot portal.
// Store in sessionStorage so ble-verify and session-start can use it as proximity proof.
function handleEsp32KeyParam() {
  const params = new URLSearchParams(window.location.search);
  const key = params.get('esp32key');
  if (!key) return;
  sessionStorage.setItem('kodex_esp32_hotspot_key', key);
  setEsp32IP('192.168.4.1');
  bleDetected = true;
  // Strip param from URL so it doesn't linger
  const clean = window.location.pathname + (window.location.hash || '');
  window.history.replaceState({}, '', clean);
  console.log('[ESP32] Hotspot key captured from URL redirect');
}

// Auto-submit attendance when student scans QR code (URL contains ?qr_token=)
async function handleQrScan() {
  const params = new URLSearchParams(window.location.search);
  const qrToken = params.get('qr_token');
  if (!qrToken) return false;

  // Clean URL immediately
  window.history.replaceState({}, '', window.location.pathname);

  const content = document.getElementById('main-content');
  if (content) {
    content.innerHTML = `
      <div class="card" style="text-align:center;padding:48px 24px;max-width:400px;margin:40px auto">
        <div style="font-size:48px;margin-bottom:16px">⏳</div>
        <div style="font-size:18px;font-weight:700">Marking your attendance…</div>
        <p style="color:var(--text-light);font-size:13px;margin-top:8px">Please wait</p>
      </div>`;
  }

  try {
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ qrToken, method: 'qr_mark' }),
    });
    if (content) {
      content.innerHTML = `
        <div class="card" style="text-align:center;padding:48px 24px;max-width:400px;margin:40px auto;border-left:4px solid var(--success)">
          <div style="font-size:56px;margin-bottom:16px">✅</div>
          <div style="font-size:20px;font-weight:800;color:var(--success)">Attendance Marked!</div>
          <p style="color:var(--text-light);font-size:13px;margin-top:8px">You have been checked in successfully.</p>
          <button class="btn btn-primary" style="margin-top:20px" onclick="navigateTo('my-attendance')">View My Attendance</button>
        </div>`;
    }
  } catch(e) {
    if (content) {
      const expired = e.message?.toLowerCase().includes('expired');
      content.innerHTML = `
        <div class="card" style="text-align:center;padding:48px 24px;max-width:400px;margin:40px auto;border-left:4px solid var(--danger)">
          <div style="font-size:56px;margin-bottom:16px">${expired ? '⏰' : '❌'}</div>
          <div style="font-size:20px;font-weight:800;color:var(--danger)">${expired ? 'QR Code Expired' : 'Failed'}</div>
          <p style="color:var(--text-light);font-size:13px;margin-top:8px">${expired ? 'This QR code has expired. Ask your lecturer/manager for a fresh one.' : e.message}</p>
          <button class="btn btn-secondary" style="margin-top:20px" onclick="navigateTo('mark-attendance')">Go Back</button>
        </div>`;
    }
  }
  return true;
}

async function renderMarkAttendance() {
  const content = document.getElementById('main-content');
  if (!content) return;

  // Capture esp32key from URL if redirected from ESP32 captive portal
  handleEsp32KeyParam();

  // Check if arriving via QR scan deep link
  if (await handleQrScan()) return;

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
            <p style="font-size:12px;color:var(--text-light);margin-top:4px">Type the verbal code read out by your lecturer</p>
          </div>

          <div class="card mark-method-card" onclick="showQrEntry()" style="cursor:pointer;text-align:center;transition:all 0.2s">
            <div style="font-size:36px;margin-bottom:12px">${svgIcon('<rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="2" width="8" height="8" rx="1"/><rect x="2" y="14" width="8" height="8" rx="1"/><rect x="14" y="14" width="4" height="4"/><path d="M18 14h4v4M14 18h4v4"/>', 42)}</div>
            <div style="font-size:16px;font-weight:700">QR Code</div>
            <p style="font-size:12px;color:var(--text-light);margin-top:4px">Enter QR token from your lecturer's screen</p>
          </div>
          
          <div class="card mark-method-card" onclick="markBLE()" style="cursor:pointer;text-align:center;transition:all 0.2s">
            <div style="font-size:36px;margin-bottom:12px">${svgIcon('<path d="M6.5 6.5l11 11M6.5 17.5l11-11M12 2v20"/>', 42)}</div>
            <div style="font-size:16px;font-weight:700">BLE Proximity</div>
            <p style="font-size:12px;color:var(--text-light);margin-top:4px">Auto-mark by scanning classroom device via Bluetooth</p>
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
        <input type="text" id="mark-code-input" placeholder="Enter code" maxlength="4" style="font-size:24px;text-align:center;letter-spacing:8px;font-weight:700;text-transform:uppercase" autofocus>
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
    <div class="card" style="text-align:center;padding:32px 24px">
      <div style="font-size:48px;margin-bottom:12px">📷</div>
      <div style="font-size:17px;font-weight:700;margin-bottom:8px">Scan the QR Code</div>
      <p style="font-size:13px;color:var(--text-light);margin-bottom:20px">
        Point your phone camera at the QR code on the screen.<br>
        It will open a link — tap it to mark your attendance instantly.
      </p>
      <div style="background:#f8f9ff;border:1px solid var(--border);border-radius:10px;padding:16px;font-size:12px;color:var(--text-muted)">
        No camera? Enter the 4-character code shown below the QR image instead.
      </div>
    </div>
  `;
}

async function submitCodeMark() {
  const code = document.getElementById('mark-code-input')?.value?.toUpperCase().trim();
  if (!code || code.length !== 4) { toastWarning('Please enter the 4-character code.'); return; }

  // If ESP32 is detected, submit locally (works offline)
  if (bleDetected && esp32IP) {
    try {
      await submitToESP32(code);
      offlineCache('pendingMark', null);
      toastSuccess('Attendance marked successfully!');
      navigateTo('mark-attendance');
      return;
    } catch(e) {
      // Fall through to server if ESP32 submission fails
      console.warn('[BLE] ESP32 submission failed, trying server:', e.message);
    }
  }

  // Offline queuing is disabled — attendance must be marked in real-time
  // while connected to the classroom WiFi (KODEX-CLASSROOM).
  if (!(await isOnlineAsync())) {
    toastError('You must be connected to the classroom WiFi (KODEX-CLASSROOM) and have internet access to mark attendance.');
    return;
  }

  try {
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ code, method: 'code_mark' }),
    });
    offlineCache('pendingMark', null);
    toastSuccess('Attendance marked successfully!');
    navigateTo('mark-attendance');
  } catch (e) {
    if (e.data && e.data.esp32Required) {
      toastError('You must be connected to the classroom WiFi (KODEX-CLASSROOM) to mark attendance.');
    } else {
      toastError(e.message);
    }
  }
}

// Offline code entry — BLOCKED. Attendance cannot be queued offline.
// Students must be physically present on KODEX-CLASSROOM WiFi with internet.
function showCodeEntryOffline() {
  const area = document.getElementById('mark-input-area');
  if (!area) return;
  area.innerHTML = `
    <div class="card" style="text-align:center;padding:24px">
      <div style="font-size:40px;margin-bottom:12px">📡</div>
      <div style="font-weight:700;font-size:16px;margin-bottom:8px">No Internet Access</div>
      <p style="font-size:13px;color:var(--text-light);line-height:1.6">
        You must be connected to the classroom WiFi
        <strong>(KODEX-CLASSROOM)</strong> with internet access to mark attendance.<br><br>
        Offline queuing is disabled to prevent remote attendance fraud.
      </p>
    </div>
  `;
}

async function submitQrMark() {
  const qrToken = document.getElementById('mark-qr-input')?.value;
  if (!qrToken) { toastWarning('Please enter the QR token'); return; };

  // Offline queuing is disabled — QR attendance must be marked in real-time
  // while connected to the classroom WiFi (KODEX-CLASSROOM).
  if (!(await isOnlineAsync())) {
    toastError('You must be connected to the classroom WiFi (KODEX-CLASSROOM) and have internet access to mark attendance.');
    return;
  }

  try {
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ qrToken, method: 'qr_mark' }),
    });
    offlineCache('pendingMark', null);
    toastSuccess('Attendance marked successfully!');
    navigateTo('mark-attendance');
  } catch (e) {
    if (e.data && e.data.esp32Required) {
      toastError('You must be connected to the classroom WiFi (KODEX-CLASSROOM) to mark attendance.');
    } else {
      toastError(e.message);
    }
  }
}

async function markBLE() {
  const area = document.getElementById('mark-input-area');
  if (area) {
    area.innerHTML = `
      <div class="card" style="text-align:center;padding:28px 20px">
        <div style="font-size:40px;margin-bottom:12px">📡</div>
        <div style="font-size:16px;font-weight:700;margin-bottom:6px">Scanning for classroom device…</div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
          Make sure Bluetooth is ON and you are in the classroom.
        </p>
        <div id="ble-status" style="font-size:12px;color:var(--text-muted)">Starting scan…</div>
      </div>`;
  }

  const setStatus = (msg) => {
    const el = document.getElementById('ble-status');
    if (el) el.textContent = msg;
  };

  // Web Bluetooth API check
  if (!navigator.bluetooth) {
    if (area) area.innerHTML = `
      <div class="card" style="text-align:center;padding:28px 20px">
        <div style="font-size:40px;margin-bottom:12px">❌</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:8px">Bluetooth Not Supported</div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
          Your browser does not support Web Bluetooth.<br>
          Use <strong>Chrome on Android</strong>, or use the <strong>Enter Code</strong> method instead.
        </p>
        <button class="btn btn-secondary btn-sm" onclick="showCodeEntry()">Enter Code Instead</button>
      </div>`;
    return;
  }

  let device, server, service, characteristic;

  try {
    setStatus('Requesting Bluetooth access…');

    // Request device — filter for KODEX ESP32 beacon (name starts with ATT_)
    device = await navigator.bluetooth.requestDevice({
      filters: [
        { namePrefix: 'ATT_' },
        { services: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'] },
      ],
      optionalServices: ['6e400001-b5a3-f393-e0a9-e50e24dcca9e'],
    });

    setStatus('Connecting to ' + device.name + '…');
    server        = await device.gatt.connect();
    setStatus('Reading attendance token…');
    service       = await server.getPrimaryService('6e400001-b5a3-f393-e0a9-e50e24dcca9e');
    characteristic = await service.getCharacteristic('6e400002-b5a3-f393-e0a9-e50e24dcca9e');
    const value   = await characteristic.readValue();
    const text    = new TextDecoder().decode(value);

    // Disconnect immediately after reading — don't stay connected
    device.gatt.disconnect();

    let bleData;
    try { bleData = JSON.parse(text); }
    catch(e) {
      throw new Error('Could not read token from device. Move closer and try again.');
    }

    const { bleToken, sessionId, ts } = bleData;
    if (!bleToken || !ts) throw new Error('Invalid data from device. Try again.');

    setStatus('Verifying token with server…');

    // Ping the ESP32 over the local hotspot right before calling the server.
    // This ensures the X-ESP32-Device-Token header is captured in sessionStorage
    // even if discoverESP32() wasn't called earlier in the session.
    // We do this silently — if it fails (e.g. Android already switched to mobile
    // data before we got here) we still try with whatever key we have.
    try {
      await discoverESP32();
    } catch(e) { /* silent — proceed with whatever key we have */ }

    // Step 1: Verify the BLE token server-side
    // Server checks: hotspot key OR IP on 192.168.4.x, HMAC valid, timestamp fresh, single-use
    let verifyResult;
    try {
      const hotspotKey = sessionStorage.getItem('kodex_esp32_hotspot_key') || '';
      verifyResult = await api('/api/esp32/ble-verify', {
        method: 'POST',
        headers: hotspotKey ? { 'x-esp32-hotspot-key': hotspotKey } : {},
        body: JSON.stringify({ bleToken, sessionId, timestamp: ts }),
      });
    } catch (e) {
      // Map server error codes to clear messages
      const code = e.data?.code;
      if (code === 'NOT_ON_HOTSPOT')      throw new Error(
        'Connected to KODEX-CLASSROOM but still failing?\n\n' +
        'Android is routing traffic through mobile data instead of WiFi.\n\n' +
        'Fix: Go to Settings → Wi-Fi → tap & hold KODEX-CLASSROOM → ' +
        'Network usage → set to \'Always use this network\', then retry.'
      );
      if (code === 'TOKEN_EXPIRED')       throw new Error('Token expired — move closer to the device and try again.');
      if (code === 'INVALID_TOKEN')       throw new Error('Invalid token. You must be physically next to the classroom device.');
      if (code === 'TOKEN_ALREADY_USED')  throw new Error('This token was already used. Each BLE scan is single-use.');
      if (code === 'DEVICE_OFFLINE')      throw new Error('Classroom device is offline. Ask your lecturer to power it on.');
      throw e;
    }

    if (!verifyResult?.verified) throw new Error('BLE verification failed. Try again.');

    setStatus('Marking attendance…');

    // Step 2: Mark attendance using the verified sessionId
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({
        method: 'ble_mark',
        sessionId: verifyResult.sessionId,
      }),
    });

    // Success
    if (area) area.innerHTML = `
      <div class="card" style="text-align:center;padding:32px 20px;border-left:4px solid var(--success);background:#f0fdf4">
        <div style="font-size:52px;margin-bottom:12px">✅</div>
        <div style="font-size:18px;font-weight:800;color:var(--success)">Attendance Marked!</div>
        <p style="font-size:13px;color:var(--text-muted);margin-top:6px">Verified via BLE proximity.</p>
      </div>`;
    toastSuccess('Attendance marked via BLE proximity!');
    setTimeout(() => navigateTo('mark-attendance'), 2500);

  } catch (e) {
    // User cancelled the Bluetooth picker
    if (e.name === 'NotFoundError' || e.message?.includes('cancelled') || e.message?.includes('User cancelled')) {
      if (area) area.innerHTML = '';
      return;
    }
    if (area) area.innerHTML = `
      <div class="card" style="text-align:center;padding:28px 20px;border-left:4px solid var(--danger);background:#fef2f2">
        <div style="font-size:40px;margin-bottom:12px">❌</div>
        <div style="font-size:15px;font-weight:700;margin-bottom:8px">BLE Failed</div>
        <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">${e.message}</p>
        <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="markBLE()">↻ Try Again</button>
          <button class="btn btn-primary btn-sm" onclick="showCodeEntry()">Enter Code Instead</button>
        </div>
      </div>`;
    if (device?.gatt?.connected) device.gatt.disconnect().catch(() => {});
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
    if (joinUrl) window.open(joinUrl, '_blank');
    toastSuccess('Attendance marked via meeting join!');
    navigateTo('mark-attendance');
  } catch (e) {
    toastError(e.message);
  }
}

function showMarkAttendanceModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h3>Mark Attendance</h3>
        <p style="font-size:13px;color:var(--text-light);margin-bottom:16px">Enter the 4-character code shown by your lecturer or manager.</p>
        <div class="form-group">
          <label>Attendance Code</label>
          <input type="text" id="attend-code" placeholder="Enter code" maxlength="4" style="font-size:22px;text-align:center;letter-spacing:8px;font-weight:700;text-transform:uppercase" autofocus>
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
    if (!code || code.length !== 4) { toastWarning('Please enter the 4-character code.'); return; }
    await api('/api/attendance-sessions/mark', {
      method: 'POST',
      body: JSON.stringify({ code, method: 'code_mark' }),
    });
    closeModal();
    toastSuccess('Attendance marked successfully!');
    renderMyAttendance();
  } catch (e) {
    toastError(e.message);
  }
}

async function paySubscription() {
  try {
    // Determine plan from company mode
    const mode   = currentUser?.company?.mode || 'academic';
    const planId = mode === 'corporate' ? 'monthly' : 'semester';

    // Show loading state on button
    const btn = document.querySelector('[onclick="paySubscription()"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Initializing…'; }

    const data = await api('/api/payments/paystack/initialize', {
      method: 'POST',
      body: JSON.stringify({ plan: planId }),
    });

    if (data.authorization_url) {
      // Redirect to Paystack hosted payment page
      window.location.href = data.authorization_url;
    } else {
      toastError('Could not get payment URL. Please try again.');
      if (btn) { btn.disabled = false; btn.innerHTML = '💳 Pay with Paystack'; }
    }
  } catch (e) {
    toastError(e.message || 'Payment initialization failed. Please try again.');
    const btn = document.querySelector('[onclick="paySubscription()"]');
    if (btn) { btn.disabled = false; btn.innerHTML = '💳 Pay with Paystack'; }
  }
}

async function renderSubscription() {
  const content = document.getElementById('main-content');
  if (!content) return;
  try {
    const meData  = await api('/api/auth/me');
    const ut      = meData.userTrial || {};
    const status   = ut.status   || 'expired';
    const daysLeft = ut.daysLeft  || 0;
    const expiry   = ut.subscriptionExpiry
      ? new Date(ut.subscriptionExpiry).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' })
      : '—';

    // Determine plan based on company mode
    const mode       = currentUser?.company?.mode || 'academic';
    const isCorp     = mode === 'corporate';
    const planName   = isCorp ? 'Monthly Plan'   : 'Semester Plan';
    const planPrice  = isCorp ? 'GHS 150'        : 'GHS 300';
    const planPeriod = isCorp ? '30 days'        : '112 days (1 semester)';
    const planId     = isCorp ? 'monthly'        : 'semester';
    const planLabel  = isCorp ? 'GHS 150 / month': 'GHS 300 / semester';

    const statusColor = status === 'active' ? 'var(--success)' : status === 'trial' ? '#f59e0b' : 'var(--danger)';
    const statusLabel = status === 'active' ? '✅ Active' : status === 'trial' ? '⏳ Free Trial' : '❌ Expired';
    const currentPlan = status === 'active' ? planName : status === 'trial' ? 'Free Trial' : 'None';

    content.innerHTML = `
      <div class="page-header">
        <h2>My Subscription</h2>
        <p>Your personal KODEX access · ${planLabel} · Paystack only</p>
      </div>

      <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card">
          <div class="stat-value" style="color:${statusColor}">${statusLabel}</div>
          <div class="stat-label">Subscription Status</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${currentPlan}</div>
          <div class="stat-label">Current Plan</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${daysLeft}</div>
          <div class="stat-label">Days Remaining</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="font-size:15px">${expiry}</div>
          <div class="stat-label">${status === 'active' ? 'Expires On' : status === 'trial' ? 'Trial Ends' : 'Expired On'}</div>
        </div>
      </div>

      <div class="card" style="max-width:500px">
        <div class="card-title">${status === 'active' ? 'Renew Subscription' : 'Subscribe Now'}</div>

        <div style="margin:16px 0;padding:16px;background:var(--bg);border-radius:10px;border:1.5px solid var(--border)">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span style="font-size:15px;font-weight:600;color:var(--text)">${planName}</span>
            <span style="font-size:22px;font-weight:700;color:var(--primary)">${planPrice}</span>
          </div>
          <div style="font-size:13px;color:var(--text-light);margin-bottom:10px">⏱ ${planPeriod} · Auto-stacks if renewed early</div>
          <ul style="font-size:13px;color:var(--text-light);margin:0;padding-left:18px;line-height:1.9">
            <li>Full platform access</li>
            <li>Attendance marking &amp; session management</li>
            <li>Assessment creation &amp; grading</li>
            <li>Reports &amp; analytics</li>
            <li>Renew any time — days stack up</li>
          </ul>
        </div>

        ${status === 'active' && daysLeft > 14 ? `
          <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#15803d">
            ✅ Subscription active — <strong>${daysLeft} days</strong> remaining. Renewing now will add ${planPeriod} on top.
          </div>` : ''}

        ${status === 'expired' ? `
          <div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#dc2626">
            ⚠️ Your subscription has expired. Renew to continue using KODEX.
          </div>` : ''}

        ${status === 'trial' ? `
          <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:13px;color:#92400e">
            ⏳ Free trial active — <strong>${daysLeft} days</strong> left. Subscribe before it ends to avoid interruption.
          </div>` : ''}

        <button class="btn btn-primary" style="width:100%;padding:14px;font-size:15px;font-weight:600;letter-spacing:0.3px;border-radius:10px"
          onclick="paySubscription()">
          💳 Pay ${planPrice} with Paystack
        </button>
        <p style="font-size:11px;color:var(--text-light);text-align:center;margin-top:10px">
          Secured by Paystack · Paid in GHS · Mobile Money &amp; Card accepted
        </p>
      </div>
    `;
  } catch (e) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger)">Error loading subscription: ${e.message}</p></div>`;
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
        ? '<td>' + (u.IndexNumber || u.indexNumber || u.email || '—') + '</td>'
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
    toastError(err.message);
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
            <button class="btn btn-sm" style="background:#16a34a;color:#fff" onclick="exportAttendanceToExcel('${sessionId}', '${sessionTitle}')">📊 Excel</button>
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
    <div style="font-size:13px;color:var(--text-light);margin-bottom:12px">${records.length} ${currentUser.company?.mode === 'corporate' ? 'employee' : 'student'}${records.length!==1?'s':''} checked in</div>
    ${records.length ? `
      <table>
        <thead><tr><th>Name</th><th>ID</th><th>Method</th><th>Time</th><th>Status</th></tr></thead>
        <tbody>${records.map(r => `
          <tr>
            <td>${r.student?.name || 'N/A'}</td>
            <td style="font-family:monospace;font-size:12px">${r.student?.IndexNumber || r.student?.indexNumber || r.student?.email || '—'}</td>
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
        <div style="position:relative;flex-shrink:0">
          <div id="profile-avatar" style="width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--primary),#6366f1);display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700;color:#fff;overflow:hidden;cursor:pointer" onclick="document.getElementById('photo-upload').click()" title="Click to change photo">
            ${u.profilePhoto ? `<img src="${u.profilePhoto}" style="width:100%;height:100%;object-fit:cover">` : (u.name||'?')[0].toUpperCase()}
          </div>
          <div style="position:absolute;bottom:0;right:0;width:22px;height:22px;border-radius:50%;background:var(--primary);display:flex;align-items:center;justify-content:center;cursor:pointer;border:2px solid #fff" onclick="document.getElementById('photo-upload').click()">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </div>
          <input type="file" id="photo-upload" accept="image/*" style="display:none" onchange="uploadProfilePhoto(this)">
        </div>
        <div>
          <div style="font-size:18px;font-weight:700">${u.name || 'N/A'}</div>
          <div style="font-size:13px;color:var(--text-light)">${u.email || u.indexNumber || ''}</div>
          <span class="role-badge role-${u.role}" style="margin-top:4px;display:inline-block">${u.role}</span>
        </div>
      </div>

      <div id="profile-msg" style="display:none;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:16px"></div>

      <div style="margin-bottom:20px">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">Account Details</h3>
        <div class="form-group">
          <label>Full Name</label>
          <input type="text" id="profile-name" value="${u.name || ''}" placeholder="Your full name">
        </div>
        ${['lecturer','hod','student'].includes(u.role) ? `
        <div class="form-group" id="new-user-dept-wrap">
          <label>Department <span style="font-weight:400;font-size:11px;color:var(--text-muted)">(cannot be changed here — contact admin)</span></label>
          <input type="text" value="${u.department || 'Not set'}" disabled style="background:var(--bg);color:var(--text-muted);">
        </div>` : ''}
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

      ${!['student'].includes(u.role) ? `
      <div style="margin-bottom:20px;padding-top:20px;border-top:1px solid var(--border)">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">Two-Factor Authentication</h3>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;background:var(--bg);border-radius:10px;border:1.5px solid var(--border)">
          <div>
            <div style="font-weight:600;font-size:14px">Email 2FA</div>
            <div style="font-size:12px;color:var(--text-muted)">Send a code to your email every time you sign in</div>
          </div>
          <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer">
            <input type="checkbox" id="twofa-toggle" ${currentUser.twoFactorEnabled ? 'checked' : ''} onchange="toggle2FA(this.checked)" style="opacity:0;width:0;height:0">
            <span style="position:absolute;inset:0;border-radius:24px;background:${currentUser.twoFactorEnabled ? 'var(--primary)' : '#d1d5db'};transition:.2s">
              <span style="position:absolute;width:18px;height:18px;background:#fff;border-radius:50%;top:3px;left:${currentUser.twoFactorEnabled ? '23px' : '3px'};transition:.2s"></span>
            </span>
          </label>
        </div>
      </div>` : ''}
      <button class="btn btn-primary" onclick="saveProfile()" style="width:100%">Save Changes</button>
    </div>
  `;
}

async function toggle2FA(enable) {
  const cb = document.getElementById('twofa-toggle');
  try {
    await api('/api/auth/2fa/toggle', { method: 'POST', body: JSON.stringify({ enable }) });
    currentUser.twoFactorEnabled = enable;
    // Update toggle visual immediately
    const span = document.querySelector('#twofa-toggle + span');
    if (span) {
      span.style.background = enable ? 'var(--primary)' : '#d1d5db';
      const dot = span.querySelector('span');
      if (dot) dot.style.left = enable ? '23px' : '3px';
    }
    if (cb) cb.checked = enable;
    showToastNotif(enable ? '2FA enabled — you will get a code by email each login' : '2FA disabled', enable ? 'success' : 'warn');
  } catch(e) {
    showToastNotif('Failed to update 2FA: ' + e.message, 'warn');
    // Revert toggle
    if (cb) cb.checked = !enable;
  }
}

async function saveProfile() {
  const name = document.getElementById('profile-name').value.trim();
  const dept = document.getElementById('profile-dept')?.value?.trim();
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
  if (dept !== undefined && ['lecturer','hod'].includes(currentUser.role)) {
    body.department = dept;
  }
  if (newPassword) { body.currentPassword = currentPassword; body.newPassword = newPassword; }

  try {
    const data = await api('/api/auth/profile', { method: 'PUT', body: JSON.stringify(body) });
    if (data.user?.name) { currentUser.name = data.user.name; document.getElementById('user-name').textContent = data.user.name; }
    if (data.user?.department !== undefined) { currentUser.department = data.user.department; }
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
        ['What happens when the subscription expires?', 'Access is suspended after the trial/subscription period. You can renew anytime from the Subscription page in your dashboard — payments are processed instantly via Paystack.'],
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
// ══════════════════════════════════════════════════════════════════════════════
//  GRADE BOOK
// ══════════════════════════════════════════════════════════════════════════════

async function renderGradeBook() {
  const content = document.getElementById('main-content');
  if (!content) return;
  const isStudent = currentUser.role === 'student';
  if (isStudent) {
    await renderStudentGradeBook(content);
  } else {
    await renderLecturerGradeBook(content);
  }
}

// ── STUDENT VIEW ─────────────────────────────────────────────────────────────

async function renderStudentGradeBook(content) {
  content.innerHTML = '<div class="loading">Loading your grades…</div>';
  try {
    const data = await api('/api/gradebook/my-courses');
    const courses = data.courses || [];
    content.innerHTML = `
      <div class="page-header"><h2>My Grades</h2><p>Your academic performance across all courses</p></div>
      ${courses.length === 0
        ? '<div class="card"><div class="empty-state"><p>You are not enrolled in any courses yet.</p></div></div>'
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;">
            ${courses.map(c => `
              <div class="card" style="cursor:pointer;transition:transform .15s;border:1.5px solid var(--border);"
                   onmouseenter="this.style.transform='translateY(-2px)'"
                   onmouseleave="this.style.transform=''"
                   onclick="renderStudentCourseGrades('${c._id}','${c.title} (${c.code})')">
                <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${c.title}</div>
                <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">${c.code} · ${c.lecturerId?.name || 'N/A'}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:12px;color:var(--text-light);">${c.enrolledStudents?.length || 0} students</span>
                  <span class="btn btn-sm btn-primary" style="pointer-events:none;">View Grades →</span>
                </div>
              </div>`).join('')}
           </div>`
      }`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">${e.message}</p></div>`;
  }
}

async function renderStudentCourseGrades(courseId, courseTitle) {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading grades…</div>';
  try {
    const d = await api('/api/gradebook/my/' + courseId);
    const bar = (pct, color) => `
      <div style="background:var(--border);border-radius:4px;height:8px;flex:1;">
        <div style="width:${Math.min(pct,100)}%;background:${color};height:8px;border-radius:4px;transition:width .4s;"></div>
      </div>`;

    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" onclick="renderStudentGradeBook(document.getElementById('main-content'))">← Back</button>
        <div class="page-header" style="margin:0;padding:0;border:none;"><h2 style="margin:0;">${courseTitle}</h2></div>
      </div>

      <!-- Final Grade Card -->
      <div class="card" style="margin-bottom:16px;text-align:center;background:linear-gradient(135deg,var(--card),${d.color}18);border:2px solid ${d.color}40;">
        <div style="font-size:13px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Final Grade</div>
        <div style="font-size:56px;font-weight:900;color:${d.color};line-height:1;">${d.letter}</div>
        <div style="font-size:22px;font-weight:700;color:${d.color};margin-top:2px;">${d.finalPct}%</div>
      </div>

      <!-- Component Breakdown -->
      <div class="card" style="margin-bottom:16px;">
        <div class="card-title" style="margin-bottom:12px;">Grade Components</div>
        ${[
          { label: 'Quizzes', pct: d.quizPct, weight: d.weights.quizzes, color: '#6366f1' },
          { label: 'Attendance', pct: d.attPct, weight: d.weights.attendance, color: '#22c55e' },
          { label: 'Manual Grades', pct: d.manualPct, weight: d.weights.manual, color: '#f59e0b' },
        ].map(c => `
          <div style="margin-bottom:14px;">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
              <span style="font-size:13px;font-weight:600;">${c.label} <span style="font-weight:400;color:var(--text-muted);">(${c.weight}% weight)</span></span>
              <span style="font-size:13px;font-weight:700;color:${c.color};">${c.pct}%</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">${bar(c.pct, c.color)}</div>
          </div>`).join('')}
      </div>

      <!-- Quiz Breakdown -->
      ${d.quizBreakdown.length ? `
      <div class="card" style="margin-bottom:16px;">
        <div class="card-title" style="margin-bottom:10px;">Quiz Scores</div>
        ${d.quizBreakdown.map(q => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;">${q.title}</span>
            <span style="font-size:13px;font-weight:700;color:${q.score===null?'var(--text-muted)':'var(--text-primary)'};">
              ${q.score === null ? 'Not attempted' : q.score + ' / ' + q.maxScore}
            </span>
          </div>`).join('')}
      </div>` : ''}

      <!-- Attendance -->
      <div class="card" style="margin-bottom:16px;">
        <div class="card-title" style="margin-bottom:10px;">Attendance</div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;">Sessions attended</span>
          <span style="font-weight:700;">${d.attendanceBreakdown.attended} / ${d.attendanceBreakdown.total}</span>
        </div>
        ${bar(d.attPct, '#22c55e')}
      </div>

      <!-- Manual Grades -->
      ${d.manualBreakdown.length ? `
      <div class="card">
        <div class="card-title" style="margin-bottom:10px;">Other Grades</div>
        ${d.manualBreakdown.map(m => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
            <span style="font-size:13px;">${m.label}</span>
            <span style="font-size:13px;font-weight:700;color:${m.score===null?'var(--text-muted)':'var(--text-primary)'};">
              ${m.score === null ? 'Not graded' : m.score + ' / ' + m.maxScore}
            </span>
          </div>`).join('')}
      </div>` : ''}
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">${e.message}</p></div>`;
  }
}

// ── LECTURER VIEW ─────────────────────────────────────────────────────────────

async function renderLecturerGradeBook(content) {
  content.innerHTML = '<div class="loading">Loading courses…</div>';
  try {
    const data = await api('/api/gradebook/courses');
    const courses = data.courses || [];
    content.innerHTML = `
      <div class="page-header"><h2>Grade Book</h2><p>Manage grades across your courses</p></div>
      ${courses.length === 0
        ? '<div class="card"><div class="empty-state"><p>No courses found.</p></div></div>'
        : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;">
            ${courses.map(c => `
              <div class="card" style="cursor:pointer;transition:transform .15s;"
                   onmouseenter="this.style.transform='translateY(-2px)'"
                   onmouseleave="this.style.transform=''"
                   onclick="renderLecturerCourseGrades('${c._id}','${c.title} (${c.code})')">
                <div style="font-weight:700;font-size:15px;margin-bottom:4px;">${c.title}</div>
                <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">${c.code} · ${c.lecturerId?.name || 'N/A'}</div>
                <div style="display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-size:12px;color:var(--text-light);">${c.enrolledStudents?.length || 0} students</span>
                  <span class="btn btn-sm btn-primary" style="pointer-events:none;">Open →</span>
                </div>
              </div>`).join('')}
           </div>`
      }`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">${e.message}</p></div>`;
  }
}

async function renderLecturerCourseGrades(courseId, courseTitle) {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading grade book…</div>';
  try {
    const d = await api('/api/gradebook/course/' + courseId);
    const grades        = d.grades      || [];
    const gradeBook     = d.gradeBook   || { weights: { quizzes: 50, attendance: 20, manual: 30 }, manualEntries: [] };
    // API returns assessments.legacyQuizzes (not a top-level d.quizzes)
    const quizzes       = d.assessments?.legacyQuizzes || [];
    const totalSessions = d.totalSessions ?? 0;
    const gb = gradeBook;
    const w  = gb.weights || { quizzes: 50, attendance: 20, manual: 30 };

    // Grade distribution summary
    const dist = { A:0, B:0, C:0, D:0, F:0 };
    grades.forEach(g => { dist[g.letter] = (dist[g.letter]||0)+1; });
    const avg = grades.length ? (grades.reduce((s,g) => s+g.finalPct, 0) / grades.length).toFixed(1) : 0;

    content.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap;">
        <button class="btn btn-secondary btn-sm" onclick="renderLecturerGradeBook(document.getElementById('main-content'))">← Back</button>
        <div style="flex:1;"><h2 style="margin:0;font-size:18px;">${courseTitle}</h2></div>
        <button class="btn btn-sm" style="background:#4f46e5;color:#fff;" onclick="openWeightsModal('${courseId}',${w.quizzes},${w.attendance},${w.manual})">⚖️ Weights</button>
        <button class="btn btn-sm btn-secondary" onclick="openAddManualEntryModal('${courseId}')">＋ Grade Column</button>
        <button class="btn btn-sm btn-secondary" onclick="exportGradeBookCSV('${courseId}','${courseTitle}')">⬇ CSV</button>
      </div>

      <!-- Summary Stats -->
      <div class="stats-grid" style="margin-bottom:16px;">
        <div class="stat-card"><div class="stat-value">${grades.length}</div><div class="stat-label">Students</div></div>
        <div class="stat-card"><div class="stat-value">${avg}%</div><div class="stat-label">Class Average</div></div>
        <div class="stat-card"><div class="stat-value">${quizzes.length}</div><div class="stat-label">Quizzes</div></div>
        <div class="stat-card"><div class="stat-value">${totalSessions}</div><div class="stat-label">Sessions</div></div>
        ${Object.entries(dist).map(([l,n]) => `<div class="stat-card"><div class="stat-value" style="color:${{A:'#22c55e',B:'#84cc16',C:'#f59e0b',D:'#f97316',F:'#ef4444'}[l]}">${n}</div><div class="stat-label">Grade ${l}</div></div>`).join('')}
      </div>

      <!-- Weights display -->
      <div class="card" style="margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;align-items:center;">
        <span style="font-size:12px;color:var(--text-muted);font-weight:700;text-transform:uppercase;">Weights:</span>
        <span style="font-size:13px;">📝 Quizzes <strong>${w.quizzes}%</strong></span>
        <span style="font-size:13px;">📅 Attendance <strong>${w.attendance}%</strong></span>
        <span style="font-size:13px;">✏️ Manual <strong>${w.manual}%</strong></span>
      </div>

      <!-- Grade Table -->
      ${grades.length === 0
        ? '<div class="card"><div class="empty-state"><p>No enrolled students.</p></div></div>'
        : `<div class="card" style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead>
                <tr style="border-bottom:2px solid var(--border);">
                  <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);">Student</th>
                  <th style="padding:10px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted);">Quizzes</th>
                  <th style="padding:10px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted);">Attendance</th>
                  ${gb.manualEntries.map(e => `<th style="padding:10px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted);" title="Max: ${e.maxScore}">
                    ${e.label}
                    <button onclick="openEditManualScores('${courseId}','${e._id}','${e.label}',${e.maxScore})" style="background:none;border:none;cursor:pointer;color:#6366f1;font-size:11px;margin-left:3px;" title="Enter scores">✏️</button>
                    <button onclick="confirmDeleteManualEntry('${courseId}','${e._id}')" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:11px;" title="Delete column">×</button>
                  </th>`).join('')}
                  <th style="padding:10px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted);">Final %</th>
                  <th style="padding:10px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted);">Grade</th>
                </tr>
              </thead>
              <tbody>
                ${grades.map((g, i) => `
                  <tr style="border-bottom:1px solid var(--border);background:${i%2===0?'transparent':'var(--bg)'};">
                    <td style="padding:10px 12px;">
                      <div style="font-weight:600;">${g.student.name}</div>
                      <div style="font-size:11px;color:var(--text-muted);">${g.student.studentId || g.student.email}</div>
                    </td>
                    <td style="padding:10px 8px;text-align:center;">${g.quizPct}%</td>
                    <td style="padding:10px 8px;text-align:center;">${g.attPct}% <span style="font-size:10px;color:var(--text-muted);">(${g.attendedSessions}/${g.totalSessions})</span></td>
                    ${gb.manualEntries.map(e => {
                      const ms = g.manualScores.find(m => m.entryId.toString() === e._id.toString());
                      return `<td style="padding:10px 8px;text-align:center;">${ms?.score !== null && ms?.score !== undefined ? ms.score + '/' + e.maxScore : '<span style="color:var(--text-muted);">—</span>'}</td>`;
                    }).join('')}
                    <td style="padding:10px 8px;text-align:center;font-weight:700;">${g.finalPct}%</td>
                    <td style="padding:10px 8px;text-align:center;">
                      <span style="font-weight:900;font-size:16px;color:${g.color};">${g.letter}</span>
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`
      }
    `;

    // Store current data globally for CSV export and score entry
    window._gbData = d;
    window._gbCourseId = courseId;
    window._gbCourseTitle = courseTitle;

  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">${e.message}</p></div>`;
  }
}

// ── Weights Modal ──────────────────────────────────────────────────────────────
function openWeightsModal(courseId, qW, aW, mW) {
  const ol = document.createElement('div');
  ol.id = 'gb-weights-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)';
  ol.innerHTML = `
    <div style="background:var(--card);border-radius:14px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
        <h3 style="font-size:15px;font-weight:700;margin:0;">⚖️ Grade Weights</h3>
        <button onclick="document.getElementById('gb-weights-overlay').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer;">✕</button>
      </div>
      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px;">
        <p style="font-size:12px;color:var(--text-muted);margin:0;">Weights determine how each component contributes to the final grade. They don't need to sum to 100 — they're proportional.</p>
        ${[['Quizzes','gb-w-quiz',qW],['Attendance','gb-w-att',aW],['Manual Grades','gb-w-man',mW]].map(([label, id, val]) => `
          <div>
            <label style="font-size:12px;font-weight:700;margin-bottom:4px;display:block;">${label}</label>
            <div style="display:flex;align-items:center;gap:8px;">
              <input type="range" id="${id}" min="0" max="100" value="${val}" style="flex:1;accent-color:var(--primary);" oninput="document.getElementById('${id}-val').textContent=this.value+'%'">
              <span id="${id}-val" style="font-weight:700;min-width:38px;text-align:right;">${val}%</span>
            </div>
          </div>`).join('')}
        <div id="gb-weights-err" style="display:none;color:#ef4444;font-size:12px;"></div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="document.getElementById('gb-weights-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="saveWeights('${courseId}')">Save</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
}

async function saveWeights(courseId) {
  const quizzes    = +document.getElementById('gb-w-quiz').value;
  const attendance = +document.getElementById('gb-w-att').value;
  const manual     = +document.getElementById('gb-w-man').value;
  try {
    await api('/api/gradebook/course/' + courseId + '/weights', {
      method: 'PATCH',
      body: JSON.stringify({ quizzes, attendance, manual }),
    });
    document.getElementById('gb-weights-overlay').remove();
    toastSuccess('Weights updated ✓');
    renderLecturerCourseGrades(courseId, '');
  } catch(e) {
    const err = document.getElementById('gb-weights-err');
    if (err) { err.textContent = e.message; err.style.display = 'block'; }
  }
}

// ── Add Manual Entry Modal ────────────────────────────────────────────────────
function openAddManualEntryModal(courseId) {
  const ol = document.createElement('div');
  ol.id = 'gb-entry-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)';
  ol.innerHTML = `
    <div style="background:var(--card);border-radius:14px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
        <h3 style="font-size:15px;font-weight:700;margin:0;">＋ Add Grade Column</h3>
        <button onclick="document.getElementById('gb-entry-overlay').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer;">✕</button>
      </div>
      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px;">
        <div>
          <label style="font-size:12px;font-weight:700;margin-bottom:4px;display:block;">Column Label</label>
          <input id="gb-entry-label" placeholder="e.g. Midterm Exam, Lab Report 1" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
        </div>
        <div>
          <label style="font-size:12px;font-weight:700;margin-bottom:4px;display:block;">Maximum Score</label>
          <input id="gb-entry-max" type="number" min="1" placeholder="e.g. 100" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
        </div>
        <div id="gb-entry-err" style="display:none;color:#ef4444;font-size:12px;"></div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-secondary" onclick="document.getElementById('gb-entry-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="saveManualEntry('${courseId}')">Add Column</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
}

async function saveManualEntry(courseId) {
  const label    = document.getElementById('gb-entry-label').value.trim();
  const maxScore = document.getElementById('gb-entry-max').value;
  const errEl    = document.getElementById('gb-entry-err');
  if (!label || !maxScore) {
    if (errEl) { errEl.textContent = 'Both fields are required.'; errEl.style.display = 'block'; }
    return;
  }
  try {
    await api('/api/gradebook/course/' + courseId + '/manual-entry', {
      method: 'POST',
      body: JSON.stringify({ label, maxScore }),
    });
    document.getElementById('gb-entry-overlay').remove();
    toastSuccess('Grade column added ✓');
    renderLecturerCourseGrades(courseId, window._gbCourseTitle || '');
  } catch(e) {
    if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
  }
}

// ── Enter Manual Scores Modal ─────────────────────────────────────────────────
function openEditManualScores(courseId, entryId, label, maxScore) {
  const gbData = window._gbData;
  if (!gbData) { toastError('Grade data not loaded'); return; }

  const ol = document.createElement('div');
  ol.id = 'gb-scores-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)';

  // Only registered students have a real _id — skip roster-only (unregistered) rows
  const rows = gbData.grades.filter(g => g.student._id && g.student.isRegistered !== false).map(g => {
    const existing = g.manualScores.find(m => m.entryId.toString() === entryId);
    return `
      <tr>
        <td style="padding:8px 10px;font-size:13px;">${g.student.name}</td>
        <td style="padding:8px 10px;">
          <input type="number" min="0" max="${maxScore}" step="0.5"
                 data-student="${g.student._id}"
                 value="${existing?.score !== null && existing?.score !== undefined ? existing.score : ''}"
                 placeholder="/ ${maxScore}"
                 style="width:80px;padding:5px 8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;text-align:center;outline:none;">
        </td>
      </tr>`;
  }).join('');

  ol.innerHTML = `
    <div style="background:var(--card);border-radius:14px;width:100%;max-width:480px;max-height:88vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--card);z-index:1;border-radius:14px 14px 0 0;">
        <h3 style="font-size:15px;font-weight:700;margin:0;">✏️ ${label} <span style="font-weight:400;color:var(--text-muted);">(max ${maxScore})</span></h3>
        <button onclick="document.getElementById('gb-scores-overlay').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer;">✕</button>
      </div>
      <div style="padding:8px 20px;">
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr>
            <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);">Student</th>
            <th style="padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted);">Score</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;position:sticky;bottom:0;background:var(--card);border-radius:0 0 14px 14px;">
        <button class="btn btn-secondary" onclick="document.getElementById('gb-scores-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="submitManualScores('${courseId}','${entryId}')">Save Scores</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
}

async function submitManualScores(courseId, entryId) {
  const inputs = document.querySelectorAll('#gb-scores-overlay input[data-student]');
  const scores = Array.from(inputs).map(inp => ({
    studentId: inp.dataset.student,
    score: inp.value !== '' ? inp.value : null,
  })).filter(s => s.score !== null);

  try {
    await api('/api/gradebook/course/' + courseId + '/manual-entry/' + entryId + '/scores', {
      method: 'PUT',
      body: JSON.stringify({ scores }),
    });
    document.getElementById('gb-scores-overlay').remove();
    toastSuccess('Scores saved ✓');
    renderLecturerCourseGrades(courseId, window._gbCourseTitle || '');
  } catch(e) {
    toastError(e.message);
  }
}

function confirmDeleteManualEntry(courseId, entryId) {
  toastConfirm('Delete this grade column? All scores will be lost.', async () => {
    try {
      await api('/api/gradebook/course/' + courseId + '/manual-entry/' + entryId, { method: 'DELETE' });
      toastSuccess('Column deleted');
      renderLecturerCourseGrades(courseId, window._gbCourseTitle || '');
    } catch(e) { toastError(e.message); }
  });
}

// ── CSV Export ────────────────────────────────────────────────────────────────
function exportGradeBookCSV(courseId, courseTitle) {
  const d = window._gbData;
  if (!d || !d.grades.length) { toastWarning('No grades to export'); return; }

  const manualCols = d.gradeBook.manualEntries.map(e => e.label);
  const header = ['Student Name', 'Student ID', 'Quiz %', 'Attendance %', ...manualCols, 'Final %', 'Grade'];

  const rows = d.grades.map(g => {
    const manual = d.gradeBook.manualEntries.map(e => {
      const ms = g.manualScores.find(m => m.entryId.toString() === e._id.toString());
      return ms?.score !== null && ms?.score !== undefined ? ms.score + '/' + e.maxScore : '';
    });
    return [g.student.name, g.student.studentId || g.student.email, g.quizPct+'%', g.attPct+'%', ...manual, g.finalPct+'%', g.letter];
  });

  const csv = [header, ...rows].map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = courseTitle.replace(/[^a-z0-9]/gi,'_') + '_grades.csv';
  a.click(); URL.revokeObjectURL(url);
}

// ── Announcements (server-backed) ───────────────────────────────────────────

async function loadAnnBadge() {
  try {
    if (currentUser?.role === 'employee') return;
    if (!['admin','superadmin','manager','lecturer','hod','student'].includes(currentUser?.role)) return;
    const data = await api('/api/announcements/unread-count');
    const badge = document.getElementById('ann-badge');
    if (!badge) return;
    if (data.count > 0) {
      badge.textContent = data.count > 99 ? '99+' : data.count;
      badge.style.display = 'inline-block';
    } else {
      badge.style.display = 'none';
    }
  } catch(_) {}
}



const ANN_COLORS = { info:'#6366f1', warning:'#f59e0b', success:'#22c55e', urgent:'#ef4444' };
const ANN_ICONS  = { info:'ℹ️', warning:'⚠️', success:'✅', urgent:'🚨' };
const ANN_CAN_POST = ['admin','superadmin','lecturer','manager','hod'];

async function renderAnnouncements() {
  const content = document.getElementById('main-content');
  if (!content) return;
  if (!isOnline()) {
    const cached = offlineRead('announcements');
    if (cached) {
      content.innerHTML = '<div style="background:#fef3c7;color:#92400e;padding:10px 16px;border-radius:8px;font-size:13px;margin-bottom:16px">📡 Offline — showing cached announcements</div>';
      _renderAnnouncementsHTML(content, cached);
    } else {
      content.innerHTML = '<div class="card" style="text-align:center;padding:32px"><div style="font-size:36px">📡</div><p style="margin-top:8px;color:var(--text-light)">No cached data. Connect once to view announcements offline.</p></div>';
    }
    return;
  }
  content.innerHTML = '<div class="loading">Loading announcements…</div>';
  try {
    const data = await api('/api/announcements');
    offlineCache('announcements', data);
    const anns = data.announcements || [];
    const canPost = ANN_CAN_POST.includes(currentUser.role);
    const isAdmin = ['admin','superadmin'].includes(currentUser.role);

    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
        <div>
          <h2>Announcements</h2>
          <p>Institution-wide notices and updates</p>
        </div>
        ${canPost ? `<button class="btn btn-primary" onclick="openPostAnnouncementModal()">＋ Post Announcement</button>` : ''}
      </div>
      <div id="ann-list">
        ${anns.length === 0
          ? '<div class="card"><div class="empty-state"><p>No announcements yet.</p></div></div>'
          : anns.map(a => annCard(a, canPost, isAdmin)).join('')}
      </div>`;

    // Mark all unread as read
    anns.filter(a => !a.isRead).forEach(a => {
      api('/api/announcements/' + a._id + '/read', { method: 'PATCH' }).catch(()=>{});
    });
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444;">Error: ${e.message}</p></div>`;
  }
}

function annCard(a, canPost, isAdmin) {
  const color = ANN_COLORS[a.type] || '#6366f1';
  const icon  = ANN_ICONS[a.type]  || 'ℹ️';
  const canDelete = isAdmin || (canPost && a.author?._id === (currentUser._id || currentUser.id));
  const audienceLabel = { all:'Everyone', students:'Students', employees:'Employees' }[a.audience] || 'Everyone';
  return `
    <div class="card" style="margin-bottom:12px;border-left:4px solid ${color};position:relative;${a.pinned?'background:linear-gradient(135deg,var(--card),#fefce8);':''}" id="ann-${a._id}">
      ${a.pinned ? '<div style="position:absolute;top:10px;right:12px;font-size:11px;color:#92400e;font-weight:700;background:#fef3c7;padding:2px 7px;border-radius:20px;">📌 Pinned</div>' : ''}
      <div style="display:flex;align-items:flex-start;gap:12px;">
        <div style="font-size:22px;flex-shrink:0;margin-top:2px;">${icon}</div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
            <span style="font-weight:700;font-size:15px;">${a.title}</span>
            ${!a.isRead ? '<span style="background:#6366f1;color:#fff;font-size:10px;padding:1px 7px;border-radius:20px;font-weight:700;">NEW</span>' : ''}
          </div>
          <div style="font-size:13px;color:var(--text-light);margin-bottom:10px;white-space:pre-wrap;line-height:1.6;">${a.body}</div>
          ${a.attachment ? (() => {
            const t = typeof token !== 'undefined' ? token : '';
            const src = `/api/announcements/attachment/${a.attachment.fileName}?token=${t}`;
            return a.attachment.mimeType?.startsWith('image/')
              ? `<div style="margin-bottom:10px;"><img src="${src}" alt="${esc(a.attachment.originalName)}" style="max-width:100%;max-height:220px;border-radius:8px;border:1px solid var(--border);object-fit:contain;cursor:pointer;" onclick="window.open('${src}','_blank')"></div>`
              : `<div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fef9f0;border:1px solid #fed7aa;border-radius:8px;font-size:12px;color:#c2410c;cursor:pointer;" onclick="window.open('${src}','_blank')"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> 📄 ${esc(a.attachment.originalName)} <span style="color:var(--text-muted);margin-left:4px;">(click to view)</span></div>`;
          })() : ''}
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:11px;color:var(--text-muted);">
            <span>👤 ${a.author?.name || 'Unknown'}</span>
            <span>📢 ${audienceLabel}</span>
            ${a.course ? `<span style="background:#ede9fe;color:#7c3aed;padding:1px 7px;border-radius:20px;font-weight:700;">📚 ${esc(a.course.title||'')}${a.course.level?' · L'+a.course.level:''}${a.course.group?' · Grp '+a.course.group:''}</span>` : ''}
            <span>🕐 ${new Date(a.createdAt).toLocaleString()}</span>
            ${a.readCount > 0 ? `<span>👁 ${a.readCount} read</span>` : ''}
          </div>
        </div>
        <div style="display:flex;gap:5px;flex-shrink:0;flex-direction:column;align-items:flex-end;">
          ${isAdmin ? `<button class="btn btn-sm btn-secondary" style="font-size:11px;padding:3px 8px;" onclick="annTogglePin('${a._id}')">${a.pinned?'Unpin':'📌 Pin'}</button>` : ''}
          ${canDelete ? `<button style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;padding:2px 4px;" onclick="annDelete('${a._id}')" title="Delete">×</button>` : ''}
        </div>
      </div>
    </div>`;
}

async function openPostAnnouncementModal() {
  const existing = document.getElementById('ann-post-overlay');
  if (existing) existing.remove();
  const isAdmin = ['admin','superadmin'].includes(currentUser.role);

  // Pre-fetch courses for lecturer/hod course selector
  let courses = [];
  if (currentUser.role === 'lecturer' || currentUser.role === 'hod') {
    try {
      const d = await api('/api/courses');
      courses = d.courses || d || [];
    } catch(e) { courses = []; }
  }
  const courseOptions = `<option value="">— All my students —</option>` +
    courses.map(c => `<option value="${c._id}">${esc(c.title)}${c.level?' · L'+c.level:''}${c.group?' · Grp '+c.group:''}</option>`).join('');

  const ol = document.createElement('div');
  ol.id = 'ann-post-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(3px)';
  ol.innerHTML = `
    <div style="background:var(--card);border-radius:14px;width:100%;max-width:520px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:var(--card);z-index:1;border-radius:14px 14px 0 0;">
        <h3 style="font-size:15px;font-weight:700;margin:0">📢 Post Announcement</h3>
        <button onclick="document.getElementById('ann-post-overlay').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer;font-size:13px;">✕</button>
      </div>
      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:13px;">
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Title *</label>
          <input id="ann-title" placeholder="e.g. Class cancelled tomorrow" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;outline:none;">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Message *</label>
          <textarea id="ann-body" rows="4" placeholder="Enter your announcement…" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none;"></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Type</label>
            <select id="ann-type" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
              <option value="info">ℹ️ Info</option>
              <option value="warning">⚠️ Warning</option>
              <option value="success">✅ Good News</option>
              <option value="urgent">🚨 Urgent</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Audience</label>
            ${currentUser.role === 'lecturer'
              ? `<input type="hidden" id="ann-audience" value="students">
                 <div style="padding:8px 12px;background:var(--bg);border:1.5px solid var(--border);border-radius:8px;font-size:13px;color:var(--text-light);">📚 My Students only</div>`
              : currentUser.role === 'hod'
              ? `<select id="ann-audience" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
                  <option value="all">Everyone</option>
                  <option value="students">Students only</option>
                  <option value="lecturers">Lecturers only</option>
                </select>`
              : `<select id="ann-audience" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
                  <option value="all">Everyone</option>
                  <option value="students">Students only</option>
                  ${currentUser?.company?.mode === 'academic'
                    ? '<option value="lecturers">Lecturers only</option>'
                    : '<option value="employees">Employees only</option>'
                  }
                </select>`
            }
          </div>
        </div>
        ${currentUser.role === 'lecturer' ? `
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Target Course <span style="font-weight:400;text-transform:none">(optional)</span></label>
          <select id="ann-course" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
            ${courseOptions}
          </select>
          <p style="font-size:11px;color:var(--text-muted);margin-top:3px">Pick a course to target only that group. Leave blank to reach all your students.</p>
        </div>` : '<input type="hidden" id="ann-course" value="">'}
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:5px;display:block;">Expires At <span style="font-weight:400;text-transform:none;">(optional)</span></label>
          <input id="ann-expires" type="datetime-local" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;">
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:6px;display:block;">Attachment <span style="font-weight:400;text-transform:none;">(PDF or image, optional)</span></label>
          <input type="file" id="ann-file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif" style="display:none" onchange="annPreviewFile(this)">
          <div style="display:flex;align-items:center;gap:8px;">
            <button type="button" onclick="document.getElementById('ann-file').click()" style="display:flex;align-items:center;gap:6px;padding:7px 13px;border:1.5px dashed var(--border);border-radius:8px;background:var(--bg);cursor:pointer;font-size:12px;font-weight:600;color:var(--text-light);transition:.15s" onmouseover="this.style.borderColor='var(--primary)';this.style.color='var(--primary)'" onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-light)'">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
              📎 Attach File
            </button>
            <span id="ann-file-name" style="font-size:12px;color:var(--text-muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"></span>
            <button id="ann-file-clear" type="button" onclick="annClearFile()" style="display:none;background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:16px;padding:2px 5px;line-height:1;">×</button>
          </div>
          <div id="ann-file-preview" style="margin-top:8px;display:none;"></div>
        </div>
        ${isAdmin ? `
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500;">
          <input type="checkbox" id="ann-pinned" style="accent-color:var(--primary);width:15px;height:15px;">
          📌 Pin this announcement to the top
        </label>` : ''}
        <div id="ann-post-err" style="display:none;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:7px;color:#dc2626;font-size:12px;font-weight:500;"></div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;position:sticky;bottom:0;background:var(--card);border-radius:0 0 14px 14px;">
        <button class="btn btn-secondary" onclick="document.getElementById('ann-post-overlay').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="submitAnnouncement()">📢 Post</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
}

function annPreviewFile(input) {
  const file = input.files[0];
  if (!file) return;
  document.getElementById('ann-file-name').textContent = file.name;
  document.getElementById('ann-file-clear').style.display = 'inline';
  const preview = document.getElementById('ann-file-preview');
  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    preview.innerHTML = `<img src="${url}" style="max-width:100%;max-height:160px;border-radius:8px;border:1px solid var(--border);object-fit:contain;">`;
    preview.style.display = 'block';
  } else {
    preview.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:12px;color:#dc2626;"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg> ${file.name}</div>`;
    preview.style.display = 'block';
  }
}

function annClearFile() {
  const input = document.getElementById('ann-file');
  if (input) input.value = '';
  document.getElementById('ann-file-name').textContent = '';
  document.getElementById('ann-file-clear').style.display = 'none';
  const preview = document.getElementById('ann-file-preview');
  if (preview) { preview.innerHTML = ''; preview.style.display = 'none'; }
}

async function submitAnnouncement() {
  const title    = document.getElementById('ann-title')?.value?.trim();
  const body     = document.getElementById('ann-body')?.value?.trim();
  const type     = document.getElementById('ann-type')?.value || 'info';
  const audience = document.getElementById('ann-audience')?.value || 'all';
  const expiresAt= document.getElementById('ann-expires')?.value || null;
  const pinned   = document.getElementById('ann-pinned')?.checked || false;
  const courseId = document.getElementById('ann-course')?.value || null;
  const fileInput = document.getElementById('ann-file');
  const file     = fileInput?.files?.[0] || null;
  const errEl    = document.getElementById('ann-post-err');

  if (!title || !body) {
    if (errEl) { errEl.textContent = 'Title and message are required.'; errEl.style.display = 'block'; }
    return;
  }
  try {
    const fd = new FormData();
    fd.append('title', title);
    fd.append('body', body);
    fd.append('type', type);
    fd.append('audience', audience);
    fd.append('pinned', pinned ? 'true' : 'false');
    if (expiresAt) fd.append('expiresAt', new Date(expiresAt).toISOString());
    if (courseId) fd.append('courseId', courseId);
    if (file) fd.append('attachment', file);

    await apiUpload('/api/announcements', fd);
    document.getElementById('ann-post-overlay')?.remove();
    toastSuccess('Announcement posted ✓');
    renderAnnouncements();
  } catch(e) {
    if (errEl) { errEl.textContent = e.message || 'Failed to post'; errEl.style.display = 'block'; }
  }
}

async function annDelete(id) {
  toastConfirm('Delete this announcement?', async () => {
    try {
      await api('/api/announcements/' + id, { method: 'DELETE' });
      document.getElementById('ann-' + id)?.remove();
      toastSuccess('Announcement deleted');
    } catch(e) { toastError('Delete failed'); }
  });
}

async function annTogglePin(id) {
  try {
    const data = await api('/api/announcements/' + id + '/pin', { method: 'PATCH' });
    toastSuccess(data.pinned ? 'Pinned ✓' : 'Unpinned');
    renderAnnouncements();
  } catch(e) { toastError('Failed to update pin'); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  FEATURE: SESSION ATTENDANCE CSV EXPORT
// ══════════════════════════════════════════════════════════════════════════════
async function exportSessionCSV(sessionId, sessionTitle) {
  try {
    const data = await api('/api/attendance-sessions/' + sessionId + '/records');
    const records = data.records || [];
    if (!records.length) { toastWarning('No attendance records to export'); return; }

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
  } catch(e) { toastError('Export failed: ' + e.message); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  FEATURE: ABOUT / VERSION PAGE
// ══════════════════════════════════════════════════════════════════════════════
function renderAbout() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = `
    <div class="page-header"><h2>About</h2><p>KODEX Platform</p></div>
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
        <span style="font-size:12px">&copy; 2026 KODEX. All rights reserved.</span>
      </div>
    </div>
  `;
}



// ── Dark Mode ──────────────────────────────────────────────────────────────────
function initDarkMode() {
  const saved = localStorage.getItem('kodex_theme');
  if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
}

function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('kodex_theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('kodex_theme', 'dark');
  }
  // Update toggle button icon if present
  const btn = document.getElementById('dark-mode-btn');
  if (btn) btn.textContent = isDark ? '🌙' : '☀️';
}

// Call on load
initDarkMode();

// ── Profile Photo Upload ───────────────────────────────────────────────────────
async function uploadProfilePhoto(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showToastNotif('Image must be under 2MB', 'error'); return; }

  // Convert to base64
  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64 = e.target.result;
    try {
      const data = await api('/api/auth/profile', { method: 'PUT', body: JSON.stringify({ profilePhoto: base64 }) });
      currentUser.profilePhoto = base64;
      // Update avatar display
      const avatar = document.getElementById('profile-avatar');
      if (avatar) avatar.innerHTML = `<img src="${base64}" style="width:100%;height:100%;object-fit:cover">`;
      showToastNotif('Profile photo updated!', 'success');
    } catch(e) { showToastNotif('Failed to upload photo: ' + e.message, 'error'); }
  };
  reader.readAsDataURL(file);
}

// ── Push Notifications ─────────────────────────────────────────────────────────
async function requestPushPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;
  const permission = await Notification.requestPermission();
  return permission === 'granted';
}

async function showLocalNotification(title, body, url) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') {
    const granted = await requestPushPermission();
    if (!granted) return;
  }
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  if (reg) {
    reg.showNotification(title, { body, icon: '/icons/icon-192.png', data: { url: url || '/' } });
  } else {
    new Notification(title, { body });
  }
}

// ── Bulk Email to Course Students ──────────────────────────────────────────────
function openBulkEmailModal(courseId, courseName) {
  const existing = document.getElementById('bulk-email-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'bulk-email-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--card);border-radius:16px;padding:28px;width:100%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:4px">📧 Email Students</h3>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px">${courseName}</p>
      <div class="form-group">
        <label>Subject</label>
        <input type="text" id="bulk-email-subject" placeholder="e.g. Assignment reminder">
      </div>
      <div class="form-group">
        <label>Message</label>
        <textarea id="bulk-email-body" rows="5" placeholder="Your message to all students in this course…" style="width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:9px;font-size:14px;font-family:inherit;resize:vertical"></textarea>
      </div>
      <div id="bulk-email-status" style="display:none;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="document.getElementById('bulk-email-modal').remove()">Cancel</button>
        <button class="btn btn-primary" onclick="sendBulkEmail('${courseId}')">Send to All Students</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function sendBulkEmail(courseId) {
  const subject = document.getElementById('bulk-email-subject')?.value?.trim();
  const message = document.getElementById('bulk-email-body')?.value?.trim();
  const status = document.getElementById('bulk-email-status');
  if (!subject || !message) { 
    status.textContent = 'Please enter subject and message.';
    status.style.cssText = 'display:block;background:#fef2f2;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px';
    return;
  }
  try {
    const data = await api(`/api/courses/${courseId}/email-students`, { method: 'POST', body: JSON.stringify({ subject, message }) });
    status.textContent = `✓ Email sent to ${data.sentCount} student(s)`;
    status.style.cssText = 'display:block;background:#f0fdf4;color:#15803d;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px';
    setTimeout(() => document.getElementById('bulk-email-modal')?.remove(), 2000);
  } catch(e) {
    status.textContent = 'Failed: ' + e.message;
    status.style.cssText = 'display:block;background:#fef2f2;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px';
  }
}


// ── Bulk SMS to students ──────────────────────────────────────────────────────
function openBulkSmsModal(courseId, courseName) {
  const existing = document.getElementById('bulk-sms-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'bulk-sms-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = `
    <div style="background:var(--card);border-radius:16px;padding:28px;width:100%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,.3)">
      <h3 style="font-size:16px;font-weight:700;margin-bottom:4px">💬 SMS Students</h3>
      <p style="font-size:13px;color:var(--text-muted);margin-bottom:20px">${courseName} — students with phone numbers only</p>
      <div class="form-group">
        <label>Message <span style="font-weight:400;color:var(--text-muted);font-size:12px">(max 160 characters)</span></label>
        <textarea id="bulk-sms-body" rows="4" maxlength="160" placeholder="e.g. Class cancelled today. See you next week."
          style="width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:9px;font-size:14px;font-family:inherit;resize:vertical"
          oninput="document.getElementById('sms-char-count').textContent=(160-this.value.length)+' remaining'"></textarea>
        <div id="sms-char-count" style="font-size:11px;color:var(--text-muted);text-align:right;margin-top:3px">160 remaining</div>
      </div>
      <div id="bulk-sms-status" style="display:none;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button class="btn btn-secondary" onclick="document.getElementById('bulk-sms-modal').remove()">Cancel</button>
        <button class="btn btn-primary" style="background:#10b981;border-color:#10b981" onclick="sendBulkSms('${courseId}')">Send SMS to All Students</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

async function sendBulkSms(courseId) {
  const message = document.getElementById('bulk-sms-body')?.value?.trim();
  const status  = document.getElementById('bulk-sms-status');
  if (!message) {
    status.textContent = 'Please enter a message.';
    status.style.cssText = 'display:block;background:#fef2f2;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px';
    return;
  }
  if (message.length > 160) {
    status.textContent = 'Message too long — max 160 characters.';
    status.style.cssText = 'display:block;background:#fef2f2;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px';
    return;
  }
  try {
    const data = await api(`/api/courses/${courseId}/sms-students`, { method: 'POST', body: JSON.stringify({ message }) });
    status.textContent = `✓ SMS sent to ${data.sentCount} student(s)`;
    status.style.cssText = 'display:block;background:#f0fdf4;color:#15803d;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px';
    setTimeout(() => document.getElementById('bulk-sms-modal')?.remove(), 2000);
  } catch(e) {
    status.textContent = 'Failed: ' + e.message;
    status.style.cssText = 'display:block;background:#fef2f2;color:#dc2626;padding:10px 14px;border-radius:8px;font-size:13px;margin-bottom:12px';
  }
}


// ── Export to Excel (uses SheetJS via CDN) ────────────────────────────────────
async function exportAttendanceToExcel(sessionId, sessionTitle) {
  try {
    showToastNotif('Preparing Excel file…', 'info');
    const data = await api(`/api/attendance-sessions/${sessionId}/records`);
    const records = data.records || [];

    // Load SheetJS dynamically
    if (!window.XLSX) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const rows = [['Student Name', 'Student ID', 'Status', 'Method', 'Check-in Time', 'Course']];
    records.forEach(r => {
      rows.push([
        r.student?.name || '—',
        r.student?.indexNumber || r.student?.employeeId || '—',
        r.status,
        r.method,
        r.checkInTime ? new Date(r.checkInTime).toLocaleString() : '—',
        r.session?.course?.title || '—',
      ]);
    });

    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

    // Style header row
    const range = window.XLSX.utils.decode_range(ws['!ref']);
    for (let C = range.s.c; C <= range.e.c; C++) {
      const cell = ws[window.XLSX.utils.encode_cell({ r: 0, c: C })];
      if (cell) cell.s = { font: { bold: true }, fill: { fgColor: { rgb: 'E0E7FF' } } };
    }
    ws['!cols'] = [{ wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 22 }, { wch: 20 }];

    const filename = `Attendance_${(sessionTitle || 'session').replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
    window.XLSX.writeFile(wb, filename);
    showToastNotif('Excel file downloaded!', 'success');
  } catch(e) {
    showToastNotif('Export failed: ' + e.message, 'error');
  }
}

async function exportAllAttendanceToExcel() {
  try {
    showToastNotif('Preparing Excel file…', 'info');
    const data = await api('/api/attendance-sessions/my-attendance?limit=500');
    const records = data.records || [];

    if (!window.XLSX) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }

    const rows = [['Session', 'Date', 'Status', 'Method']];
    records.forEach(r => {
      rows.push([
        r.session?.title || '—',
        r.checkInTime ? new Date(r.checkInTime).toLocaleDateString() : '—',
        r.status,
        r.method,
      ]);
    });

    const ws = window.XLSX.utils.aoa_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'My Attendance');
    ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }, { wch: 15 }];
    window.XLSX.writeFile(wb, `My_Attendance_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToastNotif('Excel file downloaded!', 'success');
  } catch(e) {
    showToastNotif('Export failed: ' + e.message, 'error');
  }
}


// ── Timetable — Lecturer (editable) & Student (read-only) ─────────────────────

const TIMETABLE_DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const TIMETABLE_DAYS_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const TIMETABLE_COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#14b8a6'];

function _timetableGrid(slots, canEdit) {
  // Show Mon-Sat (1-6) only — skip Sunday unless there are Sunday slots
  const hasSunday = slots.some(s => s.dayOfWeek === 0);
  const daysToShow = hasSunday ? [0,1,2,3,4,5,6] : [1,2,3,4,5,6];
  const today = new Date().getDay();

  return `
    <div style="display:grid;grid-template-columns:${daysToShow.map(()=>'1fr').join(' ')};gap:8px;margin-bottom:20px;">
      ${daysToShow.map(d => `
        <div style="text-align:center;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;
            color:${d===today?'var(--primary)':'var(--text-muted)'};
            margin-bottom:8px;padding-bottom:6px;border-bottom:2px solid ${d===today?'var(--primary)':'var(--border)'}">
            ${TIMETABLE_DAYS_SHORT[d]}
          </div>
          ${slots.filter(s=>s.dayOfWeek===d).sort((a,b)=>a.startTime.localeCompare(b.startTime)).map(s=>`
            <div style="background:${s.color}18;border-left:3px solid ${s.color};border-radius:6px;
              padding:8px 10px;margin-bottom:6px;text-align:left;position:relative;cursor:${canEdit?'pointer':'default'}"
              ${canEdit ? `onclick="openEditSlotModal('${s._id}')"` : ''}>
              <div style="font-size:12px;font-weight:700;color:${s.color};margin-bottom:2px;">
                ${s.startTime} – ${s.endTime}
              </div>
              <div style="font-size:12px;font-weight:600;color:var(--text-primary);line-height:1.3;">
                ${esc(s.title || s.course?.title || 'Class')}
              </div>
              ${s.course?.code ? `<div style="font-size:10px;color:var(--text-muted);">${esc(s.course.code)}</div>` : ''}
              ${s.room ? `<div style="font-size:10px;color:var(--text-muted);">📍 ${esc(s.room)}</div>` : ''}
              ${!canEdit && s.lecturer?.name ? `<div style="font-size:10px;color:var(--text-muted);">👤 ${esc(s.lecturer.name)}</div>` : ''}
              ${canEdit ? `<button onclick="event.stopPropagation();deleteSlot('${s._id}')"
                style="position:absolute;top:4px;right:4px;background:none;border:none;cursor:pointer;
                color:var(--text-muted);font-size:14px;line-height:1;padding:2px;">×</button>` : ''}
            </div>
          `).join('')}
          ${canEdit ? `
            <button onclick="openAddSlotModal(${d})"
              style="width:100%;padding:6px;background:transparent;border:1.5px dashed var(--border);
              border-radius:6px;font-size:11px;color:var(--text-muted);cursor:pointer;margin-top:2px">
              + Add
            </button>` : ''}
        </div>
      `).join('')}
    </div>`;
}

let _timetableSlots = [];
let _timetableCourses = [];

async function renderLecturerTimetable() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading timetable…</div>';
  try {
    const [slotData, courseData] = await Promise.all([
      api('/api/timetable'),
      api('/api/courses').catch(() => api('/api/lecturer/quizzes').then(d => ({ courses: [] })).catch(() => ({ courses: [] }))),
    ]);
    _timetableSlots   = slotData.slots   || [];
    _timetableCourses = (courseData.courses || courseData || []);

    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px">
        <div>
          <h2>My Schedule</h2>
          <p>Your weekly class timetable — click any slot to edit, + to add a new class</p>
        </div>
        <button class="btn btn-primary" onclick="openAddSlotModal()">+ Add Class</button>
      </div>
      ${_timetableSlots.length === 0
        ? `<div class="card" style="text-align:center;padding:40px">
            <div style="font-size:48px;margin-bottom:12px">📅</div>
            <p style="color:var(--text-muted);margin-bottom:16px">No classes scheduled yet. Add your first class to get started.</p>
            <button class="btn btn-primary" onclick="openAddSlotModal()">+ Add Your First Class</button>
          </div>`
        : `<div class="card" style="overflow-x:auto">${_timetableGrid(_timetableSlots, true)}</div>`
      }`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger)">Error: ${e.message}</p></div>`;
  }
}

async function renderStudentTimetable() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading timetable…</div>';
  try {
    const slotData = await api('/api/timetable');
    const slots = slotData.slots || [];
    content.innerHTML = `
      <div class="page-header">
        <h2>My Schedule</h2>
        <p>Your weekly class timetable based on your enrolled courses</p>
      </div>
      ${slots.length === 0
        ? `<div class="card" style="text-align:center;padding:40px">
            <div style="font-size:48px">📅</div>
            <p style="margin-top:12px;color:var(--text-muted)">No classes scheduled yet. Your lecturers haven't added timetable slots yet.</p>
          </div>`
        : `<div class="card" style="overflow-x:auto">${_timetableGrid(slots, false)}</div>`
      }`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger)">Error: ${e.message}</p></div>`;
  }
}

function openAddSlotModal(presetDay) { _openSlotModal(null, presetDay); }
async function openEditSlotModal(slotId) {
  const slot = _timetableSlots.find(s => s._id === slotId);
  if (!slot) return;
  _openSlotModal(slot);
}

function _openSlotModal(slot, presetDay) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  const isEdit = !!slot;
  const colorOptions = TIMETABLE_COLORS.map(c =>
    `<span onclick="document.getElementById('slot-color').value='${c}';document.querySelectorAll('.color-dot').forEach(d=>d.style.outline='none');this.style.outline='3px solid ${c}';this.style.outlineOffset='2px'"
      class="color-dot" style="display:inline-block;width:22px;height:22px;border-radius:50%;background:${c};cursor:pointer;margin:2px;
      ${slot?.color===c||(!slot&&c==='#6366f1')?'outline:3px solid '+c+';outline-offset:2px':''}"></span>`
  ).join('');

  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:420px">
        <h3 style="margin:0 0 16px">${isEdit ? 'Edit Class Slot' : 'Add Class to Timetable'}</h3>

        <div class="form-group">
          <label>Course <span style="color:red">*</span></label>
          <select id="slot-course" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
            <option value="">Select a course…</option>
            ${_timetableCourses.map(c=>`<option value="${c._id}" ${slot?.course?._id===c._id||slot?.course===c._id?'selected':''}>${esc(c.title)}${c.code?' ('+c.code+')':''}${c.level?' · L'+c.level:''}${c.group?' · '+c.group:''}</option>`).join('')}
          </select>
        </div>

        <div class="form-group">
          <label>Day <span style="color:red">*</span></label>
          <select id="slot-day" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
            ${TIMETABLE_DAYS.map((d,i)=>`<option value="${i}" ${(slot?.dayOfWeek===i||(presetDay===i&&!slot))?'selected':''}>${d}</option>`).join('')}
          </select>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group">
            <label>Start Time <span style="color:red">*</span></label>
            <input type="time" id="slot-start" value="${slot?.startTime||'08:00'}"
              style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
          </div>
          <div class="form-group">
            <label>End Time <span style="color:red">*</span></label>
            <input type="time" id="slot-end" value="${slot?.endTime||'10:00'}"
              style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
          </div>
        </div>

        <div class="form-group">
          <label>Room / Venue <span style="font-weight:400;color:var(--text-muted)">(optional)</span></label>
          <input type="text" id="slot-room" value="${slot?.room||''}" placeholder="e.g. LT3, Room 204, Online"
            style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
        </div>

        <div class="form-group">
          <label>Colour</label>
          <div style="margin-bottom:6px">${colorOptions}</div>
          <input type="hidden" id="slot-color" value="${slot?.color||'#6366f1'}">
        </div>

        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          ${isEdit ? `<button class="btn btn-danger btn-sm" onclick="deleteSlot('${slot._id}')">Delete</button>` : ''}
          <button class="btn btn-primary btn-sm" onclick="saveSlot(${isEdit?`'${slot._id}'`:'null'})">${isEdit?'Save Changes':'Add to Timetable'}</button>
        </div>
      </div>
    </div>`;
}

async function saveSlot(slotId) {
  const courseId  = document.getElementById('slot-course').value;
  const dayOfWeek = document.getElementById('slot-day').value;
  const startTime = document.getElementById('slot-start').value;
  const endTime   = document.getElementById('slot-end').value;
  const room      = document.getElementById('slot-room').value.trim();
  const color     = document.getElementById('slot-color').value;

  if (!courseId) { toastWarning('Please select a course'); return; }
  if (!startTime || !endTime) { toastWarning('Please set start and end time'); return; }
  if (startTime >= endTime) { toastWarning('End time must be after start time'); return; }

  try {
    const body = { courseId, dayOfWeek: Number(dayOfWeek), startTime, endTime, room, color };
    if (slotId) {
      await api(`/api/timetable/${slotId}`, { method: 'PUT', body: JSON.stringify(body) });
      showToastNotif('Class updated', 'success');
    } else {
      await api('/api/timetable', { method: 'POST', body: JSON.stringify(body) });
      showToastNotif('Class added to timetable', 'success');
    }
    closeModal();
    renderLecturerTimetable();
  } catch(e) {
    toastError(e.message);
  }
}

async function deleteSlot(slotId) {
  if (!confirm('Remove this class from your timetable?')) return;
  try {
    await api(`/api/timetable/${slotId}`, { method: 'DELETE' });
    showToastNotif('Class removed', 'success');
    closeModal();
    renderLecturerTimetable();
  } catch(e) {
    toastError(e.message);
  }
}


// ── Two-Factor Authentication (2FA) via Email ────────────────────────────────
// Simple email-based 2FA — sends a 6-digit code after password verification
// Stored in sessionStorage so it clears when browser closes

async function initiate2FA(credentials) {
  // Login with password first
  const data = await api('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
  if (!data.token) throw new Error('Login failed');

  // If 2FA not enabled, return immediately — normal login
  if (!data.user?.twoFactorEnabled) return data;

  // 2FA required — send code (non-fatal if email is slow)
  try {
    await api('/api/auth/2fa/send', { method: 'POST', headers: { Authorization: 'Bearer ' + data.token } });
  } catch(e) {
    console.error('2FA send failed:', e.message);
    throw new Error('Failed to send 2FA code. Please try again.');
  }

  // Block everything behind modal — resolve only after successful verify
  return new Promise((resolve, reject) => {
    // Remove any existing 2FA modal
    document.getElementById('kodex-2fa-modal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'kodex-2fa-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px';
    modal.innerHTML = `
      <div style="background:#fff;border-radius:16px;padding:32px;width:100%;max-width:360px;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="font-size:44px;margin-bottom:12px">🔐</div>
        <h3 style="font-size:17px;font-weight:700;margin-bottom:8px;color:#111">Two-Factor Authentication</h3>
        <p style="font-size:13px;color:#6b7280;margin-bottom:20px">A 6-digit code was sent to<br><strong style="color:#111">${data.user.email}</strong></p>
        <input type="text" id="kodex-2fa-input" placeholder="Enter 6-digit code" maxlength="6" inputmode="numeric"
          style="width:100%;padding:14px;border:1.5px solid #d1d5db;border-radius:10px;font-size:22px;text-align:center;letter-spacing:10px;font-family:monospace;outline:none;margin-bottom:8px;color:#111;background:#fff">
        <div id="kodex-2fa-err" style="color:#dc2626;font-size:13px;margin-bottom:12px;min-height:20px"></div>
        <button id="kodex-2fa-btn" onclick="window._kodex2faVerify('${data.token}')"
          style="width:100%;padding:13px;background:#4f46e5;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;margin-bottom:8px">
          Verify
        </button>
        <button onclick="document.getElementById('kodex-2fa-modal').remove();window._kodex2faReject(new Error('2FA cancelled'))"
          style="width:100%;padding:10px;background:transparent;border:none;color:#9ca3af;font-size:13px;cursor:pointer">
          Cancel
        </button>
      </div>`;
    document.body.appendChild(modal);

    window._kodex2faResolve = resolve;
    window._kodex2faReject  = reject;
    window._kodex2faData    = data;

    const input = document.getElementById('kodex-2fa-input');
    input.focus();
    input.addEventListener('keydown', e => { if (e.key === 'Enter') window._kodex2faVerify(data.token); });
  });
}

async function _kodex2faVerify(tempToken) {
  window._kodex2faVerify = _kodex2faVerify; // make global
  const input = document.getElementById('kodex-2fa-input');
  const errEl = document.getElementById('kodex-2fa-err');
  const btn   = document.getElementById('kodex-2fa-btn');
  const code  = input?.value?.trim();

  if (!code || code.length !== 6) {
    if (errEl) errEl.textContent = 'Please enter the 6-digit code';
    return;
  }

  if (btn) { btn.textContent = 'Verifying…'; btn.disabled = true; }
  if (errEl) errEl.textContent = '';

  try {
    const result = await api('/api/auth/2fa/verify', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tempToken },
      body: JSON.stringify({ code }),
    });
    document.getElementById('kodex-2fa-modal')?.remove();
    const finalData = { ...window._kodex2faData, token: result.token || tempToken };
    window._kodex2faResolve?.(finalData);
  } catch(e) {
    if (errEl) errEl.textContent = e.message || 'Invalid code — please try again';
    if (btn) { btn.textContent = 'Verify'; btn.disabled = false; }
    input?.focus();
    input?.select();
  }
}
window._kodex2faVerify = _kodex2faVerify;


// ── Branding: Preview login page ─────────────────────────────────────────────
function previewLoginPage() {
  const logo  = document.getElementById('bd-logo')?.value || '';
  const color = document.getElementById('bd-color')?.value || '#6366f1';
  const tag   = document.getElementById('bd-tagline')?.value || 'Powered by KODEX';
  const name  = currentUser.company?.name || 'Your Institution';
  const code  = currentUser.company?.institutionCode || '——';

  const modal = document.getElementById('modal-container');
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:480px;padding:0;overflow:hidden;border-radius:16px">
        <!-- Preview header -->
        <div style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:12px;font-weight:700;color:#64748b">LOGIN PAGE PREVIEW</span>
          <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:#64748b;font-size:18px;line-height:1">×</button>
        </div>
        <!-- Simulated login page -->
        <div style="background:#0d1117;padding:32px;display:flex;align-items:center;justify-content:center;min-height:400px">
          <div style="background:#fff;border-radius:14px;padding:28px;width:100%;max-width:340px;box-shadow:0 20px 60px rgba(0,0,0,.4)">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
              ${logo
                ? `<img src="${logo}" style="height:40px;width:auto;border-radius:8px" onerror="this.style.display='none'">`
                : `<div style="width:40px;height:40px;border-radius:10px;background:${color};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:18px">${name[0]}</div>`}
              <div>
                <div style="font-size:16px;font-weight:800;color:#0d1117">${esc(name)}</div>
                <div style="font-size:11px;color:#6b7280">${esc(tag)}</div>
              </div>
            </div>
            <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Email</div>
            <div style="padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;color:#9ca3af;margin-bottom:12px">admin@example.com</div>
            <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px">Password</div>
            <div style="padding:10px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;color:#9ca3af;margin-bottom:16px">••••••••</div>
            <div style="padding:12px;background:${color};color:#fff;border-radius:8px;text-align:center;font-size:14px;font-weight:700">Sign In</div>
            <div style="text-align:center;margin-top:12px;font-size:11px;color:#9ca3af">Institution Code: <span style="font-family:monospace;font-weight:700;color:#374151">${code}</span></div>
          </div>
        </div>
      </div>
    </div>`;
}


// ── Math rendering helper (MathJax already loaded in index.html) ─────────────
function renderMath(container) {
  if (!window.MathJax) return;
  try {
    const el = container || document.getElementById('main-content') || document.body;
    if (MathJax.typesetPromise) {
      MathJax.typesetPromise([el]).catch(() => {});
    } else if (MathJax.Hub) {
      MathJax.Hub.Queue(['Typeset', MathJax.Hub, el]);
    }
  } catch(e) {}
}



function updateMathPreview(inputId, previewId) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!input || !preview) return;
  const val = input.value.trim();
  if (!val || (!val.includes('\\(') && !val.includes('\\[') && !val.includes('$'))) {
    preview.style.display = 'none';
    return;
  }
  preview.style.display = 'block';
  preview.innerHTML = '<span style="font-size:10px;color:#6b7280;font-weight:600">PREVIEW: </span>' + val;
  renderMath(preview);
}

// ── Math Symbol Toolbar ───────────────────────────────────────────────────────
function insertMathSymbol(targetId, sym) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const start = el.selectionStart;
  const end   = el.selectionEnd;
  const val   = el.value;
  // Wrap selection in \( ... \) if no math delimiters around cursor
  let insert = sym;
  el.value = val.slice(0, start) + insert + val.slice(end);
  el.selectionStart = el.selectionEnd = start + insert.length;
  el.focus();
}

function wrapMath(targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const start = el.selectionStart;
  const end   = el.selectionEnd;
  const sel   = el.value.slice(start, end);
  const wrap  = sel ? '\\(' + sel + '\\)' : '\\(  \\)';
  el.value = el.value.slice(0, start) + wrap + el.value.slice(end);
  const pos = sel ? start + wrap.length : start + 3;
  el.selectionStart = el.selectionEnd = pos;
  el.focus();
}

function getMathToolbar(targetId) {
  const syms = [
    { label: '\\( \\)', tip: 'Wrap in math', action: `wrapMath('${targetId}')` },
    { label: 'x²', tip: 'Superscript', sym: '^{2}' },
    { label: 'xₙ', tip: 'Subscript', sym: '_{n}' },
    { label: '√', tip: 'Square root', sym: '\\sqrt{}' },
    { label: '∛', tip: 'Cube root', sym: '\\sqrt[3]{}' },
    { label: 'a/b', tip: 'Fraction', sym: '\\frac{}{}' },
    { label: '∑', tip: 'Summation', sym: '\\sum_{}^{}' },
    { label: '∫', tip: 'Integral', sym: '\\int_{}^{}' },
    { label: 'π', tip: 'Pi', sym: '\\pi' },
    { label: '∞', tip: 'Infinity', sym: '\\infty' },
    { label: '±', tip: 'Plus-minus', sym: '\\pm' },
    { label: '≤', tip: 'Less or equal', sym: '\\leq' },
    { label: '≥', tip: 'Greater or equal', sym: '\\geq' },
    { label: '≠', tip: 'Not equal', sym: '\\neq' },
    { label: 'α', tip: 'Alpha', sym: '\\alpha' },
    { label: 'β', tip: 'Beta', sym: '\\beta' },
    { label: 'θ', tip: 'Theta', sym: '\\theta' },
    { label: 'Δ', tip: 'Delta', sym: '\\Delta' },
    { label: '×', tip: 'Multiply', sym: '\\times' },
    { label: '÷', tip: 'Divide', sym: '\\div' },
  ];
  return `
    <div style="margin-bottom:8px">
      <div style="font-size:11px;color:#6b7280;margin-bottom:4px;font-weight:600">MATH SYMBOLS — click to insert</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${syms.map(s => s.action
          ? `<button type="button" title="${s.tip}" onclick="${s.action}" style="padding:3px 8px;border:1px solid #d1d5db;border-radius:5px;background:#f9fafb;font-size:12px;cursor:pointer;font-family:inherit">${s.label}</button>`
          : `<button type="button" title="${s.tip}" onclick="insertMathSymbol('${targetId}','${s.sym}')" style="padding:3px 8px;border:1px solid #d1d5db;border-radius:5px;background:#f9fafb;font-size:12px;cursor:pointer;font-family:inherit">${s.label}</button>`
        ).join('')}
      </div>
    </div>`;
}

// ── Bulk Excel Student Import ─────────────────────────────────────────────────
function openExcelImportModal(courseId, courseName) {
  const existing = document.getElementById('excel-import-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'excel-import-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1000;display:flex;align-items:center;justify-content:center;padding:20px';
  modal.innerHTML = '<div style="background:var(--card);border-radius:16px;padding:28px;width:100%;max-width:520px;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
    '<h3 style="font-size:16px;font-weight:700;margin-bottom:4px">📊 Import Students from Excel</h3>' +
    '<p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">' + courseName + '</p>' +
    '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 14px;margin-bottom:16px;font-size:12px;color:#15803d">' +
      '<strong>Excel format required:</strong><br>' +
      'Column A = Student ID &nbsp;|&nbsp; Column B = Full Name &nbsp;|&nbsp; Column C = Email (optional)<br>' +
      'First row can be a header — it will be skipped automatically.' +
    '</div>' +
    '<div id="excel-drop-zone" style="border:2px dashed var(--border);border-radius:10px;padding:32px;text-align:center;cursor:pointer;margin-bottom:16px"' +
      ' onclick="document.getElementById(\'excel-file-input\').click()"' +
      ' ondragover="event.preventDefault();this.style.borderColor=\'var(--primary)\'"' +
      ' ondragleave="this.style.borderColor=\'var(--border)\'"' +
      ' ondrop="handleExcelDrop(event,\'' + courseId + '\')">' +
      '<div style="font-size:32px;margin-bottom:8px">📂</div>' +
      '<div style="font-weight:600;font-size:14px">Drop Excel file here or click to browse</div>' +
      '<div style="font-size:12px;color:var(--text-muted);margin-top:4px">.xlsx or .xls files only</div>' +
    '</div>' +
    '<input type="file" id="excel-file-input" accept=".xlsx,.xls" style="display:none" onchange="processExcelFile(this.files[0],\'' + courseId + '\')">' +
    '<div id="excel-preview" style="display:none;margin-bottom:16px">' +
      '<div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px">PREVIEW (first 5 students)</div>' +
      '<div id="excel-preview-table"></div>' +
      '<div id="excel-count" style="font-size:13px;color:var(--primary);font-weight:600;margin-top:8px"></div>' +
    '</div>' +
    '<div id="excel-msg" style="display:none;margin-bottom:12px;padding:10px 14px;border-radius:8px;font-size:13px"></div>' +
    '<div style="display:flex;gap:8px">' +
      '<button onclick="document.getElementById(\'excel-import-modal\').remove()" style="flex:1;padding:10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;background:transparent;color:var(--text)">Cancel</button>' +
      '<button id="excel-import-btn" onclick="uploadExcelStudents(\'' + courseId + '\')" disabled style="flex:2;padding:10px;background:var(--primary);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;opacity:.5">Import Students</button>' +
    '</div></div>';
  document.body.appendChild(modal);
}

let _excelStudents = [];

function handleExcelDrop(e, courseId) {
  e.preventDefault();
  document.getElementById('excel-drop-zone').style.borderColor = 'var(--border)';
  const file = e.dataTransfer.files[0];
  if (file) processExcelFile(file, courseId);
}

async function processExcelFile(file, courseId) {
  if (!file) return;
  if (!file.name.match(/\.xlsx?$/i)) { showExcelMsg('Please upload an Excel file (.xlsx or .xls)', false); return; }
  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const wb = window.XLSX.read(ev.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1 });
      _excelStudents = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const id = String(row[0] || '').trim();
        const name = String(row[1] || '').trim();
        if (i === 0 && (id.toLowerCase().includes('id') || id.toLowerCase().includes('student'))) continue;
        if (!id) continue;
        _excelStudents.push({ studentId: id, name, email: String(row[2] || '').trim() });
      }
      if (_excelStudents.length === 0) { showExcelMsg('No valid students found. Check the format.', false); return; }
      const preview = document.getElementById('excel-preview');
      const table = document.getElementById('excel-preview-table');
      const countEl = document.getElementById('excel-count');
      preview.style.display = 'block';
      let rows_html = '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:var(--bg)">' +
        '<th style="padding:6px 8px;text-align:left;border:1px solid var(--border)">Student ID</th>' +
        '<th style="padding:6px 8px;text-align:left;border:1px solid var(--border)">Name</th>' +
        '<th style="padding:6px 8px;text-align:left;border:1px solid var(--border)">Email</th>' +
        '</tr></thead><tbody>';
      _excelStudents.slice(0,5).forEach(s => {
        rows_html += '<tr>' +
          '<td style="padding:6px 8px;border:1px solid var(--border)">' + esc(s.studentId) + '</td>' +
          '<td style="padding:6px 8px;border:1px solid var(--border)">' + esc(s.name) + '</td>' +
          '<td style="padding:6px 8px;border:1px solid var(--border)">' + esc(s.email || '—') + '</td>' +
          '</tr>';
      });
      rows_html += '</tbody></table>';
      table.innerHTML = rows_html;
      countEl.textContent = '✅ ' + _excelStudents.length + ' student' + (_excelStudents.length !== 1 ? 's' : '') + ' found in file';
      const btn = document.getElementById('excel-import-btn');
      btn.disabled = false; btn.style.opacity = '1';
    } catch(err) { showExcelMsg('Could not read file: ' + err.message, false); }
  };
  reader.readAsArrayBuffer(file);
}

function showExcelMsg(msg, ok) {
  const el = document.getElementById('excel-msg');
  if (!el) return;
  el.textContent = msg; el.style.display = 'block';
  el.style.background = ok ? '#f0fdf4' : '#fef2f2';
  el.style.color = ok ? '#15803d' : '#dc2626';
}

async function uploadExcelStudents(courseId) {
  if (!_excelStudents.length) return;
  const btn = document.getElementById('excel-import-btn');
  btn.textContent = 'Importing…'; btn.disabled = true;
  try {
    const data = await api('/api/roster/' + courseId + '/upload', { method: 'POST', body: JSON.stringify({ students: _excelStudents }) });
    showExcelMsg('✅ ' + data.message, true);
    btn.textContent = 'Done!';
    setTimeout(() => { document.getElementById('excel-import-modal')?.remove(); _excelStudents = []; }, 2000);
  } catch(e) {
    showExcelMsg('Import failed: ' + e.message, false);
    btn.textContent = 'Import Students'; btn.disabled = false;
  }
}

// ── Attendance Report Card PDF ────────────────────────────────────────────────
async function generateAttendanceReportCard() {
  try {
    showToastNotif('Generating report card…', 'info');
    if (!window.jspdf) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const attendanceData = await api('/api/attendance-sessions/my-attendance?limit=500').catch(() => ({ records: [] }));
    const records = attendanceData.records || [];
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, M = 20;

    // Header bar
    doc.setFillColor(79, 70, 229);
    doc.rect(0, 0, W, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22); doc.setFont('helvetica', 'bold');
    doc.text('KODEX', M, 16);
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    doc.text('Student Attendance Report Card', M, 24);
    doc.text('Generated: ' + new Date().toDateString(), M, 31);

    // Student info
    doc.setTextColor(30, 27, 75);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(currentUser.name || 'Student', M, 52);
    doc.setFontSize(10); doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Student ID: ' + (currentUser.indexNumber || 'N/A'), M, 59);
    doc.text('Institution: ' + (currentUser.company?.name || 'N/A'), M, 65);
    doc.setDrawColor(199, 210, 254);
    doc.line(M, 70, W - M, 70);

    // Table header
    let y = 80;
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 27, 75);
    doc.text('Attendance by Course', M, y); y += 8;
    doc.setFillColor(238, 242, 255);
    doc.rect(M, y, W - 2*M, 8, 'F');
    doc.setFontSize(9); doc.setTextColor(79, 70, 229);
    doc.text('Course', M + 3, y + 5.5);
    doc.text('Present', 120, y + 5.5);
    doc.text('Total', 148, y + 5.5);
    doc.text('Rate', 168, y + 5.5);
    y += 10;

    // Group by session title (course not populated in my-attendance)
    const byCourse = {};
    records.forEach(r => {
      const key = r.session?.title || 'General';
      if (!byCourse[key]) byCourse[key] = { name: key, present: 0, total: 0 };
      byCourse[key].total++;
      if (r.status === 'present') byCourse[key].present++;
    });

    const entries = Object.values(byCourse);
    if (entries.length === 0) {
      doc.setTextColor(150,150,150); doc.setFont('helvetica','normal');
      doc.text('No attendance records found.', M + 3, y + 5);
    }
    entries.forEach((c, i) => {
      if (y > 260) { doc.addPage(); y = 20; }
      const rate = c.total > 0 ? Math.round((c.present/c.total)*100) : 0;
      const cr = rate >= 75 ? [22,163,74] : rate >= 50 ? [217,119,6] : [220,38,38];
      if (i % 2 === 0) { doc.setFillColor(249,250,251); doc.rect(M, y-1, W-2*M, 9, 'F'); }
      doc.setTextColor(30,27,75); doc.setFont('helvetica','normal'); doc.setFontSize(9);
      doc.text(c.name.substring(0,44), M + 3, y + 5);
      doc.text(String(c.present), 120, y + 5);
      doc.text(String(c.total), 148, y + 5);
      doc.setTextColor(cr[0], cr[1], cr[2]); doc.setFont('helvetica','bold');
      doc.text(rate + '%', 168, y + 5);
      y += 9;
    });

    // Summary row
    y += 4;
    const totalPresent = records.filter(r => r.status === 'present').length;
    const overall = records.length > 0 ? Math.round((totalPresent/records.length)*100) : 0;
    doc.setFillColor(79, 70, 229);
    doc.rect(M, y, W-2*M, 12, 'F');
    doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(10);
    doc.text('Overall Attendance Rate', M + 3, y + 8);
    doc.text(overall + '%  (' + totalPresent + ' of ' + records.length + ' sessions)', 128, y + 8);

    doc.setFontSize(8); doc.setTextColor(150,150,150); doc.setFont('helvetica','normal');
    doc.text('Generated automatically by KODEX — kodex.it.com', M, 285);
    doc.save('KODEX_Report_Card_' + (currentUser.indexNumber||'student') + '_' + new Date().toISOString().slice(0,10) + '.pdf');
    showToastNotif('Report card downloaded!', 'success');
  } catch(e) { showToastNotif('Failed: ' + e.message, 'error'); }
}

// ── Course Completion Certificate ─────────────────────────────────────────────
async function generateCertificate(courseId, courseTitle) {
  try {
    showToastNotif('Generating certificate…', 'info');
    if (!window.jspdf) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
        s.onload = resolve; s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297, H = 210;

    doc.setDrawColor(79,70,229); doc.setLineWidth(3);
    doc.rect(8, 8, W-16, H-16);
    doc.setDrawColor(199,210,254); doc.setLineWidth(1);
    doc.rect(12, 12, W-24, H-24);
    [[15,15],[W-15,15],[15,H-15],[W-15,H-15]].forEach(function(pt) {
      doc.setFillColor(79,70,229); doc.circle(pt[0],pt[1],3,'F');
    });

    doc.setFontSize(11); doc.setFont('helvetica','normal');
    doc.setTextColor(99,102,241);
    doc.text('KODEX', W/2, 28, { align: 'center' });
    doc.text('Learning & Attendance Management Platform', W/2, 34, { align: 'center' });

    doc.setFontSize(32); doc.setFont('helvetica','bold');
    doc.setTextColor(30,27,75);
    doc.text('Certificate of Completion', W/2, 60, { align: 'center' });

    doc.setDrawColor(199,210,254); doc.setLineWidth(0.5);
    doc.line(60, 65, W-60, 65);

    doc.setFontSize(13); doc.setFont('helvetica','normal');
    doc.setTextColor(100,100,100);
    doc.text('This is to certify that', W/2, 78, { align: 'center' });

    doc.setFontSize(28); doc.setFont('helvetica','bold');
    doc.setTextColor(79,70,229);
    doc.text(currentUser.name || 'Student Name', W/2, 96, { align: 'center' });
    var nw = doc.getTextWidth(currentUser.name || 'Student Name');
    doc.setDrawColor(79,70,229); doc.setLineWidth(0.8);
    doc.line(W/2 - nw/2, 99, W/2 + nw/2, 99);

    doc.setFontSize(13); doc.setFont('helvetica','normal');
    doc.setTextColor(100,100,100);
    doc.text('has successfully completed the course', W/2, 110, { align: 'center' });

    doc.setFontSize(20); doc.setFont('helvetica','bold');
    doc.setTextColor(30,27,75);
    doc.text(courseTitle || 'Course Title', W/2, 124, { align: 'center' });

    doc.setFontSize(11); doc.setFont('helvetica','normal');
    doc.setTextColor(100,100,100);
    doc.text('at ' + (currentUser.company?.name || 'Institution'), W/2, 133, { align: 'center' });
    doc.text('Date of Issue: ' + new Date().toDateString(), W/2, 145, { align: 'center' });

    doc.setDrawColor(100,100,100); doc.setLineWidth(0.3);
    doc.line(W/2-60, 165, W/2+60, 165);
    doc.setFontSize(9);
    doc.text('Authorised by KODEX Platform', W/2, 171, { align: 'center' });

    doc.setFontSize(8); doc.setTextColor(199,210,254);
    doc.text('kodex.it.com', W/2, H-16, { align: 'center' });

    doc.save('KODEX_Certificate_' + (courseTitle||'course').replace(/[^a-z0-9]/gi,'_') + '.pdf');
    showToastNotif('Certificate downloaded!', 'success');
  } catch(e) { showToastNotif('Failed: ' + e.message, 'error'); }
}

// ── Push Notification Triggers ────────────────────────────────────────────────
async function notifySessionStarted(sessionTitle) {
  await showLocalNotification('Attendance Session Live!', sessionTitle + ' — Mark your attendance now', '/?view=mark-attendance');
}
async function notifyQuizAvailable(quizTitle, endTime) {
  const mins = Math.round((new Date(endTime) - Date.now()) / 60000);
  await showLocalNotification('Quiz Available: ' + quizTitle, 'You have ' + mins + ' minutes to complete this quiz', '/?view=quizzes');
}
async function notifyAssignmentDue(assignmentTitle, dueDate) {
  const hours = Math.round((new Date(dueDate) - Date.now()) / 3600000);
  await showLocalNotification('Assignment Due Soon: ' + assignmentTitle, 'Due in ' + hours + ' hour' + (hours !== 1 ? 's' : ''), '/assignments.html');
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
    admin: currentUser?.company?.mode === 'academic'
      ? ['dashboard', 'sessions', 'quizzes', 'reports']
      : ['dashboard', 'sessions', 'users', 'reports'],
    manager:    ['dashboard', 'sessions', 'reports', 'users'],
    lecturer:   ['dashboard', 'sessions', 'quizzes', 'assignments'],
    hod:        ['hod-overview', 'hod-courses', 'hod-lecturers', 'hod-reports', 'meetings'],
    employee:   ['dashboard', 'sign-in-out', 'my-attendance', 'reports'],
    student:    ['dashboard', 'mark-attendance', 'quizzes', 'assignments'],
    superadmin: currentUser?.company?.mode === 'academic'
      ? ['dashboard', 'sessions', 'quizzes', 'reports']
      : ['dashboard', 'sessions', 'users', 'reports'],
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
    'hod-overview': 'Overview', 'hod-sessions': 'Sessions', 'hod-courses': 'Courses', 'hod-lecturers': 'Lecturers',
    'hod-students': 'Students', 'hod-reports': 'Reports',
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
    btn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon}</svg><span class="nav-label">${label}</span>`;
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
  moreBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg><span class="nav-label">More</span>`;
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
        <!-- Source tabs -->
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--text-light);margin-bottom:8px;display:block">Content Source</label>
          <div style="display:flex;gap:1px;background:var(--border);border-radius:9px;overflow:hidden;margin-bottom:12px;flex-wrap:wrap;">
            <button id="aiq-tab-topic"    onclick="aiqSwitchTab('topic')"   style="flex:1;min-width:70px;padding:8px 6px;border:none;cursor:pointer;font-size:11px;font-weight:600;background:var(--primary);color:#fff;font-family:inherit;">📝 Topic</button>
            <button id="aiq-tab-notes"    onclick="aiqSwitchTab('notes')"   style="flex:1;min-width:70px;padding:8px 6px;border:none;cursor:pointer;font-size:11px;font-weight:600;background:var(--card);color:var(--text-light);font-family:inherit;">📋 Notes</button>
            <button id="aiq-tab-pdf"      onclick="aiqSwitchTab('pdf')"     style="flex:1;min-width:70px;padding:8px 6px;border:none;cursor:pointer;font-size:11px;font-weight:600;background:var(--card);color:var(--text-light);font-family:inherit;">📄 PDF</button>
            <button id="aiq-tab-drawing"  onclick="aiqSwitchTab('drawing')" style="flex:1;min-width:70px;padding:8px 6px;border:none;cursor:pointer;font-size:11px;font-weight:600;background:var(--card);color:var(--text-light);font-family:inherit;">✏️ Draw</button>
            <button id="aiq-tab-graph"    onclick="aiqSwitchTab('graph')"   style="flex:1;min-width:70px;padding:8px 6px;border:none;cursor:pointer;font-size:11px;font-weight:600;background:var(--card);color:var(--text-light);font-family:inherit;">📈 Graph</button>
            <button id="aiq-tab-image"    onclick="aiqSwitchTab('image')"   style="flex:1;min-width:70px;padding:8px 6px;border:none;cursor:pointer;font-size:11px;font-weight:600;background:var(--card);color:var(--text-light);font-family:inherit;">🖼️ Image</button>
          </div>
          <!-- Topic input -->
          <div id="aiq-src-topic">
            <input id="aiq-topic" placeholder="e.g. Photosynthesis, Newton's laws, Python loops…" style="width:100%;padding:10px 13px;border:1.5px solid var(--border);border-radius:9px;font-size:14px;font-family:inherit;outline:none" onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='var(--border)'"/>
          </div>
          <!-- Paste notes -->
          <div id="aiq-src-notes" style="display:none;">
            <textarea id="aiq-notes" rows="5" placeholder="Paste your lecture notes, textbook content, or any study material here…" style="width:100%;padding:10px 13px;border:1.5px solid var(--border);border-radius:9px;font-size:13px;font-family:inherit;resize:vertical;outline:none;" onfocus="this.style.borderColor='#7c3aed'" onblur="this.style.borderColor='var(--border)'"></textarea>
            <p style="font-size:11px;color:var(--text-muted);margin-top:4px;">Questions will be generated directly from this material.</p>
          </div>
          <!-- PDF upload -->
          <div id="aiq-src-pdf" style="display:none;">
            <label for="aiq-pdf-file" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;border:2px dashed var(--border);border-radius:10px;cursor:pointer;background:var(--bg);transition:border-color .2s;" onmouseover="this.style.borderColor='#7c3aed'" onmouseout="this.style.borderColor='var(--border)'">
              <span style="font-size:28px;">📄</span>
              <span style="font-size:13px;font-weight:600;color:var(--text);">Click to upload a PDF</span>
              <span style="font-size:11px;color:var(--text-muted);">Max 10 MB · Text-based PDFs only</span>
              <input type="file" id="aiq-pdf-file" accept=".pdf" style="display:none;" onchange="aiqShowPdfName(this)">
            </label>
            <div id="aiq-pdf-name" style="display:none;margin-top:8px;padding:7px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:7px;font-size:12px;color:#166534;font-weight:500;"></div>
          </div>
          <!-- Drawing Canvas — Premium -->
          <div id="aiq-src-drawing" style="display:none;">
            <div style="background:var(--bg);border:1.5px solid var(--border);border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
              <!-- Toolbar row 1: tools -->
              <div style="display:flex;gap:5px;padding:8px 10px;background:var(--card);border-bottom:1px solid var(--border);flex-wrap:wrap;align-items:center;">
                <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);margin-right:2px;">TOOLS</span>
                <button id="aiq-draw-tool-pen"   onclick="aiqSetDrawTool('pen')"   style="padding:5px 10px;border:1.5px solid #7c3aed;border-radius:7px;background:#7c3aed;color:#fff;font-size:11px;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:3px">✏️ Pen</button>
                <button id="aiq-draw-tool-eraser" onclick="aiqSetDrawTool('eraser')" style="padding:5px 10px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-size:11px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:3px">🧹 Eraser</button>
                <button id="aiq-draw-tool-line"  onclick="aiqSetDrawTool('line')"  style="padding:5px 10px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-size:11px;cursor:pointer;font-weight:600">╱ Line</button>
                <button id="aiq-draw-tool-rect"  onclick="aiqSetDrawTool('rect')"  style="padding:5px 10px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-size:11px;cursor:pointer;font-weight:600">▭ Rect</button>
                <button id="aiq-draw-tool-circle" onclick="aiqSetDrawTool('circle')" style="padding:5px 10px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-size:11px;cursor:pointer;font-weight:600">◯ Circle</button>
                <button id="aiq-draw-tool-text"  onclick="aiqSetDrawTool('text')"  style="padding:5px 10px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-size:11px;cursor:pointer;font-weight:600">T Text</button>
                <div style="flex:1"></div>
                <div style="display:flex;align-items:center;gap:6px;padding:4px 8px;background:var(--bg);border:1px solid var(--border);border-radius:7px">
                  <span style="font-size:10px;color:var(--text-muted);font-weight:600">Color</span>
                  <input type="color" id="aiq-draw-color" value="#1a1a2e" style="width:22px;height:22px;border:none;cursor:pointer;border-radius:4px;padding:0;background:none" title="Pick colour">
                </div>
                <select id="aiq-draw-size" style="padding:5px 8px;border:1.5px solid var(--border);border-radius:7px;font-size:11px;font-family:inherit;outline:none;background:var(--bg);color:var(--text);cursor:pointer">
                  <option value="2">Thin (2px)</option><option value="4" selected>Normal (4px)</option><option value="8">Thick (8px)</option><option value="14">Bold (14px)</option>
                </select>
              </div>
              <!-- Toolbar row 2: actions -->
              <div style="display:flex;gap:5px;padding:6px 10px;background:var(--card);border-bottom:1px solid var(--border);align-items:center">
                <button onclick="aiqDrawUndo()" style="padding:5px 12px;border:1.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-size:11px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg> Undo
                </button>
                <button onclick="aiqDrawClear()" style="padding:5px 12px;border:1.5px solid #fca5a5;border-radius:7px;background:#fef2f2;color:#dc2626;font-size:11px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg> Clear Canvas
                </button>
                <div style="flex:1"></div>
                <span style="font-size:10px;color:var(--text-muted)">Click &amp; drag to draw · Touch supported</span>
              </div>
              <canvas id="aiq-draw-canvas" width="460" height="300" style="display:block;width:100%;cursor:crosshair;touch-action:none;background:#fff;"></canvas>
            </div>
            <p style="font-size:11px;color:var(--text-muted);margin-top:8px;line-height:1.5">Draw a diagram, geometry sketch, chart or concept map. AI will analyse your drawing and generate quiz questions from it.</p>
          </div>
          <!-- Graph / Coordinate Plane -->
          <div id="aiq-src-graph" style="display:none;">
            <div style="background:#f9fafb;border:1.5px solid var(--border);border-radius:10px;overflow:hidden;">
              <div style="padding:8px 10px;background:var(--card);border-bottom:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <span style="font-size:11px;font-weight:700;color:var(--text-muted);">Function:</span>
                <input id="aiq-graph-fn" type="text" placeholder="e.g. x^2  or  2*x+3  or  sin(x)" style="flex:1;min-width:140px;padding:4px 8px;border:1px solid var(--border);border-radius:6px;font-size:12px;font-family:monospace;outline:none">
                <button onclick="aiqGraphPlot()" style="padding:4px 10px;border:none;border-radius:6px;background:#7c3aed;color:#fff;font-size:11px;cursor:pointer;font-weight:600">Plot</button>
                <span style="font-size:11px;font-weight:700;color:var(--text-muted);">x:</span>
                <input id="aiq-graph-xmin" type="number" value="-10" style="width:50px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:11px;outline:none">
                <span style="font-size:11px;color:var(--text-muted)">to</span>
                <input id="aiq-graph-xmax" type="number" value="10" style="width:50px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:11px;outline:none">
                <button onclick="aiqGraphClear()" style="padding:4px 9px;border:1px solid #dc2626;border-radius:6px;background:#fef2f2;color:#dc2626;font-size:11px;cursor:pointer">Clear</button>
              </div>
              <canvas id="aiq-graph-canvas" width="460" height="280" style="display:block;width:100%;cursor:crosshair;background:#fff;touch-action:none;"></canvas>
            </div>
            <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center;">
              <span style="font-size:11px;color:var(--text-muted);">Data points (click canvas or enter):</span>
              <input id="aiq-graph-pt-x" type="number" placeholder="x" style="width:55px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:11px;outline:none">
              <input id="aiq-graph-pt-y" type="number" placeholder="y" style="width:55px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;font-size:11px;outline:none">
              <button onclick="aiqGraphAddPoint()" style="padding:4px 9px;border:1px solid var(--border);border-radius:5px;background:var(--bg);font-size:11px;cursor:pointer">+ Add</button>
              <span id="aiq-graph-pts-display" style="font-size:11px;color:var(--text-muted)"></span>
            </div>
            <p style="font-size:11px;color:var(--text-muted);margin-top:4px;">Plot a function or data points. AI will generate questions based on the graph.</p>
          </div>
          <!-- Image upload (photo, diagram, handwritten) -->
          <div id="aiq-src-image" style="display:none;">
            <label for="aiq-image-file" style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:20px;border:2px dashed var(--border);border-radius:10px;cursor:pointer;background:var(--bg);transition:border-color .2s;" onmouseover="this.style.borderColor='#7c3aed'" onmouseout="this.style.borderColor='var(--border)'">
              <span style="font-size:28px;">🖼️</span>
              <span style="font-size:13px;font-weight:600;color:var(--text);">Click to upload an image</span>
              <span style="font-size:11px;color:var(--text-muted);">PNG, JPG, WEBP · Max 10 MB · Diagrams, photos, handwritten notes</span>
              <input type="file" id="aiq-image-file" accept="image/png,image/jpeg,image/webp" style="display:none;" onchange="aiqShowImagePreview(this)">
            </label>
            <div id="aiq-image-preview" style="display:none;margin-top:10px;text-align:center;">
              <img id="aiq-image-preview-img" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border);">
              <div id="aiq-image-preview-name" style="font-size:11px;color:var(--text-muted);margin-top:4px;"></div>
            </div>
          </div>
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
              <optgroup label="── Pure Mathematics ──">
              <option value="arithmetic">Arithmetic &amp; Number Theory</option>
              <option value="algebra">Algebra</option>
              <option value="advanced algebra">Advanced Algebra</option>
              <option value="calculus">Calculus (Differential &amp; Integral)</option>
              <option value="multivariable calculus">Multivariable Calculus</option>
              <option value="geometry">Geometry (Euclidean)</option>
              <option value="analytic geometry">Analytic Geometry &amp; Coordinate Geometry</option>
              <option value="trigonometry">Trigonometry</option>
              <option value="linear algebra">Linear Algebra &amp; Matrices</option>
              <option value="abstract algebra">Abstract Algebra (Groups, Rings, Fields)</option>
              <option value="real analysis">Real Analysis</option>
              <option value="complex analysis">Complex Analysis</option>
              <option value="topology">Topology</option>
              <option value="number theory">Number Theory</option>
              <option value="combinatorics">Combinatorics</option>
              <option value="graph theory">Graph Theory</option>
              <option value="discrete math">Discrete Mathematics</option>
              <option value="set theory">Set Theory &amp; Logic</option>
              <option value="mathematical logic">Mathematical Logic &amp; Proof Writing</option>
              </optgroup>
              <optgroup label="── Applied Mathematics ──">
              <option value="statistics">Statistics &amp; Probability</option>
              <option value="differential equations">Differential Equations (ODEs)</option>
              <option value="partial differential equations">Partial Differential Equations (PDEs)</option>
              <option value="numerical methods">Numerical Methods &amp; Analysis</option>
              <option value="operations research">Operations Research &amp; Optimisation</option>
              <option value="mathematical modelling">Mathematical Modelling</option>
              <option value="game theory">Game Theory</option>
              <option value="information theory">Information Theory</option>
              </optgroup>
              <optgroup label="── Engineering &amp; Physics Math ──">
              <option value="vector calculus">Vector Calculus</option>
              <option value="fourier analysis">Fourier Analysis &amp; Transforms</option>
              <option value="laplace transforms">Laplace Transforms</option>
              <option value="complex numbers">Complex Numbers</option>
              <option value="Boolean algebra">Boolean Algebra &amp; Logic Gates</option>
              <option value="financial mathematics">Financial Mathematics</option>
              </optgroup>
              <optgroup label="── School Level ──">
              <option value="primary mathematics">Primary School Mathematics</option>
              <option value="junior high mathematics">Junior High Mathematics (JHS)</option>
              <option value="core mathematics">Core Mathematics (SHS)</option>
              <option value="elective mathematics">Elective Mathematics (SHS)</option>
              </optgroup>
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

// Tab switching for AI panel source
function aiqSwitchTab(tab) {
  ['topic','notes','pdf','drawing','graph','image'].forEach(t => {
    const src = document.getElementById('aiq-src-' + t);
    const btn = document.getElementById('aiq-tab-' + t);
    if (!src || !btn) return;
    const active = t === tab;
    src.style.display = active ? 'block' : 'none';
    btn.style.background = active ? 'var(--primary)' : 'var(--card)';
    btn.style.color = active ? '#fff' : 'var(--text-light)';
  });
  // Init canvas on first show
  if (tab === 'drawing') setTimeout(aiqInitDrawCanvas, 50);
  if (tab === 'graph')   setTimeout(aiqInitGraphCanvas, 50);
}

function aiqShowPdfName(input) {
  const nameEl = document.getElementById('aiq-pdf-name');
  if (!nameEl) return;
  if (input.files?.[0]) {
    nameEl.textContent = '📄 ' + input.files[0].name;
    nameEl.style.display = 'block';
  } else {
    nameEl.style.display = 'none';
  }
}

function aiqShowImagePreview(input) {
  const preview = document.getElementById('aiq-image-preview');
  const img     = document.getElementById('aiq-image-preview-img');
  const name    = document.getElementById('aiq-image-preview-name');
  if (!preview || !img) return;
  const file = input.files?.[0];
  if (!file) { preview.style.display = 'none'; return; }
  const url = URL.createObjectURL(file);
  img.src = url;
  img.onload = () => URL.revokeObjectURL(url);
  if (name) name.textContent = file.name + ' (' + (file.size / 1024).toFixed(1) + ' KB)';
  preview.style.display = 'block';
}

// ── Drawing Canvas ───────────────────────────────────────────────────────────
let _aiqDrawTool = 'pen', _aiqDrawing = false, _aiqDrawStart = null, _aiqDrawSnapshot = null;
let _aiqDrawHistory = [];

function aiqInitDrawCanvas() {
  const canvas = document.getElementById('aiq-draw-canvas');
  if (!canvas || canvas._aiqInited) return;
  canvas._aiqInited = true;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / r.width;
    const scaleY = canvas.height / r.height;
    const src = e.touches?.[0] || e;
    return { x: (src.clientX - r.left) * scaleX, y: (src.clientY - r.top) * scaleY };
  };
  const getCtxSettings = () => ({
    color: document.getElementById('aiq-draw-color')?.value || '#1e1e2e',
    size:  parseInt(document.getElementById('aiq-draw-size')?.value) || 4,
  });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    _aiqDrawing = true;
    _aiqDrawStart = getPos(e);
    _aiqDrawSnapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { color, size } = getCtxSettings();
    ctx.strokeStyle = _aiqDrawTool === 'eraser' ? '#fff' : color;
    ctx.lineWidth   = _aiqDrawTool === 'eraser' ? size * 3 : size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (_aiqDrawTool === 'pen' || _aiqDrawTool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(_aiqDrawStart.x, _aiqDrawStart.y);
    }
    if (_aiqDrawTool === 'text') {
      const text = prompt('Enter text label:');
      if (text) {
        ctx.font = `${size * 3 + 10}px sans-serif`;
        ctx.fillStyle = color;
        ctx.fillText(text, _aiqDrawStart.x, _aiqDrawStart.y);
        _aiqDrawHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      }
      _aiqDrawing = false;
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!_aiqDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const { color, size } = getCtxSettings();
    ctx.strokeStyle = _aiqDrawTool === 'eraser' ? '#fff' : color;
    ctx.lineWidth   = _aiqDrawTool === 'eraser' ? size * 3 : size;
    if (_aiqDrawTool === 'pen' || _aiqDrawTool === 'eraser') {
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    } else if (_aiqDrawSnapshot) {
      ctx.putImageData(_aiqDrawSnapshot, 0, 0);
      ctx.beginPath();
      ctx.strokeStyle = color;
      if (_aiqDrawTool === 'line') {
        ctx.moveTo(_aiqDrawStart.x, _aiqDrawStart.y);
        ctx.lineTo(pos.x, pos.y);
      } else if (_aiqDrawTool === 'rect') {
        ctx.rect(_aiqDrawStart.x, _aiqDrawStart.y, pos.x - _aiqDrawStart.x, pos.y - _aiqDrawStart.y);
      } else if (_aiqDrawTool === 'circle') {
        const rx = Math.abs(pos.x - _aiqDrawStart.x) / 2;
        const ry = Math.abs(pos.y - _aiqDrawStart.y) / 2;
        const cx = _aiqDrawStart.x + (pos.x - _aiqDrawStart.x) / 2;
        const cy = _aiqDrawStart.y + (pos.y - _aiqDrawStart.y) / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      }
      ctx.stroke();
    }
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!_aiqDrawing) return;
    _aiqDrawing = false;
    _aiqDrawHistory.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (_aiqDrawHistory.length > 30) _aiqDrawHistory.shift();
  });
  canvas.addEventListener('pointerleave', () => { if (_aiqDrawing) { _aiqDrawing = false; } });
}

function aiqSetDrawTool(tool) {
  _aiqDrawTool = tool;
  const tools = ['pen','line','rect','circle','text','eraser'];
  tools.forEach(t => {
    const btn = document.getElementById('aiq-draw-tool-' + t);
    if (!btn) return;
    const active = t === tool;
    btn.style.background = active ? '#7c3aed' : 'var(--bg)';
    btn.style.color      = active ? '#fff'    : 'var(--text)';
    btn.style.border     = active ? '1.5px solid #7c3aed' : '1.5px solid var(--border)';
  });
}

function aiqDrawUndo() {
  const canvas = document.getElementById('aiq-draw-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (_aiqDrawHistory.length > 1) {
    _aiqDrawHistory.pop();
    ctx.putImageData(_aiqDrawHistory[_aiqDrawHistory.length - 1], 0, 0);
  } else {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    _aiqDrawHistory = [];
  }
}

function aiqDrawClear() {
  const canvas = document.getElementById('aiq-draw-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  _aiqDrawHistory = [];
}

// ── Graph Canvas ─────────────────────────────────────────────────────────────
window._aiqGraphPoints = [];

function aiqInitGraphCanvas() {
  const canvas = document.getElementById('aiq-graph-canvas');
  if (!canvas || canvas._aiqGraphInited) return;
  canvas._aiqGraphInited = true;
  aiqGraphDraw();

  canvas.addEventListener('click', (e) => {
    const r = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / r.width;
    const scaleY = canvas.height / r.height;
    const px = (e.clientX - r.left) * scaleX;
    const py = (e.clientY - r.top)  * scaleY;
    // Convert canvas pixel to graph coordinates
    const xmin = parseFloat(document.getElementById('aiq-graph-xmin')?.value) || -10;
    const xmax = parseFloat(document.getElementById('aiq-graph-xmax')?.value) || 10;
    const gx = xmin + (px / canvas.width)  * (xmax - xmin);
    const gy = -(((py / canvas.height) - 0.5) * (xmax - xmin));
    window._aiqGraphPoints.push({ x: +gx.toFixed(2), y: +gy.toFixed(2) });
    aiqGraphDraw();
    const display = document.getElementById('aiq-graph-pts-display');
    if (display) display.textContent = window._aiqGraphPoints.map(p => `(${p.x},${p.y})`).join(' ');
  });
}

function aiqGraphAddPoint() {
  const x = parseFloat(document.getElementById('aiq-graph-pt-x')?.value);
  const y = parseFloat(document.getElementById('aiq-graph-pt-y')?.value);
  if (isNaN(x) || isNaN(y)) return;
  window._aiqGraphPoints.push({ x, y });
  aiqGraphDraw();
  const display = document.getElementById('aiq-graph-pts-display');
  if (display) display.textContent = window._aiqGraphPoints.map(p => `(${p.x},${p.y})`).join(' ');
}

function aiqGraphClear() {
  window._aiqGraphPoints = [];
  const c = document.getElementById('aiq-graph-canvas');
  if (c) { c._aiqGraphInited = false; }
  aiqInitGraphCanvas();
  const display = document.getElementById('aiq-graph-pts-display');
  if (display) display.textContent = '';
}

function aiqGraphPlot() {
  aiqGraphDraw(true);
}

function aiqGraphDraw(plotFn) {
  const canvas = document.getElementById('aiq-graph-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const xmin = parseFloat(document.getElementById('aiq-graph-xmin')?.value) || -10;
  const xmax = parseFloat(document.getElementById('aiq-graph-xmax')?.value) || 10;
  const range = xmax - xmin;
  const ymin = -(range / 2), ymax = range / 2;

  // Helper: graph coord → canvas pixel
  const toPixX = x => ((x - xmin) / range) * W;
  const toPixY = y => H - ((y - ymin) / (ymax - ymin)) * H;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // Grid
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  const step = range <= 4 ? 0.5 : range <= 20 ? 1 : range <= 50 ? 5 : 10;
  for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
    const px = toPixX(x);
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, H); ctx.stroke();
  }
  for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) {
    const py = toPixY(y);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(W, py); ctx.stroke();
  }

  // Axes
  ctx.strokeStyle = '#374151';
  ctx.lineWidth = 1.5;
  const ox = toPixX(0), oy = toPixY(0);
  ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke(); // x-axis
  ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke(); // y-axis

  // Axis labels
  ctx.fillStyle = '#6b7280';
  ctx.font = '10px sans-serif';
  for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
    if (Math.abs(x) < 0.001) continue;
    ctx.fillText(x, toPixX(x) + 2, Math.min(H - 2, oy + 12));
  }
  for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) {
    if (Math.abs(y) < 0.001) continue;
    ctx.fillText(y, Math.max(2, ox + 3), toPixY(y) - 2);
  }

  // Plot function
  if (plotFn) {
    const fnStr = document.getElementById('aiq-graph-fn')?.value?.trim();
    if (fnStr) {
      try {
        // Safe eval: allow only math expressions
        const safeExpr = fnStr.replace(/\^/g, '**').replace(/sin/g,'Math.sin').replace(/cos/g,'Math.cos').replace(/tan/g,'Math.tan').replace(/sqrt/g,'Math.sqrt').replace(/abs/g,'Math.abs').replace(/log/g,'Math.log').replace(/exp/g,'Math.exp').replace(/pi/g,'Math.PI').replace(/e(?![a-zA-Z])/g,'Math.E');
        // eslint-disable-next-line no-new-func
        const fn = new Function('x', '"use strict"; return ' + safeExpr + ';');
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let started = false;
        for (let px = 0; px <= W; px += 1) {
          const x = xmin + (px / W) * range;
          try {
            const y = fn(x);
            if (!isFinite(y)) { started = false; continue; }
            const py = toPixY(y);
            if (!started) { ctx.moveTo(px, py); started = true; } else { ctx.lineTo(px, py); }
          } catch(e) { started = false; }
        }
        ctx.stroke();
      } catch(e) {
        // Invalid function — ignore
      }
    }
  }

  // Data points
  ctx.fillStyle = '#ef4444';
  for (const pt of (window._aiqGraphPoints || [])) {
    const px = toPixX(pt.x), py = toPixY(pt.y);
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#374151';
    ctx.font = '10px sans-serif';
    ctx.fillText(`(${pt.x},${pt.y})`, px + 6, py - 4);
    ctx.fillStyle = '#ef4444';
  }
}

async function runAIQuizGenerate(quizId) {
  const activeTab  = document.getElementById('aiq-src-notes')?.style.display !== 'none'   ? 'notes'
                   : document.getElementById('aiq-src-pdf')?.style.display !== 'none'     ? 'pdf'
                   : document.getElementById('aiq-src-drawing')?.style.display !== 'none' ? 'drawing'
                   : document.getElementById('aiq-src-graph')?.style.display !== 'none'   ? 'graph'
                   : document.getElementById('aiq-src-image')?.style.display !== 'none'   ? 'image'
                   : 'topic';
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

  // ── If PDF, Notes, Drawing, Graph, or Image tab → use backend ai-generate endpoint ──
  if (['pdf','notes','drawing','graph','image'].includes(activeTab)) {
    errEl.style.display = 'none';
    previewDiv.style.display = 'none';
    addBtn.style.display = 'none';
    _aiQuizQuestions = [];

    btn.disabled = true;
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Generating…';

    try {
      const types = qtype === 'mixed' ? 'single,multiple' : qtype === 'fill' ? 'fill' : qtype;
      const formData = new FormData();
      formData.append('count', count);
      formData.append('types', types);
      formData.append('difficulty', difficulty);
      if (context) formData.append('context', context);

      if (activeTab === 'pdf') {
        const pdfFile = document.getElementById('aiq-pdf-file')?.files?.[0];
        if (!pdfFile) { errEl.textContent = 'Please select a PDF file.'; errEl.style.display = 'block'; btn.disabled = false; btn.innerHTML = '✨ Generate Questions'; return; }
        formData.append('pdf', pdfFile);
      } else if (activeTab === 'notes') {
        const notes = document.getElementById('aiq-notes')?.value?.trim();
        if (!notes) { errEl.textContent = 'Please paste your notes.'; errEl.style.display = 'block'; btn.disabled = false; btn.innerHTML = '✨ Generate Questions'; return; }
        formData.append('notes', notes);
      } else if (activeTab === 'drawing') {
        const canvas = document.getElementById('aiq-draw-canvas');
        if (!canvas) { errEl.textContent = 'Drawing canvas not ready.'; errEl.style.display = 'block'; btn.disabled = false; btn.innerHTML = '✨ Generate Questions'; return; }
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) { errEl.textContent = 'Could not capture drawing.'; errEl.style.display = 'block'; btn.disabled = false; btn.innerHTML = '✨ Generate Questions'; return; }
        formData.append('image', blob, 'drawing.png');
      } else if (activeTab === 'graph') {
        // Serialize graph as PNG image
        const canvas = document.getElementById('aiq-graph-canvas');
        if (!canvas) { errEl.textContent = 'Graph canvas not ready.'; errEl.style.display = 'block'; btn.disabled = false; btn.innerHTML = '✨ Generate Questions'; return; }
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) { errEl.textContent = 'Could not capture graph.'; errEl.style.display = 'block'; btn.disabled = false; btn.innerHTML = '✨ Generate Questions'; return; }
        // Also add text description for better AI context
        const fnText = document.getElementById('aiq-graph-fn')?.value?.trim();
        const ptsText = (window._aiqGraphPoints || []).map(p => `(${p.x},${p.y})`).join(', ');
        const desc = [fnText ? `Function: ${fnText}` : '', ptsText ? `Points: ${ptsText}` : ''].filter(Boolean).join('. ');
        if (desc) formData.append('context', (context ? context + '. ' : '') + 'Graph shows: ' + desc);
        formData.append('image', blob, 'graph.png');
      } else if (activeTab === 'image') {
        const imgFile = document.getElementById('aiq-image-file')?.files?.[0];
        if (!imgFile) { errEl.textContent = 'Please select an image file.'; errEl.style.display = 'block'; btn.disabled = false; btn.innerHTML = '✨ Generate Questions'; return; }
        formData.append('image', imgFile);
      }

      const token = localStorage.getItem('token') || '';
      const resp = await fetch(`/api/lecturer/quizzes/${quizId}/ai-generate`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData,
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Generation failed');

      // Questions already saved to DB — refresh the view
      document.getElementById('ai-quiz-overlay')?.remove();
      toastSuccess(`${data.questions.length} questions generated and added!`);
      await showAddQuestionsView(quizId);
      return;
    } catch(e) {
      errEl.textContent = e.message;
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '✨ Regenerate';
      return;
    }
  }

  // ── Topic tab → existing AI proxy flow ──
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
    prompt = 'You are an expert mathematics educator creating quiz questions for KODEX.\n\nGenerate exactly ' + count + ' ' + difficulty + ' difficulty math MCQ questions about: "' + topic + '". ' + branch + '\n' + (context ? 'Context: ' + context : '') + '\n\nStyle: ' + styleDesc + '. Question type: ' + qtypeDesc + '. Each question has EXACTLY 5 options (A through E).\n\nUse LaTeX \\( ... \\) for ALL inline math. Use \\[ ... \\] for display equations.\n\nReturn ONLY a valid JSON array:\n[\n  {\n    "questionText": "Find \\( x \\) if \\( x^2 - 5x + 6 = 0 \\).",\n    "options": ["\\( x = 2, 3 \\)", "\\( x = -2, -3 \\)", "\\( x = 1, 6 \\)", "\\( x = 5, -1 \\)", "\\( x = 0, 5 \\)"],\n    "correctAnswers": [0],\n    "questionType": "single",\n    "explanation": "Factorising: \\( (x-2)(x-3)=0 \\)."\n  }\n]';
  } else {
    prompt = 'You are an expert educator creating quiz questions for KODEX.\n\nGenerate exactly ' + count + ' ' + difficulty + ' difficulty MCQ questions about: "' + topic + '".\n' + (context ? 'Context: ' + context : '') + '\nQuestion type: ' + qtypeDesc + '. Each question has EXACTLY 5 options (A, B, C, D, E).\n\nReturn ONLY a valid JSON array:\n[\n  {\n    "questionText": "Question here?",\n    "options": ["Option A", "Option B", "Option C", "Option D", "Option E"],\n    "correctAnswers": [0],\n    "questionType": "single",\n    "explanation": "Why this is correct"\n  }\n]\n\ncorrectAnswers = 0-based indices. questionType = "single" or "multiple". No extra text.';
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

    const L = ['A','B','C','D','E'];
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
  if (added > 0) toastSuccess(msg); else toastError(msg);
  await showAddQuestionsView(quizId);
}

// ══════════════════════════════════════════════════════════════════════════
//  CORPORATE PHASE 1 — SHIFTS & LEAVE
// ══════════════════════════════════════════════════════════════════════════

// ── SHIFTS (Admin/Manager) ─────────────────────────────────────────────────
async function renderShifts() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading shifts…</div>';
  try {
    const [shiftsData, assignmentsData, usersData] = await Promise.all([
      api('/api/shifts'),
      api('/api/shifts/assignments'),
      api('/api/users').catch(() => ({ users: [] })),
    ]);
    const shifts = shiftsData.shifts || [];
    const assignments = assignmentsData.assignments || [];
    const users = (usersData.users || []).filter(u => u.role === 'employee' || u.role === 'manager');

    content.innerHTML = `
      <div class="page-header">
        <h2>Shift Management</h2>
        <p>Create shifts and assign employees</p>
      </div>

      <!-- Create Shift -->
      <div class="card" style="margin-bottom:20px">
        <h3 style="margin-bottom:14px;font-size:15px;font-weight:700">Create New Shift</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:12px">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Shift Name *</label>
            <input id="sh-name" placeholder="e.g. Morning Shift" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Start Time *</label>
            <input id="sh-start" type="time" value="08:00" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">End Time *</label>
            <input id="sh-end" type="time" value="17:00" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Grace Period (min)</label>
            <input id="sh-grace" type="number" value="15" min="0" max="60" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:6px">Working Days</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap" id="sh-days">
            ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `
              <label style="display:flex;align-items:center;gap:4px;padding:5px 10px;border:1.5px solid #e5e7eb;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600">
                <input type="checkbox" value="${d}" ${['Mon','Tue','Wed','Thu','Fri'].includes(d) ? 'checked' : ''}> ${d}
              </label>`).join('')}
          </div>
        </div>
        <div id="sh-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <button class="btn btn-primary" onclick="submitCreateShift()">+ Create Shift</button>
      </div>

      <!-- Shifts List -->
      <div class="card" style="margin-bottom:20px">
        <h3 style="margin-bottom:14px;font-size:15px;font-weight:700">Shifts (${shifts.length})</h3>
        ${shifts.length ? `
          <div style="display:flex;flex-direction:column;gap:8px">
            ${shifts.map(s => `
              <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border:1px solid #e5e7eb;border-radius:8px;flex-wrap:wrap;gap:8px">
                <div>
                  <div style="font-weight:700;font-size:14px">${s.name}</div>
                  <div style="font-size:12px;color:#6b7280">${s.startTime} – ${s.endTime} · Grace: ${s.gracePeriodMinutes}min · ${(s.days||[]).join(', ')}</div>
                </div>
                <button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca" onclick="deleteShift('${s._id}')">Delete</button>
              </div>`).join('')}
          </div>` : '<p style="color:#9ca3af;font-size:13px">No shifts created yet.</p>'}
      </div>

      <!-- Assign Shift -->
      <div class="card" style="margin-bottom:20px">
        <h3 style="margin-bottom:14px;font-size:15px;font-weight:700">Assign Shift to Employee</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:12px">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Employee *</label>
            <select id="sh-emp" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              <option value="">Select employee…</option>
              ${users.map(u => `<option value="${u._id}">${u.name}${u.department ? ' · '+u.department : ''}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Shift *</label>
            <select id="sh-shift" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              <option value="">Select shift…</option>
              ${shifts.map(s => `<option value="${s._id}">${s.name} (${s.startTime}–${s.endTime})</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Start Date *</label>
            <input id="sh-asgn-start" type="date" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">End Date (optional)</label>
            <input id="sh-asgn-end" type="date" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
        </div>
        <div id="sh-asgn-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <button class="btn btn-primary" onclick="submitAssignShift()">Assign Shift</button>
      </div>

      <!-- Current Assignments -->
      <div class="card">
        <h3 style="margin-bottom:14px;font-size:15px;font-weight:700">Current Assignments (${assignments.length})</h3>
        ${assignments.length ? `
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f9fafb">
                <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Employee</th>
                <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Department</th>
                <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Shift</th>
                <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Hours</th>
                <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Since</th>
                <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Action</th>
              </tr>
            </thead>
            <tbody>
              ${assignments.map(a => `
                <tr style="border-bottom:1px solid #f3f4f6">
                  <td style="padding:10px;font-weight:600">${a.employee?.name || 'Unknown'}</td>
                  <td style="padding:10px;color:#6b7280">${a.employee?.department || '—'}</td>
                  <td style="padding:10px">${a.shift?.name || '—'}</td>
                  <td style="padding:10px;color:#6b7280">${a.shift?.startTime || ''}–${a.shift?.endTime || ''}</td>
                  <td style="padding:10px;color:#6b7280">${new Date(a.startDate).toLocaleDateString()}</td>
                  <td style="padding:10px">
                    <button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca" onclick="removeShiftAssignment('${a._id}')">Remove</button>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<p style="color:#9ca3af;font-size:13px">No assignments yet.</p>'}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function submitCreateShift() {
  const name = document.getElementById('sh-name').value.trim();
  const startTime = document.getElementById('sh-start').value;
  const endTime = document.getElementById('sh-end').value;
  const gracePeriodMinutes = parseInt(document.getElementById('sh-grace').value) || 15;
  const days = [...document.querySelectorAll('#sh-days input:checked')].map(c => c.value);
  const errEl = document.getElementById('sh-error');
  errEl.style.display = 'none';
  if (!name || !startTime || !endTime) { errEl.textContent = 'Name, start and end time are required.'; errEl.style.display = 'block'; return; }
  if (!days.length) { errEl.textContent = 'Select at least one working day.'; errEl.style.display = 'block'; return; }
  const btn = event.target; btn.disabled = true; btn.textContent = 'Creating…';
  try {
    await api('/api/shifts', { method: 'POST', body: JSON.stringify({ name, startTime, endTime, gracePeriodMinutes, days }) });
    toast('Shift created!', 'ok');
    renderShifts();
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = '+ Create Shift';
  }
}

async function deleteShift(id) {
  if (!confirm('Delete this shift? Employees assigned to it will need a new shift.')) return;
  try {
    await api(`/api/shifts/${id}`, { method: 'DELETE' });
    toast('Shift deleted', 'ok');
    renderShifts();
  } catch(e) { toast(e.message, 'err'); }
}

async function submitAssignShift() {
  const employeeId = document.getElementById('sh-emp').value;
  const shiftId = document.getElementById('sh-shift').value;
  const startDate = document.getElementById('sh-asgn-start').value;
  const endDate = document.getElementById('sh-asgn-end').value;
  const errEl = document.getElementById('sh-asgn-error');
  errEl.style.display = 'none';
  if (!employeeId || !shiftId || !startDate) { errEl.textContent = 'Employee, shift and start date are required.'; errEl.style.display = 'block'; return; }
  const btn = event.target; btn.disabled = true; btn.textContent = 'Assigning…';
  try {
    await api('/api/shifts/assign', { method: 'POST', body: JSON.stringify({ employeeId, shiftId, startDate, endDate: endDate || null }) });
    toast('Shift assigned!', 'ok');
    renderShifts();
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Assign Shift';
  }
}

async function removeShiftAssignment(id) {
  if (!confirm('Remove this shift assignment?')) return;
  try {
    await api(`/api/shifts/assignments/${id}`, { method: 'DELETE' });
    toast('Assignment removed', 'ok');
    renderShifts();
  } catch(e) { toast(e.message, 'err'); }
}

// ── MY SHIFT (Employee) ────────────────────────────────────────────────────
async function renderMyShift() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading your shift…</div>';
  try {
    const { assignment } = await api('/api/shifts/my-shift');
    const s = assignment?.shift;
    content.innerHTML = `
      <div class="page-header"><h2>My Shift</h2><p>Your assigned working hours</p></div>
      ${assignment && s ? `
        <div class="card" style="text-align:center;padding:40px 24px;border-left:4px solid var(--primary)">
          <div style="font-size:48px;margin-bottom:12px">🕐</div>
          <div style="font-size:22px;font-weight:800;margin-bottom:6px">${s.name}</div>
          <div style="font-size:32px;font-weight:700;color:var(--primary);margin-bottom:8px">${s.startTime} – ${s.endTime}</div>
          <div style="font-size:14px;color:#6b7280;margin-bottom:4px">Working days: <strong>${(s.days||[]).join(', ')}</strong></div>
          <div style="font-size:13px;color:#9ca3af">Grace period: ${s.gracePeriodMinutes} minutes · Assigned since ${new Date(assignment.startDate).toLocaleDateString()}</div>
          ${assignment.endDate ? `<div style="font-size:13px;color:#f59e0b;margin-top:8px">⚠️ This assignment ends on ${new Date(assignment.endDate).toLocaleDateString()}</div>` : ''}
        </div>` : `
        <div class="card" style="text-align:center;padding:60px 24px">
          <div style="font-size:48px;opacity:.3;margin-bottom:16px">📅</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:6px">No shift assigned</div>
          <p style="color:#9ca3af;font-size:13px">Contact your manager to get a shift assigned to you.</p>
        </div>`}
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

// ── LEAVE REQUESTS (Admin/Manager) ────────────────────────────────────────
async function renderLeaveRequests() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading leave requests…</div>';
  try {
    const [pendingData, allData] = await Promise.all([
      api('/api/leaves/pending'),
      api('/api/leaves?status=approved'),
    ]);
    const pending = pendingData.leaves || [];
    const approved = allData.leaves || [];

    const leaveTypeBadge = t => ({
      annual: '<span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Annual</span>',
      sick:   '<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Sick</span>',
      maternity: '<span style="background:#fdf4ff;color:#9333ea;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Maternity</span>',
      paternity: '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Paternity</span>',
      unpaid: '<span style="background:#f9fafb;color:#6b7280;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Unpaid</span>',
      other:  '<span style="background:#fffbeb;color:#d97706;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Other</span>',
    }[t] || t);

    content.innerHTML = `
      <div class="page-header"><h2>Leave Requests</h2><p>Review and approve employee leave</p></div>

      <!-- Pending -->
      <div class="card" style="margin-bottom:20px">
        <h3 style="margin-bottom:14px;font-size:15px;font-weight:700">⏳ Pending Approval (${pending.length})</h3>
        ${pending.length ? pending.map(l => `
          <div style="padding:14px;border:1px solid #fed7aa;border-radius:8px;background:#fffbeb;margin-bottom:10px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <div>
                <div style="font-weight:700;font-size:14px">${l.employee?.name || 'Unknown'} ${leaveTypeBadge(l.type)}</div>
                <div style="font-size:12px;color:#6b7280;margin-top:3px">${l.employee?.department || 'No dept'} · ${new Date(l.startDate).toLocaleDateString()} → ${new Date(l.endDate).toLocaleDateString()} · <strong>${l.days} day${l.days!==1?'s':''}</strong></div>
                ${l.reason ? `<div style="font-size:12px;color:#374151;margin-top:4px;font-style:italic">"${l.reason}"</div>` : ''}
              </div>
              <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                <input id="note-${l._id}" placeholder="Note (optional)" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:12px;width:160px">
                <button class="btn btn-sm" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;font-weight:600" onclick="reviewLeave('${l._id}','approved')">✓ Approve</button>
                <button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-weight:600" onclick="reviewLeave('${l._id}','rejected')">✗ Reject</button>
              </div>
            </div>
          </div>`).join('') : '<p style="color:#9ca3af;font-size:13px">No pending requests.</p>'}
      </div>

      <!-- Recent Approved -->
      <div class="card">
        <h3 style="margin-bottom:14px;font-size:15px;font-weight:700">✅ Recently Approved</h3>
        ${approved.length ? `
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:#f9fafb">
                <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Employee</th>
                <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Type</th>
                <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Dates</th>
                <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Days</th>
              </tr>
            </thead>
            <tbody>
              ${approved.slice(0,20).map(l => `
                <tr style="border-bottom:1px solid #f3f4f6">
                  <td style="padding:10px;font-weight:600">${l.employee?.name || 'Unknown'}</td>
                  <td style="padding:10px">${leaveTypeBadge(l.type)}</td>
                  <td style="padding:10px;color:#6b7280;font-size:12px">${new Date(l.startDate).toLocaleDateString()} → ${new Date(l.endDate).toLocaleDateString()}</td>
                  <td style="padding:10px">${l.days}</td>
                </tr>`).join('')}
            </tbody>
          </table>` : '<p style="color:#9ca3af;font-size:13px">No approved leaves yet.</p>'}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function reviewLeave(id, action) {
  const note = document.getElementById(`note-${id}`)?.value || '';
  const btn = event.target; btn.disabled = true;
  try {
    await api(`/api/leaves/${id}/review`, { method: 'PATCH', body: JSON.stringify({ action, note }) });
    toast(action === 'approved' ? 'Leave approved ✓' : 'Leave rejected', action === 'approved' ? 'ok' : 'err');
    renderLeaveRequests();
  } catch(e) {
    toast(e.message, 'err');
    btn.disabled = false;
  }
}

// ── MY LEAVES (Employee) ──────────────────────────────────────────────────
async function renderMyLeaves() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { leaves } = await api('/api/leaves/my');

    const statusBadge = s => ({
      pending:   '<span style="background:#fffbeb;color:#d97706;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Pending</span>',
      approved:  '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Approved</span>',
      rejected:  '<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Rejected</span>',
      cancelled: '<span style="background:#f9fafb;color:#6b7280;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Cancelled</span>',
    }[s] || s);

    content.innerHTML = `
      <div class="page-header"><h2>My Leave</h2><p>Request and track your leave</p></div>

      <!-- Request Form -->
      <div class="card" style="margin-bottom:20px">
        <h3 style="margin-bottom:14px;font-size:15px;font-weight:700">Request Leave</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Leave Type *</label>
            <select id="lv-type" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              <option value="annual">Annual Leave</option>
              <option value="sick">Sick Leave</option>
              <option value="maternity">Maternity Leave</option>
              <option value="paternity">Paternity Leave</option>
              <option value="unpaid">Unpaid Leave</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Start Date *</label>
            <input id="lv-start" type="date" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">End Date *</label>
            <input id="lv-end" type="date" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
        </div>
        <div style="margin-bottom:10px">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Reason (optional)</label>
          <textarea id="lv-reason" rows="2" placeholder="Brief reason for leave…" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;resize:vertical"></textarea>
        </div>
        <div id="lv-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <button class="btn btn-primary" onclick="submitLeaveRequest()">Submit Request</button>
      </div>

      <!-- History -->
      <div class="card">
        <h3 style="margin-bottom:14px;font-size:15px;font-weight:700">My Leave History</h3>
        ${leaves.length ? leaves.map(l => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-size:13px;font-weight:600">${l.type.charAt(0).toUpperCase()+l.type.slice(1)} Leave · ${l.days} day${l.days!==1?'s':''}</div>
              <div style="font-size:12px;color:#6b7280">${new Date(l.startDate).toLocaleDateString()} → ${new Date(l.endDate).toLocaleDateString()}</div>
              ${l.reviewNote ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px">Note: ${l.reviewNote}</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              ${statusBadge(l.status)}
              ${l.status === 'pending' ? `<button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-size:11px" onclick="cancelLeave('${l._id}')">Cancel</button>` : ''}
            </div>
          </div>`).join('') : '<p style="color:#9ca3af;font-size:13px">No leave requests yet.</p>'}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function submitLeaveRequest() {
  const type = document.getElementById('lv-type').value;
  const startDate = document.getElementById('lv-start').value;
  const endDate = document.getElementById('lv-end').value;
  const reason = document.getElementById('lv-reason').value.trim();
  const errEl = document.getElementById('lv-error');
  errEl.style.display = 'none';
  if (!startDate || !endDate) { errEl.textContent = 'Start and end dates are required.'; errEl.style.display = 'block'; return; }
  if (new Date(endDate) < new Date(startDate)) { errEl.textContent = 'End date must be after start date.'; errEl.style.display = 'block'; return; }
  const btn = event.target; btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    await api('/api/leaves', { method: 'POST', body: JSON.stringify({ type, startDate, endDate, reason }) });
    toast('Leave request submitted!', 'ok');
    renderMyLeaves();
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Submit Request';
  }
}

async function cancelLeave(id) {
  if (!confirm('Cancel this leave request?')) return;
  try {
    await api(`/api/leaves/${id}/cancel`, { method: 'PATCH' });
    toast('Leave request cancelled', 'ok');
    renderMyLeaves();
  } catch(e) { toast(e.message, 'err'); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CORPORATE PHASE 2 — TRAINING & ASSESSMENTS
// ══════════════════════════════════════════════════════════════════════════════

// ── SIDEBAR: add training nav items ──────────────────────────────────────────
// Patch buildSidebar to inject training links for corporate mode
const _origBuildSidebar = buildSidebar;
buildSidebar = function() {
  _origBuildSidebar();
  const role = currentUser?.role;
  const mode = currentUser?.company?.mode;
  if (mode !== 'corporate') return;

  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  const trainingIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`;

  if (['admin','manager','superadmin'].includes(role)) {
    // Insert after leave-requests link
    const leaveLink = document.getElementById('nav-leave-requests');
    if (leaveLink && !document.getElementById('nav-training')) {
      const a = document.createElement('a');
      a.id = 'nav-training';
      a.innerHTML = `${trainingIcon}<span>Training & Assessments</span>`; a.dataset.tooltip = "Training & Assessments";
      a.onclick = () => navigateTo('training');
      leaveLink.insertAdjacentElement('afterend', a);
    }
  } else if (role === 'employee') {
    const myLeaveLink = document.getElementById('nav-my-leaves');
    if (myLeaveLink && !document.getElementById('nav-my-training')) {
      const a = document.createElement('a');
      a.id = 'nav-my-training';
      a.innerHTML = `${trainingIcon}<span>My Assessments</span>`; a.dataset.tooltip = "My Assessments";
      a.onclick = () => navigateTo('my-training');
      myLeaveLink.insertAdjacentElement('afterend', a);
    }
  }
};

// ── Patch navigateTo to handle training routes ────────────────────────────────
const _origNavigateTo = navigateTo;
navigateTo = function(view) {
  if (view === 'training')    { currentView = view; _setNavActive(view); renderTraining(); return; }
  if (view === 'my-training') { currentView = view; _setNavActive(view); renderMyTraining(); return; }
  _origNavigateTo(view);
};

function _setNavActive(view) {
  document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
  const el = document.getElementById(`nav-${view}`);
  if (el) el.classList.add('active');
  const content = document.getElementById('main-content');
  if (content) content.innerHTML = '<div class="loading">Loading...</div>';
}

// ── ADMIN/MANAGER: Training Hub ───────────────────────────────────────────────
async function renderTraining() {
  const content = document.getElementById('main-content');
  if (!content) return;

  try {
    const [overviewData, modulesData] = await Promise.all([
      api('/api/training/overview'),
      api('/api/training/modules'),
    ]);

    const { stats, recent } = overviewData;
    const modules = modulesData.modules || [];

    const typeBadge = t => ({
      onboarding:   '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Onboarding</span>',
      mandatory:    '<span style="background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Mandatory</span>',
      certification:'<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Certification</span>',
      policy:       '<span style="background:#ede9fe;color:#5b21b6;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Policy</span>',
    }[t] || t);

    content.innerHTML = `
      <div class="page-header">
        <h2>Training & Assessments</h2>
        <p>Create and manage mandatory training modules</p>
      </div>

      <!-- Stats -->
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-value">${stats.modules}</div><div class="stat-label">Modules</div></div>
        <div class="stat-card"><div class="stat-value">${stats.completed}</div><div class="stat-label">Completions</div></div>
        <div class="stat-card"><div class="stat-value">${stats.passed}</div><div class="stat-label">Passed</div></div>
        <div class="stat-card" style="${stats.overdue > 0 ? 'border-left:3px solid #f59e0b' : ''}">
          <div class="stat-value" style="${stats.overdue > 0 ? 'color:#f59e0b' : ''}">${stats.overdue}</div>
          <div class="stat-label">Overdue</div>
        </div>
      </div>

      <!-- Create Module -->
      <div class="card" style="margin-bottom:20px">
        <h3 style="margin-bottom:14px;font-size:15px;font-weight:700">Create Training Module</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Title *</label>
            <input id="tm-title" placeholder="e.g. Fire Safety Training" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Type</label>
            <select id="tm-type" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              <option value="onboarding">Onboarding</option>
              <option value="mandatory" selected>Mandatory</option>
              <option value="certification">Certification</option>
              <option value="policy">Policy</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Passing Score (%)</label>
            <input id="tm-pass" type="number" value="70" min="1" max="100" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Due In (days)</label>
            <input id="tm-due" type="number" value="7" min="1" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Time Limit (mins)</label>
            <input id="tm-time" type="number" placeholder="Optional" min="1" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
        </div>
        <div style="margin-bottom:10px">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Description</label>
          <input id="tm-desc" placeholder="Brief description of the module" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
        </div>
        <div style="margin-bottom:10px">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Training Content</label>
          <textarea id="tm-content" rows="4" placeholder="Write the training content here. Employees will read this before taking the assessment." style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;resize:vertical"></textarea>
        </div>
        <div style="margin-bottom:12px">
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Video URL (optional)</label>
          <input id="tm-video" placeholder="https://youtube.com/..." style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
        </div>
        <div id="tm-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <button class="btn btn-primary" onclick="submitCreateModule()">+ Create Module</button>
      </div>

      <!-- Modules List -->
      <div class="card">
        <h3 style="margin-bottom:14px;font-size:15px;font-weight:700">Modules (${modules.length})</h3>
        ${modules.length ? modules.map(m => `
          <div style="padding:16px;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
                  <span style="font-weight:700;font-size:15px">${m.title}</span>
                  ${typeBadge(m.type)}
                </div>
                <div style="font-size:12px;color:#6b7280;margin-bottom:8px">${m.description || 'No description'} · Pass: ${m.passingScore}% · Due in ${m.dueInDays}d${m.timeLimitMinutes ? ` · ⏱ ${m.timeLimitMinutes}min` : ''} · ${m.questions.length} question${m.questions.length !== 1 ? 's' : ''}</div>
                <div style="display:flex;gap:12px;font-size:12px">
                  <span style="color:#6b7280">👥 ${m.stats.total} assigned</span>
                  <span style="color:#16a34a">✅ ${m.stats.completed} completed</span>
                  <span style="color:#2563eb">🏆 ${m.stats.passed} passed</span>
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-sm" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe" onclick="showAddTrainingQuestion('${m._id}')">+ Questions</button>
                <button class="btn btn-sm" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0" onclick="assignModule('${m._id}')">Assign All</button>
                <button class="btn btn-sm" style="background:#f5f3ff;color:#5b21b6;border:1px solid #ddd6fe" onclick="viewModuleProgress('${m._id}', '${m.title.replace(/'/g,"\\'")}')">Progress</button>
                <button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca" onclick="deleteModule('${m._id}')">Delete</button>
              </div>
            </div>
          </div>
        `).join('') : '<p style="color:#9ca3af;font-size:13px">No training modules yet. Create one above.</p>'}
      </div>

      ${recent.length ? `
      <div class="card" style="margin-top:16px">
        <h3 style="margin-bottom:12px;font-size:15px;font-weight:700">Recent Completions</h3>
        ${recent.map(r => `
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f3f4f6">
            <div>
              <span style="font-weight:600;font-size:13px">${r.employee?.name || 'Unknown'}</span>
              <span style="color:#6b7280;font-size:12px"> completed </span>
              <span style="font-size:13px">${r.module?.title || 'Module'}</span>
            </div>
            <span style="font-size:11px;color:#9ca3af">${new Date(r.completedAt).toLocaleDateString()}</span>
          </div>
        `).join('')}
      </div>
      ` : ''}
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function submitCreateModule() {
  const title = document.getElementById('tm-title').value.trim();
  const type = document.getElementById('tm-type').value;
  const passingScore = parseInt(document.getElementById('tm-pass').value) || 70;
  const dueInDays = parseInt(document.getElementById('tm-due').value) || 7;
  const description = document.getElementById('tm-desc').value.trim();
  const content = document.getElementById('tm-content').value.trim();
  const videoUrl = document.getElementById('tm-video').value.trim();
  const errEl = document.getElementById('tm-error');
  errEl.style.display = 'none';

  if (!title) { errEl.textContent = 'Title is required.'; errEl.style.display = 'block'; return; }

  const btn = event.target; btn.disabled = true; btn.textContent = 'Creating…';
  try {
    const timeLimitMinutes = parseInt(document.getElementById('tm-time')?.value) || null;
    await api('/api/training/modules', {
      method: 'POST',
      body: JSON.stringify({ title, type, description, content, videoUrl, passingScore, dueInDays, timeLimitMinutes }),
    });
    toast('Module created!', 'ok');
    renderTraining();
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = '+ Create Module';
  }
}

async function assignModule(moduleId) {
  const btn = event.target; btn.disabled = true; btn.textContent = 'Assigning…';
  try {
    const data = await api(`/api/training/modules/${moduleId}/assign`, { method: 'POST' });
    toast(data.message || 'Assigned!', 'ok');
    renderTraining();
  } catch(e) {
    toast(e.message, 'err');
    btn.disabled = false; btn.textContent = 'Assign All';
  }
}

async function deleteModule(id) {
  if (!confirm('Delete this training module?')) return;
  try {
    await api(`/api/training/modules/${id}`, { method: 'DELETE' });
    toast('Module deleted', 'ok');
    renderTraining();
  } catch(e) { toast(e.message, 'err'); }
}

function showAddTrainingQuestion(moduleId) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:500px">
        <h3>Add Question</h3>
        <div class="form-group">
          <label>Question *</label>
          <textarea id="tq-text" rows="2" placeholder="Enter question…" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px"></textarea>
        </div>
        ${['A','B','C','D'].map((l,i) => `
        <div class="form-group">
          <label>Option ${l}${i<2?' *':''}</label>
          <input type="text" id="tq-opt-${i}" placeholder="Option ${l}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
        </div>`).join('')}
        <div class="form-group">
          <label>Correct Answer *</label>
          <div style="display:flex;gap:12px;margin-top:4px">
            ${['A','B','C','D'].map((l,i) => `<label style="display:flex;align-items:center;gap:4px;cursor:pointer"><input type="radio" name="tq-correct" value="${i}"> ${l}</label>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label>Marks</label>
          <input type="number" id="tq-marks" value="1" min="1" style="width:80px;padding:8px;border:1px solid #d1d5db;border-radius:6px">
        </div>
        <div id="tq-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="submitTrainingQuestion('${moduleId}')">Add Question</button>
        </div>
      </div>
    </div>
  `;
}

async function submitTrainingQuestion(moduleId) {
  const questionText = document.getElementById('tq-text').value.trim();
  const options = [0,1,2,3].map(i => document.getElementById(`tq-opt-${i}`).value.trim()).filter(o => o);
  const correctRadio = document.querySelector('input[name="tq-correct"]:checked');
  const marks = parseInt(document.getElementById('tq-marks').value) || 1;
  const errEl = document.getElementById('tq-error');
  errEl.style.display = 'none';

  if (!questionText) { errEl.textContent = 'Question text is required.'; errEl.style.display = 'block'; return; }
  if (options.length < 2) { errEl.textContent = 'At least 2 options required.'; errEl.style.display = 'block'; return; }
  if (!correctRadio) { errEl.textContent = 'Select the correct answer.'; errEl.style.display = 'block'; return; }

  const correctAnswer = parseInt(correctRadio.value);
  try {
    await api(`/api/training/modules/${moduleId}/questions`, {
      method: 'POST',
      body: JSON.stringify({ questionText, options, correctAnswer, marks }),
    });
    closeModal();
    toast('Question added!', 'ok');
    renderTraining();
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
  }
}

async function viewModuleProgress(moduleId, title) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:650px;width:95%">
        <h3>Progress — ${title}</h3>
        <div id="mp-content"><p>Loading…</p></div>
        <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>
      </div>
    </div>
  `;
  try {
    const { progress } = await api(`/api/training/modules/${moduleId}/progress`);
    const el = document.getElementById('mp-content');

    const statusBadge = s => ({
      assigned:    '<span style="background:#f1f5f9;color:#475569;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Assigned</span>',
      in_progress: '<span style="background:#eff6ff;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">In Progress</span>',
      completed:   '<span style="background:#f0fdf4;color:#16a34a;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Completed</span>',
      failed:      '<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Failed</span>',
      overdue:     '<span style="background:#fffbeb;color:#d97706;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Overdue</span>',
    }[s] || s);

    if (!progress.length) { el.innerHTML = '<p style="color:#9ca3af">No one assigned yet.</p>'; return; }

    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f9fafb">
          <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Employee</th>
          <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Status</th>
          <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Score</th>
          <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Due</th>
          <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Completed</th>
        </tr></thead>
        <tbody>
          ${progress.map(p => `
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:10px;font-weight:600">${p.employee?.name || 'Unknown'}<div style="font-size:11px;color:#9ca3af">${p.employee?.department || ''}</div></td>
              <td style="padding:10px">${statusBadge(p.status)}</td>
              <td style="padding:10px">${p.percentage != null ? `<strong style="color:${p.passed ? '#16a34a' : '#dc2626'}">${p.percentage}%</strong> (${p.score}/${p.maxScore})` : '—'}</td>
              <td style="padding:10px;font-size:12px;color:#6b7280">${p.dueDate ? new Date(p.dueDate).toLocaleDateString() : '—'}</td>
              <td style="padding:10px;font-size:12px;color:#6b7280">${p.completedAt ? new Date(p.completedAt).toLocaleDateString() : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch(e) {
    document.getElementById('mp-content').innerHTML = `<p style="color:#ef4444">Error: ${e.message}</p>`;
  }
}

// ── EMPLOYEE: My Training ─────────────────────────────────────────────────────
async function renderMyTraining() {
  const content = document.getElementById('main-content');
  if (!content) return;
  try {
    const { progress } = await api('/api/training/my');

    const statusStyle = s => ({
      assigned:    'background:#f1f5f9;color:#475569',
      in_progress: 'background:#eff6ff;color:#1d4ed8',
      completed:   'background:#f0fdf4;color:#16a34a',
      failed:      'background:#fef2f2;color:#dc2626',
      overdue:     'background:#fffbeb;color:#d97706',
    }[s] || '');

    const typeIcon = t => ({ onboarding:'🚀', mandatory:'⚠️', certification:'🏆', policy:'📄' }[t] || '📚');

    const total = progress.length;
    const completed = progress.filter(p => p.status === 'completed').length;
    const pending = progress.filter(p => ['assigned','in_progress','overdue'].includes(p.status)).length;

    content.innerHTML = `
      <div class="page-header"><h2>My Assessments</h2><p>Complete your assigned training and assessment modules</p></div>

      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-value">${total}</div><div class="stat-label">Assigned</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--success)">${completed}</div><div class="stat-label">Completed</div></div>
        <div class="stat-card"><div class="stat-value" style="color:${pending > 0 ? '#f59e0b' : 'var(--text)'}">${pending}</div><div class="stat-label">Pending</div></div>
      </div>

      ${progress.length ? progress.map(p => {
        const m = p.module;
        if (!m) return '';
        const isActionable = ['assigned','in_progress','overdue'].includes(p.status);
        const canRetry = ['failed','overdue'].includes(p.status);
        return `
        <div class="card" style="margin-bottom:14px;border-left:4px solid ${
          p.status === 'completed' ? '#22c55e' :
          p.status === 'failed'    ? '#ef4444' :
          p.status === 'overdue'   ? '#f59e0b' : 'var(--primary)'}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
                <span style="font-size:18px">${typeIcon(m.type)}</span>
                <span style="font-weight:700;font-size:15px">${m.title}</span>
                <span style="padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;${statusStyle(p.status)}">${p.status.replace('_',' ')}</span>
              </div>
              <div style="font-size:12px;color:#6b7280;margin-bottom:6px">${m.description || ''} · ${m.questions.length} question${m.questions.length !== 1 ? 's' : ''} · Pass: ${m.passingScore}%${m.timeLimitMinutes ? ` · ⏱ ${m.timeLimitMinutes} min` : ''}</div>
              ${p.dueDate ? `<div style="font-size:12px;color:${new Date(p.dueDate) < new Date() && p.status !== 'completed' ? '#f59e0b' : '#6b7280'}">Due: ${new Date(p.dueDate).toLocaleDateString()}</div>` : ''}
              ${p.percentage != null ? `<div style="font-size:13px;margin-top:4px;font-weight:600;color:${p.passed ? '#16a34a' : '#dc2626'}">Score: ${p.percentage}% — ${p.passed ? '✅ Passed' : '❌ Failed'}</div>` : ''}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${isActionable ? `<button class="btn btn-primary btn-sm" onclick="startTrainingModule('${p._id}', '${m._id}')">Start</button>` : ''}
              ${canRetry ? `<button class="btn btn-sm" style="background:#fef3c7;color:#d97706;border:1px solid #fde68a" onclick="retryTrainingModule('${p._id}')">Retry</button>` : ''}
              ${p.status === 'completed' ? `<span style="color:#16a34a;font-size:13px;font-weight:600">✓ Complete</span>` : ''}
            </div>
          </div>
        </div>`;
      }).join('') : `<div class="card" style="text-align:center;padding:60px 24px">
        <div style="font-size:48px;opacity:.3;margin-bottom:16px">📚</div>
        <div style="font-size:16px;font-weight:600;margin-bottom:6px">No training assigned</div>
        <p style="color:#9ca3af;font-size:13px">Your manager will assign training modules when required.</p>
      </div>`}
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function startTrainingModule(progressId, moduleId) {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading module…</div>';

  try {
    await api(`/api/training/my/${progressId}/start`, { method: 'POST' });
    const { progress } = await api('/api/training/my');
    const p = progress.find(x => x._id === progressId);
    if (!p) { renderMyTraining(); return; }
    const m = p.module;

    content.innerHTML = `
      <div class="page-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <div><h2>${m.title}</h2><p>${m.description || ''}</p></div>
        <button class="btn btn-secondary btn-sm" onclick="renderMyTraining()">← Back</button>
      </div>

      ${m.videoUrl ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-title">Training Video</div>
        <a href="${m.videoUrl}" target="_blank" class="btn btn-primary btn-sm" style="display:inline-flex;align-items:center;gap:6px;text-decoration:none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          Watch Video
        </a>
      </div>` : ''}

      ${m.content ? `
      <div class="card" style="margin-bottom:16px">
        <div class="card-title">Training Material</div>
        <div style="font-size:14px;line-height:1.7;white-space:pre-wrap;color:var(--text)">${m.content}</div>
      </div>` : ''}

      ${m.questions.length ? `
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:12px">
          <div class="card-title" style="margin:0">Assessment — ${m.questions.length} Question${m.questions.length !== 1 ? 's' : ''}</div>
          ${m.timeLimitMinutes ? `<div id="training-timer" style="font-size:14px;font-weight:700;color:#ef4444;background:#fef2f2;padding:6px 14px;border-radius:20px;border:1px solid #fecaca">⏱ <span id="training-timer-display">${m.timeLimitMinutes}:00</span></div>` : ''}
        </div>
        <p style="font-size:13px;color:#6b7280;margin-bottom:16px">Passing score: ${m.passingScore}%${m.timeLimitMinutes ? ` · Time limit: ${m.timeLimitMinutes} minutes` : ''}. Answer all questions then click Submit.</p>
        ${m.questions.map((q, i) => `
          <div style="padding:14px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:10px">
            <div class="math-content" style="font-weight:600;margin-bottom:10px;font-size:14px">Q${i+1}. ${q.questionText} <span style="color:#9ca3af;font-weight:400;font-size:12px">(${q.marks} mark${q.marks !== 1 ? 's' : ''})</span></div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${q.options.map((opt, oi) => `
                <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid #e5e7eb;border-radius:7px;cursor:pointer;font-size:13px" onmouseover="this.style.background='#f9fafb'" onmouseout="this.style.background=''">
                  <input type="radio" name="tma-${i}" value="${oi}" style="accent-color:var(--primary)">
                  <span><strong>${String.fromCharCode(65+oi)}.</strong> ${opt}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `).join('')}
        <div style="margin-top:16px;text-align:center">
          <button class="btn btn-primary" style="padding:12px 32px;font-size:15px" onclick="submitTrainingAssessment('${progressId}', ${m.questions.length})">Submit Assessment</button>
        </div>
      </div>
      ` : `
      <div class="card" style="text-align:center;padding:40px">
        <div style="font-size:36px;margin-bottom:12px">✅</div>
        <div style="font-size:18px;font-weight:700">No Assessment Required</div>
        <p style="color:#6b7280;margin:8px 0 16px">This module has no quiz. Mark as read to complete.</p>
        <button class="btn btn-primary" onclick="markTrainingRead('${progressId}')">Mark as Completed</button>
      </div>
      `}
    `;
    // Start assessment timer if time limit set
    if (m.timeLimitMinutes && m.questions.length) {
      let secsLeft = m.timeLimitMinutes * 60;
      const timerDisplay = document.getElementById('training-timer-display');
      if (timerDisplay) {
        window._trainingTimerInterval = setInterval(() => {
          secsLeft--;
          const mins = Math.floor(secsLeft / 60);
          const secs = secsLeft % 60;
          if (timerDisplay) timerDisplay.textContent = `${mins}:${secs.toString().padStart(2,'0')}`;
          if (secsLeft <= 60) {
            document.getElementById('training-timer')?.style && (document.getElementById('training-timer').style.animation = 'pulse 1s infinite');
          }
          if (secsLeft <= 0) {
            clearInterval(window._trainingTimerInterval);
            toast('⏱ Time is up! Auto-submitting…', 'warn');
            submitTrainingAssessment(progressId, m.questions.length);
          }
        }, 1000);
      }
    }
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function submitTrainingAssessment(progressId, questionCount) {
  if (window._trainingTimerInterval) { clearInterval(window._trainingTimerInterval); window._trainingTimerInterval = null; }
  const answers = [];
  for (let i = 0; i < questionCount; i++) {
    const selected = document.querySelector(`input[name="tma-${i}"]:checked`);
    answers.push({ questionIndex: i, selectedAnswer: selected ? parseInt(selected.value) : -1 });
  }

  const btn = event.target; btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    const data = await api(`/api/training/my/${progressId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    });

    const content = document.getElementById('main-content');
    const passed = data.passed;
    content.innerHTML = `
      <div style="max-width:480px;margin:60px auto;text-align:center">
        <div class="card">
          <div style="font-size:56px;margin-bottom:12px">${passed ? '🏆' : '📝'}</div>
          <h2 style="margin-bottom:8px">${passed ? 'Congratulations!' : 'Not Quite There'}</h2>
          <div style="font-size:2.5em;font-weight:800;color:${passed ? '#22c55e' : '#ef4444'};margin:16px 0">${data.percentage}%</div>
          <p style="color:#6b7280">Score: ${data.score} / ${data.maxScore} · Pass mark: ${data.passingScore}%</p>
          <div style="margin-top:24px;display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
            ${!passed ? `<button class="btn btn-sm" style="background:#fef3c7;color:#d97706;border:1px solid #fde68a" onclick="renderMyTraining()">Try Again Later</button>` : ''}
            <button class="btn btn-primary" onclick="renderMyTraining()">Back to Training</button>
          </div>
        </div>
      </div>
    `;
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Submit Assessment';
    toast(e.message, 'err');
  }
}

async function markTrainingRead(progressId) {
  const btn = event.target; btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await api(`/api/training/my/${progressId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ answers: [] }),
    });
    toast('Module completed! ✅', 'ok');
    renderMyTraining();
  } catch(e) {
    toast(e.message, 'err');
    btn.disabled = false; btn.textContent = 'Mark as Completed';
  }
}

async function retryTrainingModule(progressId) {
  try {
    const data = await api(`/api/training/my/${progressId}/retry`, { method: 'POST' });
    startTrainingModule(progressId, data.progress.module._id || data.progress.module);
  } catch(e) { toast(e.message, 'err'); }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CORPORATE PHASE 3 — PERFORMANCE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

// ── Patch buildSidebar for Phase 3 nav ───────────────────────────────────────
const _p2BuildSidebar = buildSidebar;
buildSidebar = function() {
  _p2BuildSidebar();
  const role = currentUser?.role;
  const mode = currentUser?.company?.mode;
  if (mode !== 'corporate') return;

  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  const perfIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`;

  if (['admin','manager','superadmin'].includes(role)) {
    const trainingLink = document.getElementById('nav-training');
    if (trainingLink && !document.getElementById('nav-performance')) {
      const a = document.createElement('a');
      a.id = 'nav-performance';
      a.innerHTML = `${perfIcon}<span>Performance</span>`; a.dataset.tooltip = "Performance";
      a.onclick = () => navigateTo('performance');
      trainingLink.insertAdjacentElement('afterend', a);
    }
  } else if (role === 'employee') {
    const myTrainingLink = document.getElementById('nav-my-training');
    if (myTrainingLink && !document.getElementById('nav-my-performance')) {
      const a = document.createElement('a');
      a.id = 'nav-my-performance';
      a.innerHTML = `${perfIcon}<span>My Performance</span>`; a.dataset.tooltip = "My Performance";
      a.onclick = () => navigateTo('my-performance');
      myTrainingLink.insertAdjacentElement('afterend', a);
    }
  }
};

// ── Patch navigateTo for Phase 3 ─────────────────────────────────────────────
const _p2NavigateTo = navigateTo;
navigateTo = function(view) {
  if (view === 'performance' || view === 'my-performance') {
    currentView = view; _setNavActive(view);
    if (currentUser?.role === 'lecturer') renderLecturerPerformance();
    else if (currentUser?.role === 'student') renderStudentQuizHistory();
    else renderPerformance();
    return;
  }
  _p2NavigateTo(view);
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function _starRating(score, max=5) {
  if (!score) return '<span style="color:#d1d5db">No rating</span>';
  const full = Math.round(score);
  return Array.from({length:max}, (_,i) =>
    `<span style="color:${i < full ? '#f59e0b' : '#d1d5db'};font-size:16px">★</span>`
  ).join('') + ` <span style="font-size:12px;color:#6b7280">(${score}/5)</span>`;
}

function _progressBar(pct) {
  const color = pct >= 100 ? '#22c55e' : pct >= 60 ? '#3b82f6' : pct >= 30 ? '#f59e0b' : '#ef4444';
  return `<div style="background:#f3f4f6;border-radius:6px;height:8px;width:100%">
    <div style="background:${color};height:8px;border-radius:6px;width:${Math.min(pct,100)}%;transition:width .3s"></div>
  </div>`;
}

function _catBadge(c) {
  return ({
    kpi:      '<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">KPI</span>',
    personal: '<span style="background:#ede9fe;color:#5b21b6;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Personal</span>',
    team:     '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Team</span>',
    learning: '<span style="background:#fef3c7;color:#d97706;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">Learning</span>',
  }[c] || c);
}

// ── MANAGER: Performance Hub ──────────────────────────────────────────────────
async function renderPerformance() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading…</div>';

  try {
    const { overview } = await api('/api/performance/team-overview');

    content.innerHTML = `
      <div class="page-header">
        <h2>Performance Management</h2>
        <p>Team goals, reviews and scorecards</p>
      </div>

      <!-- Team Overview Table -->
      <div class="card" style="margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">
          <h3 style="font-size:15px;font-weight:700;margin:0">Team Overview (${overview.length})</h3>
          <button class="btn btn-primary btn-sm" onclick="showCreateReviewModal()">+ New Review</button>
        </div>
        ${overview.length ? `
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f9fafb">
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Employee</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Department</th>
              <th style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb">Goals</th>
              <th style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb">Reviews</th>
              <th style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb">Avg Score</th>
              <th style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb">Actions</th>
            </tr></thead>
            <tbody>
              ${overview.map(o => `
                <tr style="border-bottom:1px solid #f3f4f6;cursor:pointer" onclick="viewScorecard('${o.employee._id}', '${(o.employee.name||'').replace(/'/g,"\\'")}')">
                  <td style="padding:10px;font-weight:600">${o.employee.name}</td>
                  <td style="padding:10px;color:#6b7280">${o.employee.department || '—'}</td>
                  <td style="padding:10px;text-align:center">
                    <span style="font-weight:700">${o.completedGoals}</span><span style="color:#9ca3af">/${o.totalGoals}</span>
                  </td>
                  <td style="padding:10px;text-align:center">${o.reviewCount}</td>
                  <td style="padding:10px;text-align:center">${_starRating(o.avgScore)}</td>
                  <td style="padding:10px;text-align:center">
                    <button class="btn btn-sm" style="background:#f5f3ff;color:#5b21b6;border:1px solid #ddd6fe" onclick="event.stopPropagation();viewScorecard('${o.employee._id}','${(o.employee.name||'').replace(/'/g,"\\'")}')">Scorecard</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : '<p style="color:#9ca3af;font-size:13px">No employees yet.</p>'}
      </div>

      <!-- Set Goal for Employee -->
      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">Set Goal for Employee</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:10px">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Employee ID</label>
            <input id="pg-emp" placeholder="Employee _id or search" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Goal Title *</label>
            <input id="pg-title" placeholder="e.g. Close 20 deals" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Category</label>
            <select id="pg-cat" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              <option value="kpi">KPI</option>
              <option value="personal">Personal</option>
              <option value="team">Team</option>
              <option value="learning">Learning</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Target Value</label>
            <input id="pg-target" type="number" placeholder="e.g. 100" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Unit</label>
            <input id="pg-unit" placeholder="e.g. deals, calls, %" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Period</label>
            <select id="pg-period" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              <option value="monthly">Monthly</option>
              <option value="quarterly" selected>Quarterly</option>
              <option value="annual">Annual</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Due Date</label>
            <input id="pg-due" type="date" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
        </div>
        <div id="pg-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <button class="btn btn-primary" onclick="submitCreateGoal(false)">+ Set Goal</button>
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function viewScorecard(employeeId, name) {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading scorecard…</div>';

  try {
    const data = await api(`/api/performance/scorecard/${employeeId}`);
    const { employee, goals, reviews, stats } = data;

    const statusColor = s => ({active:'#3b82f6',completed:'#22c55e',cancelled:'#9ca3af',overdue:'#f59e0b'}[s]||'#6b7280');

    content.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:20px">
        <div class="page-header" style="margin:0"><h2>Scorecard — ${employee.name}</h2><p>${employee.department || ''} · ${employee.employeeId || ''}</p></div>
        <button class="btn btn-secondary btn-sm" onclick="renderPerformance()">← Back</button>
      </div>

      <!-- Stats -->
      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-value">${stats.totalGoals}</div><div class="stat-label">Total Goals</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#22c55e">${stats.completedGoals}</div><div class="stat-label">Completed</div></div>
        <div class="stat-card"><div class="stat-value">${stats.avgProgress}%</div><div class="stat-label">Avg Progress</div></div>
        <div class="stat-card"><div class="stat-value">${stats.avgReviewScore ? `${stats.avgReviewScore}/5` : '—'}</div><div class="stat-label">Avg Review</div></div>
      </div>

      <!-- Goals -->
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <h3 style="font-size:15px;font-weight:700;margin:0">Goals (${goals.length})</h3>
          <button class="btn btn-sm" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe" onclick="showAddGoalForEmployee('${employeeId}','${name.replace(/'/g,"\\'")}')">+ Add Goal</button>
        </div>
        ${goals.length ? goals.map(g => {
          const pct = g.targetValue ? Math.round((g.currentValue/g.targetValue)*100) : null;
          return `
          <div style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-weight:600;font-size:14px">${g.title}</span>
                ${_catBadge(g.category)}
                <span style="width:8px;height:8px;border-radius:50%;background:${statusColor(g.status)};display:inline-block"></span>
                <span style="font-size:11px;color:#6b7280">${g.status}</span>
              </div>
              <div style="display:flex;gap:6px">
                ${g.status === 'active' ? `<button class="btn btn-sm" style="font-size:11px" onclick="showUpdateGoalProgress('${g._id}','${g.title.replace(/'/g,"\\'")}',${g.currentValue},${g.targetValue||0},'${g.unit||''}')">Update</button>` : ''}
                <button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-size:11px" onclick="deleteGoal('${g._id}','${employeeId}','${name.replace(/'/g,"\\'")}')">Delete</button>
              </div>
            </div>
            ${pct !== null ? `
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <div style="flex:1">${_progressBar(pct)}</div>
                <span style="font-size:12px;font-weight:700;min-width:36px">${pct}%</span>
              </div>
              <div style="font-size:12px;color:#6b7280">${g.currentValue} / ${g.targetValue} ${g.unit}</div>
            ` : `<div style="font-size:12px;color:#9ca3af">No numeric target set</div>`}
            ${g.dueDate ? `<div style="font-size:11px;color:#9ca3af;margin-top:4px">Due: ${new Date(g.dueDate).toLocaleDateString()}</div>` : ''}
          </div>`;
        }).join('') : '<p style="color:#9ca3af;font-size:13px">No goals set yet.</p>'}
      </div>

      <!-- Reviews -->
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
          <h3 style="font-size:15px;font-weight:700;margin:0">Reviews (${reviews.length})</h3>
          <button class="btn btn-sm" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0" onclick="showCreateReviewForEmployee('${employeeId}','${name.replace(/'/g,"\\'")}')">+ Add Review</button>
        </div>
        ${reviews.length ? reviews.map(r => `
          <div style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:6px">
              <div>
                <span style="font-weight:600">${r.period}</span>
                <span style="font-size:12px;color:#6b7280;margin-left:8px">${r.type} review by ${r.reviewer?.name||'Unknown'}</span>
                ${r.status === 'submitted' ? '<span style="background:#f0fdf4;color:#16a34a;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600;margin-left:6px">Submitted</span>' : '<span style="background:#f9fafb;color:#6b7280;padding:2px 6px;border-radius:10px;font-size:10px;font-weight:600;margin-left:6px">Draft</span>'}
              </div>
              <div>${_starRating(r.overallScore)}</div>
            </div>
            ${r.summary ? `<p style="font-size:13px;color:#374151;margin:4px 0">${r.summary}</p>` : ''}
            ${r.strengths ? `<p style="font-size:12px;color:#16a34a;margin:2px 0">💪 ${r.strengths}</p>` : ''}
            ${r.improvements ? `<p style="font-size:12px;color:#d97706;margin:2px 0">📈 ${r.improvements}</p>` : ''}
            ${r.status === 'draft' ? `<button class="btn btn-sm" style="margin-top:8px;font-size:11px" onclick="submitReview('${r._id}','${employeeId}','${name.replace(/'/g,"\\'")}')">Submit Review</button>` : ''}
          </div>
        `).join('') : '<p style="color:#9ca3af;font-size:13px">No reviews yet.</p>'}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function submitCreateGoal(isSelf, employeeId, employeeName) {
  const prefix = isSelf ? 'myg' : 'pg';
  const title   = document.getElementById(`${prefix}-title`).value.trim();
  const cat     = document.getElementById(`${prefix}-cat`).value;
  const target  = document.getElementById(`${prefix}-target`)?.value;
  const unit    = document.getElementById(`${prefix}-unit`)?.value.trim() || '';
  const period  = document.getElementById(`${prefix}-period`).value;
  const due     = document.getElementById(`${prefix}-due`)?.value;
  const empId   = isSelf ? null : (document.getElementById(`${prefix}-emp`)?.value.trim() || employeeId);
  const errEl   = document.getElementById(`${prefix}-error`);
  if (errEl) errEl.style.display = 'none';

  if (!title) { if (errEl) { errEl.textContent = 'Title is required.'; errEl.style.display = 'block'; } return; }

  const body = { title, category: cat, period };
  if (empId) body.employeeId = empId;
  if (target) body.targetValue = parseFloat(target);
  if (unit) body.unit = unit;
  if (due) body.dueDate = due;

  const btn = event.target; btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await api('/api/performance/goals', { method: 'POST', body: JSON.stringify(body) });
    toast('Goal created!', 'ok');
    closeModal();
    if (isSelf) renderMyPerformance();
    else if (employeeId) viewScorecard(employeeId, employeeName);
    else renderPerformance();
  } catch(e) {
    if (errEl) { errEl.textContent = e.message; errEl.style.display = 'block'; }
    else toast(e.message, 'err');
    btn.disabled = false; btn.textContent = '+ Set Goal';
  }
}

function showAddGoalForEmployee(employeeId, name) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:480px">
        <h3>Add Goal for ${name}</h3>
        ${_goalFormFields('mg')}
        <div id="mg-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="submitGoalFromModal('${employeeId}','${name.replace(/'/g,"\\'")}')">+ Add Goal</button>
        </div>
      </div>
    </div>`;
}

function _goalFormFields(prefix) {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      <div style="grid-column:1/-1">
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Title *</label>
        <input id="${prefix}-title" placeholder="Goal title" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Category</label>
        <select id="${prefix}-cat" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          <option value="kpi">KPI</option><option value="personal">Personal</option><option value="team">Team</option><option value="learning">Learning</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Period</label>
        <select id="${prefix}-period" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          <option value="monthly">Monthly</option><option value="quarterly" selected>Quarterly</option><option value="annual">Annual</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Target</label>
        <input id="${prefix}-target" type="number" placeholder="e.g. 100" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Unit</label>
        <input id="${prefix}-unit" placeholder="e.g. calls, %" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      </div>
      <div style="grid-column:1/-1">
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Due Date</label>
        <input id="${prefix}-due" type="date" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      </div>
    </div>`;
}

async function submitGoalFromModal(employeeId, name) {
  const title   = document.getElementById('mg-title').value.trim();
  const cat     = document.getElementById('mg-cat').value;
  const target  = document.getElementById('mg-target').value;
  const unit    = document.getElementById('mg-unit').value.trim();
  const period  = document.getElementById('mg-period').value;
  const due     = document.getElementById('mg-due').value;
  const errEl   = document.getElementById('mg-error');
  errEl.style.display = 'none';

  if (!title) { errEl.textContent = 'Title is required.'; errEl.style.display = 'block'; return; }

  const body = { title, category: cat, period, employeeId };
  if (target) body.targetValue = parseFloat(target);
  if (unit) body.unit = unit;
  if (due) body.dueDate = due;

  const btn = event.target; btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await api('/api/performance/goals', { method: 'POST', body: JSON.stringify(body) });
    toast('Goal added!', 'ok');
    closeModal();
    viewScorecard(employeeId, name);
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = '+ Add Goal';
  }
}

function showUpdateGoalProgress(goalId, title, current, target, unit) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:380px">
        <h3>Update: ${title}</h3>
        <p style="font-size:13px;color:#6b7280;margin-bottom:14px">Target: ${target || '—'} ${unit}</p>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Current Value *</label>
        <input id="up-val" type="number" value="${current}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;margin-bottom:12px">
        <div id="up-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="updateGoalProgress('${goalId}')">Save Progress</button>
        </div>
      </div>
    </div>`;
}

async function updateGoalProgress(goalId) {
  const val = parseFloat(document.getElementById('up-val').value);
  const errEl = document.getElementById('up-error');
  if (isNaN(val)) { errEl.textContent = 'Enter a valid number.'; errEl.style.display = 'block'; return; }
  const btn = event.target; btn.disabled = true;
  try {
    await api(`/api/performance/goals/${goalId}`, { method: 'PATCH', body: JSON.stringify({ currentValue: val }) });
    toast('Progress updated!', 'ok');
    closeModal();
    // Refresh current scorecard view
    const h2 = document.querySelector('.page-header h2');
    if (h2 && h2.textContent.includes('Scorecard')) {
      const match = h2.textContent.match(/Scorecard — (.+)/);
      if (match) {
        const empRow = document.querySelector(`button[onclick*="viewScorecard"]`);
        if (empRow) empRow.click();
      }
    }
  } catch(e) { errEl.textContent = e.message; errEl.style.display = 'block'; btn.disabled = false; }
}

async function deleteGoal(goalId, employeeId, name) {
  if (!confirm('Delete this goal?')) return;
  try {
    await api(`/api/performance/goals/${goalId}`, { method: 'DELETE' });
    toast('Goal deleted', 'ok');
    viewScorecard(employeeId, name);
  } catch(e) { toast(e.message, 'err'); }
}

function showCreateReviewModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:500px">
        <h3>New Performance Review</h3>
        ${_reviewFormFields('nr')}
        <div id="nr-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="submitCreateReview('nr', null, null)">Create Review</button>
        </div>
      </div>
    </div>`;
}

function showCreateReviewForEmployee(employeeId, name) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:500px">
        <h3>Review — ${name}</h3>
        ${_reviewFormFields('er', employeeId)}
        <div id="er-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="submitCreateReview('er','${employeeId}','${name.replace(/'/g,"\\'")}')">Create Review</button>
        </div>
      </div>
    </div>`;
}

function _reviewFormFields(prefix, employeeId) {
  return `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
      ${!employeeId ? `<div style="grid-column:1/-1">
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Employee ID *</label>
        <input id="${prefix}-emp" placeholder="Paste employee _id" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      </div>` : ''}
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Period *</label>
        <input id="${prefix}-period" placeholder="e.g. Q1 2026" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Type</label>
        <select id="${prefix}-type" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          <option value="manager">Manager Review</option>
          <option value="peer">Peer Review</option>
          <option value="self">Self Review</option>
        </select>
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Overall Score (1–5)</label>
        <input id="${prefix}-score" type="number" min="1" max="5" step="0.5" placeholder="e.g. 4.0" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      </div>
    </div>
    <div style="margin-bottom:10px">
      <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Summary</label>
      <textarea id="${prefix}-summary" rows="2" placeholder="Overall performance summary…" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;resize:vertical"></textarea>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Strengths</label>
        <textarea id="${prefix}-strengths" rows="2" placeholder="Key strengths…" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;resize:vertical"></textarea>
      </div>
      <div>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Areas to Improve</label>
        <textarea id="${prefix}-improve" rows="2" placeholder="Growth areas…" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;resize:vertical"></textarea>
      </div>
    </div>`;
}

async function submitCreateReview(prefix, employeeId, name) {
  const empId   = employeeId || document.getElementById(`${prefix}-emp`)?.value.trim();
  const period  = document.getElementById(`${prefix}-period`).value.trim();
  const type    = document.getElementById(`${prefix}-type`).value;
  const score   = document.getElementById(`${prefix}-score`).value;
  const summary = document.getElementById(`${prefix}-summary`).value.trim();
  const strengths = document.getElementById(`${prefix}-strengths`).value.trim();
  const improvements = document.getElementById(`${prefix}-improve`).value.trim();
  const errEl   = document.getElementById(`${prefix}-error`);
  errEl.style.display = 'none';

  if (!empId) { errEl.textContent = 'Employee ID is required.'; errEl.style.display = 'block'; return; }
  if (!period) { errEl.textContent = 'Period is required.'; errEl.style.display = 'block'; return; }

  const btn = event.target; btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await api('/api/performance/reviews', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: empId, period, type,
        overallScore: score ? parseFloat(score) : null,
        summary, strengths, improvements,
      }),
    });
    toast('Review created!', 'ok');
    closeModal();
    if (name) viewScorecard(empId, name);
    else renderPerformance();
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Create Review';
  }
}

async function submitReview(reviewId, employeeId, name) {
  if (!confirm('Submit this review? It cannot be edited after submission.')) return;
  try {
    await api(`/api/performance/reviews/${reviewId}`, { method: 'PATCH', body: JSON.stringify({ submit: true }) });
    toast('Review submitted!', 'ok');
    viewScorecard(employeeId, name);
  } catch(e) { toast(e.message, 'err'); }
}

// ── EMPLOYEE: My Performance ──────────────────────────────────────────────────
async function renderMyPerformance() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading…</div>';

  try {
    const [goalsData, reviewsData] = await Promise.all([
      api('/api/performance/goals'),
      api('/api/performance/reviews'),
    ]);

    const goals   = goalsData.goals || [];
    const reviews = reviewsData.reviews.filter(r => r.status === 'submitted') || [];

    const totalGoals = goals.length;
    const completedGoals = goals.filter(g => g.status === 'completed').length;
    const activeGoals = goals.filter(g => g.status === 'active');

    content.innerHTML = `
      <div class="page-header"><h2>My Performance</h2><p>Track your goals and view your reviews</p></div>

      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-value">${totalGoals}</div><div class="stat-label">Goals</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#22c55e">${completedGoals}</div><div class="stat-label">Completed</div></div>
        <div class="stat-card"><div class="stat-value">${reviews.length}</div><div class="stat-label">Reviews</div></div>
        <div class="stat-card">
          <div class="stat-value">${reviews.length && reviews[0].overallScore ? `${reviews[0].overallScore}/5` : '—'}</div>
          <div class="stat-label">Latest Score</div>
        </div>
      </div>

      <!-- Goals -->
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
          <h3 style="font-size:15px;font-weight:700;margin:0">My Goals</h3>
          <button class="btn btn-primary btn-sm" onclick="showMyGoalModal()">+ Add Goal</button>
        </div>
        ${activeGoals.length ? activeGoals.map(g => {
          const pct = g.targetValue ? Math.round((g.currentValue/g.targetValue)*100) : null;
          return `
          <div style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                <span style="font-weight:600;font-size:14px">${g.title}</span>
                ${_catBadge(g.category)}
              </div>
              ${pct !== null ? `<button class="btn btn-sm" style="font-size:11px" onclick="showSelfUpdateGoal('${g._id}','${g.title.replace(/'/g,"\\'")}',${g.currentValue},${g.targetValue},'${g.unit||''}')">Update</button>` : ''}
            </div>
            ${pct !== null ? `
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                <div style="flex:1">${_progressBar(pct)}</div>
                <span style="font-size:12px;font-weight:700;min-width:36px">${pct}%</span>
              </div>
              <div style="font-size:12px;color:#6b7280">${g.currentValue} / ${g.targetValue} ${g.unit} · Due ${g.dueDate ? new Date(g.dueDate).toLocaleDateString() : '—'}</div>
            ` : ''}
          </div>`;
        }).join('') : '<p style="color:#9ca3af;font-size:13px">No active goals. Add your own or wait for your manager to assign goals.</p>'}
        ${completedGoals > 0 ? `<p style="font-size:12px;color:#16a34a;margin-top:8px">✅ ${completedGoals} goal${completedGoals>1?'s':''} completed</p>` : ''}
      </div>

      <!-- Reviews -->
      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">My Reviews</h3>
        ${reviews.length ? reviews.map(r => `
          <div style="padding:14px;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:8px">
              <div>
                <span style="font-weight:700;font-size:15px">${r.period}</span>
                <span style="font-size:12px;color:#6b7280;margin-left:8px">${r.type} review · ${r.reviewer?.name||'Manager'}</span>
              </div>
              <div>${_starRating(r.overallScore)}</div>
            </div>
            ${r.summary ? `<p style="font-size:13px;line-height:1.6;margin:0 0 8px">${r.summary}</p>` : ''}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              ${r.strengths ? `<div style="background:#f0fdf4;padding:10px;border-radius:7px"><div style="font-size:11px;font-weight:700;color:#16a34a;margin-bottom:4px">STRENGTHS</div><div style="font-size:12px">${r.strengths}</div></div>` : ''}
              ${r.improvements ? `<div style="background:#fffbeb;padding:10px;border-radius:7px"><div style="font-size:11px;font-weight:700;color:#d97706;margin-bottom:4px">IMPROVEMENTS</div><div style="font-size:12px">${r.improvements}</div></div>` : ''}
            </div>
          </div>
        `).join('') : `<p style="color:#9ca3af;font-size:13px">No reviews submitted yet.</p>`}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

function showMyGoalModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:440px">
        <h3>Add Personal Goal</h3>
        ${_goalFormFields('myg')}
        <div id="myg-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="submitSelfGoal()">Add Goal</button>
        </div>
      </div>
    </div>`;
}

async function submitSelfGoal() {
  const title  = document.getElementById('myg-title').value.trim();
  const cat    = document.getElementById('myg-cat').value;
  const target = document.getElementById('myg-target').value;
  const unit   = document.getElementById('myg-unit').value.trim();
  const period = document.getElementById('myg-period').value;
  const due    = document.getElementById('myg-due').value;
  const errEl  = document.getElementById('myg-error');
  errEl.style.display = 'none';
  if (!title) { errEl.textContent = 'Title is required.'; errEl.style.display = 'block'; return; }

  const body = { title, category: cat, period };
  if (target) body.targetValue = parseFloat(target);
  if (unit) body.unit = unit;
  if (due) body.dueDate = due;

  const btn = event.target; btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await api('/api/performance/goals', { method: 'POST', body: JSON.stringify(body) });
    toast('Goal added!', 'ok');
    closeModal();
    renderMyPerformance();
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Add Goal';
  }
}

function showSelfUpdateGoal(goalId, title, current, target, unit) {
  showUpdateGoalProgress(goalId, title, current, target, unit);
}

// ══════════════════════════════════════════════════════════════════════════════
//  CORPORATE PHASE 4 — OPERATIONS (Timesheets, Expenses, Assets)
// ══════════════════════════════════════════════════════════════════════════════

// ── Patch buildSidebar for Phase 4 ───────────────────────────────────────────
const _p4BuildSidebar = buildSidebar;
buildSidebar = function() {
  _p4BuildSidebar();
  const role = currentUser?.role;
  const mode = currentUser?.company?.mode;
  if (mode !== 'corporate') return;

  const opsIcon  = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`;
  const assetIcon= `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`;

  if (['admin','manager','superadmin'].includes(role)) {
    const perfLink = document.getElementById('nav-performance');
    if (perfLink) {
      if (!document.getElementById('nav-timesheets')) {
        const a = document.createElement('a');
        a.id = 'nav-timesheets';
        a.innerHTML = `${opsIcon}<span>Timesheets</span>`; a.dataset.tooltip = "Timesheets";
        a.onclick = () => navigateTo('timesheets');
        perfLink.insertAdjacentElement('afterend', a);
      }
      if (!document.getElementById('nav-expenses-mgr')) {
        const a = document.createElement('a');
        a.id = 'nav-expenses-mgr';
        a.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span>Expenses</span>`; a.dataset.tooltip = "Expenses";
        a.onclick = () => navigateTo('expenses-mgr');
        document.getElementById('nav-timesheets').insertAdjacentElement('afterend', a);
      }
      if (!document.getElementById('nav-assets')) {
        const a = document.createElement('a');
        a.id = 'nav-assets';
        a.innerHTML = `${assetIcon}<span>Assets</span>`; a.dataset.tooltip = "Assets";
        a.onclick = () => navigateTo('assets');
        document.getElementById('nav-expenses-mgr').insertAdjacentElement('afterend', a);
      }
    }
  } else if (role === 'employee') {
    const myPerfLink = document.getElementById('nav-my-performance');
    if (myPerfLink) {
      if (!document.getElementById('nav-my-timesheet')) {
        const a = document.createElement('a');
        a.id = 'nav-my-timesheet';
        a.innerHTML = `${opsIcon}<span>Timesheet</span>`; a.dataset.tooltip = "Timesheet";
        a.onclick = () => navigateTo('my-timesheet');
        myPerfLink.insertAdjacentElement('afterend', a);
      }
      if (!document.getElementById('nav-my-expenses')) {
        const a = document.createElement('a');
        a.id = 'nav-my-expenses';
        a.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><span>Expenses</span>`; a.dataset.tooltip = "Expenses";
        a.onclick = () => navigateTo('my-expenses');
        document.getElementById('nav-my-timesheet').insertAdjacentElement('afterend', a);
      }
      if (!document.getElementById('nav-my-assets')) {
        const a = document.createElement('a');
        a.id = 'nav-my-assets';
        a.innerHTML = `${assetIcon}<span>My Assets</span>`; a.dataset.tooltip = "My Assets";
        a.onclick = () => navigateTo('my-assets');
        document.getElementById('nav-my-expenses').insertAdjacentElement('afterend', a);
      }
    }
  }
};

// ── Patch navigateTo for Phase 4 ─────────────────────────────────────────────
const _p4NavigateTo = navigateTo;
navigateTo = function(view) {
  if (view === 'timesheets')   { currentView = view; _setNavActive(view); renderTimesheets(); return; }
  if (view === 'expenses-mgr') { currentView = view; _setNavActive('expenses-mgr'); renderExpensesMgr(); return; }
  if (view === 'assets')       { currentView = view; _setNavActive(view); renderAssets(); return; }
  if (view === 'my-timesheet') { currentView = view; _setNavActive('my-timesheet'); renderMyTimesheet(); return; }
  if (view === 'my-expenses')  { currentView = view; _setNavActive('my-expenses'); renderMyExpenses(); return; }
  if (view === 'my-assets')    { currentView = view; _setNavActive('my-assets'); renderMyAssets(); return; }
  _p4NavigateTo(view);
};

// ── Shared helpers ────────────────────────────────────────────────────────────
function _statusPill(s) {
  return ({
    draft:     'background:#f1f5f9;color:#475569',
    submitted: 'background:#eff6ff;color:#1d4ed8',
    approved:  'background:#f0fdf4;color:#16a34a',
    rejected:  'background:#fef2f2;color:#dc2626',
    pending:   'background:#fef3c7;color:#d97706',
  }[s] || 'background:#f3f4f6;color:#6b7280');
}
function _pill(label, status) {
  return `<span style="${_statusPill(status)};padding:2px 10px;border-radius:12px;font-size:11px;font-weight:700;text-transform:uppercase">${label}</span>`;
}

// ══════════════════════════════════════════════════════════════
// MANAGER — TIMESHEETS
// ══════════════════════════════════════════════════════════════
async function renderTimesheets() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading…</div>';

  const period = new Date().toISOString().slice(0, 7);

  try {
    const { timesheets } = await api(`/api/operations/timesheets?period=${period}`);

    const summary = { total: timesheets.length, submitted: 0, approved: 0, rejected: 0, totalHours: 0 };
    timesheets.forEach(t => { summary[t.status] = (summary[t.status]||0)+1; summary.totalHours += t.totalHours||0; });

    content.innerHTML = `
      <div class="page-header"><h2>Timesheets</h2><p>Review and approve employee timesheets</p></div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <label style="font-size:12px;font-weight:700;color:#6b7280">Period:</label>
        <input type="month" id="ts-period-filter" value="${period}" onchange="filterTimesheets()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
      </div>

      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-value">${summary.total}</div><div class="stat-label">Total</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#1d4ed8">${summary.submitted||0}</div><div class="stat-label">Pending Review</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#16a34a">${summary.approved||0}</div><div class="stat-label">Approved</div></div>
        <div class="stat-card"><div class="stat-value">${summary.totalHours}</div><div class="stat-label">Total Hours</div></div>
      </div>

      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">Submitted Timesheets</h3>
        ${timesheets.length ? `
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f9fafb">
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Employee</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Period</th>
              <th style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb">Hours</th>
              <th style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb">Status</th>
              <th style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb">Actions</th>
            </tr></thead>
            <tbody>
              ${timesheets.map(t => `
                <tr style="border-bottom:1px solid #f3f4f6">
                  <td style="padding:10px;font-weight:600">${t.employee?.name||'—'}<div style="font-size:11px;color:#9ca3af">${t.employee?.department||''}</div></td>
                  <td style="padding:10px;color:#6b7280">${t.period}</td>
                  <td style="padding:10px;text-align:center;font-weight:700">${t.totalHours}</td>
                  <td style="padding:10px;text-align:center">${_pill(t.status, t.status)}</td>
                  <td style="padding:10px;text-align:center">
                    <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
                      <button class="btn btn-sm" style="font-size:11px" onclick="viewTimesheetDetail('${t._id}','${(t.employee?.name||'').replace(/'/g,"\\'")}','${t.period}')">View</button>
                      ${t.status === 'submitted' ? `
                        <button class="btn btn-sm" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0;font-size:11px" onclick="reviewTimesheet('${t._id}','approved')">✓ Approve</button>
                        <button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-size:11px" onclick="reviewTimesheet('${t._id}','rejected')">✗ Reject</button>
                      ` : ''}
                      ${t.status === 'approved' ? `<button class="btn btn-sm" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-size:11px" onclick="exportTimesheet('${t._id}')">⬇ CSV</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : '<p style="color:#9ca3af;font-size:13px">No timesheets for this period.</p>'}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function filterTimesheets() {
  const period = document.getElementById('ts-period-filter')?.value;
  if (!period) return;
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { timesheets } = await api(`/api/operations/timesheets?period=${period}`);
    renderTimesheets._cached = timesheets;
    renderTimesheets();
  } catch(e) { content.innerHTML = `<div class="card"><p style="color:#ef4444">${e.message}</p></div>`; }
}

async function viewTimesheetDetail(id, name, period) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:560px;width:95%">
        <h3>Timesheet — ${name} (${period})</h3>
        <div id="tsd-content"><p>Loading…</p></div>
        <div class="modal-actions"><button class="btn btn-secondary" onclick="closeModal()">Close</button></div>
      </div>
    </div>`;
  try {
    const { timesheets } = await api(`/api/operations/timesheets?period=${period}`);
    const ts = timesheets.find(t => t._id === id);
    const el = document.getElementById('tsd-content');
    if (!ts || !ts.entries.length) { el.innerHTML = '<p style="color:#9ca3af">No entries.</p>'; return; }
    el.innerHTML = `
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px">
        <thead><tr style="background:#f9fafb">
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb">Date</th>
          <th style="padding:8px;text-align:center;border-bottom:1px solid #e5e7eb">Hours</th>
          <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb">Notes</th>
        </tr></thead>
        <tbody>
          ${ts.entries.sort((a,b)=>new Date(a.date)-new Date(b.date)).map(e=>`
            <tr style="border-bottom:1px solid #f3f4f6">
              <td style="padding:8px">${new Date(e.date).toLocaleDateString()}</td>
              <td style="padding:8px;text-align:center;font-weight:600">${e.hoursWorked}</td>
              <td style="padding:8px;color:#6b7280;font-size:12px">${e.notes||'—'}</td>
            </tr>
          `).join('')}
          <tr style="background:#f9fafb;font-weight:700">
            <td style="padding:8px">TOTAL</td>
            <td style="padding:8px;text-align:center">${ts.totalHours}</td>
            <td></td>
          </tr>
        </tbody>
      </table>
      ${ts.reviewNote ? `<p style="font-size:12px;color:#6b7280">Note: ${ts.reviewNote}</p>` : ''}
    `;
  } catch(e) {
    document.getElementById('tsd-content').innerHTML = `<p style="color:#ef4444">${e.message}</p>`;
  }
}

async function reviewTimesheet(id, action) {
  const note = action === 'rejected' ? prompt('Reason for rejection (optional):') || '' : '';
  try {
    await api(`/api/operations/timesheets/${id}/review`, { method: 'PATCH', body: JSON.stringify({ action, note }) });
    toast(`Timesheet ${action}!`, 'ok');
    renderTimesheets();
  } catch(e) { toast(e.message, 'err'); }
}

function exportTimesheet(id) {
  const token = localStorage.getItem('kodex_token') || localStorage.getItem('token');
  window.open(`/api/operations/timesheets/${id}/export?token=${token}`, '_blank');
}

// ══════════════════════════════════════════════════════════════
// MANAGER — EXPENSES
// ══════════════════════════════════════════════════════════════
async function renderExpensesMgr() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { expenses } = await api('/api/operations/expenses');
    const pending  = expenses.filter(e => e.status === 'pending');
    const approved = expenses.filter(e => e.status === 'approved');
    const totalPending  = pending.reduce((s,e)=>s+e.amount,0);
    const totalApproved = approved.reduce((s,e)=>s+e.amount,0);

    const catIcon = c => ({travel:'✈️',meals:'🍽️',equipment:'🖥️',software:'💿',training:'📚',other:'📎'}[c]||'📎');

    content.innerHTML = `
      <div class="page-header"><h2>Expense Claims</h2><p>Review and approve employee expense claims</p></div>

      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-value">${expenses.length}</div><div class="stat-label">Total Claims</div></div>
        <div class="stat-card" style="border-left:3px solid #f59e0b"><div class="stat-value" style="color:#f59e0b">${pending.length}</div><div class="stat-label">Pending</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#16a34a">${approved.length}</div><div class="stat-label">Approved</div></div>
        <div class="stat-card"><div class="stat-value">${totalApproved.toFixed(2)}</div><div class="stat-label">Total Approved (GHS)</div></div>
      </div>

      ${pending.length ? `
      <div class="card" style="margin-bottom:16px">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">Pending Review (${pending.length})</h3>
        ${pending.map(e => `
          <div style="padding:14px;border:1px solid #fde68a;border-radius:10px;background:#fffbeb;margin-bottom:10px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px">
              <div>
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
                  <span style="font-size:16px">${catIcon(e.category)}</span>
                  <span style="font-weight:700">${e.title}</span>
                </div>
                <div style="font-size:12px;color:#6b7280">${e.employee?.name||'—'} · ${new Date(e.date).toLocaleDateString()} · ${e.currency} <strong>${e.amount.toFixed(2)}</strong></div>
                ${e.notes ? `<div style="font-size:12px;color:#9ca3af;margin-top:4px">${e.notes}</div>` : ''}
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-sm" style="background:#f0fdf4;color:#16a34a;border:1px solid #bbf7d0" onclick="reviewExpense('${e._id}','approved')">✓ Approve</button>
                <button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca" onclick="reviewExpense('${e._id}','rejected')">✗ Reject</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>` : ''}

      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">All Claims</h3>
        ${expenses.length ? `
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f9fafb">
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Employee</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Title</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Category</th>
              <th style="padding:10px;text-align:right;border-bottom:1px solid #e5e7eb">Amount</th>
              <th style="padding:10px;text-align:center;border-bottom:1px solid #e5e7eb">Status</th>
              <th style="padding:10px;text-align:left;border-bottom:1px solid #e5e7eb">Date</th>
            </tr></thead>
            <tbody>
              ${expenses.map(e=>`
                <tr style="border-bottom:1px solid #f3f4f6">
                  <td style="padding:10px;font-weight:600">${e.employee?.name||'—'}</td>
                  <td style="padding:10px">${e.title}</td>
                  <td style="padding:10px">${catIcon(e.category)} ${e.category}</td>
                  <td style="padding:10px;text-align:right;font-weight:700">${e.currency} ${e.amount.toFixed(2)}</td>
                  <td style="padding:10px;text-align:center">${_pill(e.status,e.status)}</td>
                  <td style="padding:10px;font-size:12px;color:#6b7280">${new Date(e.date).toLocaleDateString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : '<p style="color:#9ca3af;font-size:13px">No expense claims yet.</p>'}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function reviewExpense(id, action) {
  const note = action === 'rejected' ? prompt('Reason for rejection (optional):') || '' : '';
  try {
    await api(`/api/operations/expenses/${id}/review`, { method: 'PATCH', body: JSON.stringify({ action, note }) });
    toast(`Expense ${action}!`, 'ok');
    renderExpensesMgr();
  } catch(e) { toast(e.message, 'err'); }
}

// ══════════════════════════════════════════════════════════════
// MANAGER — ASSETS
// ══════════════════════════════════════════════════════════════
async function renderAssets() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { assets } = await api('/api/operations/assets');
    const assigned   = assets.filter(a => a.assignedTo);
    const unassigned = assets.filter(a => !a.assignedTo);

    const catIcon = c => ({laptop:'💻',phone:'📱',vehicle:'🚗',furniture:'🪑',equipment:'⚙️',other:'📦'}[c]||'📦');
    const condColor = c => ({new:'#16a34a',good:'#3b82f6',fair:'#f59e0b',poor:'#ef4444'}[c]||'#6b7280');

    content.innerHTML = `
      <div class="page-header"><h2>Asset Tracking</h2><p>Manage and assign company assets</p></div>

      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-value">${assets.length}</div><div class="stat-label">Total Assets</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#16a34a">${assigned.length}</div><div class="stat-label">Assigned</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#f59e0b">${unassigned.length}</div><div class="stat-label">Available</div></div>
      </div>

      <!-- Add Asset -->
      <div class="card" style="margin-bottom:16px">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">Add Asset</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:10px">
          ${[
            ['as-name','Name *','text','e.g. MacBook Pro'],
            ['as-tag','Asset Tag','text','e.g. AST-001'],
            ['as-serial','Serial No.','text','Optional'],
          ].map(([id,label,type,placeholder])=>`
            <div>
              <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">${label}</label>
              <input id="${id}" type="${type}" placeholder="${placeholder}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
            </div>
          `).join('')}
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Category</label>
            <select id="as-cat" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              ${['laptop','phone','vehicle','furniture','equipment','other'].map(c=>`<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Condition</label>
            <select id="as-cond" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              ${['new','good','fair','poor'].map(c=>`<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Purchase Value (GHS)</label>
            <input id="as-val" type="number" placeholder="Optional" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
        </div>
        <div id="as-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <button class="btn btn-primary" onclick="submitCreateAsset()">+ Add Asset</button>
      </div>

      <!-- Assets list -->
      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">All Assets (${assets.length})</h3>
        ${assets.length ? assets.map(a => `
          <div style="padding:14px;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:10px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                  <span style="font-size:18px">${catIcon(a.category)}</span>
                  <span style="font-weight:700;font-size:14px">${a.name}</span>
                  ${a.assetTag ? `<span style="font-size:11px;color:#6b7280;background:#f3f4f6;padding:2px 6px;border-radius:4px">${a.assetTag}</span>` : ''}
                  <span style="width:8px;height:8px;border-radius:50%;background:${condColor(a.condition)};display:inline-block" title="${a.condition}"></span>
                </div>
                <div style="font-size:12px;color:#6b7280">
                  ${a.serialNumber ? `S/N: ${a.serialNumber} · ` : ''}
                  ${a.purchaseValue ? `GHS ${a.purchaseValue.toLocaleString()} · ` : ''}
                  ${a.assignedTo ? `<span style="color:#16a34a;font-weight:600">Assigned: ${a.assignedTo.name}</span>` : '<span style="color:#f59e0b">Unassigned</span>'}
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button class="btn btn-sm" style="background:#f5f3ff;color:#5b21b6;border:1px solid #ddd6fe;font-size:11px" onclick="showAssignAsset('${a._id}','${a.name.replace(/'/g,"\\'")}')">
                  ${a.assignedTo ? 'Reassign' : 'Assign'}
                </button>
                ${a.assignedTo ? `<button class="btn btn-sm" style="background:#fef3c7;color:#d97706;border:1px solid #fde68a;font-size:11px" onclick="unassignAsset('${a._id}')">Unassign</button>` : ''}
                <button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-size:11px" onclick="deleteAsset('${a._id}')">Remove</button>
              </div>
            </div>
          </div>
        `).join('') : '<p style="color:#9ca3af;font-size:13px">No assets yet. Add one above.</p>'}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function submitCreateAsset() {
  const name = document.getElementById('as-name').value.trim();
  const errEl = document.getElementById('as-error');
  errEl.style.display = 'none';
  if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }
  const body = {
    name,
    assetTag: document.getElementById('as-tag').value.trim(),
    serialNumber: document.getElementById('as-serial').value.trim(),
    category: document.getElementById('as-cat').value,
    condition: document.getElementById('as-cond').value,
    purchaseValue: document.getElementById('as-val').value || null,
  };
  const btn = event.target; btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await api('/api/operations/assets', { method: 'POST', body: JSON.stringify(body) });
    toast('Asset added!', 'ok');
    renderAssets();
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = '+ Add Asset';
  }
}

function showAssignAsset(assetId, name) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:380px">
        <h3>Assign: ${name}</h3>
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Employee ID</label>
        <input id="assign-emp" placeholder="Paste employee _id" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px;margin-bottom:12px">
        <div id="assign-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="confirmAssignAsset('${assetId}')">Assign</button>
        </div>
      </div>
    </div>`;
}

async function confirmAssignAsset(assetId) {
  const employeeId = document.getElementById('assign-emp').value.trim();
  const errEl = document.getElementById('assign-error');
  if (!employeeId) { errEl.textContent = 'Employee ID required.'; errEl.style.display = 'block'; return; }
  const btn = event.target; btn.disabled = true;
  try {
    await api(`/api/operations/assets/${assetId}/assign`, { method: 'PATCH', body: JSON.stringify({ employeeId }) });
    toast('Asset assigned!', 'ok');
    closeModal();
    renderAssets();
  } catch(e) { errEl.textContent = e.message; errEl.style.display = 'block'; btn.disabled = false; }
}

async function unassignAsset(assetId) {
  if (!confirm('Remove assignment for this asset?')) return;
  try {
    await api(`/api/operations/assets/${assetId}/assign`, { method: 'PATCH', body: JSON.stringify({ employeeId: null }) });
    toast('Asset unassigned', 'ok');
    renderAssets();
  } catch(e) { toast(e.message, 'err'); }
}

async function deleteAsset(id) {
  if (!confirm('Remove this asset from tracking?')) return;
  try {
    await api(`/api/operations/assets/${id}`, { method: 'DELETE' });
    toast('Asset removed', 'ok');
    renderAssets();
  } catch(e) { toast(e.message, 'err'); }
}

// ══════════════════════════════════════════════════════════════
// EMPLOYEE — TIMESHEET
// ══════════════════════════════════════════════════════════════
async function renderMyTimesheet() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading…</div>';
  const period = new Date().toISOString().slice(0, 7);

  try {
    const { timesheet } = await api(`/api/operations/timesheets/my?period=${period}`);
    const editable = timesheet.status === 'draft';

    // Build calendar grid for the month
    const [yr, mo] = period.split('-').map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const entryMap = {};
    timesheet.entries.forEach(e => {
      const d = new Date(e.date).getDate();
      entryMap[d] = e;
    });

    content.innerHTML = `
      <div class="page-header"><h2>My Timesheet</h2><p>Log your daily hours</p></div>

      <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <input type="month" id="mts-period" value="${period}" onchange="reloadMyTimesheet()" style="padding:6px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
        <span>${_pill(timesheet.status, timesheet.status)}</span>
        ${editable ? `<button class="btn btn-primary btn-sm" onclick="submitMyTimesheet('${period}')">Submit for Approval</button>` : ''}
      </div>

      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-value">${timesheet.totalHours}</div><div class="stat-label">Total Hours</div></div>
        <div class="stat-card"><div class="stat-value">${timesheet.entries.length}</div><div class="stat-label">Days Logged</div></div>
        <div class="stat-card"><div class="stat-value">${daysInMonth}</div><div class="stat-label">Days in Month</div></div>
      </div>

      ${timesheet.reviewNote ? `<div class="card" style="margin-bottom:14px;border-left:4px solid ${timesheet.status==='approved'?'#22c55e':'#ef4444'}"><p style="font-size:13px;margin:0"><strong>Review note:</strong> ${timesheet.reviewNote}</p></div>` : ''}

      <!-- Log hours form -->
      ${editable ? `
      <div class="card" style="margin-bottom:16px">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">Log Hours</h3>
        <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Date</label>
            <input id="log-date" type="date" value="${new Date().toISOString().slice(0,10)}" style="padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Hours</label>
            <input id="log-hours" type="number" min="0" max="24" step="0.5" value="8" style="width:80px;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div style="flex:1;min-width:140px">
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Notes</label>
            <input id="log-notes" placeholder="Optional notes" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <button class="btn btn-primary" onclick="logHours('${period}')">Log</button>
        </div>
      </div>
      ` : ''}

      <!-- Entries table -->
      <div class="card">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">Entries</h3>
        ${timesheet.entries.length ? `
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f9fafb">
            <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb">Date</th>
            <th style="padding:8px;text-align:center;border-bottom:1px solid #e5e7eb">Hours</th>
            <th style="padding:8px;text-align:left;border-bottom:1px solid #e5e7eb">Notes</th>
          </tr></thead>
          <tbody>
            ${timesheet.entries.sort((a,b)=>new Date(a.date)-new Date(b.date)).map(e=>`
              <tr style="border-bottom:1px solid #f3f4f6">
                <td style="padding:8px">${new Date(e.date).toLocaleDateString()}</td>
                <td style="padding:8px;text-align:center;font-weight:600">${e.hoursWorked}</td>
                <td style="padding:8px;color:#6b7280;font-size:12px">${e.notes||'—'}</td>
              </tr>
            `).join('')}
            <tr style="background:#f9fafb;font-weight:700">
              <td style="padding:8px">TOTAL</td>
              <td style="padding:8px;text-align:center">${timesheet.totalHours}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
        ` : '<p style="color:#9ca3af;font-size:13px">No hours logged yet.</p>'}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function reloadMyTimesheet() {
  const period = document.getElementById('mts-period')?.value;
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { timesheet } = await api(`/api/operations/timesheets/my?period=${period}`);
    renderMyTimesheet._ts = timesheet;
    renderMyTimesheet();
  } catch(e) { content.innerHTML = `<div class="card"><p style="color:#ef4444">${e.message}</p></div>`; }
}

async function logHours(period) {
  const date  = document.getElementById('log-date').value;
  const hours = parseFloat(document.getElementById('log-hours').value);
  const notes = document.getElementById('log-notes').value.trim();
  if (!date || isNaN(hours)) { toast('Date and hours required', 'err'); return; }
  const btn = event.target; btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await api('/api/operations/timesheets/my/entry', {
      method: 'POST',
      body: JSON.stringify({ period, date, hoursWorked: hours, notes }),
    });
    toast('Hours logged!', 'ok');
    renderMyTimesheet();
  } catch(e) {
    toast(e.message, 'err');
    btn.disabled = false; btn.textContent = 'Log';
  }
}

async function submitMyTimesheet(period) {
  if (!confirm('Submit timesheet for approval? You cannot edit it after submission.')) return;
  try {
    await api('/api/operations/timesheets/my/submit', { method: 'POST', body: JSON.stringify({ period }) });
    toast('Timesheet submitted!', 'ok');
    renderMyTimesheet();
  } catch(e) { toast(e.message, 'err'); }
}

// ══════════════════════════════════════════════════════════════
// EMPLOYEE — EXPENSES
// ══════════════════════════════════════════════════════════════
async function renderMyExpenses() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { expenses } = await api('/api/operations/expenses/my');
    const total    = expenses.reduce((s,e)=>s+e.amount, 0);
    const approved = expenses.filter(e=>e.status==='approved').reduce((s,e)=>s+e.amount,0);
    const pending  = expenses.filter(e=>e.status==='pending').length;

    const catIcon = c => ({travel:'✈️',meals:'🍽️',equipment:'🖥️',software:'💿',training:'📚',other:'📎'}[c]||'📎');

    content.innerHTML = `
      <div class="page-header"><h2>My Expenses</h2><p>Submit and track expense claims</p></div>

      <div class="stats-grid" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-value">${expenses.length}</div><div class="stat-label">Claims</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#f59e0b">${pending}</div><div class="stat-label">Pending</div></div>
        <div class="stat-card"><div class="stat-value" style="color:#16a34a">${approved.toFixed(2)}</div><div class="stat-label">Approved (GHS)</div></div>
      </div>

      <!-- Submit expense -->
      <div class="card" style="margin-bottom:16px">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">New Expense Claim</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:10px">
          <div style="grid-column:1/-1">
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Title *</label>
            <input id="exp-title" placeholder="e.g. Uber to client site" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Category</label>
            <select id="exp-cat" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              ${['travel','meals','equipment','software','training','other'].map(c=>`<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Amount (GHS) *</label>
            <input id="exp-amount" type="number" min="0" step="0.01" placeholder="0.00" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Date *</label>
            <input id="exp-date" type="date" value="${new Date().toISOString().slice(0,10)}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div style="grid-column:1/-1">
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Notes</label>
            <input id="exp-notes" placeholder="Optional details" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
        </div>
        <div id="exp-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <button class="btn btn-primary" onclick="submitExpense()">Submit Claim</button>
      </div>

      <!-- My claims -->
      <div class="card">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:12px">My Claims</h3>
        ${expenses.length ? expenses.map(e => `
          <div style="padding:12px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:8px">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px">
              <div>
                <span style="font-size:15px;margin-right:6px">${catIcon(e.category)}</span>
                <span style="font-weight:600">${e.title}</span>
                <span style="font-size:12px;color:#6b7280;margin-left:8px">${new Date(e.date).toLocaleDateString()}</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-weight:700">GHS ${e.amount.toFixed(2)}</span>
                ${_pill(e.status, e.status)}
              </div>
            </div>
            ${e.reviewNote ? `<p style="font-size:12px;color:#6b7280;margin:4px 0 0">Note: ${e.reviewNote}</p>` : ''}
          </div>
        `).join('') : '<p style="color:#9ca3af;font-size:13px">No claims yet.</p>'}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function submitExpense() {
  const title  = document.getElementById('exp-title').value.trim();
  const amount = document.getElementById('exp-amount').value;
  const date   = document.getElementById('exp-date').value;
  const cat    = document.getElementById('exp-cat').value;
  const notes  = document.getElementById('exp-notes').value.trim();
  const errEl  = document.getElementById('exp-error');
  errEl.style.display = 'none';
  if (!title || !amount || !date) { errEl.textContent = 'Title, amount and date are required.'; errEl.style.display = 'block'; return; }
  const btn = event.target; btn.disabled = true; btn.textContent = 'Submitting…';
  try {
    await api('/api/operations/expenses', { method: 'POST', body: JSON.stringify({ title, category: cat, amount, date, notes }) });
    toast('Expense claim submitted!', 'ok');
    renderMyExpenses();
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Submit Claim';
  }
}

// ══════════════════════════════════════════════════════════════
// EMPLOYEE — MY ASSETS
// ══════════════════════════════════════════════════════════════
async function renderMyAssets() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { assets } = await api('/api/operations/assets/my');
    const catIcon = c => ({laptop:'💻',phone:'📱',vehicle:'🚗',furniture:'🪑',equipment:'⚙️',other:'📦'}[c]||'📦');

    content.innerHTML = `
      <div class="page-header"><h2>My Assets</h2><p>Assets assigned to you by your company</p></div>
      ${assets.length ? assets.map(a => `
        <div class="card" style="margin-bottom:12px">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            <div style="font-size:36px">${catIcon(a.category)}</div>
            <div style="flex:1">
              <div style="font-weight:700;font-size:16px;margin-bottom:2px">${a.name}</div>
              <div style="font-size:12px;color:#6b7280">
                ${a.assetTag ? `Tag: ${a.assetTag} · ` : ''}
                ${a.serialNumber ? `S/N: ${a.serialNumber} · ` : ''}
                Condition: <span style="font-weight:600;text-transform:capitalize">${a.condition}</span>
              </div>
              ${a.description ? `<div style="font-size:12px;color:#9ca3af;margin-top:4px">${a.description}</div>` : ''}
              <div style="font-size:11px;color:#9ca3af;margin-top:4px">Assigned ${a.assignedAt ? new Date(a.assignedAt).toLocaleDateString() : '—'}</div>
            </div>
          </div>
        </div>
      `).join('') : `
        <div class="card" style="text-align:center;padding:60px 24px">
          <div style="font-size:48px;opacity:.3;margin-bottom:16px">📦</div>
          <div style="font-size:16px;font-weight:600;margin-bottom:6px">No assets assigned</div>
          <p style="color:#9ca3af;font-size:13px">Your manager will assign company assets to you when needed.</p>
        </div>
      `}
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CORPORATE PHASE 5 — ADVANCED (Multi-branch, Branding, Payroll, Analytics)
// ══════════════════════════════════════════════════════════════════════════════

// ── Patch buildSidebar for Phase 5 ───────────────────────────────────────────
const _p5BuildSidebar = buildSidebar;
buildSidebar = function() {
  _p5BuildSidebar();
  const role = currentUser?.role;
  const mode = currentUser?.company?.mode;
  if (mode !== 'corporate' || !['admin','superadmin'].includes(role)) return;

  const icons = {
    analytics: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="18" y="3" width="4" height="18"/><rect x="10" y="8" width="4" height="13"/><rect x="2" y="13" width="4" height="8"/></svg>`,
    branches:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="12"/><circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M12 12 L6 14"/><path d="M12 12 L18 14"/></svg>`,
    branding:  `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
    payroll:   `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
  };

  const assetLink = document.getElementById('nav-assets');
  const anchor = assetLink || document.querySelector('.sidebar-nav a:last-child');
  if (!anchor) return;

  [
    ['nav-analytics',  icons.analytics, 'Analytics',   'analytics'],
    ['nav-branches',   icons.branches,  'Branches',    'branches'],
    ['nav-branding',   icons.branding,  'Branding',    'branding'],
    ['nav-payroll-exp',icons.payroll,   'Payroll Export','payroll-export'],
  ].forEach(([id, icon, label, view]) => {
    if (!document.getElementById(id)) {
      const a = document.createElement('a');
      a.id = id;
      a.innerHTML = `${icon}<span>${label}</span>`; a.dataset.tooltip = label;
      a.onclick = () => navigateTo(view);
      anchor.insertAdjacentElement('afterend', a);
    }
  });
};

// ── Patch navigateTo for Phase 5 ─────────────────────────────────────────────
const _p5NavigateTo = navigateTo;
navigateTo = function(view) {
  if (view === 'analytics')     { currentView = view; _setNavActive(view); renderAnalytics(); return; }
  if (view === 'branches')      { currentView = view; _setNavActive(view); renderBranches(); return; }
  if (view === 'branding')      { currentView = view; _setNavActive(view); renderBranding(); return; }
  if (view === 'payroll-export'){ currentView = view; _setNavActive('payroll-exp'); renderPayrollExport(); return; }
  _p5NavigateTo(view);
};

// ── Mini chart helper (pure CSS bar chart) ────────────────────────────────────
function _miniBarChart(data, labelKey, valueKey, colorFn) {
  if (!data || !data.length) return '<p style="color:#9ca3af;font-size:12px">No data</p>';
  const max = Math.max(...data.map(d => d[valueKey]));
  return data.map(d => {
    const pct = max > 0 ? Math.round((d[valueKey] / max) * 100) : 0;
    const color = colorFn ? colorFn(d) : 'var(--primary)';
    return `
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <div style="font-size:12px;color:#6b7280;min-width:80px;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d[labelKey] || '—'}</div>
        <div style="flex:1;background:#f3f4f6;border-radius:4px;height:14px">
          <div style="background:${color};height:14px;border-radius:4px;width:${pct}%;transition:width .4s"></div>
        </div>
        <div style="font-size:12px;font-weight:700;min-width:30px;text-align:right">${d[valueKey]}</div>
      </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// ANALYTICS DASHBOARD
// ══════════════════════════════════════════════════════════════
async function renderAnalytics() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading analytics…</div>';
  try {
    const data = await api('/api/advanced/analytics');
    const { headcount, leave, training, performance, expenses, timesheets } = data;

    const leaveMap = {};
    (leave.byStatus || []).forEach(l => leaveMap[l._id] = l.count);
    const expTotal = (expenses.byCategory || []).reduce((s,e) => s + e.total, 0);

    content.innerHTML = `
      <div class="page-header"><h2>Analytics Dashboard</h2><p>Company-wide performance insights</p></div>

      <!-- Top KPIs -->
      <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card"><div class="stat-value">${headcount.total}</div><div class="stat-label">Total Employees</div></div>
        <div class="stat-card"><div class="stat-value">${training.rate}%</div><div class="stat-label">Training Completion</div></div>
        <div class="stat-card"><div class="stat-value">${performance.goalRate}%</div><div class="stat-label">Goal Completion</div></div>
        <div class="stat-card"><div class="stat-value">${performance.avgReview ? `${performance.avgReview}/5` : '—'}</div><div class="stat-label">Avg Review Score</div></div>
        <div class="stat-card"><div class="stat-value">${timesheets.totalHours}</div><div class="stat-label">Hours This Month</div></div>
        <div class="stat-card"><div class="stat-value">${expTotal.toFixed(0)}</div><div class="stat-label">Expenses This Month</div></div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-bottom:16px">

        <!-- Headcount by Department -->
        <div class="card">
          <div style="font-size:14px;font-weight:700;margin-bottom:14px">👥 Headcount by Department</div>
          ${_miniBarChart(headcount.byDepartment, '_id', 'count', () => 'var(--primary)')}
          ${headcount.byBranch.length > 1 ? `
            <div style="border-top:1px solid #f3f4f6;margin-top:12px;padding-top:12px">
              <div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:8px">BY BRANCH</div>
              ${_miniBarChart(headcount.byBranch, 'name', 'count', () => '#8b5cf6')}
            </div>
          ` : ''}
        </div>

        <!-- Leave Overview -->
        <div class="card">
          <div style="font-size:14px;font-weight:700;margin-bottom:14px">🏖️ Leave (Last 90 Days)</div>
          <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px">
            ${[['pending','#f59e0b'],['approved','#22c55e'],['rejected','#ef4444']].map(([s,c]) => `
              <div style="text-align:center;padding:10px;border-radius:8px;background:#f9fafb">
                <div style="font-size:22px;font-weight:800;color:${c}">${leaveMap[s]||0}</div>
                <div style="font-size:11px;color:#6b7280;text-transform:capitalize">${s}</div>
              </div>
            `).join('')}
          </div>
          ${leave.trend.length ? `
            <div style="font-size:12px;font-weight:700;color:#6b7280;margin-bottom:8px">MONTHLY TREND</div>
            ${_miniBarChart(leave.trend, '_id', 'count', () => '#f59e0b')}
          ` : ''}
        </div>

        <!-- Training -->
        <div class="card">
          <div style="font-size:14px;font-weight:700;margin-bottom:14px">📚 Training Status</div>
          <div style="text-align:center;padding:20px 0">
            <div style="position:relative;display:inline-block">
              <svg width="120" height="120" style="transform:rotate(-90deg)">
                <circle cx="60" cy="60" r="52" fill="none" stroke="#f3f4f6" stroke-width="12"/>
                <circle cx="60" cy="60" r="52" fill="none" stroke="#6366f1" stroke-width="12"
                  stroke-dasharray="${Math.round(2*Math.PI*52*training.rate/100)} ${Math.round(2*Math.PI*52)}"
                  stroke-linecap="round"/>
              </svg>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center">
                <div style="font-size:24px;font-weight:800">${training.rate}%</div>
                <div style="font-size:10px;color:#6b7280">complete</div>
              </div>
            </div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px">
            <div style="text-align:center;background:#f0fdf4;padding:10px;border-radius:8px">
              <div style="font-size:20px;font-weight:700;color:#16a34a">${training.completed}</div>
              <div style="font-size:11px;color:#6b7280">Completed</div>
            </div>
            <div style="text-align:center;background:#f9fafb;padding:10px;border-radius:8px">
              <div style="font-size:20px;font-weight:700">${training.total - training.completed}</div>
              <div style="font-size:11px;color:#6b7280">Pending</div>
            </div>
          </div>
        </div>

        <!-- Performance -->
        <div class="card">
          <div style="font-size:14px;font-weight:700;margin-bottom:14px">🎯 Performance</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
            <div style="background:#f5f3ff;padding:14px;border-radius:10px;text-align:center">
              <div style="font-size:28px;font-weight:800;color:#5b21b6">${performance.avgReview || '—'}</div>
              <div style="font-size:11px;color:#7c3aed">Avg Review /5</div>
              <div style="font-size:11px;color:#9ca3af">${performance.totalReviews} reviews</div>
            </div>
            <div style="background:#f0fdf4;padding:14px;border-radius:10px;text-align:center">
              <div style="font-size:28px;font-weight:800;color:#16a34a">${performance.goalRate}%</div>
              <div style="font-size:11px;color:#15803d">Goals Met</div>
              <div style="font-size:11px;color:#9ca3af">${performance.completedGoals}/${performance.totalGoals}</div>
            </div>
          </div>
        </div>

        <!-- Expenses breakdown -->
        <div class="card">
          <div style="font-size:14px;font-weight:700;margin-bottom:14px">💳 Expense Breakdown (${expenses.period})</div>
          ${expenses.byCategory.length ? `
            <div style="margin-bottom:10px">
              ${_miniBarChart(expenses.byCategory.map(e => ({...e, label: e._id})), 'label', 'total',
                () => '#f59e0b')}
            </div>
            <div style="font-size:12px;font-weight:700;color:#6b7280;border-top:1px solid #f3f4f6;padding-top:10px">
              Total Approved: <span style="color:var(--text)">${expTotal.toFixed(2)} GHS</span>
            </div>
          ` : '<p style="color:#9ca3af;font-size:12px">No approved expenses this month.</p>'}
        </div>

        <!-- Timesheets -->
        <div class="card">
          <div style="font-size:14px;font-weight:700;margin-bottom:14px">⏱️ Timesheets (${timesheets.period})</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
            <div style="background:#eff6ff;padding:14px;border-radius:10px;text-align:center">
              <div style="font-size:28px;font-weight:800;color:#1d4ed8">${timesheets.totalHours}</div>
              <div style="font-size:11px;color:#2563eb">Total Hours</div>
            </div>
            <div style="background:#f9fafb;padding:14px;border-radius:10px;text-align:center">
              <div style="font-size:28px;font-weight:800">${timesheets.count}</div>
              <div style="font-size:11px;color:#6b7280">Timesheets</div>
            </div>
          </div>
        </div>

      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

// ══════════════════════════════════════════════════════════════
// BRANCHES
// ══════════════════════════════════════════════════════════════
async function renderBranches() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { branches } = await api('/api/advanced/branches');

    content.innerHTML = `
      <div class="page-header"><h2>Branch Management</h2><p>Manage your company locations</p></div>

      <!-- Create Branch -->
      <div class="card" style="margin-bottom:16px">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:12px">Add Branch</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px;margin-bottom:10px">
          ${[
            ['br-name','Name *','text','e.g. Accra HQ'],
            ['br-code','Code','text','e.g. ACC'],
            ['br-city','City','text','e.g. Accra'],
            ['br-country','Country','text','e.g. Ghana'],
            ['br-phone','Phone','text','Optional'],
          ].map(([id,label,type,ph]) => `
            <div>
              <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">${label}</label>
              <input id="${id}" type="${type}" placeholder="${ph}" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
            </div>
          `).join('')}
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Address</label>
            <input id="br-addr" placeholder="Street address" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
        </div>
        <div id="br-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <button class="btn btn-primary" onclick="submitCreateBranch()">+ Add Branch</button>
      </div>

      <!-- Branches list -->
      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">Branches (${branches.length})</h3>
        ${branches.length ? branches.map(b => `
          <div style="padding:16px;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:12px">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px">
              <div style="flex:1">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
                  <span style="font-weight:700;font-size:15px">🏢 ${b.name}</span>
                  ${b.code ? `<span style="font-size:11px;background:#f3f4f6;color:#6b7280;padding:2px 8px;border-radius:4px;font-weight:600">${b.code}</span>` : ''}
                  <span style="font-size:12px;color:#6b7280">${b.headcount} employee${b.headcount !== 1 ? 's' : ''}</span>
                </div>
                <div style="font-size:12px;color:#9ca3af">
                  ${[b.address, b.city, b.country].filter(Boolean).join(', ') || 'No address set'}
                  ${b.phone ? ` · ${b.phone}` : ''}
                  ${b.manager ? ` · Manager: <strong>${b.manager.name}</strong>` : ''}
                </div>
              </div>
              <div style="display:flex;gap:6px">
                <button class="btn btn-sm" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;font-size:11px" onclick="deleteBranch('${b._id}')">Remove</button>
              </div>
            </div>
          </div>
        `).join('') : '<p style="color:#9ca3af;font-size:13px">No branches yet. Add your first location above.</p>'}
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

async function submitCreateBranch() {
  const name = document.getElementById('br-name').value.trim();
  const errEl = document.getElementById('br-error');
  errEl.style.display = 'none';
  if (!name) { errEl.textContent = 'Branch name is required.'; errEl.style.display = 'block'; return; }

  const body = {
    name,
    code:    document.getElementById('br-code').value.trim(),
    city:    document.getElementById('br-city').value.trim(),
    country: document.getElementById('br-country').value.trim(),
    phone:   document.getElementById('br-phone').value.trim(),
    address: document.getElementById('br-addr').value.trim(),
  };
  const btn = event.target; btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await api('/api/advanced/branches', { method: 'POST', body: JSON.stringify(body) });
    toast('Branch added!', 'ok');
    renderBranches();
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = '+ Add Branch';
  }
}

async function deleteBranch(id) {
  if (!confirm('Remove this branch? Employees in this branch will be unassigned.')) return;
  try {
    await api(`/api/advanced/branches/${id}`, { method: 'DELETE' });
    toast('Branch removed', 'ok');
    renderBranches();
  } catch(e) { toast(e.message, 'err'); }
}

// ══════════════════════════════════════════════════════════════
// WHITE-LABEL BRANDING
// ══════════════════════════════════════════════════════════════
async function renderBranding() {
  const content = document.getElementById('main-content');
  content.innerHTML = '<div class="loading">Loading…</div>';
  try {
    const { branding, companyName } = await api('/api/advanced/branding');
    const payrollData = await api('/api/advanced/analytics').catch(() => null);

    content.innerHTML = `
      <div class="page-header"><h2>Branding & Settings</h2><p>Customize your portal appearance and payroll configuration</p></div>

      <!-- Branding -->
      <div class="card" style="margin-bottom:16px">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">White-Label Branding</h3>

        <!-- Live preview -->
        <div id="brand-preview" style="padding:16px;border-radius:10px;margin-bottom:20px;background:${branding.primaryColor||'#6366f1'}20;border:2px solid ${branding.primaryColor||'#6366f1'}40">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            ${branding.logoUrl ? `<img src="${branding.logoUrl}" style="height:40px;width:auto;border-radius:6px" onerror="this.style.display='none'">` : `<div style="width:40px;height:40px;border-radius:8px;background:${branding.primaryColor||'#6366f1'};display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:18px">${companyName?.[0]||'K'}</div>`}
            <div>
              <div style="font-weight:800;font-size:16px">${companyName}</div>
              <div style="font-size:12px;color:#6b7280">${branding.companyTagline||'Powered by KODEX'}</div>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;margin-bottom:14px">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Logo URL</label>
            <input id="bd-logo" value="${branding.logoUrl||''}" placeholder="https://…" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px" oninput="updateBrandPreview()">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Primary Color</label>
            <div style="display:flex;gap:6px;align-items:center">
              <input type="color" id="bd-color" value="${branding.primaryColor||'#6366f1'}" style="width:40px;height:36px;border:1px solid #d1d5db;border-radius:6px;padding:2px;cursor:pointer" oninput="updateBrandPreview()">
              <input id="bd-color-text" value="${branding.primaryColor||'#6366f1'}" placeholder="#6366f1" style="flex:1;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px" oninput="document.getElementById('bd-color').value=this.value;updateBrandPreview()">
            </div>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Tagline</label>
            <input id="bd-tagline" value="${branding.companyTagline||''}" placeholder="Your company tagline" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px" oninput="updateBrandPreview()">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Support Email</label>
            <input id="bd-email" value="${branding.supportEmail||''}" placeholder="support@yourcompany.com" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Website</label>
            <input id="bd-web" value="${branding.website||''}" placeholder="https://yourcompany.com" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
        </div>
        <div id="bd-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="saveBranding()">Save Branding</button>
          <button class="btn btn-secondary" onclick="previewLoginPage()">👁 Preview Login Page</button>
        </div>
      </div>

      <!-- Payroll Settings -->
      <div class="card">
        <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">Payroll Configuration</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:14px">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Currency</label>
            <select id="pr-currency" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              ${['GHS','USD','EUR','GBP','NGN','KES','ZAR'].map(c=>`<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Pay Period</label>
            <select id="pr-period" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly" selected>Monthly</option>
            </select>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Standard Hours/Month</label>
            <input id="pr-hours" type="number" value="160" min="1" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:4px">Overtime Rate (×)</label>
            <input id="pr-ot" type="number" value="1.5" step="0.1" min="1" style="width:100%;padding:8px;border:1px solid #d1d5db;border-radius:6px;font-size:13px">
          </div>
        </div>
        <div id="pr-error" style="color:#ef4444;font-size:13px;margin-bottom:8px;display:none"></div>
        <button class="btn btn-primary" onclick="savePayrollSettings()">Save Payroll Settings</button>
      </div>
    `;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

function updateBrandPreview() {
  const logo  = document.getElementById('bd-logo')?.value;
  const color = document.getElementById('bd-color')?.value || '#6366f1';
  const tag   = document.getElementById('bd-tagline')?.value || 'Powered by KODEX';
  const preview = document.getElementById('brand-preview');
  if (!preview) return;
  preview.style.background = `${color}20`;
  preview.style.borderColor = `${color}40`;
  const img = preview.querySelector('img');
  const box = preview.querySelector('div > div');
  if (logo && img) { img.src = logo; img.style.display = ''; }
  else if (box) box.style.background = color;
  const tagEl = preview.querySelector('div:last-child div:last-child');
  if (tagEl) tagEl.textContent = tag;
}

async function saveBranding() {
  const body = {
    logoUrl:        document.getElementById('bd-logo').value.trim(),
    primaryColor:   document.getElementById('bd-color').value,
    companyTagline: document.getElementById('bd-tagline').value.trim(),
    supportEmail:   document.getElementById('bd-email').value.trim(),
    website:        document.getElementById('bd-web').value.trim(),
  };
  const errEl = document.getElementById('bd-error');
  errEl.style.display = 'none';
  const btn = event.target; btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await api('/api/advanced/branding', { method: 'PATCH', body: JSON.stringify(body) });
    toast('Branding saved!', 'ok');
    btn.disabled = false; btn.textContent = 'Save Branding';
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Save Branding';
  }
}

async function savePayrollSettings() {
  const body = {
    currency:      document.getElementById('pr-currency').value,
    payPeriod:     document.getElementById('pr-period').value,
    standardHours: parseFloat(document.getElementById('pr-hours').value),
    overtimeRate:  parseFloat(document.getElementById('pr-ot').value),
  };
  const errEl = document.getElementById('pr-error');
  errEl.style.display = 'none';
  const btn = event.target; btn.disabled = true; btn.textContent = 'Saving…';
  try {
    await api('/api/advanced/payroll-settings', { method: 'PATCH', body: JSON.stringify(body) });
    toast('Payroll settings saved!', 'ok');
    btn.disabled = false; btn.textContent = 'Save Payroll Settings';
  } catch(e) {
    errEl.textContent = e.message; errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Save Payroll Settings';
  }
}

// ══════════════════════════════════════════════════════════════
// PAYROLL EXPORT
// ══════════════════════════════════════════════════════════════
async function renderPayrollExport() {
  const content = document.getElementById('main-content');
  const period = new Date().toISOString().slice(0, 7);
  content.innerHTML = `
    <div class="page-header"><h2>Payroll Export</h2><p>Generate payroll-ready CSV for your finance team</p></div>

    <div class="card" style="max-width:540px">
      <h3 style="font-size:15px;font-weight:700;margin-bottom:14px">Generate Payroll Report</h3>
      <p style="font-size:13px;color:#6b7280;margin-bottom:16px;line-height:1.6">
        Exports all <strong>approved timesheets</strong> and <strong>approved expense claims</strong> for the selected period into a single CSV file compatible with most payroll systems.
      </p>

      <div style="margin-bottom:16px">
        <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:#6b7280;display:block;margin-bottom:6px">Pay Period</label>
        <input type="month" id="pe-period" value="${period}" style="padding:9px 12px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;width:200px">
      </div>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:14px;margin-bottom:16px">
        <div style="font-size:12px;font-weight:700;color:#15803d;margin-bottom:6px">What's included:</div>
        <ul style="font-size:12px;color:#166534;margin:0;padding-left:16px;line-height:1.8">
          <li>Employee name, ID and department</li>
          <li>Regular hours worked (up to standard hours)</li>
          <li>Overtime hours worked (above standard)</li>
          <li>Overtime multiplier from payroll settings</li>
          <li>Total approved expense reimbursements</li>
        </ul>
      </div>

      <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:10px;padding:12px;margin-bottom:20px">
        <div style="font-size:12px;color:#92400e">⚠️ Only <strong>approved</strong> timesheets and expenses are included. Make sure to review all submissions before exporting.</div>
      </div>

      <button class="btn btn-primary" style="padding:12px 28px;font-size:14px" onclick="downloadPayrollExport()">
        ⬇ Download CSV
      </button>
    </div>
  `;
}

function downloadPayrollExport() {
  const period = document.getElementById('pe-period')?.value || new Date().toISOString().slice(0, 7);
  const token  = localStorage.getItem('kodex_token') || localStorage.getItem('token') || '';
  const btn = event.target; btn.disabled = true; btn.textContent = 'Generating…';
  setTimeout(() => { btn.disabled = false; btn.textContent = '⬇ Download CSV'; }, 3000);
  window.open(`/api/advanced/payroll-export?period=${period}&token=${token}`, '_blank');
  toast('Payroll CSV downloading…', 'ok');
}

// ── Meeting Attendance Modal ──────────────────────────────────────────────────
async function viewMeetingAttendance(meetingId, title) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = '<div class="modal-overlay" onclick="closeModal(event)"><div class="modal" onclick="event.stopPropagation()" style="max-width:700px;width:95%"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px"><h3 style="margin:0">Meeting Attendance</h3><button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer">×</button></div><div id="meeting-attendance-body"><div class="loading">Loading...</div></div></div></div>';

  try {
    const data = await api('/api/zoom/' + meetingId + '/attendance');
    const attendance = data.attendance || [];
    const total = data.total || 0;
    const statusColor = { present: '#22c55e', partial: '#f59e0b', absent: '#ef4444' };

    let rows = '';
    for (const a of attendance) {
      const joinStr = a.joinTime ? new Date(a.joinTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—';
      const leaveStr = a.leaveTime ? new Date(a.leaveTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '<span style="color:#f59e0b;font-size:11px">In meeting</span>';
      const statusLabel = a.status ? a.status.charAt(0).toUpperCase() + a.status.slice(1) : '—';
      rows += '<tr><td style="font-weight:600">' + (a.user && a.user.name ? a.user.name : '—') + '</td>'
            + '<td style="font-size:12px;color:var(--text-muted)">' + (a.user && (a.user.email || a.user.indexNumber) ? (a.user.email || a.user.indexNumber) : '—') + '</td>'
            + '<td style="font-size:12px">' + joinStr + '</td>'
            + '<td style="font-size:12px">' + leaveStr + '</td>'
            + '<td style="font-size:12px">' + (a.durationMinutes || 0) + 'm</td>'
            + '<td><span style="background:' + (statusColor[a.status] || '#6b7280') + ';color:#fff;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600">' + statusLabel + '</span></td></tr>';
    }

    const token = localStorage.getItem('token') || localStorage.getItem('kodex_token') || '';
    const csvUrl = '/api/zoom/' + meetingId + '/attendance/csv?token=' + token;

    let tableHtml = attendance.length
      ? '<table style="width:100%"><thead><tr><th>Name</th><th>Email / Index</th><th>Joined</th><th>Left</th><th>Duration</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table>'
      : '<div class="empty-state"><p>No attendance records yet.</p></div>';

    document.getElementById('meeting-attendance-body').innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">'
      + '<span style="font-size:13px;color:var(--text-light)">' + total + ' participant' + (total !== 1 ? 's' : '') + '</span>'
      + '<div style="display:flex;gap:8px">'
      + '<a href="' + csvUrl + '" download style="text-decoration:none"><button class="btn btn-sm" style="background:#22c55e;color:#fff">⬇ Download CSV</button></a>'
      + '<button class="btn btn-sm" style="background:#7c3aed;color:#fff" onclick="printMeetingAttendance(\'' + meetingId + '\', \'' + title.replace(/'/g, "\\'") + '\')">🖨 Print / PDF</button>'
      + '</div></div>'
      + tableHtml;
  } catch(e) {
    const el = document.getElementById('meeting-attendance-body');
    if (el) el.innerHTML = '<p style="color:red">' + e.message + '</p>';
  }
}

async function printMeetingAttendance(meetingId, title) {
  try {
    const data = await api('/api/zoom/' + meetingId + '/attendance');
    const attendance = data.attendance || [];
    const statusColor = { present: '#22c55e', partial: '#f59e0b', absent: '#ef4444' };

    let rows = '';
    for (const a of attendance) {
      const joinStr = a.joinTime ? new Date(a.joinTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '—';
      const leaveStr = a.leaveTime ? new Date(a.leaveTime).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : 'In meeting';
      const statusLabel = a.status ? a.status.charAt(0).toUpperCase() + a.status.slice(1) : '—';
      const color = statusColor[a.status] || '#6b7280';
      rows += '<tr><td>' + (a.user && a.user.name ? a.user.name : '—') + '</td>'
            + '<td>' + (a.user && (a.user.email || a.user.indexNumber) ? (a.user.email || a.user.indexNumber) : '—') + '</td>'
            + '<td>' + joinStr + '</td><td>' + leaveStr + '</td>'
            + '<td>' + (a.durationMinutes || 0) + 'm</td>'
            + '<td style="color:' + color + ';font-weight:600">' + statusLabel + '</td></tr>';
    }

    const win = window.open('', '_blank');
    win.document.write('<!DOCTYPE html><html><head><title>' + title + ' — Attendance</title>'
      + '<style>body{font-family:Arial,sans-serif;padding:24px}h2{margin-bottom:4px}p{color:#666;margin-bottom:16px}'
      + 'table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left;font-size:13px}'
      + 'th{background:#f3f4f6;font-weight:600}tr:nth-child(even){background:#f9fafb}'
      + '@media print{button{display:none}}</style></head><body>'
      + '<h2>' + title + ' — Meeting Attendance</h2>'
      + '<p>Generated: ' + new Date().toLocaleString() + '</p>'
      + '<table><thead><tr><th>Name</th><th>Email / Index</th><th>Joined</th><th>Left</th><th>Duration</th><th>Status</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table>'
      + '<br><button onclick="window.print()">🖨 Print</button>'
      + '</body></html>');
    win.document.close();
    win.focus();
    setTimeout(function() { win.print(); }, 500);
  } catch(e) {
    toastError('Failed to generate PDF: ' + e.message);
  }
}


// ── Register real functions for index.html stubs ─────────────────────────────

// ════════════════════════════════════════════════════════════════════════════
// KODEX MESSAGING  (Phase 2: Facebook-style desktop UI)
// ════════════════════════════════════════════════════════════════════════════

let _activeConvoId  = null;
let _msgSearchQuery = '';

// ── Avatar color palette ──────────────────────────────────────────────────
const MSG_AVATAR_COLORS = ['#2563eb','#7c3aed','#0891b2','#16a34a','#d97706','#db2777','#dc2626','#0f766e'];
function _avatarColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return MSG_AVATAR_COLORS[Math.abs(h) % MSG_AVATAR_COLORS.length];
}
function _initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function _convoTypeLabel(type) {
  if (type === 'hod_request') return '<span class="msg-badge msg-badge--hod">HOD Request</span>';
  if (type === 'announcement') return '<span class="msg-badge msg-badge--ann">Announcement</span>';
  return '';
}

// ── Render the full messages page ────────────────────────────────────────
async function renderMessages() {
  const content = document.getElementById('main-content');
  if (!content) return;
  const canAttach = ['admin','superadmin','lecturer','manager','hod'].includes(currentUser?.role);
  const isStudent = currentUser?.role === 'student';

  content.innerHTML = `
    <div class="msg-page">
      <!-- ── Left sidebar: conversation list ── -->
      <aside class="msg-sidebar" id="msg-sidebar">
        <div class="msg-sidebar-head">
          <div class="msg-sidebar-title-row">
            <span class="msg-sidebar-title">Messages</span>
            <div class="msg-sidebar-actions">
              ${isStudent ? `
                <button class="msg-btn-hod" onclick="showHodRequestModal()" title="Contact HOD">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 11 19.79 19.79 0 0 1 1.62 2.35 2 2 0 0 1 3.62.17h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 7.91a16 16 0 0 0 6.06 6.06l1.06-1.06a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  HOD Request
                </button>
              ` : ''}
              <button class="msg-btn-new" onclick="showNewConvoModal()" title="New conversation">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New
              </button>
            </div>
          </div>
          <div class="msg-search-wrap">
            <svg class="msg-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="msg-search" class="msg-search" type="text" placeholder="Search conversations…"
              oninput="_msgSearchQuery=this.value.toLowerCase();_renderConvoList(window._msgConvos||[])">
          </div>
        </div>
        <div id="msg-convo-list" class="msg-convo-list">
          <div class="msg-loading">Loading…</div>
        </div>
      </aside>

      <!-- ── Right: thread pane ── -->
      <main class="msg-thread-wrap" id="msg-thread-wrap">
        <div class="msg-thread-empty" id="msg-thread-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" style="opacity:.4"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <p>Select a conversation to start messaging</p>
        </div>
        <!-- Thread header -->
        <div class="msg-thread-header hidden" id="msg-thread-header">
          <button class="msg-back-btn" id="msg-back-btn" onclick="_msgBackToList()">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="msg-thread-avatar" id="msg-thread-avatar"></div>
          <div class="msg-thread-meta" id="msg-thread-meta"></div>
        </div>
        <!-- Messages body -->
        <div class="msg-thread-body hidden" id="msg-thread-body"></div>
        <!-- Input bar -->
        <div class="msg-input-bar hidden" id="msg-input-bar">
          <div class="msg-file-preview" id="msg-file-preview-bar" style="display:none">
            <div id="msg-file-preview-inner" class="msg-file-preview-inner"></div>
            <button onclick="msgClearFile()" class="msg-file-clear">✕</button>
          </div>
          <div class="msg-composer" id="msg-composer">
            ${canAttach ? `
            <label class="msg-attach-btn" title="Attach file">
              <input type="file" id="msg-file-input" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.doc,.docx" style="display:none" onchange="msgPreviewFile(this)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </label>` : ''}
            <textarea id="msg-input" class="msg-textarea" placeholder="Write a message…" rows="1"
              oninput="this.style.height='auto';this.style.height=Math.min(this.scrollHeight,120)+'px'"
              onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendMessage()}"></textarea>
            <button class="msg-send-btn" onclick="sendMessage()" title="Send">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
          <div class="msg-hint">Enter to send · Shift+Enter new line</div>
        </div>
      </main>
    </div>`;

  await _loadConvoList();
}

// ── Load and render conversation list ─────────────────────────────────────
async function _loadConvoList() {
  const list = document.getElementById('msg-convo-list');
  if (!list) return;
  try {
    const data = await api('/api/messages/conversations');
    window._msgConvos = data.conversations || [];
    _renderConvoList(window._msgConvos);
  } catch(e) {
    list.innerHTML = `<div class="msg-error">Error: ${e.message}</div>`;
  }
}

function _renderConvoList(convos) {
  const list = document.getElementById('msg-convo-list');
  if (!list) return;
  const q    = _msgSearchQuery || '';
  const filtered = q
    ? convos.filter(c => {
        const myId  = currentUser._id || currentUser.id;
        const others = (c.participants || []).filter(p => {
          const uid = p.user?._id || p.user;
          return uid?.toString() !== myId?.toString() && p.user?.name;
        });
        const name = c.isGroup ? (c.title || 'Group') : (others[0]?.user?.name || '');
        return name.toLowerCase().includes(q) || (c.lastMessage?.body || '').toLowerCase().includes(q);
      })
    : convos;

  if (!filtered.length) {
    list.innerHTML = `<div class="msg-empty-list">
      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <div>${q ? 'No conversations match your search' : 'No conversations yet'}</div>
      ${!q ? '<div style="font-size:11px;margin-top:4px">Click <strong>+ New</strong> to start one</div>' : ''}
    </div>`;
    return;
  }

  const myId = currentUser._id || currentUser.id;
  list.innerHTML = filtered.map(c => {
    const others  = (c.participants || []).filter(p => {
      const uid = p.user?._id || p.user;
      return uid?.toString() !== myId?.toString() && p.user?.name;
    });
    const name    = c.isGroup ? (c.title || 'Group') : (others[0]?.user?.name || 'Conversation');
    const subRole = others[0]?.user?.role ? `<span class="msg-role-tag">${others[0].user.role}</span>` : '';
    const unread  = c.myUnreadCount || 0;
    const preview = c.lastMessage?.body
      ? (c.lastMessage.body.length > 48 ? c.lastMessage.body.slice(0, 48) + '…' : c.lastMessage.body)
      : 'No messages yet';
    const time    = c.lastMessage?.sentAt
      ? _msgRelTime(c.lastMessage.sentAt)
      : '';
    const isActive = _activeConvoId === c._id;
    const color   = _avatarColor(name);
    const typeBadge = _convoTypeLabel(c.type);

    return `<div class="msg-convo-item${isActive ? ' msg-convo-item--active' : ''}"
        onclick="openConvo('${c._id}','${name.replace(/'/g,"\\'")}','${c.type||'direct_message'}')">
      <div class="msg-convo-avatar" style="background:${color}">${_initials(name)}</div>
      <div class="msg-convo-info">
        <div class="msg-convo-top">
          <span class="msg-convo-name${unread > 0 ? ' msg-convo-name--unread' : ''}">${name}</span>
          ${subRole}
          <span class="msg-convo-time">${time}</span>
        </div>
        <div class="msg-convo-bottom">
          ${typeBadge}
          <span class="msg-convo-preview">${preview}</span>
          ${unread > 0 ? `<span class="msg-unread-badge">${unread > 99 ? '99+' : unread}</span>` : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function _msgRelTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return 'now';
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr}h`;
  const dy = Math.floor(hr / 24);
  if (dy < 7)   return `${dy}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Open a conversation ───────────────────────────────────────────────────
async function openConvo(id, name, type) {
  _activeConvoId = id;
  _renderConvoList(window._msgConvos || []);

  const header = document.getElementById('msg-thread-header');
  const body   = document.getElementById('msg-thread-body');
  const bar    = document.getElementById('msg-input-bar');
  const empty  = document.getElementById('msg-thread-empty');
  const wrap   = document.getElementById('msg-thread-wrap');

  if (!header || !body || !bar) return;

  empty?.classList.add('hidden');
  header.classList.remove('hidden');
  body.classList.remove('hidden');
  bar.classList.remove('hidden');
  wrap?.classList.add('msg-thread-active');

  // Thread header
  const color    = _avatarColor(name);
  const typeLabel = type === 'hod_request' ? 'HOD Request' : type === 'group' || type === 'announcement' ? 'Group' : 'Direct message';
  document.getElementById('msg-thread-avatar').innerHTML =
    `<div style="width:38px;height:38px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${_initials(name)}</div>`;
  document.getElementById('msg-thread-meta').innerHTML =
    `<div class="msg-thread-name">${name}</div>
     <div class="msg-thread-sub">${_convoTypeLabel(type) || typeLabel}</div>`;

  body.innerHTML = '<div class="msg-loading" style="text-align:center;padding:28px">Loading…</div>';
  document.getElementById('msg-input')?.focus();

  try {
    await api(`/api/messages/conversations/${id}/read`, { method: 'PATCH' });
    const data = await api(`/api/messages/conversations/${id}`);
    const msgs  = data.messages || [];
    const myId  = currentUser._id || currentUser.id;

    if (!msgs.length) {
      body.innerHTML = `<div class="msg-empty-thread">
        <div style="font-size:28px;margin-bottom:8px">💬</div>
        <div>No messages yet — say hello!</div>
      </div>`;
    } else {
      body.innerHTML = msgs.map(m => _buildMsgRow(m, myId)).join('');
      body.scrollTop = body.scrollHeight;
    }
    // Refresh sidebar unread counts
    if (window._msgConvos) {
      const c = window._msgConvos.find(x => x._id === id);
      if (c) { c.myUnreadCount = 0; _renderConvoList(window._msgConvos); }
    }
  } catch(e) {
    body.innerHTML = `<div class="msg-error">Error: ${e.message}</div>`;
  }
}

function _buildMsgRow(m, myId) {
  const isMine     = (m.sender?._id || m.sender)?.toString() === myId?.toString();
  const time       = new Date(m.createdAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  const senderName = m.sender?.name || 'Unknown';
  const content    = m.isDeleted
    ? '<em class="msg-deleted">[message deleted]</em>'
    : _buildBubbleContent(m.body, m.attachment, isMine);

  if (isMine) {
    return `<div class="msg-row msg-row--mine">
      <div class="msg-bubble msg-bubble--mine">${content}</div>
      <span class="msg-ts">${time}${m.editedAt ? ' · edited' : ''}</span>
    </div>`;
  }
  return `<div class="msg-row msg-row--theirs">
    <div class="msg-avatar-sm" style="background:${_avatarColor(senderName)}">${_initials(senderName)}</div>
    <div class="msg-bubble-wrap">
      <span class="msg-sender-name">${senderName}</span>
      <div class="msg-bubble msg-bubble--theirs">${content}</div>
      <span class="msg-ts">${time}${m.editedAt ? ' · edited' : ''}</span>
    </div>
  </div>`;
}

function _buildBubbleContent(bodyText, attachment, isMine) {
  if (!attachment) return (bodyText || '').replace(/\n/g, '<br>');
  const t   = typeof token !== 'undefined' ? token : '';
  const src = `${attachment.fileUrl}?token=${t}`;
  const isImg  = attachment.mimeType?.startsWith('image/');
  const isPdf  = attachment.mimeType === 'application/pdf';
  const isDoc  = attachment.mimeType?.includes('word') || attachment.originalName?.match(/\.docx?$/i);
  const caption = bodyText && bodyText !== `📎 ${attachment.originalName}` ? `<div class="msg-attach-caption">${bodyText}</div>` : '';

  if (isImg) {
    return `${caption}<img class="msg-img-thumb" src="${src}" onclick="window.open('${src}','_blank')" onerror="this.style.display='none'" loading="lazy">`;
  }
  const icon = isPdf ? '📄' : isDoc ? '📝' : '📎';
  const kb   = attachment.fileSize ? ` · ${(attachment.fileSize / 1024).toFixed(0)} KB` : '';
  return `${caption}<a class="msg-file-card" href="${src}" target="_blank" rel="noopener">
    <span class="msg-file-icon">${icon}</span>
    <div class="msg-file-info">
      <div class="msg-file-name">${attachment.originalName}</div>
      <div class="msg-file-meta">${(isPdf?'PDF':isDoc?'Document':'File')}${kb}</div>
    </div>
    <a class="msg-file-dl" href="/api/messages/attachment/${attachment.fileName}/download?token=${t}" download title="Download">⬇</a>
  </a>`;
}

// ── Mobile back to list ───────────────────────────────────────────────────
function _msgBackToList() {
  _activeConvoId = null;
  const wrap = document.getElementById('msg-thread-wrap');
  wrap?.classList.remove('msg-thread-active');
  _renderConvoList(window._msgConvos || []);
}

// ── File preview ──────────────────────────────────────────────────────────
function msgPreviewFile(input) {
  const file  = input.files[0];
  if (!file) return;
  const bar   = document.getElementById('msg-file-preview-bar');
  const inner = document.getElementById('msg-file-preview-inner');
  if (!bar || !inner) return;
  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    inner.innerHTML = `<img src="${url}" class="msg-preview-img"> <span>${file.name}</span>`;
  } else {
    const kb = (file.size / 1024).toFixed(0);
    inner.innerHTML = `📄 <strong>${file.name}</strong> <span class="msg-file-size">(${kb} KB)</span>`;
  }
  bar.style.display = 'flex';
}

function msgClearFile() {
  const input = document.getElementById('msg-file-input');
  if (input) input.value = '';
  const bar = document.getElementById('msg-file-preview-bar');
  if (bar) {
    bar.style.display = 'none';
    const inner = document.getElementById('msg-file-preview-inner');
    if (inner) inner.innerHTML = '';
  }
}

// ── Send a message ────────────────────────────────────────────────────────
async function sendMessage() {
  if (!_activeConvoId) return;
  const input    = document.getElementById('msg-input');
  const bodyText = input?.value.trim() || '';
  const fileInput = document.getElementById('msg-file-input');
  const file     = fileInput?.files?.[0] || null;
  if (!bodyText && !file) return;

  input.value = '';
  input.style.height = 'auto';
  msgClearFile();

  const body2 = document.getElementById('msg-thread-body');
  // Optimistic self-bubble
  const nowTime = new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
  const tempEl  = document.createElement('div');
  tempEl.className = 'msg-row msg-row--mine';
  tempEl.innerHTML = `<div class="msg-bubble msg-bubble--mine">${(bodyText || (file ? `📎 ${file.name}` : '')).replace(/\n/g,'<br>')}</div><span class="msg-ts">${nowTime}</span>`;
  body2?.appendChild(tempEl);
  if (body2) body2.scrollTop = body2.scrollHeight;

  try {
    let data;
    if (file) {
      const fd = new FormData();
      if (bodyText) fd.append('body', bodyText);
      fd.append('attachment', file);
      data = await apiUpload(`/api/messages/conversations/${_activeConvoId}/messages`, fd);
    } else {
      data = await api(`/api/messages/conversations/${_activeConvoId}/messages`, {
        method: 'POST',
        body:   JSON.stringify({ body: bodyText }),
      });
    }
    // Replace optimistic bubble with real one
    const msg  = data.message;
    const myId = currentUser._id || currentUser.id;
    tempEl.outerHTML = _buildMsgRow(msg, myId);
    if (body2) body2.scrollTop = body2.scrollHeight;
    // Update sidebar
    await _loadConvoList();
  } catch(e) {
    tempEl.remove();
    toastError('Failed to send: ' + e.message);
  }
}

// ── New Conversation modal (role-aware, uses /users/messageable) ──────────
async function showNewConvoModal() {
  document.getElementById('new-convo-overlay')?.remove();
  let users = [], hodUsers = [], canDirectHod = true;
  try {
    const d = await api('/api/messages/users/messageable');
    users        = d.users        || [];
    hodUsers     = d.hodUsers     || [];
    canDirectHod = d.canDirectMessageHod !== false;
  } catch(_) {}

  const isStudent = currentUser?.role === 'student';
  const hodSection = !canDirectHod && hodUsers.length
    ? `<div class="msg-modal-info">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        To contact a HOD, use the <button class="msg-link" onclick="document.getElementById('new-convo-overlay')?.remove();showHodRequestModal()">HOD Request form</button>.
       </div>`
    : '';

  const ol = document.createElement('div');
  ol.id = 'new-convo-overlay';
  ol.className = 'msg-modal-overlay';
  ol.innerHTML = `
    <div class="msg-modal" onclick="event.stopPropagation()">
      <div class="msg-modal-head">
        <h3>New Message</h3>
        <button class="msg-modal-close" onclick="document.getElementById('new-convo-overlay').remove()">✕</button>
      </div>
      <div class="msg-modal-body">
        ${hodSection}
        <div class="msg-modal-field">
          <label class="msg-field-label">To</label>
          <div class="msg-recipient-search">
            <input id="nc-search" type="text" placeholder="Search name or role…" class="msg-field-input"
              oninput="_filterNcRecipients(this.value)">
          </div>
          <div id="nc-user-list" class="msg-user-list">
            ${users.length === 0 ? '<div class="msg-empty-recipients">No available recipients</div>' :
              users.map(u => `<label class="msg-user-opt" data-name="${u.name.toLowerCase()}" data-role="${u.role}">
                <input type="checkbox" name="nc-rec" value="${u._id}">
                <div class="msg-user-opt-avatar" style="background:${_avatarColor(u.name)}">${_initials(u.name)}</div>
                <div class="msg-user-opt-info">
                  <div class="msg-user-opt-name">${u.name}</div>
                  <div class="msg-user-opt-role">${u.role}${u.department ? ' · ' + u.department : ''}</div>
                </div>
              </label>`).join('')}
          </div>
        </div>
        <div class="msg-modal-field" id="nc-group-name-row" style="display:none">
          <label class="msg-field-label">Group name (optional)</label>
          <input id="nc-title" type="text" placeholder="e.g. Project Alpha Team" class="msg-field-input">
        </div>
        <div class="msg-modal-field">
          <label class="msg-field-label">Message <span style="color:var(--danger)">*</span></label>
          <textarea id="nc-body" rows="3" placeholder="Write your first message…" class="msg-field-textarea"></textarea>
        </div>
      </div>
      <div class="msg-modal-foot">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('new-convo-overlay').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="startNewConvo()">Send</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
  ol.addEventListener('click', e => { if (e.target === ol) ol.remove(); });
  document.getElementById('nc-search')?.focus();
  document.querySelectorAll('input[name="nc-rec"]').forEach(cb =>
    cb.addEventListener('change', () => {
      const checked = document.querySelectorAll('input[name="nc-rec"]:checked').length;
      const row = document.getElementById('nc-group-name-row');
      if (row) row.style.display = checked > 1 ? 'block' : 'none';
    })
  );
}

function _filterNcRecipients(q) {
  const term = q.toLowerCase();
  document.querySelectorAll('.msg-user-opt').forEach(el => {
    const match = el.dataset.name.includes(term) || el.dataset.role.includes(term);
    el.style.display = match ? '' : 'none';
  });
}

async function startNewConvo() {
  const checked = document.querySelectorAll('input[name="nc-rec"]:checked');
  const body    = document.getElementById('nc-body')?.value.trim();
  const title   = document.getElementById('nc-title')?.value.trim();
  if (!checked.length) return toastError('Select at least one recipient.');
  if (!body)           return toastError('Message is required.');
  const recipientIds = Array.from(checked).map(c => c.value);
  try {
    const data = await api('/api/messages/conversations', {
      method: 'POST',
      body:   JSON.stringify({ recipientIds, message: body, title }),
    });
    document.getElementById('new-convo-overlay')?.remove();
    const c    = data.conversation;
    const myId = currentUser._id || currentUser.id;
    const others = (c.participants || []).filter(p => {
      const uid = p.user?._id || p.user?.toString?.() || p.user;
      return uid?.toString() !== myId?.toString();
    });
    const name = c.isGroup ? (c.title || 'Group') : (others[0]?.user?.name || 'Conversation');
    toastSuccess('Conversation started!');
    await _loadConvoList();
    openConvo(c._id, name, c.type || 'direct_message');
  } catch(e) {
    toastError(e.message || 'Failed to start conversation');
  }
}

// ── HOD Request modal (students only) ────────────────────────────────────
async function showHodRequestModal() {
  document.getElementById('hod-request-overlay')?.remove();
  let hods = [];
  try {
    const d = await api('/api/messages/users/messageable');
    hods = d.hodUsers || [];
  } catch(_) {}

  const ol = document.createElement('div');
  ol.id = 'hod-request-overlay';
  ol.className = 'msg-modal-overlay';
  ol.innerHTML = `
    <div class="msg-modal" onclick="event.stopPropagation()">
      <div class="msg-modal-head">
        <h3>
          <span class="msg-badge msg-badge--hod" style="margin-right:6px">HOD Request</span>
          Contact HOD
        </h3>
        <button class="msg-modal-close" onclick="document.getElementById('hod-request-overlay').remove()">✕</button>
      </div>
      <div class="msg-modal-body">
        ${hods.length === 0 ? '<div class="msg-modal-info">No HOD found in your institution. Contact your admin.</div>' : `
        <div class="msg-modal-field">
          <label class="msg-field-label">HOD</label>
          <select id="hr-hod" class="msg-field-input">
            ${hods.map(h => `<option value="${h._id}">${h.name}${h.department?' · '+h.department:''}</option>`).join('')}
          </select>
        </div>
        <div class="msg-modal-field">
          <label class="msg-field-label">Category <span style="color:var(--danger)">*</span></label>
          <select id="hr-category" class="msg-field-input">
            <option value="">— Select —</option>
            <option value="complaint">Complaint</option>
            <option value="academic_issue">Academic Issue</option>
            <option value="emergency">Emergency</option>
          </select>
        </div>
        <div class="msg-modal-field">
          <label class="msg-field-label">Subject <span style="color:var(--danger)">*</span></label>
          <input id="hr-subject" type="text" placeholder="Brief subject…" class="msg-field-input" maxlength="120">
        </div>
        <div class="msg-modal-field">
          <label class="msg-field-label">Description <span style="color:var(--danger)">*</span></label>
          <textarea id="hr-description" rows="4" placeholder="Describe your issue in detail…" class="msg-field-textarea"></textarea>
        </div>`}
      </div>
      <div class="msg-modal-foot">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('hod-request-overlay').remove()">Cancel</button>
        ${hods.length > 0 ? '<button class="btn btn-primary btn-sm" onclick="submitHodRequest()">Submit Request</button>' : ''}
      </div>
    </div>`;
  document.body.appendChild(ol);
  ol.addEventListener('click', e => { if (e.target === ol) ol.remove(); });
}

async function submitHodRequest() {
  const hodId       = document.getElementById('hr-hod')?.value;
  const category    = document.getElementById('hr-category')?.value;
  const subject     = document.getElementById('hr-subject')?.value.trim();
  const description = document.getElementById('hr-description')?.value.trim();
  if (!category)    return toastError('Please select a category.');
  if (!subject)     return toastError('Subject is required.');
  if (!description) return toastError('Description is required.');
  try {
    const data = await api('/api/messages/hod-request', {
      method: 'POST',
      body:   JSON.stringify({ hodId, category, subject, description }),
    });
    document.getElementById('hod-request-overlay')?.remove();
    toastSuccess('HOD request submitted!');
    await _loadConvoList();
    const c    = data.conversation;
    const myId = currentUser._id || currentUser.id;
    const others = (c.participants || []).filter(p => {
      const uid = p.user?._id || p.user?.toString?.() || p.user;
      return uid?.toString() !== myId?.toString();
    });
    openConvo(c._id, others[0]?.user?.name || 'HOD', 'hod_request');
  } catch(e) {
    toastError(e.message || 'Failed to submit request');
  }
}

window._realSelectMode   = selectMode;
window._realSelectPortal = selectPortal;
window._appLoaded = true;
// Execute any pending calls from before app.js loaded
if (window._pendingMode)   { selectMode(window._pendingMode);     window._pendingMode = null; }
if (window._pendingPortal) { selectPortal(window._pendingPortal); window._pendingPortal = null; }

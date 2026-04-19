/* ─────────────────────────────────────────────────────────────────────────────
   pages-device.js  —  Lecturer Attendance Device page
   ───────────────────────────────────────────────────────────────────────────── */

// ── helpers ───────────────────────────────────────────────────────────────────
function _devFmt(date) {
  if (!date) return 'Never';
  const d = new Date(date);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60)  return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString();
}

function _devStatusDot(status) {
  const on = status === 'online';
  return `<span class="dev-status-dot ${on ? 'dev-dot-online' : 'dev-dot-offline'}"></span>
          <span class="dev-status-label ${on ? 'dev-online-text' : 'dev-offline-text'}">${on ? 'Online' : 'Offline'}</span>`;
}

function _devSignalIcon(rssi) {
  if (!rssi) return '';
  const v = parseInt(rssi);
  const bars = v > -60 ? 3 : v > -75 ? 2 : 1;
  return `<span class="dev-signal dev-signal-${bars}" title="Signal: ${rssi} dBm">${'▂▄▆'.slice(0, bars)}</span>`;
}

// ── main render ───────────────────────────────────────────────────────────────
async function renderAttendanceDevice() {
  const content = document.getElementById('main-content');
  if (!content) return;

  content.innerHTML = `<div class="loading" style="padding:40px;text-align:center;color:var(--text-secondary)">Loading device…</div>`;

  let device = null;
  try {
    const res = await fetch('/api/devices/my', {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    });
    const json = await res.json();
    device = json.data || null;
  } catch (e) {
    device = null;
  }

  content.innerHTML = _devPageHTML(device);
  _devBindEvents(device);
}

// ── page HTML ─────────────────────────────────────────────────────────────────
function _devPageHTML(device) {
  const hasDevice = !!device;

  return `
<div class="dev-page">
  <!-- header -->
  <div class="dev-page-header">
    <div>
      <h1 class="dev-page-title">Attendance Device</h1>
      <p class="dev-page-sub">Your dedicated ESP32 classroom device</p>
    </div>
    ${hasDevice ? `
    <div class="dev-header-actions">
      <button class="dev-btn dev-btn-ghost" onclick="_devRefresh()">↻ Refresh</button>
      <button class="dev-btn dev-btn-danger" onclick="_devUnlink()">Unlink Device</button>
    </div>` : `
    <div class="dev-header-actions">
      <button class="dev-btn dev-btn-primary" onclick="_devShowPairing()">+ Pair Device</button>
    </div>`}
  </div>

  ${!hasDevice ? _devNoPairedHTML() : _devPairedHTML(device)}

  <!-- pairing modal (hidden) -->
  ${_devPairingModalHTML()}
</div>

<style>${_devCSS()}</style>`;
}

// ── no device view ─────────────────────────────────────────────────────────────
function _devNoPairedHTML() {
  return `
<div class="dev-empty-state">
  <div class="dev-empty-icon">📱</div>
  <h2 class="dev-empty-title">No Device Linked</h2>
  <p class="dev-empty-desc">Link your ESP32 device to enable device-based attendance tracking in your classroom.</p>
  <button class="dev-btn dev-btn-primary dev-btn-lg" onclick="_devShowPairing()">Pair a Device</button>
</div>`;
}

// ── paired device view ────────────────────────────────────────────────────────
function _devPairedHTML(d) {
  const online = d.status === 'online';
  const sessionActive = !!d.activeSession;
  const lastSeen = d.lastHeartbeat ? _devFmt(d.lastHeartbeat) : 'Never';

  return `
<!-- status bar -->
<div class="dev-status-bar ${online ? 'dev-status-bar-online' : 'dev-status-bar-offline'}">
  <div class="dev-status-bar-left">
    ${_devStatusDot(d.status)}
    <span class="dev-status-sep">·</span>
    <span class="dev-status-text">Last seen: <strong>${lastSeen}</strong></span>
    ${sessionActive ? `<span class="dev-session-badge">● Session Active</span>` : ''}
  </div>
  <div class="dev-status-bar-right dev-device-id-text">
    ID: ${d.deviceId}
  </div>
</div>

<!-- main grid -->
<div class="dev-grid">

  <!-- Device Details card -->
  <div class="dev-card dev-card-main">
    <div class="dev-card-header">
      <span class="dev-card-title">Device Details</span>
      <button class="dev-btn dev-btn-ghost dev-btn-sm" onclick="_devRename()">Rename</button>
    </div>
    <div class="dev-detail-grid">
      <div class="dev-detail-item">
        <span class="dev-detail-label">Device Name</span>
        <span class="dev-detail-value" id="dev-name-display">${_esc(d.deviceName)}</span>
      </div>
      <div class="dev-detail-item">
        <span class="dev-detail-label">Linked Lecturer</span>
        <span class="dev-detail-value">${_esc(d.owner?.name || '—')}</span>
      </div>
      <div class="dev-detail-item">
        <span class="dev-detail-label">Assigned Room</span>
        <span class="dev-detail-value">${_esc(d.assignedRoom || '—')}</span>
      </div>
      <div class="dev-detail-item">
        <span class="dev-detail-label">Department</span>
        <span class="dev-detail-value">${_esc(d.assignedDepartment || '—')}</span>
      </div>
      <div class="dev-detail-item">
        <span class="dev-detail-label">Device Mode</span>
        <span class="dev-detail-value dev-badge dev-badge-blue">${d.mode || '—'}</span>
      </div>
      <div class="dev-detail-item">
        <span class="dev-detail-label">Registered</span>
        <span class="dev-detail-value">${d.registeredAt ? new Date(d.registeredAt).toLocaleDateString() : '—'}</span>
      </div>
      <div class="dev-detail-item">
        <span class="dev-detail-label">Firmware</span>
        <span class="dev-detail-value">${_esc(d.firmware || '—')}</span>
      </div>
    </div>
  </div>

  <!-- Status card -->
  <div class="dev-card">
    <div class="dev-card-header">
      <span class="dev-card-title">Status</span>
    </div>
    <div class="dev-status-block">
      <div class="dev-status-row">
        <span class="dev-detail-label">Connection</span>
        <span>${_devStatusDot(d.status)}</span>
      </div>
      <div class="dev-status-row">
        <span class="dev-detail-label">Last Heartbeat</span>
        <span class="dev-detail-value">${lastSeen}</span>
      </div>
      <div class="dev-status-row">
        <span class="dev-detail-label">Active Session</span>
        <span>${sessionActive ? '<span class="dev-badge dev-badge-green">Running</span>' : '<span class="dev-badge dev-badge-gray">None</span>'}</span>
      </div>
    </div>
    <div class="dev-action-row">
      <button class="dev-btn dev-btn-secondary dev-btn-sm" onclick="_devTestConnection()">Test Connection</button>
    </div>
  </div>

  <!-- WiFi card -->
  <div class="dev-card" id="dev-wifi-card">
    <div class="dev-card-header">
      <span class="dev-card-title">WiFi Status</span>
      <span class="dev-badge dev-badge-gray" style="font-size:10px">Read-only</span>
    </div>
    ${_devWifiHTML(d)}
  </div>

  <!-- Activity card -->
  <div class="dev-card dev-card-activity" id="dev-activity-card">
    <div class="dev-card-header">
      <span class="dev-card-title">Recent Activity</span>
      <button class="dev-btn dev-btn-ghost dev-btn-sm" onclick="_devLoadActivity()">↻</button>
    </div>
    <div id="dev-activity-list" class="dev-timeline">
      <div class="dev-tl-loading">Loading activity…</div>
    </div>
  </div>

</div>

<!-- Help panel -->
${_devHelpHTML()}`;
}

// ── WiFi section ──────────────────────────────────────────────────────────────
function _devWifiHTML(d) {
  const nets = d.allowedNetworks || [];
  const current = d.currentNetwork;
  if (!current && nets.length === 0) {
    return `<p class="dev-empty-note">No WiFi information available.</p>`;
  }
  return `
<div class="dev-status-block">
  <div class="dev-status-row">
    <span class="dev-detail-label">Current SSID</span>
    <span class="dev-detail-value">${current ? _esc(current) : '—'}</span>
  </div>
  <div class="dev-status-row">
    <span class="dev-detail-label">Status</span>
    <span>${current ? '<span class="dev-badge dev-badge-green">Connected</span>' : '<span class="dev-badge dev-badge-gray">Disconnected</span>'}</span>
  </div>
  <div class="dev-status-row">
    <span class="dev-detail-label">Hotspot SSID</span>
    <span class="dev-detail-value">${d.apSSID ? _esc(d.apSSID) : '—'}</span>
  </div>
</div>
${nets.length > 0 ? `
<div class="dev-wifi-list">
  <p class="dev-detail-label" style="margin-bottom:6px">Saved Networks</p>
  ${nets.map(n => `
  <div class="dev-wifi-row">
    <span class="dev-wifi-ssid">${_esc(n.ssid)}</span>
    <span class="dev-wifi-priority">priority ${n.priority}</span>
    ${current === n.ssid ? '<span class="dev-badge dev-badge-green" style="font-size:10px">Active</span>' : ''}
  </div>`).join('')}
</div>` : ''}`;
}

// ── pairing modal HTML ────────────────────────────────────────────────────────
function _devPairingModalHTML() {
  return `
<div id="dev-pairing-modal" class="dev-modal-overlay" style="display:none">
  <div class="dev-modal">
    <div class="dev-modal-header">
      <h2 class="dev-modal-title">Pair Your Device</h2>
      <button class="dev-modal-close" onclick="_devHidePairing()">✕</button>
    </div>
    <div id="dev-pairing-body">
      <p class="dev-modal-desc">Click <strong>Generate Code</strong> to get a pairing code. Enter it on your ESP32 device to link it to your account.</p>
      <div id="dev-pairing-code-box" style="display:none" class="dev-pairing-code-box">
        <div id="dev-pairing-code" class="dev-pairing-code">——————</div>
        <div id="dev-pairing-expires" class="dev-pairing-expires"></div>
        <div id="dev-pairing-qr" style="margin-top:12px;text-align:center"></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">
        <button class="dev-btn dev-btn-ghost" onclick="_devHidePairing()">Cancel</button>
        <button class="dev-btn dev-btn-primary" id="dev-gen-code-btn" onclick="_devGenerateCode()">Generate Code</button>
      </div>
    </div>
  </div>
</div>`;
}

// ── help panel ────────────────────────────────────────────────────────────────
function _devHelpHTML() {
  return `
<div class="dev-help-panel">
  <div class="dev-help-header">Setup & Troubleshooting</div>
  <div class="dev-help-grid">
    <div class="dev-help-section">
      <p class="dev-help-title">How to Pair</p>
      <ol class="dev-help-list">
        <li>Click <strong>Pair Device</strong> above</li>
        <li>Click <strong>Generate Code</strong> to get your 6-character code</li>
        <li>Power on your ESP32 and enter the code when prompted</li>
        <li>The device will link automatically within seconds</li>
        <li>Code expires in 5 minutes — regenerate if needed</li>
      </ol>
    </div>
    <div class="dev-help-section">
      <p class="dev-help-title">Troubleshooting</p>
      <ul class="dev-help-list">
        <li><strong>Offline?</strong> Check ESP32 power and WiFi network</li>
        <li><strong>Wrong code?</strong> Generate a new code and retry</li>
        <li><strong>Already paired?</strong> Unlink first, then re-pair</li>
        <li><strong>Can't start session?</strong> Device must be online first</li>
      </ul>
    </div>
  </div>
</div>`;
}

// ── event handlers ─────────────────────────────────────────────────────────────
function _devBindEvents(device) {
  window._devCurrentDevice = device;
  if (device) _devLoadActivity();
}

async function _devLoadActivity() {
  const list = document.getElementById('dev-activity-list');
  if (!list) return;
  list.innerHTML = '<div class="dev-tl-loading">Loading…</div>';
  try {
    const res = await fetch('/api/devices/my/activity', {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    });
    const json = await res.json();
    const events = json.events || [];
    if (!events.length) {
      list.innerHTML = '<div class="dev-tl-loading">No activity yet.</div>';
      return;
    }
    const colorMap = { blue:'dev-tl-dot-blue', green:'dev-tl-dot-green', gray:'dev-tl-dot-gray', red:'dev-tl-dot-red', amber:'dev-tl-dot-amber' };
    list.innerHTML = events.map(e => `
      <div class="dev-timeline-item">
        <span class="dev-tl-dot ${colorMap[e.color] || 'dev-tl-dot-blue'}"></span>
        <div class="dev-tl-body">
          <span class="dev-tl-label">${_esc(e.label)}</span>
          <span class="dev-tl-time">${_devFmt(e.at)}</span>
        </div>
      </div>`).join('');
  } catch {
    list.innerHTML = '<div class="dev-tl-loading">Could not load activity.</div>';
  }
}

function _devRefresh() {
  renderAttendanceDevice();
}

function _devShowPairing() {
  const modal = document.getElementById('dev-pairing-modal');
  if (modal) modal.style.display = 'flex';
}

function _devHidePairing() {
  const modal = document.getElementById('dev-pairing-modal');
  if (modal) modal.style.display = 'none';
  const box = document.getElementById('dev-pairing-code-box');
  if (box) box.style.display = 'none';
  const code = document.getElementById('dev-pairing-code');
  if (code) code.textContent = '——————';
}

async function _devGenerateCode() {
  const btn = document.getElementById('dev-gen-code-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  try {
    const res = await fetch('/api/devices/pairing-code', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || ''), 'Content-Type': 'application/json' }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed');

    const box = document.getElementById('dev-pairing-code-box');
    const codeEl = document.getElementById('dev-pairing-code');
    const expiresEl = document.getElementById('dev-pairing-expires');
    if (box) box.style.display = 'block';
    if (codeEl) codeEl.textContent = json.code;
    if (expiresEl) {
      const exp = new Date(json.expiresAt);
      expiresEl.textContent = `Expires at ${exp.toLocaleTimeString()} (5 min)`;
      _devStartExpiryCountdown(exp, expiresEl);
    }

    // QR code
    const qrEl = document.getElementById('dev-pairing-qr');
    if (qrEl) qrEl.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent('KODEX:' + json.code)}" alt="QR" style="border-radius:8px" />`;

    // Poll for device linked
    _devPollForLink(json.code);
  } catch (e) {
    alert(e.message || 'Failed to generate pairing code');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Regenerate Code'; }
  }
}

let _devExpiryTimer = null;
function _devStartExpiryCountdown(exp, el) {
  clearInterval(_devExpiryTimer);
  _devExpiryTimer = setInterval(() => {
    const secs = Math.max(0, Math.ceil((exp - Date.now()) / 1000));
    const m = Math.floor(secs / 60), s = secs % 60;
    if (el) el.textContent = secs > 0
      ? `Expires in ${m}:${String(s).padStart(2,'0')}`
      : 'Code expired — please regenerate';
    if (secs === 0) clearInterval(_devExpiryTimer);
  }, 1000);
}

let _devPollTimer = null;
function _devPollForLink(code) {
  clearInterval(_devPollTimer);
  let attempts = 0;
  _devPollTimer = setInterval(async () => {
    attempts++;
    if (attempts > 60) { clearInterval(_devPollTimer); return; }
    try {
      const res = await fetch('/api/devices/my', {
        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
      });
      const json = await res.json();
      if (json.data) {
        clearInterval(_devPollTimer);
        clearInterval(_devExpiryTimer);
        _devHidePairing();
        renderAttendanceDevice();
      }
    } catch (_) {}
  }, 3000);
}

async function _devUnlink() {
  if (!confirm('Unlink this device? You will need to re-pair it to use it again.')) return;
  try {
    const res = await fetch('/api/devices/my', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to unlink');
    renderAttendanceDevice();
  } catch (e) {
    alert(e.message);
  }
}

async function _devRename() {
  const current = document.getElementById('dev-name-display')?.textContent || '';
  const name = prompt('Enter new device name:', current);
  if (!name?.trim() || name.trim() === current) return;
  try {
    const res = await fetch('/api/devices/my/rename', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || ''), 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: name.trim() })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Rename failed');
    const el = document.getElementById('dev-name-display');
    if (el) el.textContent = json.deviceName;
  } catch (e) {
    alert(e.message);
  }
}

async function _devTestConnection() {
  const btn = event.target;
  btn.disabled = true; btn.textContent = 'Testing…';
  try {
    const res = await fetch('/api/devices/my', {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    });
    const json = await res.json();
    const d = json.data;
    if (d?.status === 'online') {
      alert(`✓ Device is online. Last heartbeat: ${_devFmt(d.lastHeartbeat)}`);
    } else {
      alert(`Device is offline. Last seen: ${_devFmt(d?.lastHeartbeat)}`);
    }
  } catch (e) {
    alert('Connection test failed.');
  } finally {
    btn.disabled = false; btn.textContent = 'Test Connection';
  }
}

// ── safe HTML escape ──────────────────────────────────────────────────────────
function _esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── CSS ───────────────────────────────────────────────────────────────────────
function _devCSS() {
  return `
.dev-page { max-width: 1100px; margin: 0 auto; padding: 0 4px 40px; }
.dev-page-header { display:flex; align-items:flex-start; justify-content:space-between; margin-bottom:24px; flex-wrap:wrap; gap:12px; }
.dev-page-title { font-size:22px; font-weight:800; color:var(--text-primary,#1e293b); margin:0 0 4px; }
.dev-page-sub { font-size:13px; color:var(--text-secondary,#64748b); margin:0; }
.dev-header-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; }

/* Buttons */
.dev-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 16px; border-radius:10px; font-size:13px; font-weight:600; cursor:pointer; border:none; transition:background .15s,opacity .15s; }
.dev-btn-primary { background:#4f46e5; color:#fff; }
.dev-btn-primary:hover { background:#4338ca; }
.dev-btn-secondary { background:#f1f5f9; color:#334155; border:1px solid #e2e8f0; }
.dev-btn-secondary:hover { background:#e2e8f0; }
.dev-btn-ghost { background:transparent; color:#64748b; border:1px solid #e2e8f0; }
.dev-btn-ghost:hover { background:#f8fafc; }
.dev-btn-danger { background:#fee2e2; color:#dc2626; }
.dev-btn-danger:hover { background:#fecaca; }
.dev-btn-sm { padding:5px 12px; font-size:12px; }
.dev-btn-lg { padding:12px 28px; font-size:15px; }
.dev-btn:disabled { opacity:.55; cursor:not-allowed; }

/* Status bar */
.dev-status-bar { display:flex; align-items:center; justify-content:space-between; padding:12px 18px; border-radius:14px; margin-bottom:20px; flex-wrap:wrap; gap:8px; }
.dev-status-bar-online { background:#f0fdf4; border:1px solid #bbf7d0; }
.dev-status-bar-offline { background:#fef2f2; border:1px solid #fecaca; }
.dev-status-bar-left { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.dev-status-bar-right { font-size:11px; color:#94a3b8; font-family:monospace; }
.dev-status-text { font-size:13px; color:#374151; }
.dev-status-sep { color:#cbd5e1; }
.dev-device-id-text { font-size:11px; color:#94a3b8; }

/* Status dot */
.dev-status-dot { display:inline-block; width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.dev-dot-online { background:#22c55e; box-shadow:0 0 0 3px #dcfce7; }
.dev-dot-offline { background:#ef4444; }
.dev-status-label { font-size:13px; font-weight:600; }
.dev-online-text { color:#16a34a; }
.dev-offline-text { color:#dc2626; }
.dev-session-badge { background:#f59e0b; color:#fff; border-radius:20px; padding:2px 10px; font-size:11px; font-weight:700; }

/* Grid */
.dev-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media(max-width:700px){ .dev-grid { grid-template-columns:1fr; } }

/* Cards */
.dev-card { background:#fff; border-radius:16px; padding:20px; box-shadow:0 1px 4px rgba(0,0,0,.06),0 0 0 1px rgba(0,0,0,.04); }
.dev-card-main { grid-column:span 2; }
@media(max-width:700px){ .dev-card-main { grid-column:span 1; } }
.dev-card-activity { grid-column:span 2; }
@media(max-width:700px){ .dev-card-activity { grid-column:span 1; } }
.dev-card-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.dev-card-title { font-size:14px; font-weight:700; color:#1e293b; }

/* Details grid */
.dev-detail-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
@media(max-width:600px){ .dev-detail-grid { grid-template-columns:repeat(2,1fr); } }
.dev-detail-item { display:flex; flex-direction:column; gap:3px; }
.dev-detail-label { font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.5px; color:#94a3b8; }
.dev-detail-value { font-size:14px; font-weight:500; color:#1e293b; }

/* Status block */
.dev-status-block { display:flex; flex-direction:column; gap:10px; margin-bottom:14px; }
.dev-status-row { display:flex; align-items:center; justify-content:space-between; }
.dev-action-row { border-top:1px solid #f1f5f9; padding-top:12px; display:flex; gap:8px; }

/* Badges */
.dev-badge { display:inline-block; padding:2px 8px; border-radius:20px; font-size:11px; font-weight:600; }
.dev-badge-green { background:#dcfce7; color:#16a34a; }
.dev-badge-gray { background:#f1f5f9; color:#64748b; }
.dev-badge-blue { background:#eff6ff; color:#2563eb; }
.dev-badge-amber { background:#fef9c3; color:#d97706; }

/* WiFi */
.dev-wifi-list { margin-top:10px; display:flex; flex-direction:column; gap:6px; }
.dev-wifi-row { display:flex; align-items:center; gap:8px; background:#f8fafc; border-radius:8px; padding:6px 10px; }
.dev-wifi-ssid { font-size:13px; font-weight:600; color:#1e293b; flex:1; font-family:monospace; }
.dev-wifi-priority { font-size:11px; color:#94a3b8; }
.dev-empty-note { font-size:13px; color:#94a3b8; text-align:center; padding:16px 0; }

/* Timeline */
.dev-timeline { display:flex; flex-direction:column; gap:0; }
.dev-timeline-item { display:flex; align-items:flex-start; gap:12px; padding:8px 0; border-bottom:1px solid #f1f5f9; }
.dev-timeline-item:last-child { border-bottom:none; }
.dev-tl-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; margin-top:3px; }
.dev-tl-dot-blue { background:#818cf8; }
.dev-tl-dot-green { background:#4ade80; }
.dev-tl-dot-amber { background:#fbbf24; }
.dev-tl-dot-red { background:#f87171; }
.dev-tl-dot-gray { background:#cbd5e1; }
.dev-tl-loading { font-size:13px; color:#94a3b8; padding:12px 0; text-align:center; }
.dev-tl-body { display:flex; flex-direction:column; gap:1px; flex:1; }
.dev-tl-label { font-size:13px; color:#374151; font-weight:500; }
.dev-tl-time { font-size:11px; color:#94a3b8; }

/* Empty state */
.dev-empty-state { text-align:center; padding:64px 24px; background:#fff; border-radius:20px; box-shadow:0 1px 4px rgba(0,0,0,.06); }
.dev-empty-icon { font-size:48px; margin-bottom:16px; }
.dev-empty-title { font-size:20px; font-weight:800; color:#1e293b; margin:0 0 8px; }
.dev-empty-desc { font-size:14px; color:#64748b; max-width:360px; margin:0 auto 24px; line-height:1.6; }

/* Help panel */
.dev-help-panel { background:#f8fafc; border:1px solid #e2e8f0; border-radius:16px; padding:20px; margin-top:20px; }
.dev-help-header { font-size:13px; font-weight:700; color:#475569; margin-bottom:14px; text-transform:uppercase; letter-spacing:.5px; }
.dev-help-grid { display:grid; grid-template-columns:1fr 1fr; gap:20px; }
@media(max-width:600px){ .dev-help-grid { grid-template-columns:1fr; } }
.dev-help-title { font-size:13px; font-weight:700; color:#1e293b; margin:0 0 8px; }
.dev-help-list { margin:0; padding-left:18px; font-size:13px; color:#475569; line-height:1.8; }
.dev-help-section {}

/* Pairing modal */
.dev-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:9999; }
.dev-modal { background:#fff; border-radius:20px; padding:28px; max-width:420px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,.18); }
.dev-modal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.dev-modal-title { font-size:18px; font-weight:800; color:#1e293b; margin:0; }
.dev-modal-close { background:none; border:none; font-size:18px; cursor:pointer; color:#94a3b8; line-height:1; padding:4px; }
.dev-modal-desc { font-size:13px; color:#64748b; margin:0 0 16px; line-height:1.6; }
.dev-pairing-code-box { background:#f8fafc; border:2px solid #e2e8f0; border-radius:14px; padding:20px; text-align:center; }
.dev-pairing-code { font-size:38px; font-weight:900; letter-spacing:10px; color:#4f46e5; font-family:monospace; }
.dev-pairing-expires { font-size:12px; color:#94a3b8; margin-top:6px; }
.dev-signal { font-size:14px; color:#22c55e; }

/* Signal strength */
.dev-signal-1 { color:#ef4444; }
.dev-signal-2 { color:#f59e0b; }
.dev-signal-3 { color:#22c55e; }

/* Online pulse animation */
@keyframes dev-pulse {
  0%,100% { box-shadow:0 0 0 3px rgba(34,197,94,.35); }
  50%      { box-shadow:0 0 0 6px rgba(34,197,94,.08); }
}
.dev-dot-online { animation: dev-pulse 2s ease-in-out infinite; }

/* Card hover lift */
.dev-card { transition: box-shadow .18s ease; }
.dev-card:hover { box-shadow:0 4px 16px rgba(0,0,0,.09),0 0 0 1px rgba(0,0,0,.04); }

/* Page fade-in */
@keyframes dev-fade-in {
  from { opacity:0; transform:translateY(6px); }
  to   { opacity:1; transform:translateY(0); }
}
.dev-page { animation: dev-fade-in .25s ease; }

/* Responsive: single-column below 480px */
@media(max-width:480px) {
  .dev-page-header { flex-direction:column; }
  .dev-header-actions { width:100%; justify-content:flex-end; }
  .dev-status-bar { flex-direction:column; align-items:flex-start; gap:6px; }
  .dev-detail-grid { grid-template-columns:1fr 1fr !important; }
  .dev-btn-lg { width:100%; justify-content:center; }
}

/* Divider between cards */
.dev-grid > .dev-card { border-top:3px solid transparent; }
.dev-grid > .dev-card:first-child { border-top-color:#6366f1; }

/* Pairing code pulse */
@keyframes dev-code-in {
  from { transform:scale(.94); opacity:0; }
  to   { transform:scale(1);   opacity:1; }
}
.dev-pairing-code { animation: dev-code-in .2s ease; }
`;
}

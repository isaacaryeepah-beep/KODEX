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
    </div>` : ''}
  </div>

  ${!hasDevice ? _devNoPairedHTML() : _devPairedHTML(device)}

  <!-- pairing modal (hidden) -->
  ${_devPairingModalHTML()}
</div>

<style>${_devCSS()}</style>`;
}

// ── no device view ────────────────────────────────────────────────────────────
function _devNoPairedHTML() {
  return `
<!-- Setup steps guide -->
<div class="dev-setup-banner">
  <div class="dev-setup-banner-icon">⚡</div>
  <div>
    <div class="dev-setup-banner-title">First-time setup — follow these two steps</div>
    <div class="dev-setup-banner-sub">Generate a pairing code here, then configure the ESP32 at 192.168.4.1.</div>
  </div>
</div>

<div class="dev-setup-grid">

  <!-- Step 1: Generate Pairing Code -->
  <div class="dev-card dev-setup-card">
    <div class="dev-setup-step-badge">Step 1</div>
    <div class="dev-card-header" style="margin-top:8px">
      <span class="dev-card-title">Generate a Pairing Code</span>
    </div>
    <p class="dev-setup-hint">
      Generate a one-time 6-character code here first. You will need it in Step 2
      to link the device to your account.
    </p>
    <button class="dev-btn dev-btn-primary dev-btn-block" style="margin-top:auto"
            onclick="_devShowPairing()">+ Generate Pairing Code</button>
  </div>

  <!-- Step 2: WiFi + Device Setup -->
  <div class="dev-card dev-setup-card">
    <div class="dev-setup-step-badge dev-setup-step-badge--2">Step 2</div>
    <div class="dev-card-header" style="margin-top:8px">
      <span class="dev-card-title">Configure the ESP32</span>
    </div>
    <p class="dev-setup-hint">
      Power on the ESP32. It broadcasts a hotspot named <code>KODEX-XXXXXX</code>.
    </p>
    <ol class="dev-setup-steps-list">
      <li>Connect your phone or laptop to the <strong>KODEX-XXXXXX</strong> hotspot (no internet needed).</li>
      <li>On that same device, open <strong>http://192.168.4.1</strong> in a browser — the setup page loads automatically.</li>
      <li>Enter your <strong>Institution Code</strong>, the <strong>Pairing Code</strong> from Step 1, and your <strong>WiFi credentials</strong>.</li>
      <li>Tap <strong>Pair Device</strong>. The ESP32 reboots, connects to WiFi, and links to your account.</li>
    </ol>
    <p style="font-size:12px;color:#94a3b8;margin:8px 0 0">
      Note: 192.168.4.1 is only reachable while connected to the KODEX hotspot — not from the internet.
    </p>
  </div>

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
    <div id="dev-test-status" class="dev-test-status" style="display:none"></div>
  </div>

  <!-- WiFi Setup card -->
  <div class="dev-card" id="dev-wifi-card">
    <div class="dev-card-header">
      <span class="dev-card-title">WiFi Setup</span>
    </div>
    ${_devWifiHTML(d)}
    <div class="dev-wifi-reconfigure-note">
      <strong>To change networks:</strong> access the device directly at its local IP
      (e.g. <code>http://192.168.1.x</code>) while on the same network, or hold the
      reset button for 5 s to re-enter setup mode and visit <code>192.168.4.1</code>.
    </div>
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
  const current = d.currentNetwork;
  const nets    = (d.allowedNetworks || []);

  const currentRow = `
<div class="dev-status-block" style="margin-bottom:10px">
  <div class="dev-status-row">
    <span class="dev-detail-label">Current Network</span>
    <span class="dev-detail-value dev-monospace">${current ? _esc(current) : '—'}</span>
  </div>
  <div class="dev-status-row">
    <span class="dev-detail-label">WiFi Status</span>
    <span>${current
      ? '<span class="dev-badge dev-badge-green">Connected</span>'
      : '<span class="dev-badge dev-badge-gray">Not connected</span>'}</span>
  </div>${d.apSSID ? `
  <div class="dev-status-row">
    <span class="dev-detail-label">Hotspot (AP) SSID</span>
    <span class="dev-detail-value dev-monospace">${_esc(d.apSSID)}</span>
  </div>` : ''}
</div>`;

  const savedRows = nets.length ? `
<div class="dev-wifi-saved-section">
  <p class="dev-detail-label" style="margin-bottom:6px">Saved Networks</p>
  ${nets.map(n => `
  <div class="dev-wifi-saved-row">
    <span class="dev-wifi-ssid-name">${_esc(n.ssid)}</span>
    ${current === n.ssid
      ? '<span class="dev-badge dev-badge-green" style="font-size:10px">Active</span>'
      : ''}
  </div>`).join('')}
</div>` : '';

  return currentRow + savedRows;
}

// ── pairing modal HTML ────────────────────────────────────────────────────────
function _devPairingModalHTML() {
  return `
<!-- Pairing modal -->
<div id="dev-pairing-modal" class="dev-modal-overlay" style="display:none">
  <div class="dev-modal">
    <div class="dev-modal-header">
      <h2 class="dev-modal-title">Pair Your Device</h2>
      <button class="dev-modal-close" onclick="_devHidePairing()">✕</button>
    </div>
    <div id="dev-pairing-body">
      <p class="dev-modal-desc">Click <strong>Generate Code</strong> to get a pairing code. Enter it on your ESP32 captive portal to link it to your account.</p>
      <div id="dev-pairing-error" class="dev-modal-error" style="display:none"></div>
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
</div>

<!-- Unlink confirm modal -->
<div id="dev-unlink-modal" class="dev-modal-overlay" style="display:none">
  <div class="dev-modal">
    <div class="dev-modal-header">
      <h2 class="dev-modal-title">Unlink Device</h2>
      <button class="dev-modal-close" onclick="_devHideUnlink()">✕</button>
    </div>
    <p class="dev-modal-desc">Are you sure you want to unlink this device? You will need to re-pair it to use it again.</p>
    <div id="dev-unlink-error" class="dev-modal-error" style="display:none"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end">
      <button class="dev-btn dev-btn-ghost" onclick="_devHideUnlink()">Cancel</button>
      <button class="dev-btn dev-btn-danger" id="dev-unlink-confirm-btn" onclick="_devUnlinkConfirm()">Yes, Unlink</button>
    </div>
  </div>
</div>

<!-- Rename modal -->
<div id="dev-rename-modal" class="dev-modal-overlay" style="display:none">
  <div class="dev-modal">
    <div class="dev-modal-header">
      <h2 class="dev-modal-title">Rename Device</h2>
      <button class="dev-modal-close" onclick="_devHideRename()">✕</button>
    </div>
    <div id="dev-rename-error" class="dev-modal-error" style="display:none"></div>
    <input id="dev-rename-input" type="text" class="dev-rename-input" placeholder="Device name" maxlength="64" />
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:14px">
      <button class="dev-btn dev-btn-ghost" onclick="_devHideRename()">Cancel</button>
      <button class="dev-btn dev-btn-primary" id="dev-rename-confirm-btn" onclick="_devRenameConfirm()">Save</button>
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
      <p class="dev-help-title">How to Pair &amp; Set Up WiFi</p>
      <ol class="dev-help-list">
        <li>Click <strong>Generate Pairing Code</strong> and note the 6-character code</li>
        <li>Power on the ESP32 — it broadcasts hotspot <code>KODEX-XXXXXX</code></li>
        <li>Connect your phone/laptop to that hotspot</li>
        <li>Open <strong>192.168.4.1</strong> in your browser — setup page loads automatically</li>
        <li>Enter your <strong>Institution Code</strong>, the <strong>Pairing Code</strong>, and your <strong>WiFi credentials</strong></li>
        <li>Tap <strong>Pair Device</strong> — the ESP32 reboots and connects to WiFi</li>
        <li>Return here — device shows <strong>Online</strong> within ~30 seconds</li>
      </ol>
    </div>
    <div class="dev-help-section">
      <p class="dev-help-title">Troubleshooting</p>
      <ul class="dev-help-list">
        <li><strong>192.168.4.1 unreachable?</strong> Ensure you're connected to the <code>KODEX-XXXXXX</code> hotspot, not your home WiFi</li>
        <li><strong>Wrong WiFi password?</strong> Hold the reset button 5 s to re-enter setup mode</li>
        <li><strong>Offline after connecting?</strong> Wait 30 s for first heartbeat; refresh if needed</li>
        <li><strong>Can't start session?</strong> Device must show <strong>Online</strong> first</li>
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
  const btn   = document.getElementById('dev-gen-code-btn');
  const errEl = document.getElementById('dev-pairing-error');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
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
    const msg = e.message === 'Failed to fetch'
      ? 'Could not reach the server. Check your connection and try again.'
      : (e.message || 'Failed to generate pairing code');
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
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
  const btn = document.getElementById('dev-unlink-confirm-btn');
  const modal = document.getElementById('dev-unlink-modal');
  if (modal) modal.style.display = 'flex';
  // actual delete is triggered by the confirm button in the modal (see _devUnlinkConfirm)
}

async function _devUnlinkConfirm() {
  const modal  = document.getElementById('dev-unlink-modal');
  const errEl  = document.getElementById('dev-unlink-error');
  const btn    = document.getElementById('dev-unlink-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Unlinking…'; }
  if (errEl) { errEl.style.display = 'none'; }
  try {
    const res = await fetch('/api/devices/my', {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed to unlink');
    if (modal) modal.style.display = 'none';
    renderAttendanceDevice();
  } catch (e) {
    const msg = e.message === 'Failed to fetch'
      ? 'Could not reach the server. Check your connection and try again.'
      : (e.message || 'Failed to unlink device');
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Yes, Unlink'; }
  }
}

function _devHideUnlink() {
  const modal = document.getElementById('dev-unlink-modal');
  if (modal) modal.style.display = 'none';
}

async function _devRename() {
  const modal  = document.getElementById('dev-rename-modal');
  const input  = document.getElementById('dev-rename-input');
  const current = document.getElementById('dev-name-display')?.textContent || '';
  if (input) input.value = current;
  if (modal) modal.style.display = 'flex';
}

async function _devRenameConfirm() {
  const modal  = document.getElementById('dev-rename-modal');
  const input  = document.getElementById('dev-rename-input');
  const errEl  = document.getElementById('dev-rename-error');
  const btn    = document.getElementById('dev-rename-confirm-btn');
  const name   = input?.value?.trim() || '';
  if (!name) { if (errEl) { errEl.textContent = 'Name cannot be empty.'; errEl.style.display = 'block'; } return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  if (errEl) errEl.style.display = 'none';
  try {
    const res = await fetch('/api/devices/my/rename', {
      method: 'PATCH',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || ''), 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceName: name })
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Rename failed');
    const el = document.getElementById('dev-name-display');
    if (el) el.textContent = json.deviceName;
    if (modal) modal.style.display = 'none';
  } catch (e) {
    const msg = e.message === 'Failed to fetch'
      ? 'Could not reach the server. Check your connection and try again.'
      : (e.message || 'Rename failed');
    if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
  }
}

function _devHideRename() {
  const modal = document.getElementById('dev-rename-modal');
  if (modal) modal.style.display = 'none';
}

async function _devTestConnection() {
  const btn    = event.target;
  const statusEl = document.getElementById('dev-test-status');
  btn.disabled = true; btn.textContent = 'Testing…';
  if (statusEl) { statusEl.style.display = 'none'; statusEl.className = 'dev-test-status'; }
  try {
    const res = await fetch('/api/devices/my', {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    });
    const json = await res.json();
    const d = json.data;
    if (statusEl) {
      statusEl.style.display = 'block';
      if (d?.status === 'online') {
        statusEl.className = 'dev-test-status dev-test-ok';
        statusEl.textContent = `✓ Online — last heartbeat ${_devFmt(d.lastHeartbeat)}`;
      } else {
        statusEl.className = 'dev-test-status dev-test-warn';
        statusEl.textContent = `Device offline — last seen ${_devFmt(d?.lastHeartbeat)}`;
      }
    }
  } catch (e) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.className = 'dev-test-status dev-test-err';
      statusEl.textContent = 'Connection test failed. Check your internet connection.';
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Test Connection';
  }
}

// ── WiFi setup handlers ───────────────────────────────────────────────────────
async function _devScanWifi() {
  const btn      = document.getElementById('dev-scan-btn');
  const results  = document.getElementById('dev-wifi-scan-results');
  const list     = document.getElementById('dev-wifi-ssid-list');
  const ipInput  = document.getElementById('dev-esp32-ip');
  const statusEl = document.getElementById('dev-wifi-status-msg');
  if (!btn || !results || !list) return;

  const ip = (ipInput ? ipInput.value.trim() : '');

  btn.disabled = true;
  btn.textContent = 'Scanning…';
  results.style.display = 'block';
  list.innerHTML = '<div class="dev-wifi-scanning">Scanning for networks…</div>';
  if (statusEl) statusEl.style.display = 'none';
  _devClearWifiSelection();

  try {
    const url = '/api/devices/my/scan-wifi' + (ip ? '?ip=' + encodeURIComponent(ip) : '');
    const res  = await fetch(url, {
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Scan failed');

    // If server confirmed an IP, update the input
    if (json.deviceIp && ipInput && !ipInput.value.trim()) {
      ipInput.value = json.deviceIp;
    }

    const networks = json.networks || [];
    if (!networks.length) {
      list.innerHTML = '<div class="dev-wifi-scanning">No networks found. Ensure the ESP32 is powered on and the IP is correct.</div>';
    } else {
      networks.sort((a, b) => (b.rssi || -100) - (a.rssi || -100));
      // Use data-ssid attribute — safe for SSIDs with any characters
      list.innerHTML = networks.map(n => {
        const ssid  = n.ssid || n.SSID || '';
        const rssi  = typeof n.rssi === 'number' ? n.rssi : 0;
        const bars  = rssi > -60 ? 3 : rssi > -75 ? 2 : 1;
        const lock  = (n.open === false || n.authmode || n.encryption) ? '🔒 ' : '';
        return `<div class="dev-wifi-ssid-item" data-ssid="${_esc(ssid)}" onclick="_devSelectWifi(this)">
          <span class="dev-wifi-ssid-name">${_esc(ssid || '(Hidden)')}</span>
          <span class="dev-wifi-ssid-meta">${lock}${'▂▄▆'.slice(0, bars)}${rssi ? ' ' + rssi + ' dBm' : ''}</span>
        </div>`;
      }).join('');
    }
  } catch (e) {
    list.innerHTML = `<div class="dev-wifi-scan-error">${_esc(e.message)}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '⟳ Scan WiFi';
  }
}

// Called with the clicked <div> element — reads SSID from data attribute
function _devSelectWifi(el) {
  const ssid   = el.dataset.ssid || '';
  const form   = document.getElementById('dev-wifi-connect-form');
  const label  = document.getElementById('dev-wifi-selected-ssid');
  const pwdEl  = document.getElementById('dev-wifi-password');
  const msgEl  = document.getElementById('dev-wifi-status-msg');
  if (!form || !label) return;

  label.textContent = ssid;
  form.style.display = 'block';
  if (pwdEl) { pwdEl.value = ''; pwdEl.focus(); }
  if (msgEl) msgEl.style.display = 'none';

  document.querySelectorAll('.dev-wifi-ssid-item').forEach(item => {
    item.classList.toggle('dev-wifi-item-selected', item === el);
  });
}

function _devClearWifiSelection() {
  const form  = document.getElementById('dev-wifi-connect-form');
  const label = document.getElementById('dev-wifi-selected-ssid');
  if (form)  form.style.display = 'none';
  if (label) label.textContent = '';
  document.querySelectorAll('.dev-wifi-ssid-item').forEach(el => el.classList.remove('dev-wifi-item-selected'));
}

async function _devConnectWifi() {
  const ssid     = document.getElementById('dev-wifi-selected-ssid')?.textContent?.trim();
  const password = document.getElementById('dev-wifi-password')?.value?.trim();
  const deviceIp = document.getElementById('dev-esp32-ip')?.value?.trim() || '';
  const btn      = document.getElementById('dev-wifi-connect-btn');
  const statusEl = document.getElementById('dev-wifi-status-msg');

  if (!ssid) return;
  if (!password) {
    if (statusEl) { statusEl.style.display = 'block'; statusEl.className = 'dev-wifi-status-msg dev-wifi-status-error'; statusEl.textContent = 'Please enter the WiFi password.'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Connecting…'; }
  if (statusEl) {
    statusEl.style.display = 'block';
    statusEl.className = 'dev-wifi-status-msg dev-wifi-status-connecting';
    statusEl.textContent = 'Sending configuration to device…';
  }

  try {
    const res  = await fetch('/api/devices/configure-wifi', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + (localStorage.getItem('token') || ''),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ssid, password, deviceIp }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || 'Failed');

    const ok = (json.status === 'connected' || json.status === 'saved');
    if (statusEl) {
      statusEl.className = 'dev-wifi-status-msg ' + (ok ? 'dev-wifi-status-ok' : 'dev-wifi-status-error');
      statusEl.innerHTML = ok
        ? '✓ ' + _esc(json.message) + (json.warning ? '<br><small>' + _esc(json.warning) + '</small>' : '')
        : '✗ ' + _esc(json.message);
    }
  } catch (e) {
    if (statusEl) {
      statusEl.className = 'dev-wifi-status-msg dev-wifi-status-error';
      statusEl.textContent = '✗ ' + e.message;
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Connect'; }
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
.dev-monospace { font-family:monospace; }
.dev-wifi-ip-row { display:flex; align-items:flex-end; gap:10px; margin:14px 0 0; }
.dev-wifi-ip-group { display:flex; flex-direction:column; gap:4px; flex:1; }
.dev-wifi-ip-input { padding:8px 11px; border:1px solid #e2e8f0; border-radius:9px; font-size:13px; font-family:monospace; outline:none; width:100%; box-sizing:border-box; transition:border .15s; }
.dev-wifi-ip-input:focus { border-color:#6366f1; }
.dev-wifi-scan-list { display:flex; flex-direction:column; gap:4px; max-height:220px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:10px; padding:4px; }
.dev-wifi-ssid-item { display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-radius:8px; cursor:pointer; transition:background .12s; user-select:none; }
.dev-wifi-ssid-item:hover { background:#f1f5f9; }
.dev-wifi-item-selected { background:#eff6ff !important; border:1px solid #bfdbfe; }
.dev-wifi-ssid-name { font-size:13px; font-weight:600; color:#1e293b; }
.dev-wifi-ssid-meta { font-size:11px; color:#94a3b8; white-space:nowrap; }
.dev-wifi-scanning { font-size:13px; color:#94a3b8; text-align:center; padding:14px 0; }
.dev-wifi-scan-error { font-size:13px; color:#dc2626; padding:10px; background:#fef2f2; border-radius:8px; }
.dev-wifi-selected-row { display:flex; align-items:center; justify-content:space-between; background:#f8fafc; border-radius:8px; padding:8px 10px; margin-bottom:8px; }
.dev-wifi-ssid-selected { font-size:13px; font-weight:700; color:#1e293b; font-family:monospace; }
.dev-wifi-password-input { width:100%; box-sizing:border-box; padding:9px 12px; border:1px solid #e2e8f0; border-radius:9px; font-size:13px; outline:none; transition:border .15s; }
.dev-wifi-password-input:focus { border-color:#6366f1; }
.dev-btn-block { width:100%; justify-content:center; margin-top:8px; }
.dev-wifi-status-msg { margin-top:10px; padding:10px 12px; border-radius:9px; font-size:13px; line-height:1.5; }
.dev-wifi-status-connecting { background:#eff6ff; color:#1d4ed8; }
.dev-wifi-status-ok { background:#f0fdf4; color:#15803d; }
.dev-wifi-status-error { background:#fef2f2; color:#dc2626; }
.dev-wifi-saved-section { margin-top:10px; padding-top:10px; border-top:1px solid #f1f5f9; }
.dev-wifi-saved-row { display:flex; align-items:center; gap:8px; padding:5px 0; }
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

/* Setup flow (no device state) */
.dev-setup-banner { display:flex; align-items:center; gap:14px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:14px; padding:16px 20px; margin-bottom:20px; }
.dev-setup-banner-icon { font-size:26px; flex-shrink:0; }
.dev-setup-banner-title { font-size:14px; font-weight:700; color:#1e3a8a; margin-bottom:2px; }
.dev-setup-banner-sub { font-size:12px; color:#3b82f6; }
.dev-setup-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; align-items:start; }
@media(max-width:700px){ .dev-setup-grid { grid-template-columns:1fr; } }
.dev-setup-card { display:flex; flex-direction:column; min-height:320px; }
.dev-setup-step-badge { display:inline-block; background:#6366f1; color:#fff; font-size:11px; font-weight:700; padding:3px 10px; border-radius:20px; width:fit-content; }
.dev-setup-step-badge--2 { background:#0ea5e9; }
.dev-setup-hint { font-size:13px; color:#64748b; line-height:1.65; margin:0 0 14px; }
.dev-setup-hint code { background:#f1f5f9; padding:1px 5px; border-radius:4px; font-size:12px; color:#334155; }
.dev-setup-steps-list { font-size:13px; color:#475569; line-height:1.9; padding-left:18px; margin:0 0 14px; }
.dev-setup-steps-list strong { color:#1e293b; }
.dev-setup-steps-list code { background:#f1f5f9; padding:1px 5px; border-radius:4px; font-size:12px; color:#334155; }
.dev-wifi-reconfigure-note { margin-top:12px; padding:10px 14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; font-size:12px; color:#475569; line-height:1.7; }
.dev-wifi-reconfigure-note code { background:#e2e8f0; padding:1px 5px; border-radius:4px; font-family:monospace; }

/* Empty state (fallback) */
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

/* Modals */
.dev-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.4); display:flex; align-items:center; justify-content:center; z-index:9999; }
.dev-modal { background:#fff; border-radius:20px; padding:28px; max-width:420px; width:90%; box-shadow:0 20px 60px rgba(0,0,0,.18); }
.dev-modal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:16px; }
.dev-modal-title { font-size:18px; font-weight:800; color:#1e293b; margin:0; }
.dev-modal-close { background:none; border:none; font-size:18px; cursor:pointer; color:#94a3b8; line-height:1; padding:4px; }
.dev-modal-desc { font-size:13px; color:#64748b; margin:0 0 16px; line-height:1.6; }
.dev-modal-error { background:#fef2f2; border:1px solid #fecaca; color:#dc2626; border-radius:9px; padding:10px 14px; font-size:13px; margin-bottom:12px; }
.dev-pairing-code-box { background:#f8fafc; border:2px solid #e2e8f0; border-radius:14px; padding:20px; text-align:center; }
.dev-pairing-code { font-size:38px; font-weight:900; letter-spacing:10px; color:#4f46e5; font-family:monospace; }
.dev-pairing-expires { font-size:12px; color:#94a3b8; margin-top:6px; }
.dev-rename-input { width:100%; box-sizing:border-box; padding:10px 13px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px; outline:none; transition:border .15s; }
.dev-rename-input:focus { border-color:#6366f1; }
.dev-test-status { margin-top:10px; padding:9px 13px; border-radius:9px; font-size:13px; }
.dev-test-ok   { background:#f0fdf4; color:#15803d; }
.dev-test-warn { background:#fffbeb; color:#d97706; }
.dev-test-err  { background:#fef2f2; color:#dc2626; }
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

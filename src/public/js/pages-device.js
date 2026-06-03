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

  <!-- management modals -->
  ${_devModalsHTML()}
</div>

<style>${_devCSS()}</style>`;
}

// ── no device — info panel (pairing is done by Admin/HOD) ────────────────────
function _devNoPairedHTML() {
  return `
<div class="dev-connect-wrapper">
  <div class="dev-connect-card" style="text-align:center;padding:40px 24px">
    <div class="dev-connect-icon">📡</div>
    <h2 class="dev-connect-title">No Device Assigned</h2>
    <p class="dev-connect-desc" style="max-width:340px;margin:0 auto">
      Your classroom device hasn't been set up yet. Ask your <strong>Admin or HOD</strong> to pair a device to your room — they can generate a pairing code from the <strong>Devices</strong> section in their portal.
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
      on the same WiFi network, or hold the reset button for 5 s to re-enter setup
      mode — then use the <strong>Setup Wizard</strong> to reconnect.
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

<!-- Class Rep PIN card -->
<div style="margin-top:20px;padding:16px;background:#f8fafc;border-radius:12px;border:1.5px solid #e2e8f0">
  <h4 style="font-size:13px;font-weight:700;margin-bottom:8px">Class Rep PIN</h4>
  <p style="font-size:12px;color:#64748b;margin-bottom:10px">Set a 4-digit PIN that your class rep must enter to connect a shared device to your session.</p>
  <div style="display:flex;gap:8px;align-items:center">
    <input id="lecturer-pin-input" type="password" inputmode="numeric" maxlength="4" placeholder="4 digits" style="width:100px;padding:8px 12px;border:1.5px solid #e2e8f0;border-radius:8px;font-size:16px;letter-spacing:4px">
    <button onclick="saveLecturerPin()" style="padding:8px 16px;background:#1e293b;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Save PIN</button>
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

// ── management modals (unlink + rename) ──────────────────────────────────────
function _devModalsHTML() {
  return `
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
  <div class="dev-help-header">Troubleshooting</div>
  <div class="dev-help-grid">
    <div class="dev-help-section">
      <p class="dev-help-title">Device is Offline</p>
      <ul class="dev-help-list">
        <li>Check the device is powered on and the classroom WiFi is working</li>
        <li>Wait 30 s then click <strong>↻ Refresh</strong> — the first heartbeat can take a moment</li>
        <li>If still offline, the device may need its WiFi password updated — ask your Admin or HOD</li>
      </ul>
    </div>
    <div class="dev-help-section">
      <p class="dev-help-title">Session not showing on device</p>
      <ul class="dev-help-list">
        <li>Device must show <strong>Online</strong> before a session code appears</li>
        <li>Start the session from the portal — the device polls every 5 s and will pick it up automatically</li>
        <li>If the device shows the wrong session, end and restart the session</li>
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

/* ── one-tap connect flow ────────────────────────────────────────────────── */
.dev-connect-wrapper { max-width:560px; margin:0 auto; }
.dev-connect-card { background:#fff; border-radius:20px; padding:32px 28px 28px; box-shadow:0 2px 12px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.04); }
@media(max-width:480px){ .dev-connect-card { padding:24px 18px 20px; } }
.dev-connect-top { text-align:center; margin-bottom:28px; }
.dev-connect-icon { font-size:44px; margin-bottom:12px; }
.dev-connect-title { font-size:20px; font-weight:800; color:#1e293b; margin:0 0 8px; }
.dev-connect-desc { font-size:14px; color:#64748b; line-height:1.6; margin:0; }
.dev-setup-err-box { background:#fef2f2; border:1px solid #fecaca; color:#dc2626; border-radius:10px; padding:10px 14px; font-size:13px; margin-bottom:16px; line-height:1.5; }

/* Inline stepper */
.dev-inline-stepper { flex-direction:column; gap:0; margin-bottom:24px; }
.dev-istep { display:flex; gap:14px; align-items:flex-start; padding:14px 0; border-bottom:1px solid #f1f5f9; transition:opacity .25s; }
.dev-istep:last-child { border-bottom:none; }
.dev-istep-inactive { opacity:.38; pointer-events:none; }

/* Step icon */
.dev-istep-icon-wrap { width:32px; height:32px; border-radius:50%; background:#6366f1; color:#fff; font-size:13px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; transition:background .2s; }
.dev-istep-num { background:#e2e8f0; color:#64748b; }
.dev-istep-done { background:#22c55e !important; }
.dev-istep-err  { background:#ef4444 !important; }

/* CSS spinner */
.dev-istep-spinner { width:14px; height:14px; border:2px solid rgba(255,255,255,.35); border-top-color:#fff; border-radius:50%; animation:dev-spin .75s linear infinite; display:block; }
@keyframes dev-spin { to { transform:rotate(360deg); } }

/* Step body */
.dev-istep-body { flex:1; min-width:0; }
.dev-istep-label { font-size:14px; font-weight:700; color:#1e293b; line-height:1.4; }
.dev-istep-sub   { font-size:13px; color:#64748b; margin-top:2px; line-height:1.5; }

/* Code display */
.dev-inline-code-area { background:#f8fafc; border:2px solid #e2e8f0; border-radius:14px; padding:16px 20px; text-align:center; margin:4px 0 8px; }
.dev-inline-code-label { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.6px; color:#94a3b8; margin-bottom:6px; }
.dev-inline-code { font-size:36px; font-weight:900; letter-spacing:8px; color:#4f46e5; font-family:monospace; animation:dev-code-in .2s ease; }
.dev-inline-expires { font-size:12px; color:#94a3b8; margin-top:4px; }
.dev-inline-code-hint { font-size:11px; color:#94a3b8; margin-top:6px; }

/* Step 2 actions — numbered WiFi checklist */
.dev-wifi-steps { list-style:none; margin:12px 0 16px; padding:0; display:flex; flex-direction:column; gap:14px; }
.dev-wifi-steps li { display:flex; gap:12px; align-items:flex-start; }
.dev-wifi-step-num { width:22px; height:22px; border-radius:50%; background:#6366f1; color:#fff; font-size:11px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:2px; }
.dev-wifi-step-body { font-size:13px; color:#475569; line-height:1.6; flex:1; }
.dev-wifi-step-body strong { color:#1e293b; }
.dev-hotspot-chip { display:flex; align-items:center; gap:12px; background:#0f172a; border-radius:12px; padding:12px 16px; margin-top:10px; }
.dev-hotspot-chip-icon { font-size:20px; flex-shrink:0; }
.dev-hotspot-chip-ssid { font-size:15px; font-weight:800; color:#fff; font-family:monospace; letter-spacing:.5px; }
.dev-hotspot-chip-note { font-size:11px; color:#94a3b8; margin-top:2px; }
.dev-btn-portal { width:100%; justify-content:center; padding:13px; font-size:15px; border-radius:12px; }
.dev-istep-portal-note { font-size:12px; color:#92400e; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; padding:8px 12px; margin-top:10px; line-height:1.5; }

/* Main connect button */
.dev-btn-connect-main { width:100%; justify-content:center; padding:14px; font-size:16px; border-radius:12px; }

/* Success card */
.dev-setup-success { flex-direction:column; align-items:center; text-align:center; background:#fff; border-radius:20px; padding:48px 28px; box-shadow:0 2px 12px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.04); animation:dev-fade-in .3s ease; }
.dev-success-icon { width:60px; height:60px; border-radius:50%; background:#22c55e; color:#fff; font-size:28px; font-weight:900; display:flex; align-items:center; justify-content:center; margin:0 auto 16px; }
.dev-success-title { font-size:22px; font-weight:800; color:#1e293b; margin:0 0 8px; }
.dev-success-sub   { font-size:14px; color:#64748b; max-width:320px; line-height:1.6; margin:0; }

/* WiFi reconfigure note */
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

// ─── ADMIN / HOD — Devices Page ──────────────────────────────────────────────
async function renderAdminDevices() {
  const content = document.getElementById('main-content');
  if (!content) return;
  const instCode = (typeof currentUser !== 'undefined' && currentUser?.company?.institutionCode) || '——';

  content.innerHTML = `
    <style>${_devCSS()}
    .ad-hero{background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 100%);border-radius:20px;padding:28px 32px;margin-bottom:24px;display:flex;align-items:center;justify-content:space-between;gap:20px;flex-wrap:wrap;box-shadow:0 8px 32px rgba(79,70,229,.25)}
    .ad-hero-left{display:flex;align-items:center;gap:18px}
    .ad-hero-icon{width:52px;height:52px;background:rgba(255,255,255,.15);border-radius:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .ad-hero-title{font-size:22px;font-weight:800;color:#fff;margin:0 0 4px}
    .ad-hero-sub{font-size:13px;color:rgba(255,255,255,.75);margin:0}
    .ad-gen-btn{display:inline-flex;align-items:center;gap:8px;background:#fff;color:#4f46e5;border:none;border-radius:12px;padding:10px 20px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12);transition:transform .15s,box-shadow .15s;white-space:nowrap}
    .ad-gen-btn:hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(0,0,0,.18)}
    .ad-gen-btn:active{transform:translateY(0)}
    .ad-info-row{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
    @media(max-width:560px){.ad-info-row{grid-template-columns:1fr}}
    .ad-info-card{background:#fff;border-radius:16px;padding:20px 24px;box-shadow:0 1px 4px rgba(0,0,0,.06),0 0 0 1px rgba(0,0,0,.04)}
    .ad-info-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#94a3b8;margin-bottom:8px}
    .ad-inst-code-display{font-size:26px;font-weight:900;font-family:monospace;letter-spacing:5px;color:#1e293b;margin-bottom:4px}
    .ad-info-hint{font-size:11px;color:#94a3b8;line-height:1.5}
    .ad-pair-banner{display:none;background:linear-gradient(135deg,#eef2ff,#f5f3ff);border:1.5px solid #c7d2fe;border-radius:16px;padding:24px;margin-bottom:24px}
    .ad-pair-banner-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#6366f1;margin-bottom:12px;display:flex;align-items:center;gap:6px}
    .ad-pair-codes{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px}
    @media(max-width:480px){.ad-pair-codes{grid-template-columns:1fr}}
    .ad-pair-code-box{background:#fff;border-radius:12px;padding:16px 20px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,.06)}
    .ad-pair-code-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#94a3b8;margin-bottom:6px}
    .ad-pair-code-val{font-size:28px;font-weight:900;letter-spacing:6px;font-family:monospace;color:#4f46e5}
    .ad-pair-code-val.inst{color:#1e293b}
    .ad-pair-expires-note{font-size:11px;color:#6366f1;text-align:center;margin-bottom:12px}
    .ad-pair-steps{font-size:12px;color:#475569;background:rgba(255,255,255,.6);border-radius:10px;padding:10px 14px;line-height:1.8}
    .ad-list-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}
    .ad-list-title{font-size:13px;font-weight:700;color:#475569;display:flex;align-items:center;gap:8px}
    .ad-list-badge{background:#f1f5f9;color:#64748b;border-radius:999px;padding:2px 10px;font-size:11px;font-weight:700}
    .ad-refresh-btn{display:inline-flex;align-items:center;gap:6px;background:none;border:1px solid #e2e8f0;border-radius:8px;padding:5px 12px;font-size:12px;color:#64748b;cursor:pointer;transition:border-color .15s}
    .ad-refresh-btn:hover{border-color:#6366f1;color:#6366f1}
    .ad-last-updated{font-size:11px;color:#94a3b8}
    .ad-device-grid{display:flex;flex-direction:column;gap:12px}
    .ad-device-card{background:#fff;border-radius:16px;padding:0;box-shadow:0 1px 4px rgba(0,0,0,.06),0 0 0 1px rgba(0,0,0,.04);overflow:hidden;transition:box-shadow .18s}
    .ad-device-card:hover{box-shadow:0 4px 20px rgba(0,0,0,.1),0 0 0 1px rgba(0,0,0,.06)}
    .ad-device-card-top{display:flex;align-items:center;gap:14px;padding:16px 20px;border-bottom:1px solid #f1f5f9}
    .ad-device-avatar{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#e0e7ff,#ede9fe);display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .ad-device-name{font-size:15px;font-weight:700;color:#1e293b;margin:0 0 3px}
    .ad-device-meta{font-size:11px;color:#94a3b8;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .ad-status-dot{width:7px;height:7px;border-radius:50%;display:inline-block;flex-shrink:0}
    .ad-status-online{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.2)}
    .ad-status-offline{background:#cbd5e1}
    .ad-status-label-online{color:#16a34a;font-weight:600}
    .ad-status-label-offline{color:#94a3b8}
    .ad-device-actions{margin-left:auto;display:flex;gap:6px;flex-shrink:0}
    .ad-act-btn{display:inline-flex;align-items:center;gap:4px;border-radius:8px;padding:5px 11px;font-size:11px;font-weight:600;cursor:pointer;border:none;transition:background .15s}
    .ad-act-setup{background:#f1f5f9;color:#475569}
    .ad-act-setup:hover{background:#e2e8f0}
    .ad-act-remove{background:#fff0f0;color:#dc2626}
    .ad-act-remove:hover{background:#fee2e2}
    .ad-device-card-body{padding:14px 20px;display:flex;flex-direction:column;gap:10px}
    .ad-device-dept{font-size:12px;font-weight:600;color:#475569;display:flex;align-items:center;gap:6px}
    .ad-device-dept-icon{color:#94a3b8}
    .ad-lec-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .ad-lec-pill{display:inline-flex;align-items:center;gap:5px;background:#ede9fe;color:#5b21b6;border-radius:999px;padding:3px 10px 3px 12px;font-size:11px;font-weight:600;white-space:nowrap}
    .ad-lec-remove{background:none;border:none;cursor:pointer;color:#7c3aed;font-size:14px;padding:0;line-height:1;opacity:.6}
    .ad-lec-remove:hover{opacity:1}
    .ad-assign-btn{display:inline-flex;align-items:center;gap:4px;background:#f8fafc;border:1.5px dashed #cbd5e1;color:#64748b;border-radius:999px;padding:3px 12px;font-size:11px;font-weight:600;cursor:pointer;transition:border-color .15s,color .15s}
    .ad-assign-btn:hover{border-color:#6366f1;color:#6366f1}
    .ad-device-footer{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:10px 20px;background:#f8fafc;border-top:1px solid #f1f5f9}
    .ad-footer-chip{display:flex;align-items:center;gap:5px;font-size:11px;color:#94a3b8}
    .ad-footer-chip svg{opacity:.5}
    .ad-empty{text-align:center;padding:56px 24px;background:#fff;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,.06)}
    .ad-empty-icon{width:64px;height:64px;background:#f1f5f9;border-radius:20px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}
    .ad-empty-title{font-size:17px;font-weight:700;color:#1e293b;margin:0 0 6px}
    .ad-empty-desc{font-size:13px;color:#64748b;max-width:320px;margin:0 auto;line-height:1.6}
    </style>
    <div class="dev-page">

      <!-- Hero header -->
      <div class="ad-hero">
        <div class="ad-hero-left">
          <div class="ad-hero-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18" stroke-width="2.5"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="15" y2="10"/></svg>
          </div>
          <div>
            <h1 class="ad-hero-title">Classroom Devices</h1>
            <p class="ad-hero-sub">Manage and provision ESP32 attendance devices</p>
          </div>
        </div>
        <button class="ad-gen-btn" id="ad-gen-btn" onclick="adGenerateCode()">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Generate Pairing Code
        </button>
      </div>

      <!-- Info cards row -->
      <div class="ad-info-row">
        <div class="ad-info-card">
          <div class="ad-info-label">Institution Code</div>
          <div class="ad-inst-code-display" id="ad-inst-code">${instCode}</div>
          <div class="ad-info-hint">Class Rep needs this + a pairing code to set up a device. Keep it confidential.</div>
        </div>
        <div class="ad-info-card" style="background:linear-gradient(135deg,#f8fafc,#f1f5f9);display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:8px">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <div style="font-size:12px;font-weight:600;color:#475569">Device pairing is secure</div>
          <div style="font-size:11px;color:#94a3b8">JWT-authenticated · Company-isolated</div>
        </div>
      </div>

      <!-- Pairing code panel -->
      <div id="ad-pair-panel" class="ad-pair-banner">
        <div class="ad-pair-banner-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>
          New Pairing Code Generated
        </div>
        <div class="ad-pair-codes">
          <div class="ad-pair-code-box">
            <div class="ad-pair-code-label">Institution Code</div>
            <div class="ad-pair-code-val inst" id="ad-inst-code-2">${instCode}</div>
          </div>
          <div class="ad-pair-code-box">
            <div class="ad-pair-code-label">Pairing Code</div>
            <div class="ad-pair-code-val dev-pairing-code" id="ad-pair-code">——————</div>
          </div>
        </div>
        <div class="ad-pair-expires-note" id="ad-pair-expires"></div>
        <div class="ad-pair-steps">
          📱 Rep connects to <strong>Dikly-XXXXXX</strong> WiFi → opens <strong>192.168.4.1</strong> → enters both codes above + school WiFi → done.
        </div>
      </div>

      <!-- Device list -->
      <div class="ad-list-header">
        <div class="ad-list-title">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
          Paired Devices
          <span class="ad-list-badge" id="ad-device-count">—</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span class="ad-last-updated" id="ad-last-updated"></span>
          <button class="ad-refresh-btn" onclick="adRefreshDevices()">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            Refresh
          </button>
        </div>
      </div>
      <div id="ad-device-list"><div class="loading">Loading devices…</div></div>
    </div>`;

  await adLoadDevices();

  // Auto-refresh every 10 s so the HOD sees the device come online without reloading
  if (window._adRefreshTimer) clearInterval(window._adRefreshTimer);
  window._adRefreshTimer = setInterval(() => {
    // Stop polling if the user has navigated away
    if (!document.getElementById('ad-device-list')) {
      clearInterval(window._adRefreshTimer); window._adRefreshTimer = null; return;
    }
    adLoadDevices();
  }, 10000);
}

async function adRefreshDevices() {
  await adLoadDevices();
}

async function adGenerateCode() {
  const btn = document.getElementById('ad-gen-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }
  try {
    const data = await api('/api/devices/pairing-code', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || ''), 'Content-Type': 'application/json' }
    });
    const panel   = document.getElementById('ad-pair-panel');
    const codeEl  = document.getElementById('ad-pair-code');
    const expEl   = document.getElementById('ad-pair-expires');
    const codeEl2 = document.getElementById('ad-pair-code-2');
    if (panel)   panel.style.display = 'block';
    if (codeEl)  { codeEl.textContent = data.code; codeEl.style.animation = 'none'; void codeEl.offsetWidth; codeEl.style.animation = ''; }
    if (codeEl2) codeEl2.textContent = data.code;
    if (expEl && data.expiresAt) {
      const d = new Date(data.expiresAt);
      expEl.textContent = 'Expires ' + d.toLocaleDateString(undefined, { day:'numeric', month:'short', year:'numeric' });
    }
  } catch (e) {
    alert('Failed to generate pairing code: ' + (e.message || 'Server error'));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Generate Pairing Code'; }
  }
}

async function adLoadDevices() {
  const list = document.getElementById('ad-device-list');
  if (!list) return;
  try {
    const data = await api('/api/devices/all');
    const stamp = document.getElementById('ad-last-updated');
    if (stamp) {
      const t = new Date();
      stamp.textContent = 'Updated ' + t.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    const devices = data.devices || [];
    const countEl = document.getElementById('ad-device-count');
    if (countEl) countEl.textContent = devices.length;

    if (!devices.length) {
      const instCode = (typeof currentUser !== 'undefined' && currentUser?.company?.institutionCode) || null;
      list.innerHTML = `
        <div class="ad-empty">
          <div class="ad-empty-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" stroke-width="1.5"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/><line x1="9" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="15" y2="10"/></svg>
          </div>
          <div class="ad-empty-title">No devices paired yet</div>
          <div class="ad-empty-desc">
            To pair a device: <strong>1)</strong> Click <em>Generate Pairing Code</em> above.
            <strong>2)</strong> Give the Class Rep your Institution Code
            ${instCode ? `(<strong style="color:var(--primary);font-family:monospace;letter-spacing:2px">${instCode}</strong>)` : ''}
            and the pairing code. <strong>3)</strong> The Class Rep connects to the device hotspot and enters both codes.
          </div>
        </div>`;
      return;
    }

    list.innerHTML = `<div class="ad-device-grid">
      ${devices.map(d => {
        const isOnline = !!d.online;
        const last = d.lastHeartbeat
          ? new Date(d.lastHeartbeat).toLocaleString(undefined, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })
          : 'Never';
        const deptLabel = [
          d.assignedDepartment,
          d.assignedLevel && 'Level ' + d.assignedLevel,
          d.assignedGroup && 'Group ' + d.assignedGroup,
        ].filter(Boolean).join(' · ') || 'No class assigned';
        const fw = d.firmwareVersion || '—';
        const ip = d.localIp || '—';

        const lecturerPills = (d.assignedLecturers || []).map(a => {
          const lecName = a.lecturerId?.name || 'Unknown';
          const crsName = a.courseId?.title || a.courseId?.name || 'Unknown Course';
          const lecId   = a.lecturerId?._id || a.lecturerId || '';
          const crsId   = a.courseId?._id   || a.courseId   || '';
          return `<span class="ad-lec-pill">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
            ${lecName} · ${crsName}
            <button class="ad-lec-remove" onclick="adRemoveLecturer('${d.deviceId}','${lecId}','${crsId}')" title="Remove">&times;</button>
          </span>`;
        }).join('');

        const setupData = JSON.stringify({
          name: d.deviceName || '',
          dept: d.assignedDepartment || '',
          level: d.assignedLevel || '',
          group: d.assignedGroup || '',
        }).replace(/'/g, '&#39;');

        return `
          <div class="ad-device-card">
            <div class="ad-device-card-top">
              <div class="ad-device-avatar">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="1.8"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18" stroke-width="2.5"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/></svg>
              </div>
              <div style="min-width:0">
                <div class="ad-device-name">${d.deviceName}</div>
                <div class="ad-device-meta">
                  <span class="ad-status-dot ${isOnline ? 'ad-status-online' : 'ad-status-offline'}"></span>
                  <span class="${isOnline ? 'ad-status-label-online' : 'ad-status-label-offline'}">${isOnline ? 'Online' : 'Offline'}</span>
                  <span>·</span>
                  <span>${d.deviceId}</span>
                </div>
              </div>
              <div class="ad-device-actions">
                <button class="ad-act-btn ad-act-setup" onclick="adOpenSetupModal('${d.deviceId}', ${setupData})">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                  Setup
                </button>
                <button class="ad-act-btn ad-act-remove" onclick="adRemoveDevice('${d.deviceId}','${d.deviceName}')">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  Remove
                </button>
              </div>
            </div>
            <div class="ad-device-card-body">
              <div class="ad-device-dept">
                <svg class="ad-device-dept-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                ${deptLabel}
              </div>
              <div class="ad-lec-row">
                ${lecturerPills || '<span style="font-size:11px;color:#94a3b8;font-style:italic">No lecturers assigned</span>'}
                <button class="ad-assign-btn" onclick="adOpenAssignModal('${d.deviceId}')">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Assign Lecturer
                </button>
              </div>
            </div>
            <div class="ad-device-footer">
              <span class="ad-footer-chip">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                IP: ${ip}
              </span>
              <span class="ad-footer-chip">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
                fw: ${fw}
              </span>
              <span class="ad-footer-chip">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Last seen: ${last}
              </span>
            </div>
          </div>`;
      }).join('')}
    </div>`;
  } catch (e) {
    list.innerHTML = `<div class="dev-card" style="border-left:4px solid var(--danger);font-size:13px;color:var(--danger)">Failed to load devices: ${e.message}</div>`;
  }
}

// ─── ASSIGN LECTURER MODAL ────────────────────────────────────────────────────
async function adOpenAssignModal(deviceId) {
  // Remove any existing modal
  const existing = document.getElementById('ad-assign-modal-overlay');
  if (existing) existing.remove();

  // Inject overlay
  const overlay = document.createElement('div');
  overlay.id = 'ad-assign-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:12px;padding:28px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.25);position:relative">
      <button onclick="document.getElementById('ad-assign-modal-overlay').remove()" style="position:absolute;top:14px;right:14px;background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-secondary)">&times;</button>
      <div style="font-size:16px;font-weight:700;margin-bottom:4px;color:var(--text-primary)">Assign Lecturer to Device</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:20px">Device: <strong>${deviceId}</strong></div>

      <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Lecturer</label>
      <select id="ad-lec-select" style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;margin-bottom:14px;background:var(--surface,#fff);color:var(--text-primary)">
        <option value="">Loading lecturers…</option>
      </select>

      <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Course</label>
      <select id="ad-crs-select" style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;margin-bottom:20px;background:var(--surface,#fff);color:var(--text-primary)">
        <option value="">Select a lecturer first</option>
      </select>

      <div id="ad-assign-err" style="display:none;color:#dc2626;font-size:12px;margin-bottom:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button onclick="document.getElementById('ad-assign-modal-overlay').remove()" style="padding:8px 18px;border:1px solid #e2e8f0;border-radius:8px;background:none;cursor:pointer;font-size:13px">Cancel</button>
        <button id="ad-assign-submit" onclick="adSubmitAssign('${deviceId}')" style="padding:8px 18px;border:none;border-radius:8px;background:#6366f1;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Assign</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  // Close on backdrop click
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // Load lecturers
  try {
    const data = await api('/api/devices/lecturers-for-assignment');
    const lecturers = data.lecturers || [];
    window._adLecturerData = lecturers;

    const lecSel = document.getElementById('ad-lec-select');
    lecSel.innerHTML = `<option value="">— Select lecturer —</option>` +
      lecturers.map(l => `<option value="${l._id}">${l.name}</option>`).join('');

    lecSel.addEventListener('change', () => {
      const lec = lecturers.find(l => l._id === lecSel.value);
      const crsSel = document.getElementById('ad-crs-select');
      if (!lec || !lec.courses || !lec.courses.length) {
        crsSel.innerHTML = `<option value="">No courses found for this lecturer</option>`;
        return;
      }
      crsSel.innerHTML = `<option value="">— Select course —</option>` +
        lec.courses.map(c => `<option value="${c._id}">${c.courseCode} – ${c.name}</option>`).join('');
    });
  } catch (e) {
    const lecSel = document.getElementById('ad-lec-select');
    if (lecSel) lecSel.innerHTML = `<option value="">Failed to load lecturers</option>`;
  }
}

async function adSubmitAssign(deviceId) {
  const lecSel = document.getElementById('ad-lec-select');
  const crsSel = document.getElementById('ad-crs-select');
  const errEl  = document.getElementById('ad-assign-err');
  const btn    = document.getElementById('ad-assign-submit');

  const lecturerId = lecSel?.value;
  const courseId   = crsSel?.value;

  if (!lecturerId || !courseId) {
    if (errEl) { errEl.textContent = 'Please select both a lecturer and a course.'; errEl.style.display = 'block'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Assigning…'; }
  if (errEl) errEl.style.display = 'none';

  try {
    await api(`/api/devices/${deviceId}/assign-lecturer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lecturerId, courseId }),
    });
    document.getElementById('ad-assign-modal-overlay')?.remove();
    await adLoadDevices();
  } catch (e) {
    if (errEl) { errEl.textContent = e.message || 'Failed to assign lecturer.'; errEl.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Assign'; }
  }
}

async function adRemoveLecturer(deviceId, lecturerId, courseId) {
  if (!confirm('Remove this lecturer from the device?')) return;
  try {
    await api(`/api/devices/${deviceId}/remove-lecturer`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lecturerId, courseId }),
    });
    await adLoadDevices();
  } catch (e) {
    alert('Failed to remove lecturer: ' + (e.message || 'Server error'));
  }
}

// ─── DEVICE SETUP MODAL (rename + dept/level/group) ──────────────────────────
function adOpenSetupModal(deviceId, current) {
  const existing = document.getElementById('ad-setup-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'ad-setup-modal-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9000;display:flex;align-items:center;justify-content:center;padding:16px';
  overlay.innerHTML = `
    <div style="background:var(--surface,#fff);border-radius:12px;padding:28px;width:100%;max-width:440px;box-shadow:0 20px 60px rgba(0,0,0,.25);position:relative">
      <button onclick="document.getElementById('ad-setup-modal-overlay').remove()" style="position:absolute;top:14px;right:14px;background:none;border:none;cursor:pointer;font-size:20px;color:var(--text-secondary)">&times;</button>
      <div style="font-size:16px;font-weight:700;margin-bottom:4px;color:var(--text-primary)">Device Setup</div>
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:20px">ID: <strong>${deviceId}</strong></div>

      <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Device Name</label>
      <input id="ad-setup-name" value="${(current?.name || '').replace(/"/g,'&quot;')}" placeholder="e.g. DIKLY-CS-L100-A"
        style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;margin-bottom:14px;box-sizing:border-box;background:var(--surface,#fff);color:var(--text-primary)">

      <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Department</label>
      <input id="ad-setup-dept" value="${(current?.dept || '').replace(/"/g,'&quot;')}" placeholder="e.g. Computer Science"
        style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;margin-bottom:14px;box-sizing:border-box;background:var(--surface,#fff);color:var(--text-primary)">

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Level</label>
          <input id="ad-setup-level" value="${(current?.level || '').replace(/"/g,'&quot;')}" placeholder="e.g. 100"
            style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;background:var(--surface,#fff);color:var(--text-primary)">
        </div>
        <div>
          <label style="display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px">Group</label>
          <input id="ad-setup-group" value="${(current?.group || '').replace(/"/g,'&quot;')}" placeholder="e.g. A"
            style="width:100%;padding:8px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:13px;box-sizing:border-box;background:var(--surface,#fff);color:var(--text-primary)">
        </div>
      </div>

      <div id="ad-setup-err" style="display:none;color:#dc2626;font-size:12px;margin-bottom:10px"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end">
        <button onclick="document.getElementById('ad-setup-modal-overlay').remove()" style="padding:8px 18px;border:1px solid #e2e8f0;border-radius:8px;background:none;cursor:pointer;font-size:13px">Cancel</button>
        <button id="ad-setup-submit" onclick="adSubmitSetup('${deviceId}')" style="padding:8px 18px;border:none;border-radius:8px;background:#6366f1;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Save</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function adSubmitSetup(deviceId) {
  const nameEl  = document.getElementById('ad-setup-name');
  const deptEl  = document.getElementById('ad-setup-dept');
  const levelEl = document.getElementById('ad-setup-level');
  const groupEl = document.getElementById('ad-setup-group');
  const errEl   = document.getElementById('ad-setup-err');
  const btn     = document.getElementById('ad-setup-submit');

  const deviceName = nameEl?.value?.trim();
  const department = deptEl?.value?.trim();
  const level      = levelEl?.value?.trim();
  const group      = groupEl?.value?.trim();

  if (!level || !group) {
    if (errEl) { errEl.textContent = 'Level and Group are required.'; errEl.style.display = 'block'; }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  if (errEl) errEl.style.display = 'none';

  const errors = [];
  try {
    await api('/api/devices/assign-group', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, department, level, group }),
    });
  } catch (e) {
    errors.push('Group: ' + (e.message || 'Failed'));
  }

  if (deviceName) {
    try {
      await api('/api/devices/my/rename', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName, deviceId }),
      });
    } catch (e) {
      errors.push('Name: ' + (e.message || 'Failed'));
    }
  }

  if (errors.length) {
    if (errEl) { errEl.textContent = errors.join(' | '); errEl.style.display = 'block'; }
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    return;
  }

  document.getElementById('ad-setup-modal-overlay')?.remove();
  await adLoadDevices();
}

// ─── REMOVE DEVICE ────────────────────────────────────────────────────────────
async function adRemoveDevice(deviceId, deviceName) {
  if (!confirm(`Remove "${deviceName}" from your institution?\n\nThis will unpair the device and delete its JWT. The physical device will reset to setup mode on next boot.`)) return;
  try {
    await api(`/api/devices/${deviceId}/remove`, { method: 'DELETE' });
    await adLoadDevices();
  } catch (e) {
    alert('Failed to remove device: ' + e.message);
  }
}

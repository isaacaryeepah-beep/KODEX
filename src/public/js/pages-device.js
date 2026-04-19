// ── ESP32 Device Management ───────────────────────────────────────────────────
// Renders the device configuration page for lecturers.
// The ESP32 has no keypad or camera — WiFi credentials entered here are
// pushed to the device via the API so it can join the school network.
// Attendance is validated by matching the student's public IP with the
// device's last-recorded public IP (same NAT router = same school WiFi).

async function renderDevicePage() {
  const content = document.getElementById('main-content');
  if (!content) return;

  content.innerHTML = `
    <div class="page-header">
      <h2>Classroom Device</h2>
      <p>Configure your ESP32 attendance device and school WiFi networks</p>
    </div>
    <div id="device-page-body"><div class="card" style="text-align:center;padding:40px"><div class="spinner"></div></div></div>
  `;

  try {
    const data = await api('/api/devices/my').catch(() => null);
    renderDeviceBody(data);
  } catch (e) {
    document.getElementById('device-page-body').innerHTML =
      `<div class="card"><p style="color:var(--danger)">Could not load device: ${e.message}</p></div>`;
  }
}

function renderDeviceBody(data) {
  const body = document.getElementById('device-page-body');
  if (!body) return;

  const device = data?.device || null;
  const isOnline = data?.isOnline || false;
  const lastSeen = device?.lastHeartbeat ? new Date(device.lastHeartbeat).toLocaleString() : 'Never';
  const networks = device?.allowedNetworks || [];

  body.innerHTML = `
    ${device ? `
      <!-- Status card -->
      <div class="card" style="border-left:4px solid ${isOnline ? 'var(--success)' : 'var(--text-muted)'}; margin-bottom:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
          <div>
            <div style="font-size:12px;text-transform:uppercase;font-weight:700;color:${isOnline ? 'var(--success)' : 'var(--text-muted)'}">
              ${isOnline ? 'Online' : 'Offline'}
            </div>
            <div style="font-size:18px;font-weight:700;margin-top:4px">${device.deviceName || device.deviceId}</div>
            <div style="font-size:13px;color:var(--text-light);margin-top:2px">
              Device ID: <code>${device.deviceId}</code> &nbsp;·&nbsp; Last seen: ${lastSeen}
            </div>
            ${device.currentNetwork ? `<div style="font-size:13px;color:var(--text-light)">Connected to: <strong>${device.currentNetwork}</strong></div>` : ''}
            ${device.lastPublicIp ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px">Public IP: ${device.lastPublicIp}</div>` : ''}
          </div>
          <span class="status-badge ${isOnline ? 'status-active' : ''}" style="font-size:13px;padding:6px 14px">
            ${isOnline ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>
    ` : `
      <!-- No device registered -->
      <div class="card" style="border-left:4px solid var(--warning);background:#fffbeb;margin-bottom:16px">
        <div style="font-weight:700;color:#92400e;margin-bottom:4px">No device registered</div>
        <p style="font-size:13px;color:#b45309">Register your ESP32 device below to enable WiFi-based attendance.</p>
      </div>
    `}

    <!-- WiFi Networks -->
    <div class="card" style="margin-bottom:16px">
      <div class="card-title" style="margin-bottom:16px">School WiFi Networks</div>
      <p style="font-size:13px;color:var(--text-light);margin-bottom:16px">
        Add the school WiFi credentials. The ESP32 will connect to these networks in priority order.
        When students join the same network, attendance is verified automatically by matching their
        public IP — no code entry required.
      </p>

      <div id="wifi-network-list" style="margin-bottom:16px">
        ${networks.length === 0
          ? '<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:16px 0">No WiFi networks configured yet.</p>'
          : networks.map((n, i) => `
            <div class="wifi-network-row" data-index="${i}" style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#f8f9ff;border-radius:8px;margin-bottom:8px;border:1px solid var(--border)">
              <div style="flex:1">
                <div style="font-weight:600;font-size:14px">${n.ssid}</div>
                <div style="font-size:12px;color:var(--text-muted)">Priority ${n.priority || 0} · Password hidden</div>
              </div>
              <button class="btn btn-xs btn-danger" onclick="removeWifiNetwork(${i})">Remove</button>
            </div>
          `).join('')
        }
      </div>

      <!-- Add WiFi form -->
      <div style="border:1px dashed var(--border);border-radius:10px;padding:16px;background:#fafbff">
        <div style="font-size:13px;font-weight:600;margin-bottom:12px;color:var(--text-muted)">Add a Network</div>
        <div style="display:grid;grid-template-columns:1fr 1fr auto auto;gap:10px;align-items:end">
          <div class="form-group" style="margin-bottom:0">
            <label>SSID (Network Name)</label>
            <input type="text" id="wifi-ssid-input" placeholder="e.g. School-WiFi" autocomplete="off">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>Password</label>
            <input type="password" id="wifi-password-input" placeholder="WiFi password" autocomplete="off">
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>Priority</label>
            <input type="number" id="wifi-priority-input" value="0" min="0" max="10" style="width:70px">
          </div>
          <button class="btn btn-primary btn-sm" onclick="addWifiNetwork()" style="margin-bottom:0">Add</button>
        </div>
      </div>

      ${device ? `
        <button class="btn btn-primary" onclick="saveWifiNetworks()" style="margin-top:16px;width:100%">
          Save Networks to Device
        </button>
      ` : ''}
    </div>

    <!-- Register / Update Device -->
    <div class="card">
      <div class="card-title" style="margin-bottom:16px">${device ? 'Update Device' : 'Register Device'}</div>
      ${device ? '' : `
        <p style="font-size:13px;color:var(--text-light);margin-bottom:16px">
          Flash your ESP32 with the KODEX firmware, power it on, then enter its Device ID below.
          The ESP32 has no keypad or camera — it uses WiFi presence to verify attendance.
        </p>
      `}
      <div class="form-group">
        <label>Device ID</label>
        <input type="text" id="reg-device-id" placeholder="e.g. KODEX-A1B2C3" value="${device?.deviceId || ''}" ${device ? 'readonly style="background:#f3f4f6"' : ''}>
      </div>
      <div class="form-group">
        <label>Device Name</label>
        <input type="text" id="reg-device-name" placeholder="e.g. Lecture Hall A" value="${device?.deviceName || ''}">
      </div>
      <div class="form-group">
        <label>Assigned Room <span style="color:var(--text-muted);font-weight:400">(optional)</span></label>
        <input type="text" id="reg-device-room" placeholder="e.g. LH-101" value="${device?.assignedRoom || ''}">
      </div>
      <button class="btn btn-primary" onclick="${device ? 'updateDevice()' : 'registerDevice()'}" style="width:100%">
        ${device ? 'Update Device' : 'Register Device'}
      </button>
    </div>

    <!-- How it works -->
    <div class="card" style="margin-top:16px;background:#f0fdf4;border:1px solid #bbf7d0">
      <div style="font-weight:700;color:#166534;margin-bottom:8px">How WiFi Attendance Works</div>
      <ol style="font-size:13px;color:#15803d;line-height:1.8;padding-left:20px;margin:0">
        <li>Add your school WiFi credentials above and save them to the device.</li>
        <li>The ESP32 connects to the school network and sends heartbeats to the server, recording its public IP.</li>
        <li>Students connect their phones to the same school WiFi.</li>
        <li>When a student taps <strong>"Mark Attendance (School WiFi)"</strong>, the server compares their public IP with the device's recorded IP.</li>
        <li>Same IP = same router = physically in the building. Attendance is marked automatically. No code needed.</li>
        <li>Different IP (mobile data, home WiFi) = blocked. No guessing, no bypass.</li>
      </ol>
    </div>
  `;
}

// ── Local network list state ─────────────────────────────────────────────────
let _pendingNetworks = null;

function _getNetworks() {
  if (_pendingNetworks !== null) return _pendingNetworks;
  const rows = document.querySelectorAll('.wifi-network-row');
  return Array.from(rows).map(r => ({
    ssid: r.querySelector('[data-ssid]')?.dataset?.ssid || r.querySelector('div div').textContent.trim(),
    priority: parseInt(r.querySelector('div div:nth-child(2)')?.textContent?.match(/\d+/)?.[0] || '0', 10)
  }));
}

function addWifiNetwork() {
  const ssid = document.getElementById('wifi-ssid-input')?.value?.trim();
  const pass = document.getElementById('wifi-password-input')?.value;
  const priority = parseInt(document.getElementById('wifi-priority-input')?.value || '0', 10);

  if (!ssid) { toastWarning('Please enter the network name (SSID).'); return; }
  if (!pass) { toastWarning('Please enter the WiFi password.'); return; }

  // Read current displayed networks + add new one
  if (_pendingNetworks === null) {
    _pendingNetworks = [];
    document.querySelectorAll('.wifi-network-row[data-ssid]').forEach(r => {
      _pendingNetworks.push({ ssid: r.dataset.ssid, password: r.dataset.password || '', priority: parseInt(r.dataset.priority || '0', 10) });
    });
  }

  if (_pendingNetworks.some(n => n.ssid === ssid)) {
    toastWarning('Network already added. Remove it first to update the password.');
    return;
  }

  _pendingNetworks.push({ ssid, password: pass, priority });

  // Refresh the list display
  const listEl = document.getElementById('wifi-network-list');
  if (listEl) {
    listEl.innerHTML = _pendingNetworks.map((n, i) => `
      <div class="wifi-network-row" data-index="${i}" data-ssid="${n.ssid}" data-password="${n.password}" data-priority="${n.priority}"
           style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#f8f9ff;border-radius:8px;margin-bottom:8px;border:1px solid var(--border)">
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px">${n.ssid}</div>
          <div style="font-size:12px;color:var(--text-muted)">Priority ${n.priority} · Password hidden</div>
        </div>
        <button class="btn btn-xs btn-danger" onclick="removeWifiNetwork(${i})">Remove</button>
      </div>
    `).join('');
  }

  document.getElementById('wifi-ssid-input').value = '';
  document.getElementById('wifi-password-input').value = '';
  document.getElementById('wifi-priority-input').value = '0';
  toastSuccess(`Network "${ssid}" added. Click Save to push to device.`);
}

function removeWifiNetwork(index) {
  if (_pendingNetworks === null) {
    _pendingNetworks = [];
    document.querySelectorAll('.wifi-network-row').forEach(r => {
      _pendingNetworks.push({
        ssid: r.dataset.ssid || '',
        password: r.dataset.password || '',
        priority: parseInt(r.dataset.priority || '0', 10)
      });
    });
  }
  _pendingNetworks.splice(index, 1);

  const listEl = document.getElementById('wifi-network-list');
  if (listEl) {
    listEl.innerHTML = _pendingNetworks.length === 0
      ? '<p style="font-size:13px;color:var(--text-muted);text-align:center;padding:16px 0">No WiFi networks configured yet.</p>'
      : _pendingNetworks.map((n, i) => `
          <div class="wifi-network-row" data-index="${i}" data-ssid="${n.ssid}" data-password="${n.password}" data-priority="${n.priority}"
               style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:#f8f9ff;border-radius:8px;margin-bottom:8px;border:1px solid var(--border)">
            <div style="flex:1">
              <div style="font-weight:600;font-size:14px">${n.ssid}</div>
              <div style="font-size:12px;color:var(--text-muted)">Priority ${n.priority} · Password hidden</div>
            </div>
            <button class="btn btn-xs btn-danger" onclick="removeWifiNetwork(${i})">Remove</button>
          </div>
        `).join('');
  }
}

async function saveWifiNetworks() {
  if (!_pendingNetworks) {
    toastWarning('No changes to save.');
    return;
  }

  const deviceId = document.getElementById('reg-device-id')?.value?.trim();
  if (!deviceId) { toastWarning('Device ID not found.'); return; }

  try {
    await api(`/api/devices/${encodeURIComponent(deviceId)}/networks`, {
      method: 'PUT',
      body: JSON.stringify({ allowedNetworks: _pendingNetworks })
    });
    _pendingNetworks = null;
    toastSuccess('WiFi networks saved. The device will use these on its next connection.');
    renderDevicePage();
  } catch (e) {
    toastError('Failed to save networks: ' + e.message);
  }
}

async function registerDevice() {
  const deviceId   = document.getElementById('reg-device-id')?.value?.trim();
  const deviceName = document.getElementById('reg-device-name')?.value?.trim();
  const room       = document.getElementById('reg-device-room')?.value?.trim();

  if (!deviceId)   { toastWarning('Please enter a Device ID.'); return; }
  if (!deviceName) { toastWarning('Please enter a device name.'); return; }

  const networks = _pendingNetworks || [];

  try {
    await api('/api/devices/register', {
      method: 'POST',
      body: JSON.stringify({ deviceId, deviceName, allowedNetworks: networks, assignedRoom: room || null })
    });
    _pendingNetworks = null;
    toastSuccess('Device registered successfully!');
    renderDevicePage();
  } catch (e) {
    toastError('Registration failed: ' + e.message);
  }
}

async function updateDevice() {
  const deviceName = document.getElementById('reg-device-name')?.value?.trim();
  const room       = document.getElementById('reg-device-room')?.value?.trim();
  const deviceId   = document.getElementById('reg-device-id')?.value?.trim();

  if (!deviceId) { toastWarning('Device ID missing.'); return; }

  try {
    await api('/api/devices/register', {
      method: 'POST',
      body: JSON.stringify({ deviceId, deviceName: deviceName || undefined, assignedRoom: room || null })
    });
    toastSuccess('Device updated.');
    renderDevicePage();
  } catch (e) {
    toastError('Update failed: ' + e.message);
  }
}

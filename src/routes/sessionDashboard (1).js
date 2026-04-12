// ══════════════════════════════════════════════════════════════════════════════
//  KODEX — LECTURER SESSION CONTROL DASHBOARD  (paste into app.js)
//
//  Entry point:  renderSessionDashboard(sessionId)
//  Call from navigateTo() switch:
//    case 'session-dashboard':
//      renderSessionDashboard(currentSessionId);
//      break;
//
//  Helper dependencies expected in app.js:
//    api(path, opts)     — authenticated fetch wrapper returning parsed JSON
//    esc(str)            — HTML-escape helper
//    timeAgo(date)       — relative time string
//    toastSuccess(msg)   — green toast
//    toastError(msg)     — red toast
//    toastWarning(msg)   — amber toast
//    toastInfo(msg)      — blue toast
//    toastConfirm(msg, cb) — confirm dialog then callback
//    closeModal()        — closes #modal-container
//    navigateTo(view)    — SPA navigation
// ══════════════════════════════════════════════════════════════════════════════

// ── Module state ──────────────────────────────────────────────────────────────
let _dashSessionId       = null;
let _dashPollCounts      = null;
let _dashPollActivity    = null;
let _dashPollCode        = null;

// ── Entry point ───────────────────────────────────────────────────────────────
async function renderSessionDashboard(sessionId) {
  _dashSessionId = sessionId;
  _dashStopPolling();

  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = `<div class="loading" style="padding:40px;text-align:center">Loading session dashboard…</div>`;

  try {
    const { data } = await api(`/api/attendance-sessions/${sessionId}/dashboard`);
    _dashRenderFull(content, data);
    _dashStartPolling(sessionId);
  } catch (e) {
    content.innerHTML = `
      <div class="card" style="max-width:480px;margin:40px auto;text-align:center">
        <p style="color:#ef4444;font-weight:600;margin-bottom:12px">${esc(e.message)}</p>
        <button class="btn btn-secondary" onclick="_dashStopPolling();navigateTo('sessions')">← Back to Sessions</button>
      </div>`;
  }
}

// ── Polling ───────────────────────────────────────────────────────────────────
function _dashStopPolling() {
  [_dashPollCounts, _dashPollActivity, _dashPollCode].forEach(t => t && clearInterval(t));
  _dashPollCounts = _dashPollActivity = _dashPollCode = null;
}

function _dashStartPolling(id) {
  _dashPollCounts   = setInterval(() => _dashRefreshCounts(id),   8000);
  _dashPollActivity = setInterval(() => _dashRefreshActivity(id), 5000);
  _dashPollCode     = setInterval(() => _dashRefreshCodeCard(id), 3000);
}

async function _dashRefreshCounts(id) {
  try {
    const { data } = await api(`/api/attendance-sessions/${id}/dashboard`);
    _updateCountCards(data.counts);
    _updateProgressBar(data.counts);
    _updateStatusCard(data.session);
    _updateDeviceCard(data.device);
  } catch (_) {}
}

async function _dashRefreshActivity(id) {
  try {
    const { data } = await api(`/api/attendance-sessions/${id}/live-activity?limit=20`);
    const el = document.getElementById('dash-activity-feed');
    if (el) el.innerHTML = _buildActivityHTML(data);
  } catch (_) {}
}

async function _dashRefreshCodeCard(id) {
  try {
    const { data } = await api(`/api/attendance-sessions/${id}/dashboard`);
    _updateCodeCard(data.code);
  } catch (_) {}
}

// ── Full render ───────────────────────────────────────────────────────────────
function _dashRenderFull(content, d) {
  const s      = d.session;
  const c      = d.course;
  const counts = d.counts;
  const device = d.device;
  const code   = d.code;

  const statusColor = _statusColor(s.status);
  const isActive    = ['live', 'paused', 'locked'].includes(s.status);
  const isEnded     = ['ended', 'cancelled'].includes(s.status);

  content.innerHTML = `
    <!-- ── Page header ───────────────────────────────────────────────── -->
    <div id="dash-header" style="margin-bottom:16px">
      <div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="_dashStopPolling();navigateTo('sessions')">← Sessions</button>
        <div style="flex:1;min-width:0">
          <h2 style="margin:0;font-size:17px;font-weight:800;line-height:1.3">
            ${esc(c?.title || 'Session')}
            <span style="font-size:13px;color:var(--text-muted);font-weight:500;margin-left:4px">${esc(c?.code || '')}</span>
          </h2>
          <div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:4px">
            ${c?.qualificationType ? `<span class="badge badge-purple">${esc(c.qualificationType)}</span>` : ''}
            ${c?.studyType        ? `<span class="badge badge-orange">${esc(c.studyType)}</span>` : ''}
            ${c?.level            ? `<span class="badge badge-gray">Level ${esc(c.level)}</span>` : ''}
            ${c?.group            ? `<span class="badge badge-gray">Group ${esc(c.group)}</span>` : ''}
            ${c?.departmentId     ? `<span class="badge badge-gray">${esc(c.departmentId)}</span>` : ''}
          </div>
          <div style="font-size:12px;color:var(--text-muted);margin-top:3px">
            ${s.title  ? `<strong>${esc(s.title)}</strong>` : ''}
            ${s.venue  ? ` · 📍 ${esc(s.venue)}`           : ''}
            ${s.startedAt ? ` · Started ${new Date(s.startedAt).toLocaleTimeString()}` : ''}
          </div>
        </div>
      </div>
    </div>

    <!-- ── Status cards ──────────────────────────────────────────────── -->
    <div id="dash-cards" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-bottom:14px">
      ${_statusCardHTML(s)}
      ${_deviceCardHTML(device)}
      ${_codeCardHTML(code)}
      ${_networkCardHTML(s)}
      ${_countCardHTML('Marked',     counts.marked,     '#22c55e', 'dash-marked')}
      ${_countCardHTML('Expected',   counts.expected,   '#6366f1', 'dash-expected')}
      ${_countCardHTML('Absent',     counts.absent,     '#f59e0b', 'dash-absent')}
      ${_countCardHTML('Suspicious', counts.suspicious, counts.suspicious > 0 ? '#ef4444' : '#9ca3af', 'dash-suspicious')}
    </div>

    <!-- ── Progress bar ───────────────────────────────────────────────── -->
    <div class="card" style="margin-bottom:14px;padding:14px 16px">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:13px;font-weight:600">Attendance Progress</span>
        <span id="dash-pct" style="font-size:13px;font-weight:800;color:#22c55e">
          ${_pct(counts)}%
        </span>
      </div>
      <div style="height:10px;background:var(--border);border-radius:5px;overflow:hidden">
        <div id="dash-progress-bar" style="height:10px;background:linear-gradient(90deg,#22c55e,#16a34a);border-radius:5px;transition:width .5s;width:${_pct(counts)}%"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:5px">
        <span id="dash-pbar-marked">${counts.marked} marked</span>
        <span id="dash-pbar-absent">${counts.absent} absent</span>
        <span>${counts.expected} expected</span>
      </div>
    </div>

    <!-- ── Controls ───────────────────────────────────────────────────── -->
    <div class="card" id="dash-controls" style="margin-bottom:14px;padding:14px 16px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:10px">Session Controls</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${_controlButtonsHTML(s)}
      </div>
    </div>

    <!-- ── Bottom panels ──────────────────────────────────────────────── -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">

      <!-- Live Activity Feed -->
      <div class="card" style="min-height:260px;max-height:420px;display:flex;flex-direction:column">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:6px;flex-shrink:0">
          <span id="live-dot" style="width:8px;height:8px;border-radius:50%;background:${s.status==='live'?'#22c55e':'#9ca3af'};display:inline-block"></span>
          Live Activity
        </div>
        <div id="dash-activity-feed" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:6px">
          ${_buildActivityHTML(d.recentActivity)}
        </div>
      </div>

      <!-- Suspicious Events -->
      <div class="card" style="min-height:260px;max-height:420px;display:flex;flex-direction:column">
        <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:${counts.suspicious>0?'#ef4444':'var(--text)'};flex-shrink:0">
          ⚠️ Suspicious Events
          ${counts.suspicious > 0 ? `<span style="background:#ef4444;color:#fff;font-size:10px;padding:1px 8px;border-radius:20px;margin-left:4px;vertical-align:middle">${counts.suspicious}</span>` : ''}
        </div>
        <div id="dash-suspicious-feed" style="overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:6px">
          ${_buildSuspiciousHTML(d.suspiciousEvents)}
        </div>
      </div>

    </div>
  `;
}

// ── Card builders ─────────────────────────────────────────────────────────────

function _statusCardHTML(s) {
  const color = _statusColor(s.status);
  return `<div class="card" id="dash-status-card" style="text-align:center;padding:14px 8px;border-top:3px solid ${color}">
    <div class="card-label">Status</div>
    <div style="font-size:16px;font-weight:800;color:${color}">${s.status.toUpperCase()}</div>
  </div>`;
}

function _deviceCardHTML(device) {
  const color = device.deviceOnline ? '#22c55e' : '#ef4444';
  return `<div class="card" id="dash-device-card" style="text-align:center;padding:14px 8px;border-top:3px solid ${color}">
    <div class="card-label">Device</div>
    <div style="font-size:14px;font-weight:800;color:${color}">${device.deviceOnline ? '● Online' : '● Offline'}</div>
    ${device.deviceName ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${esc(device.deviceName)}</div>` : ''}
    ${device.assignedRoom ? `<div style="font-size:10px;color:var(--text-muted)">📍 ${esc(device.assignedRoom)}</div>` : ''}
    ${device.lastHeartbeat ? `<div style="font-size:10px;color:var(--text-muted)">${timeAgo(device.lastHeartbeat)}</div>` : ''}
  </div>`;
}

function _codeCardHTML(code) {
  return `<div class="card" id="dash-code-card" style="text-align:center;padding:14px 8px;border-top:3px solid #6366f1">
    <div class="card-label">Code</div>
    ${code.hasCode
      ? `<div style="font-size:14px;font-weight:800;color:${code.isExpired ? '#ef4444' : '#6366f1'}">${code.isExpired ? 'EXPIRED' : code.secondsRemaining + 's left'}</div>
         <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Rotates every ${code.rotationSeconds}s</div>`
      : `<div style="font-size:12px;color:var(--text-muted)">No code active</div>`}
  </div>`;
}

function _networkCardHTML(s) {
  const enforced = s.networkEnforcement;
  const color    = enforced ? '#0ea5e9' : '#9ca3af';
  return `<div class="card" id="dash-network-card" style="text-align:center;padding:14px 8px;border-top:3px solid ${color}">
    <div class="card-label">Network</div>
    <div style="font-size:13px;font-weight:700;color:${color}">${enforced ? '🔒 Enforced' : '🔓 Optional'}</div>
    ${s.networkStatus ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${esc(s.networkStatus)}</div>` : ''}
  </div>`;
}

function _countCardHTML(label, val, color, id) {
  return `<div class="card" id="${id}-card" style="text-align:center;padding:14px 8px;border-top:3px solid ${color}">
    <div class="card-label">${label}</div>
    <div id="${id}-val" style="font-size:26px;font-weight:900;color:${color}">${val}</div>
  </div>`;
}

function _controlButtonsHTML(s) {
  const isEnded   = ['ended', 'cancelled'].includes(s.status);
  const canControl = !isEnded;

  let btns = '';
  if (s.status === 'scheduled')  btns += `<button class="btn btn-primary" onclick="dashAction('start')">▶ Start</button>`;
  if (s.status === 'live')       btns += `<button class="btn" style="background:#f59e0b;color:#fff" onclick="dashAction('pause')">⏸ Pause</button>`;
  if (s.status === 'paused')     btns += `<button class="btn btn-primary" onclick="dashAction('resume')">▶ Resume</button>`;
  if (['live','paused'].includes(s.status)) btns += `<button class="btn" style="background:#ef4444;color:#fff" onclick="dashAction('lock')">🔒 Lock</button>`;
  if (s.status === 'locked')     btns += `<button class="btn btn-primary" onclick="dashAction('unlock')">🔓 Unlock</button>`;
  if (canControl)                btns += `<button class="btn" style="background:#1f2937;color:#fff" onclick="dashConfirmEnd()">⏹ End Session</button>`;
  if (canControl)                btns += `<button class="btn btn-secondary" onclick="dashOpenEdit()">✏️ Edit</button>`;
  btns += `<button class="btn btn-secondary" onclick="dashRefreshDevice()">🔄 Device</button>`;
  btns += `<button class="btn btn-secondary" onclick="dashOpenStudentTable()">👥 Students</button>`;
  btns += `<button class="btn btn-secondary" onclick="dashOpenReport()">📊 Report</button>`;
  btns += `<a class="btn btn-secondary" href="/api/attendance-sessions/${_dashSessionId}/report/pdf" target="_blank">⬇️ PDF</a>`;
  if (s.linkedMeetingId) btns += `<button class="btn" style="background:#0ea5e9;color:#fff" onclick="dashOpenMeeting('${s.linkedMeetingId}')">📹 Meeting</button>`;

  return btns;
}

// ── Activity & suspicious feed builders ───────────────────────────────────────

function _buildActivityHTML(events) {
  if (!events?.length) {
    return `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:30px">No activity yet</div>`;
  }
  return events.map(e => {
    const ok   = e.type === 'mark_success';
    const name = e.student?.name || 'Unknown';
    const id   = e.student?.IndexNumber || e.student?.indexNumber || '';
    return `
      <div style="display:flex;align-items:flex-start;gap:8px;padding:7px 10px;background:${ok?'#f0fdf4':'#fef2f2'};border-radius:8px;border-left:3px solid ${ok?'#22c55e':'#ef4444'}">
        <span style="font-size:14px;flex-shrink:0">${ok ? '✅' : '⚠️'}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}${id ? ` · <span style="font-family:monospace;font-size:11px">${esc(id)}</span>` : ''}</div>
          <div style="font-size:11px;color:var(--text-muted)">${ok ? (e.method || 'code mark') : esc(e.reason || e.eventType || '')}</div>
        </div>
        <div style="font-size:10px;color:var(--text-muted);white-space:nowrap;flex-shrink:0">${timeAgo(e.timestamp)}</div>
      </div>`;
  }).join('');
}

function _buildSuspiciousHTML(events) {
  if (!events?.length) {
    return `<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:30px">No suspicious events 🎉</div>`;
  }
  return events.map(e => {
    const name     = e.userId?.name || 'Unknown';
    const id       = e.userId?.IndexNumber || e.userId?.indexNumber || '';
    const typeLabel = (e.eventType || 'unknown').replace(/_/g, ' ');
    return `
      <div style="padding:8px 10px;background:#fef2f2;border-radius:8px;border-left:3px solid #ef4444">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px">
          <span style="font-size:11px;font-weight:700;color:#dc2626;text-transform:capitalize">${esc(typeLabel)}</span>
          <span style="font-size:10px;color:var(--text-muted)">${timeAgo(e.createdAt)}</span>
        </div>
        <div style="font-size:12px;color:#374151">${esc(name)}${id ? ` · <span style="font-family:monospace;font-size:11px">${esc(id)}</span>` : ''}</div>
        <div style="font-size:11px;color:#b91c1c;margin-top:2px">${esc(e.reason || '')}</div>
        <div style="margin-top:5px;display:flex;gap:6px;align-items:center">
          ${!e.resolved
            ? `<button class="btn btn-sm" style="font-size:10px;padding:2px 8px;background:#fff;border:1px solid #fca5a5;color:#dc2626;border-radius:4px" onclick="dashResolveEvent('${e._id}')">Resolve</button>`
            : `<span style="font-size:10px;color:#22c55e;font-weight:600">✓ Resolved</span>`}
          <span style="font-size:10px;color:var(--text-muted)">${e.actionTaken || 'blocked'}</span>
        </div>
      </div>`;
  }).join('');
}

// ── Card live-update helpers ──────────────────────────────────────────────────

function _updateCountCards(counts) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('dash-marked-val',    counts.marked);
  set('dash-expected-val',  counts.expected);
  set('dash-absent-val',    counts.absent);
  set('dash-suspicious-val', counts.suspicious);
}

function _updateProgressBar(counts) {
  const pct   = _pct(counts);
  const bar   = document.getElementById('dash-progress-bar');
  const label = document.getElementById('dash-pct');
  const markedLabel = document.getElementById('dash-pbar-marked');
  const absentLabel = document.getElementById('dash-pbar-absent');
  if (bar)   bar.style.width  = pct + '%';
  if (label) label.textContent = pct + '%';
  if (markedLabel) markedLabel.textContent = `${counts.marked} marked`;
  if (absentLabel) absentLabel.textContent = `${counts.absent} absent`;
}

function _updateStatusCard(s) {
  const el = document.getElementById('dash-status-card');
  if (!el) return;
  const color = _statusColor(s.status);
  el.style.borderTopColor = color;
  el.querySelector('.card-label').nextElementSibling.style.color = color;
  el.querySelector('.card-label').nextElementSibling.textContent = s.status.toUpperCase();
  const dot = document.getElementById('live-dot');
  if (dot) dot.style.background = s.status === 'live' ? '#22c55e' : '#9ca3af';
}

function _updateDeviceCard(device) {
  const el = document.getElementById('dash-device-card');
  if (!el) return;
  const color = device.deviceOnline ? '#22c55e' : '#ef4444';
  el.style.borderTopColor = color;
  el.innerHTML = `
    <div class="card-label">Device</div>
    <div style="font-size:14px;font-weight:800;color:${color}">${device.deviceOnline ? '● Online' : '● Offline'}</div>
    ${device.deviceName ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px">${esc(device.deviceName)}</div>` : ''}
    ${device.assignedRoom ? `<div style="font-size:10px;color:var(--text-muted)">📍 ${esc(device.assignedRoom)}</div>` : ''}
    ${device.lastHeartbeat ? `<div style="font-size:10px;color:var(--text-muted)">${timeAgo(device.lastHeartbeat)}</div>` : ''}
  `;
}

function _updateCodeCard(code) {
  const el = document.getElementById('dash-code-card');
  if (!el) return;
  el.innerHTML = `
    <div class="card-label">Code</div>
    ${code.hasCode
      ? `<div style="font-size:14px;font-weight:800;color:${code.isExpired ? '#ef4444' : '#6366f1'}">${code.isExpired ? 'EXPIRED' : code.secondsRemaining + 's left'}</div>
         <div style="font-size:10px;color:var(--text-muted);margin-top:2px">Rotates every ${code.rotationSeconds}s</div>`
      : `<div style="font-size:12px;color:var(--text-muted)">No code active</div>`}
  `;
}

// ── Control actions ───────────────────────────────────────────────────────────

async function dashAction(action) {
  if (!_dashSessionId) return;
  try {
    const result = await api(`/api/attendance-sessions/${_dashSessionId}/${action}`, { method: 'POST' });
    toastSuccess(result.message || `Session ${action}d.`);
    if (result.warning) toastWarning(result.warning);
    await renderSessionDashboard(_dashSessionId);
  } catch (e) {
    toastError(e.message);
  }
}

function dashConfirmEnd() {
  toastConfirm(
    'End this session? Students will no longer be able to mark attendance.',
    async () => {
      try {
        const result = await api(`/api/attendance-sessions/${_dashSessionId}/stop`, { method: 'POST' });
        toastSuccess('Session ended.');
        if (result.summary) {
          toastInfo(`${result.summary.marked} marked · ${result.summary.absent} absent · ${result.summary.suspicious} suspicious`);
        }
        await renderSessionDashboard(_dashSessionId);
      } catch (e) { toastError(e.message); }
    }
  );
}

async function dashRefreshDevice() {
  try {
    const { data } = await api(`/api/attendance-sessions/${_dashSessionId}/refresh-device`, { method: 'POST' });
    _updateDeviceCard(data);
    toastSuccess(data.deviceOnline ? 'Device is online ✓' : 'Device is offline. Check power or connection.');
  } catch (e) { toastError(e.message); }
}

// ── Edit session modal ────────────────────────────────────────────────────────

function dashOpenEdit() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:460px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0">Edit Session</h3>
          <button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-muted)">×</button>
        </div>
        <div class="form-group">
          <label>Session Title</label>
          <input type="text" id="edit-title" placeholder="e.g. Week 6 Attendance">
        </div>
        <div class="form-group">
          <label>Venue / Room</label>
          <input type="text" id="edit-venue" placeholder="e.g. LT3, Lab 2, Online">
        </div>
        <div class="form-group">
          <label>Code Rotation (seconds)
            <span style="font-size:11px;color:var(--text-muted);font-weight:400"> — 15 to 120</span>
          </label>
          <input type="number" id="edit-rotation" min="15" max="120" value="30">
        </div>
        <div class="form-group">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:600">
            <input type="checkbox" id="edit-network" style="width:16px;height:16px">
            Enforce school network verification
          </label>
          <p style="font-size:11px;color:var(--text-muted);margin-top:4px">
            When enabled, students must be on the approved school Wi-Fi to mark attendance.
          </p>
        </div>
        <div class="form-group">
          <label>Notes (optional)</label>
          <textarea id="edit-notes" rows="2" placeholder="Internal notes for this session"></textarea>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="dashSaveEdit()">Save Changes</button>
        </div>
      </div>
    </div>`;
}

async function dashSaveEdit() {
  try {
    const body = {
      title:               (document.getElementById('edit-title')?.value || '').trim() || undefined,
      venue:               (document.getElementById('edit-venue')?.value || '').trim() || undefined,
      codeRotationSeconds: parseInt(document.getElementById('edit-rotation')?.value) || 30,
      networkEnforcement:  document.getElementById('edit-network')?.checked || false,
      notes:               (document.getElementById('edit-notes')?.value || '').trim() || undefined,
    };
    await api(`/api/attendance-sessions/${_dashSessionId}/update`, {
      method: 'PUT',
      body:   JSON.stringify(body),
    });
    closeModal();
    toastSuccess('Session updated.');
    await renderSessionDashboard(_dashSessionId);
  } catch (e) { toastError(e.message); }
}

// ── Resolve suspicious event ──────────────────────────────────────────────────

async function dashResolveEvent(eventId) {
  try {
    await api(`/api/attendance-sessions/${_dashSessionId}/suspicious/${eventId}/resolve`, {
      method: 'PATCH',
      body:   JSON.stringify({ notes: 'Resolved by lecturer' }),
    });
    toastSuccess('Event resolved.');
    const { data } = await api(`/api/attendance-sessions/${_dashSessionId}/suspicious-events`);
    const el = document.getElementById('dash-suspicious-feed');
    if (el) el.innerHTML = _buildSuspiciousHTML(data);
  } catch (e) { toastError(e.message); }
}

// ── Student attendance table modal ────────────────────────────────────────────

async function dashOpenStudentTable() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:700px;width:95vw;max-height:88vh;display:flex;flex-direction:column">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-shrink:0">
          <h3 style="margin:0">Student Attendance</h3>
          <button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer">×</button>
        </div>
        <div id="student-table-content" style="flex:1;overflow-y:auto">
          <div class="loading" style="text-align:center;padding:30px">Loading…</div>
        </div>
      </div>
    </div>`;

  try {
    const { data } = await api(`/api/attendance-sessions/${_dashSessionId}/student-table`);
    const el = document.getElementById('student-table-content');
    if (!el) return;

    const present   = data.filter(r => r.status === 'present');
    const absent    = data.filter(r => r.status === 'absent');
    const flagged   = data.filter(r => r.suspicious);

    el.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <span class="badge" style="background:#f0fdf4;color:#16a34a;padding:4px 12px;font-size:12px;border-radius:20px;font-weight:700">✅ ${present.length} Present</span>
        <span class="badge" style="background:#fef3c7;color:#d97706;padding:4px 12px;font-size:12px;border-radius:20px;font-weight:700">⏳ ${absent.length} Absent</span>
        ${flagged.length > 0 ? `<span class="badge" style="background:#fef2f2;color:#dc2626;padding:4px 12px;font-size:12px;border-radius:20px;font-weight:700">⚠️ ${flagged.length} Flagged</span>` : ''}
      </div>
      <input id="stu-search" placeholder="🔍 Search by name or student ID…" oninput="dashFilterStudents(this.value)"
        style="width:100%;padding:9px 14px;border:1.5px solid var(--border);border-radius:9px;font-size:13px;margin-bottom:12px;font-family:inherit;outline:none;background:var(--bg)">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="border-bottom:2px solid var(--border)">
            <th style="text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700">Name</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700">ID</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700">Status</th>
            <th style="text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700">Time</th>
            <th style="padding:8px 10px;font-size:11px;text-transform:uppercase;color:var(--text-muted);font-weight:700;text-align:center">Actions</th>
          </tr>
        </thead>
        <tbody id="stu-tbody">
          ${data.map(r => `
            <tr class="stu-row"
              data-name="${esc((r.student?.name || '').toLowerCase())}"
              data-id="${esc((r.student?.IndexNumber || r.student?.indexNumber || '').toLowerCase())}"
              style="border-bottom:1px solid var(--border)">
              <td style="padding:9px 10px;font-weight:600">${esc(r.student?.name || '—')}</td>
              <td style="padding:9px 10px;font-family:monospace;font-size:11px;color:var(--text-muted)">${esc(r.student?.IndexNumber || r.student?.indexNumber || '—')}</td>
              <td style="padding:9px 10px">
                <span style="background:${r.status==='present'?'#f0fdf4':'#fef3c7'};color:${r.status==='present'?'#16a34a':'#d97706'};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">
                  ${r.status === 'present' ? '✅ Present' : '⏳ Absent'}
                </span>
                ${r.suspicious ? `<span style="background:#fef2f2;color:#dc2626;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;margin-left:4px">⚠️</span>` : ''}
              </td>
              <td style="padding:9px 10px;font-size:11px;color:var(--text-muted)">${r.markedAt ? new Date(r.markedAt).toLocaleTimeString() : '—'}</td>
              <td style="padding:9px 10px;text-align:center">
                ${r.suspicious ? `<button class="btn btn-sm" style="font-size:10px;padding:2px 7px;background:#fef2f2;color:#dc2626;border:1px solid #fca5a5;border-radius:4px" onclick="dashResolveStudentFlag('${r.suspicious?._id}')">Clear Flag</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    const el = document.getElementById('student-table-content');
    if (el) el.innerHTML = `<p style="color:#ef4444;padding:20px">${esc(e.message)}</p>`;
  }
}

function dashFilterStudents(q) {
  const query = q.toLowerCase();
  document.querySelectorAll('.stu-row').forEach(row => {
    const match = row.dataset.name.includes(query) || row.dataset.id.includes(query);
    row.style.display = match ? '' : 'none';
  });
}

async function dashResolveStudentFlag(eventId) {
  if (!eventId) return;
  await dashResolveEvent(eventId);
  await dashOpenStudentTable();
}

// ── Report modal ──────────────────────────────────────────────────────────────

async function dashOpenReport() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:520px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="margin:0">Session Report</h3>
          <button onclick="closeModal()" style="background:none;border:none;font-size:20px;cursor:pointer">×</button>
        </div>
        <div id="report-content"><div class="loading" style="text-align:center;padding:30px">Loading…</div></div>
        <div class="modal-actions" style="margin-top:16px">
          <button class="btn btn-secondary" onclick="closeModal()">Close</button>
          <a class="btn btn-primary" href="/api/attendance-sessions/${_dashSessionId}/report/pdf" target="_blank">⬇️ Export PDF</a>
        </div>
      </div>
    </div>`;

  try {
    const { data } = await api(`/api/attendance-sessions/${_dashSessionId}/report`);
    const el = document.getElementById('report-content');
    if (!el) return;

    const s   = data.session;
    const sum = data.summary;

    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:14px">
        ${[
          ['Expected', sum.expected,   '#6366f1'],
          ['Present',  sum.marked,     '#22c55e'],
          ['Absent',   sum.absent,     '#f59e0b'],
          ['Rate',     sum.percentage+'%', '#0ea5e9'],
          ['Suspicious', sum.suspicious, sum.suspicious>0?'#ef4444':'#9ca3af'],
          ['Unresolved', sum.unresolvedSuspicious, sum.unresolvedSuspicious>0?'#ef4444':'#9ca3af'],
        ].map(([label, val, color]) => `
          <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:12px;text-align:center">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px">${label}</div>
            <div style="font-size:22px;font-weight:900;color:${color}">${val}</div>
          </div>`).join('')}
      </div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px;font-size:12px;display:grid;gap:5px">
        <div><span style="color:var(--text-muted)">Status:</span> <strong>${esc(s.status)}</strong></div>
        <div><span style="color:var(--text-muted)">Venue:</span> <strong>${esc(s.venue || '—')}</strong></div>
        ${s.startedAt ? `<div><span style="color:var(--text-muted)">Started:</span> <strong>${new Date(s.startedAt).toLocaleString()}</strong></div>` : ''}
        ${s.stoppedAt ? `<div><span style="color:var(--text-muted)">Ended:</span> <strong>${new Date(s.stoppedAt).toLocaleString()}</strong></div>` : ''}
        ${s.duration  ? `<div><span style="color:var(--text-muted)">Duration:</span> <strong>${s.duration} minutes</strong></div>` : ''}
        <div><span style="color:var(--text-muted)">Network enforcement:</span> <strong>${s.networkEnforcement ? 'Yes' : 'No'}</strong></div>
        ${data.device ? `<div><span style="color:var(--text-muted)">Device:</span> <strong>${esc(data.device.name || '—')}</strong></div>` : ''}
        <div style="color:var(--text-muted);font-size:11px;margin-top:4px">Generated: ${new Date(data.generatedAt).toLocaleString()}</div>
      </div>
    `;
  } catch (e) {
    const el = document.getElementById('report-content');
    if (el) el.innerHTML = `<p style="color:#ef4444;padding:20px">${esc(e.message)}</p>`;
  }
}

// ── Meeting link ──────────────────────────────────────────────────────────────

function dashOpenMeeting(meetingId) {
  _dashStopPolling();
  closeModal();
  navigateTo('meetings');
}

// ── Utility helpers ───────────────────────────────────────────────────────────

function _statusColor(status) {
  return {
    scheduled: '#3b82f6', live: '#22c55e',
    paused: '#f59e0b',   locked: '#ef4444',
    ended:  '#6b7280',   cancelled: '#9ca3af',
  }[status] || '#9ca3af';
}

function _pct(counts) {
  return counts.expected > 0 ? Math.round((counts.marked / counts.expected) * 100) : 0;
}

// CSS injected once for badge and card-label utility classes
(function _dashInjectStyles() {
  if (document.getElementById('dash-styles')) return;
  const style = document.createElement('style');
  style.id = 'dash-styles';
  style.textContent = `
    .badge { display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700 }
    .badge-purple { background:#ede9fe;color:#7c3aed }
    .badge-orange { background:#fff7ed;color:#c2410c }
    .badge-gray   { background:#f3f4f6;color:#374151 }
    .card-label   { font-size:10px;font-weight:700;text-transform:uppercase;color:var(--text-muted);margin-bottom:4px }
    @keyframes pulse-green { 0%,100%{opacity:1} 50%{opacity:.4} }
  `;
  document.head.appendChild(style);
})();

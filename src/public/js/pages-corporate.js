"use strict";
/**
 * pages-corporate.js
 * Requires: app.js globals — api(), currentUser, toastError(), toastSuccess(), svgIcon()
 * Provides: renderAuditLogs(), renderProgrammes()
 *
 * Note: renderAttendanceSummary() (the "Payroll" page's successor) lives in
 * manager-portal.js. An identically-named renderPayroll(), financial and
 * dead code, previously lived here too and was removed to eliminate a
 * naming collision (this file loads before both app.js and manager-portal.js).
 */

// ════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS  (admin / superadmin only)
// ════════════════════════════════════════════════════════════════════════════

async function renderAuditLogs() {
  const content = document.getElementById('main-content');
  if (!content) return;

  content.innerHTML = `
    <div class="page-header">
      <h2>Audit Logs</h2>
      <p>Track all system activities and administrative actions</p>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
        <input id="audit-search" type="text" placeholder="Search by user or action…" style="flex:1;min-width:200px;padding:8px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none" oninput="loadAuditLogs()">
        <select id="audit-action-filter" onchange="loadAuditLogs()" style="padding:8px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;outline:none">
          <option value="">All actions</option>
          <option value="login">Login</option>
          <option value="logout">Logout</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="approve">Approve</option>
          <option value="reject">Reject</option>
        </select>
        <select id="audit-period-filter" onchange="loadAuditLogs()" style="padding:8px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;outline:none">
          <option value="7">Last 7 days</option>
          <option value="30" selected>Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>
    </div>
    <div id="audit-logs-area"><div class="loading" style="padding:20px;text-align:center;font-size:13px">Loading audit logs…</div></div>`;

  loadAuditLogs();
}

async function loadAuditLogs() {
  const area = document.getElementById('audit-logs-area');
  if (!area) return;
  const search = document.getElementById('audit-search')?.value.trim() || '';
  const action = document.getElementById('audit-action-filter')?.value || '';
  const days   = document.getElementById('audit-period-filter')?.value || '30';

  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (action) params.set('action', action);
  params.set('days', days);

  if (!navigator.onLine) {
    const cached = typeof offlineRead === 'function' ? offlineRead('corp_audit_logs') : null;
    if (cached) {
      _renderAuditLogs(area, cached, true);
    } else {
      area.innerHTML = '<div class="card"><div class="empty-state"><p>📶 Offline — audit logs require an internet connection.</p></div></div>';
    }
    return;
  }

  try {
    const data = await api(`/api/audit-logs?${params}`);
    if (typeof offlineCache === 'function' && !search && !action) offlineCache('corp_audit_logs', data);
    const logs = data.logs || data.items || [];
    _renderAuditLogs(area, { logs }, false);
  } catch(e) {
    area.innerHTML = `<div class="card"><p style="color:var(--danger);font-size:13px">Error: ${e.message}</p></div>`;
  }
}

function _renderAuditLogs(area, data, isOffline) {
  const logs = data.logs || data.items || [];
  if (!logs.length) {
    area.innerHTML = '<div class="card"><div class="empty-state"><p>No audit logs found for the selected filters.</p></div></div>';
    return;
  }
  const actionColors = { login:'#2563eb', logout:'#6b7280', create:'#16a34a', update:'#d97706', delete:'#dc2626', approve:'#059669', reject:'#dc2626' };
  area.innerHTML = `
    ${isOffline ? '<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:600;color:#92400e;margin-bottom:12px">📶 Offline — showing cached audit logs</div>' : ''}
    <div class="card" style="overflow-x:auto">
      <table>
        <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th><th>IP</th></tr></thead>
        <tbody>${logs.map(l => {
          const ac = actionColors[l.action?.toLowerCase()] || 'var(--text-muted)';
          return `<tr>
            <td style="font-size:11px;color:var(--text-muted);white-space:nowrap">${l.createdAt ? new Date(l.createdAt).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '—'}</td>
            <td style="font-size:12px;font-weight:600">${l.userName || l.user?.name || '—'}</td>
            <td><span style="background:${ac}20;color:${ac};border:1px solid ${ac}40;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700;text-transform:uppercase">${l.action || '—'}</span></td>
            <td style="font-size:12px">${l.resource || l.model || '—'}</td>
            <td style="font-size:12px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(l.details||'').replace(/"/g,'&quot;')}">${l.details || '—'}</td>
            <td style="font-size:11px;color:var(--text-muted)">${l.ipAddress || '—'}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
    </div>`;
}

// ════════════════════════════════════════════════════════════════════════════
// PROGRAMMES  (admin / academic mode)
// ════════════════════════════════════════════════════════════════════════════

async function renderProgrammes() {
  const content = document.getElementById('main-content');
  if (!content) return;

  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'superadmin';

  content.innerHTML = `
    <div class="page-header">
      <h2>Programmes</h2>
      <p>Academic programmes and courses offered by your institution</p>
    </div>
    ${isAdmin ? `<div style="margin-bottom:16px">
      <button class="btn btn-primary btn-sm" onclick="showNewProgrammeModal()">+ New Programme</button>
    </div>` : ''}
    <div id="programmes-area"><div class="loading" style="padding:20px;text-align:center;font-size:13px">Loading programmes…</div></div>`;

  loadProgrammes();
}

async function loadProgrammes() {
  const area = document.getElementById('programmes-area');
  if (!area) return;

  if (!navigator.onLine) {
    const cached = typeof offlineRead === 'function' ? offlineRead('corp_programmes') : null;
    if (cached) {
      _renderProgrammesData(area, cached, true);
    } else {
      area.innerHTML = '<div class="card"><div class="empty-state"><p>📶 Offline — no cached programmes data available.</p></div></div>';
    }
    return;
  }

  // Timeout guard so the page never stays on "Loading programmes…" forever
  const timer = setTimeout(() => {
    const el = document.getElementById('programmes-area');
    if (el && el.querySelector('.loading')) {
      el.innerHTML = '<div class="card"><p style="color:var(--danger);font-size:13px">Request timed out — please refresh and try again.</p></div>';
    }
  }, 20000);

  try {
    const data = await api('/api/programmes');
    clearTimeout(timer);
    if (typeof offlineCache === 'function') offlineCache('corp_programmes', data);

    // Re-acquire in case DOM changed during await
    const liveArea = document.getElementById('programmes-area');
    if (!liveArea) return;
    _renderProgrammesData(liveArea, data, false);
  } catch(e) {
    clearTimeout(timer);
    const liveArea = document.getElementById('programmes-area');
    if (liveArea) liveArea.innerHTML = `<div class="card"><p style="color:var(--danger);font-size:13px">Error: ${e.message}</p></div>`;
  }
}

function _renderProgrammesData(liveArea, data, isOffline) {
    const programmes = data.programmes || data.items || [];

    if (!programmes.length) {
      liveArea.innerHTML = '<div class="card"><div class="empty-state"><p>No programmes found. Add the first one with the button above.</p></div></div>';
      return;
    }

    liveArea.innerHTML = `
    ${isOffline ? '<div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:600;color:#92400e;margin-bottom:12px">📶 Offline — showing cached programmes</div>' : ''}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px">
      ${programmes.map(p => `
        <div class="card" style="padding:18px 20px">
          <div style="font-size:15px;font-weight:700;margin-bottom:4px">${p.name || 'Unnamed Programme'}</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">${p.code || ''}</div>
          ${p.description ? `<div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:10px">${p.description}</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${p.durationSemesters ? `<span style="font-size:10px;background:var(--primary-ultra-light);color:var(--primary);padding:2px 8px;border-radius:20px">${p.durationSemesters} semesters</span>` : (p.duration ? `<span style="font-size:10px;background:var(--primary-ultra-light);color:var(--primary);padding:2px 8px;border-radius:20px">${p.duration} yrs</span>` : '')}
            ${p.qualificationType || p.level ? `<span style="font-size:10px;background:#f0fdf4;color:#15803d;padding:2px 8px;border-radius:20px;text-transform:capitalize">${p.qualificationType || p.level}</span>` : ''}
            <span style="font-size:10px;background:#f5f3ff;color:#7c3aed;padding:2px 8px;border-radius:20px">${p.studentCount ?? 0} students</span>
          </div>
        </div>`).join('')}
    </div>`;
}

async function showNewProgrammeModal() {
  const existing = document.getElementById('new-prog-overlay');
  if (existing) existing.remove();
  const ol = document.createElement('div');
  ol.id = 'new-prog-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px';
  ol.innerHTML = `
    <div style="background:var(--card);border-radius:14px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:15px;font-weight:700;margin:0">New Programme</h3>
        <button onclick="document.getElementById('new-prog-overlay').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer">✕</button>
      </div>
      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Name *</label>
          <input id="np-name" type="text" placeholder="e.g. Computer Science" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none"></div>
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Code</label>
          <input id="np-code" type="text" placeholder="e.g. BSC-CS" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none"></div>
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Duration (years)</label>
          <input id="np-duration" type="number" min="1" max="10" value="4" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none"></div>
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Description</label>
          <textarea id="np-desc" rows="3" placeholder="Optional programme description…" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none"></textarea></div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('new-prog-overlay').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="submitNewProgramme()">Create Programme</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
}

async function submitNewProgramme() {
  const name     = document.getElementById('np-name')?.value.trim();
  const code     = document.getElementById('np-code')?.value.trim();
  const duration = parseInt(document.getElementById('np-duration')?.value) || 4;
  const desc     = document.getElementById('np-desc')?.value.trim();
  if (!name) return toastError('Programme name is required');
  try {
    await api('/api/programmes', { method: 'POST', body: JSON.stringify({ name, code, duration, description: desc }) });
    document.getElementById('new-prog-overlay')?.remove();
    toastSuccess('Programme created!');
    loadProgrammes();
  } catch(e) {
    toastError(e.message || 'Failed to create programme');
  }
}

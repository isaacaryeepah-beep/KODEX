/* ============================================================================
   KODEX — Manager Portal Enhanced Features
   Loaded after app.js — extends/overrides manager-specific functions
   ============================================================================ */

// ─────────────────────────────────────────────────────────────────────────────
// SMART DASHBOARD (overrides renderManagerDashboard in app.js)
// ─────────────────────────────────────────────────────────────────────────────
async function renderManagerDashboard(content) {
  content.innerHTML = '<div class="loading">Loading dashboard…</div>';
  try {
    const [usersData, pendingData, sessionsData, leavesData, analyticsData] = await Promise.all([
      api('/api/users').catch(() => ({ users: [] })),
      Promise.resolve({ pending: [] }),
      api('/api/attendance-sessions?limit=10').catch(() => ({ sessions: [], pagination: { total: 0 } })),
      api('/api/leaves/pending').catch(() => ({ leaves: [] })),
      api('/api/advanced/analytics').catch(() => null),
    ]);

    const users       = usersData.users || [];
    const employees   = users.filter(u => u.role === 'employee');
    const pending     = [];
    const sessions    = sessionsData.sessions || [];
    const leaves      = leavesData.leaves || [];
    const analytics   = analyticsData;
    const activeSessions = sessions.filter(s => s.active).length;
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const firstName = currentUser.name.split(' ')[0];
    const instCode  = currentUser.company?.institutionCode || 'N/A';
    const totalHours = analytics?.timesheets?.totalHours || 0;

    // ── Attention Needed items ──────────────────────────────────────────────
    const attn = [];
    if (leaves.length)   attn.push({ icon:'🏖️', text:`${leaves.length} leave request${leaves.length>1?'s':''} to review`, nav:'leave-requests', color:'#f59e0b' });
    if (activeSessions)  attn.push({ icon:'🟢', text:`${activeSessions} active session${activeSessions>1?'s':''} running`, nav:'sessions', color:'#10b981' });

    // ── Department breakdown ────────────────────────────────────────────────
    const deptMap = {};
    employees.forEach(u => {
      const d = u.department || 'Unassigned';
      deptMap[d] = (deptMap[d] || 0) + 1;
    });
    const depts = Object.entries(deptMap).sort((a,b) => b[1]-a[1]);

    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px">

        <!-- Welcome bar -->
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div class="dashboard-welcome">
            <h2>${greeting}, ${firstName} 👋</h2>
            <p>Manager Portal — ${currentUser.company?.name || 'Your Company'}</p>
          </div>
          <div class="inst-code-card">
            <div class="inst-code-label">Company code</div>
            <div class="inst-code-value">${instCode}</div>
            <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText('${instCode}').then(()=>toastSuccess('Copied!'))">Copy</button>
          </div>
        </div>

        <!-- Attention card -->
        ${attn.length ? `
        <div class="card" style="border-left:4px solid #f59e0b;background:linear-gradient(135deg,var(--card),#fffbeb);padding:16px">
          <div style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.6px;color:#92400e;margin-bottom:10px">⚠️ Attention Needed</div>
          <div style="display:flex;flex-direction:column;gap:6px">
            ${attn.map(a=>`
              <div onclick="navigateTo('${a.nav}')" style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:8px 12px;border-radius:8px;background:rgba(255,255,255,.8);border:1px solid rgba(0,0,0,.06)">
                <span style="font-size:18px">${a.icon}</span>
                <span style="font-size:13px;font-weight:600;color:${a.color}">${a.text}</span>
                <span style="margin-left:auto;color:${a.color};font-weight:700">→</span>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <!-- KPI grid -->
        <div class="stats-grid" style="margin:0">
          <div class="stat-card-v2" onclick="navigateTo('users')">
            <div class="stat-top-bar" style="background:#3b82f6"></div>
            <div class="stat-header">
              <span class="stat-label">Total Employees</span>
              <div class="stat-icon" style="background:#eff6ff">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
            </div>
            <div class="stat-value">${employees.length}</div>
            <div class="stat-trend">Active workforce</div>
          </div>

          <div class="stat-card-v2" onclick="navigateTo('live-attendance')">
            <div class="stat-top-bar" style="background:#10b981"></div>
            <div class="stat-header">
              <span class="stat-label">Active Sessions</span>
              <div class="stat-icon" style="background:#f0fdf4">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
            </div>
            <div class="stat-value">${activeSessions}</div>
            <div class="stat-trend" style="color:${activeSessions>0?'#10b981':'var(--text-muted)'}">
              ${activeSessions>0?'<span class="stat-live-dot"></span> Live now':'No active sessions'}
            </div>
          </div>


          <div class="stat-card-v2" onclick="navigateTo('payroll')">
            <div class="stat-top-bar" style="background:#f59e0b"></div>
            <div class="stat-header">
              <span class="stat-label">Hours This Month</span>
              <div class="stat-icon" style="background:#fffbeb">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
            </div>
            <div class="stat-value">${totalHours.toFixed(0)}</div>
            <div class="stat-trend">From approved timesheets</div>
          </div>

          <div class="stat-card-v2" onclick="navigateTo('leave-requests')">
            <div class="stat-top-bar" style="background:#ef4444"></div>
            <div class="stat-header">
              <span class="stat-label">Leave Requests</span>
              <div class="stat-icon" style="background:#fef2f2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
            </div>
            <div class="stat-value" style="color:${leaves.length>0?'#ef4444':'var(--text)'}">${leaves.length}</div>
            <div class="stat-trend">Pending review</div>
          </div>

          <div class="stat-card-v2" onclick="navigateTo('branches')">
            <div class="stat-top-bar" style="background:#6366f1"></div>
            <div class="stat-header">
              <span class="stat-label">Departments</span>
              <div class="stat-icon" style="background:#eef2ff">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              </div>
            </div>
            <div class="stat-value">${depts.length}</div>
            <div class="stat-trend">Across company</div>
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
            <button class="action-chip green" onclick="navigateTo('live-attendance')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Live attendance
            </button>
            <button class="action-chip purple" onclick="showCreateUserModal()">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              Add employee
            </button>
            <button class="action-chip amber" onclick="navigateTo('announcements')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
              Announce
            </button>
            <button class="action-chip slate" onclick="navigateTo('payroll')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              Payroll
            </button>
            <button class="action-chip" style="background:#fdf4ff;color:#9333ea;border-color:#e9d5ff" onclick="navigateTo('shifts')">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Manage shifts
            </button>
          </div>
        </div>

        <!-- Bottom panels + dept chart -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px">

          <!-- Recent sessions -->
          <div class="dashboard-panel">
            <div class="panel-header">
              <span class="panel-title">Recent Sessions</span>
              <span class="panel-link" onclick="navigateTo('sessions')">View all →</span>
            </div>
            ${sessions.length ? sessions.slice(0,6).map(s=>`
              <div class="session-row">
                <div class="session-indicator ${s.active?'live':'ended'}"></div>
                <div class="session-row-info">
                  <div class="session-row-title">${s.title||'Untitled'}</div>
                  <div class="session-row-sub">${s.createdBy?.name||''}</div>
                </div>
                <span class="session-row-time ${s.active?'live':'ended'}">${s.active?'Live':timeAgo(s.startedAt)}</span>
              </div>`).join('') : '<div class="empty-state"><p>No sessions yet</p></div>'}
          </div>

          <!-- Department breakdown -->
          <div class="dashboard-panel">
            <div class="panel-header">
              <span class="panel-title">Team by Department</span>
              <span class="panel-link" onclick="navigateTo('users')">Manage →</span>
            </div>
            ${depts.length ? depts.slice(0,8).map(([dept, count])=>{
              const pct = employees.length ? Math.round((count/employees.length)*100) : 0;
              const colors = ['#3b82f6','#10b981','#6366f1','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#84cc16'];
              const color = colors[depts.indexOf(depts.find(d=>d[0]===dept)) % colors.length];
              return `
              <div style="margin-bottom:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                  <span style="font-size:12px;font-weight:600">${dept}</span>
                  <span style="font-size:11px;color:var(--text-muted)">${count} · ${pct}%</span>
                </div>
                <div style="height:6px;background:var(--border);border-radius:99px;overflow:hidden">
                  <div style="height:100%;width:${pct}%;background:${color};border-radius:99px;transition:width .4s"></div>
                </div>
              </div>`;
            }).join('') : '<div class="empty-state"><p>No department data</p></div>'}
          </div>

          <!-- Team roster -->
          <div class="dashboard-panel">
            <div class="panel-header">
              <span class="panel-title">Team Overview</span>
              <span class="panel-link" onclick="navigateTo('users')">Full roster →</span>
            </div>
            ${employees.length ? employees.slice(0,6).map(u=>`
              <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
                <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:700;flex-shrink:0">${(u.name||'?')[0].toUpperCase()}</div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.name}</div>
                  <div style="font-size:11px;color:var(--text-muted)">${u.department||u.employeeId||u.email||'Employee'}</div>
                </div>
                <span class="status-badge ${u.isActive?'status-active':'status-stopped'}" style="font-size:10px">${u.isActive?'Active':'Inactive'}</span>
              </div>`).join('') : '<div class="empty-state"><p>No employees yet</p></div>'}
          </div>
        </div>
      </div>`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE ATTENDANCE MONITOR (enhanced — overrides app.js version)
// ─────────────────────────────────────────────────────────────────────────────
async function renderLiveAttendance() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading live attendance…</div>';

  const doRender = async () => {
    try {
      const [sessionsData, usersData, shiftsData] = await Promise.all([
        api('/api/attendance-sessions?limit=50').catch(() => ({ sessions: [] })),
        api('/api/users').catch(() => ({ users: [] })),
        api('/api/shifts/assignments').catch(() => ({ assignments: [] })),
      ]);

      const sessions    = sessionsData.sessions || [];
      const employees   = (usersData.users || []).filter(u => u.role === 'employee');
      const assignments = shiftsData.assignments || [];
      const active      = sessions.filter(s => s.active);

      // Get today's shift names per employee
      const today = new Date().toLocaleDateString('en-US',{weekday:'short'}).slice(0,3); // Mon, Tue etc
      const shiftMap = {};
      assignments.forEach(a => {
        if (a.shift?.days?.includes(today)) {
          shiftMap[a.employee?._id?.toString()] = a.shift;
        }
      });

      // Who is clocked in
      const presentIds = new Set();
      active.forEach(s => (s.attendees||[]).forEach(a => {
        presentIds.add((a.user?._id||a.user||'').toString());
      }));

      const present = employees.filter(u => presentIds.has(u._id.toString()));
      const absent  = employees.filter(u => !presentIds.has(u._id.toString()));
      const attRate = employees.length ? Math.round((present.length/employees.length)*100) : 0;

      const badge = (label, color, bg) =>
        `<span style="padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${bg};color:${color}">${label}</span>`;

      const [filterDept, setFilter] = [window._liveFilter||'', v => { window._liveFilter=v; doRender(); }];
      const allDepts = [...new Set(employees.map(u=>u.department||'Unassigned').filter(Boolean))].sort();
      const filtered = filterDept ? employees.filter(u=>(u.department||'Unassigned')===filterDept) : employees;

      content.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:16px">
          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
            <div>
              <h2>Live Attendance</h2>
              <p style="font-size:13px;color:var(--text-muted)">Real-time workforce status · Auto-refreshes every 30s</p>
            </div>
            <div style="display:flex;gap:8px;align-items:center">
              <select onchange="window._liveFilter=this.value;renderLiveAttendance()" style="padding:7px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px">
                <option value="">All Departments</option>
                ${allDepts.map(d=>`<option value="${d}" ${filterDept===d?'selected':''}>${d}</option>`).join('')}
              </select>
              <button class="btn btn-secondary btn-sm" onclick="renderLiveAttendance()">↻ Refresh</button>
            </div>
          </div>

          <!-- Summary pills -->
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px">
            <div class="card" style="text-align:center;padding:14px;border-top:3px solid #10b981">
              <div style="font-size:28px;font-weight:800;color:#10b981">${present.length}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Present</div>
            </div>
            <div class="card" style="text-align:center;padding:14px;border-top:3px solid #ef4444">
              <div style="font-size:28px;font-weight:800;color:#ef4444">${absent.length}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Absent</div>
            </div>
            <div class="card" style="text-align:center;padding:14px;border-top:3px solid #3b82f6">
              <div style="font-size:28px;font-weight:800;color:#3b82f6">${attRate}%</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Rate</div>
            </div>
            <div class="card" style="text-align:center;padding:14px;border-top:3px solid #6366f1">
              <div style="font-size:28px;font-weight:800;color:#6366f1">${active.length}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Sessions</div>
            </div>
            <div class="card" style="text-align:center;padding:14px;border-top:3px solid #f59e0b">
              <div style="font-size:28px;font-weight:800;color:#f59e0b">${employees.length}</div>
              <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Total Staff</div>
            </div>
          </div>

          <!-- Attendance rate bar -->
          <div class="card" style="padding:14px">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:13px;font-weight:700">Attendance Rate Today</span>
              <span style="font-size:13px;font-weight:800;color:${attRate>=80?'#10b981':attRate>=60?'#f59e0b':'#ef4444'}">${attRate}%</span>
            </div>
            <div style="height:10px;background:var(--border);border-radius:99px;overflow:hidden">
              <div style="height:100%;width:${attRate}%;background:${attRate>=80?'#10b981':attRate>=60?'#f59e0b':'#ef4444'};border-radius:99px;transition:width .6s ease"></div>
            </div>
          </div>

          <!-- Employee table -->
          <div class="card" style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="border-bottom:2px solid var(--border)">
                  <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Employee</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Department</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Employee ID</th>
                  <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Today's Shift</th>
                  <th style="padding:8px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Status</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.length ? filtered.map((u,i)=>{
                  const isPresent = presentIds.has(u._id.toString());
                  const shift = shiftMap[u._id.toString()];
                  return `<tr style="border-bottom:1px solid var(--border);background:${i%2===0?'transparent':'var(--bg)'}">
                    <td style="padding:10px 12px">
                      <div style="display:flex;align-items:center;gap:8px">
                        <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,${isPresent?'#10b981,#059669':'#94a3b8,#64748b'});display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700;flex-shrink:0">${(u.name||'?')[0].toUpperCase()}</div>
                        <span style="font-weight:600">${u.name}</span>
                      </div>
                    </td>
                    <td style="padding:10px 12px;color:var(--text-muted)">${u.department||'—'}</td>
                    <td style="padding:10px 12px;font-family:monospace;font-size:12px">${u.employeeId||'—'}</td>
                    <td style="padding:10px 12px;font-size:12px">${shift?`<span style="color:#6366f1;font-weight:600">${shift.name} (${shift.startTime}–${shift.endTime})</span>`:'<span style="color:var(--text-muted)">No shift</span>'}</td>
                    <td style="padding:10px 12px;text-align:center">${isPresent?badge('Present','#fff','#10b981'):badge('Absent','#fff','#ef4444')}</td>
                  </tr>`;
                }).join('') : '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-muted)">No employees found</td></tr>'}
              </tbody>
            </table>
          </div>
          <div style="font-size:11px;color:var(--text-muted);text-align:right">Auto-refreshes every 30s · Last updated: ${new Date().toLocaleTimeString()}</div>
        </div>`;

      clearTimeout(window._liveAttTimer);
      window._liveAttTimer = setTimeout(() => {
        if (currentView === 'live-attendance') doRender();
      }, 30000);
    } catch(e) {
      content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
    }
  };
  await doRender();
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYROLL — role-aware (overrides app.js and pages-corporate.js versions)
//   admin/superadmin → full run management (run, approve, mark-paid, cancel, export)
//   manager          → read-only employee roster
//   employee/others  → own payslips
// ─────────────────────────────────────────────────────────────────────────────
async function renderPayroll() {
  const content = document.getElementById('main-content');
  if (!content) return;
  const role = currentUser?.role;
  if (role === 'admin' || role === 'superadmin') {
    await _renderAdminPayroll(content);
  } else if (role === 'manager') {
    await _renderManagerPayroll(content);
  } else {
    await _renderMyPayroll(content);
  }
}

// ── Admin: full payroll run management ───────────────────────────────────────
async function _renderAdminPayroll(content) {
  content.innerHTML = '<div class="loading">Loading payroll…</div>';
  try {
    const data = await api('/api/payroll');
    const runs = data.runs || [];

    const _sc = { draft:'#6b7280', approved:'#1d4ed8', paid:'#16a34a', cancelled:'#dc2626' };
    const _badge = s => { const c = _sc[s]||'#6b7280'; return `<span style="padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${c}22;color:${c};text-transform:capitalize">${s||'draft'}</span>`; };
    const _fmt   = n => (n != null && !isNaN(n)) ? Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';

    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <h2 style="margin:0;font-size:20px;font-weight:800">Payroll Management</h2>
            <p style="margin:4px 0 0;font-size:13px;color:var(--text-muted)">Run, approve, and manage employee payroll runs</p>
          </div>
          <button class="btn btn-primary" onclick="_showRunPayrollModal()">+ Run Payroll</button>
        </div>

        <div class="card" style="overflow-x:auto">
          ${runs.length ? `
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="border-bottom:2px solid var(--border)">
                  <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Period</th>
                  <th style="padding:10px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Employees</th>
                  <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Gross Pay</th>
                  <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Deductions</th>
                  <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Net Pay</th>
                  <th style="padding:10px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Status</th>
                  <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Run By</th>
                  <th style="padding:10px 12px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${runs.map((r,i) => {
                  const period = `${r.year}-${String(r.month).padStart(2,'0')}`;
                  return `<tr style="border-bottom:1px solid var(--border);background:${i%2===0?'transparent':'var(--bg)'}">
                    <td style="padding:10px 12px;font-weight:700;cursor:pointer;color:var(--primary)" onclick="_viewPayrollRun('${r._id}','${period}')">${period}</td>
                    <td style="padding:10px 8px;text-align:center">${r.employeeCount ?? '—'}</td>
                    <td style="padding:10px 12px;text-align:right">${_fmt(r.totalGross)}</td>
                    <td style="padding:10px 12px;text-align:right;color:var(--danger)">${_fmt(r.totalDeductions)}</td>
                    <td style="padding:10px 12px;text-align:right;font-weight:700;color:var(--primary)">${_fmt(r.totalNet)}</td>
                    <td style="padding:10px 8px;text-align:center">${_badge(r.status)}</td>
                    <td style="padding:10px 12px;font-size:12px;color:var(--text-muted)">${r.runBy?.name||'—'}</td>
                    <td style="padding:8px 12px;text-align:center;white-space:nowrap">
                      ${r.status==='draft'    ? `<button class="btn btn-sm" style="background:#1d4ed8;color:#fff;margin:2px;font-size:11px" onclick="_approvePayrollRun('${r._id}')">Approve</button>` : ''}
                      ${r.status==='approved' ? `<button class="btn btn-sm" style="background:#16a34a;color:#fff;margin:2px;font-size:11px" onclick="_markPayrollPaid('${r._id}')">Mark Paid</button>` : ''}
                      <button class="btn btn-secondary btn-sm" style="margin:2px;font-size:11px" onclick="_downloadRunCSV('${r._id}','${period}')">CSV</button>
                      ${r.status!=='paid'&&r.status!=='cancelled' ? `<button class="btn btn-sm" style="background:#ef4444;color:#fff;margin:2px;font-size:11px" onclick="_cancelPayrollRun('${r._id}')">Cancel</button>` : ''}
                    </td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>
          ` : `
            <div style="padding:48px;text-align:center">
              <div style="font-size:40px;margin-bottom:12px">💰</div>
              <p style="font-size:15px;font-weight:600;color:var(--text);margin:0 0 6px">No payroll runs yet</p>
              <p style="font-size:13px;color:var(--text-muted);margin:0 0 20px">Generate the first payroll run for your team.</p>
              <button class="btn btn-primary" onclick="_showRunPayrollModal()">Run First Payroll</button>
            </div>
          `}
        </div>
      </div>`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger)">Error loading payroll: ${e.message}</p></div>`;
  }
}

function _showRunPayrollModal() {
  document.getElementById('_pr-modal')?.remove();
  const now = new Date();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const ol = document.createElement('div');
  ol.id = '_pr-modal';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px';
  ol.innerHTML = `
    <div style="background:var(--card);border-radius:14px;width:100%;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:15px;font-weight:700;margin:0">Run Payroll</h3>
        <button onclick="document.getElementById('_pr-modal').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer;font-size:14px">✕</button>
      </div>
      <div style="padding:20px;display:flex;flex-direction:column;gap:14px">
        <p style="font-size:13px;color:var(--text-muted);margin:0">Computes attendance, overtime and leave deductions for all employees in the selected period and creates a draft payroll run.</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:5px">Year</label>
            <input id="_pr-year" type="number" min="2020" max="2099" value="${now.getFullYear()}" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;box-sizing:border-box">
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:5px">Month</label>
            <select id="_pr-month" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none;background:var(--card)">
              ${months.map((m,i)=>`<option value="${i+1}"${i===now.getMonth()?' selected':''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--text-muted);display:block;margin-bottom:5px">Notes (optional)</label>
          <textarea id="_pr-notes" rows="2" placeholder="e.g. Includes Q1 bonus…" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none;box-sizing:border-box"></textarea>
        </div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('_pr-modal').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" id="_pr-submit" onclick="_submitRunPayroll()">Run Payroll</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
}

async function _submitRunPayroll() {
  const year  = parseInt(document.getElementById('_pr-year')?.value);
  const month = parseInt(document.getElementById('_pr-month')?.value);
  const notes = document.getElementById('_pr-notes')?.value.trim() || '';
  const btn   = document.getElementById('_pr-submit');
  if (!year || !month) return toastError('Year and month are required');
  if (btn) { btn.disabled = true; btn.textContent = 'Running…'; }
  try {
    const data = await api('/api/payroll/run', { method: 'POST', body: JSON.stringify({ year, month, notes }) });
    document.getElementById('_pr-modal')?.remove();
    toastSuccess(`Payroll ${year}-${String(month).padStart(2,'0')} created — ${data.employeeCount ?? 0} payslips generated`);
    _renderAdminPayroll(document.getElementById('main-content'));
  } catch(e) {
    if (btn) { btn.disabled = false; btn.textContent = 'Run Payroll'; }
    toastError(e.message || 'Failed to run payroll');
  }
}

async function _approvePayrollRun(runId) {
  if (!confirm('Approve this payroll run? All payslips will be marked as approved.')) return;
  try {
    await api(`/api/payroll/${runId}/approve`, { method: 'PATCH' });
    toastSuccess('Payroll run approved');
    _renderAdminPayroll(document.getElementById('main-content'));
  } catch(e) { toastError(e.message || 'Failed to approve'); }
}

async function _markPayrollPaid(runId) {
  if (!confirm('Mark this payroll as paid? This confirms payment has been disbursed.')) return;
  try {
    await api(`/api/payroll/${runId}/mark-paid`, { method: 'PATCH' });
    toastSuccess('Payroll marked as paid');
    _renderAdminPayroll(document.getElementById('main-content'));
  } catch(e) { toastError(e.message || 'Failed to mark as paid'); }
}

async function _cancelPayrollRun(runId) {
  if (!confirm('Cancel this payroll run? This cannot be undone.')) return;
  try {
    await api(`/api/payroll/${runId}/cancel`, { method: 'PATCH' });
    toastSuccess('Payroll run cancelled');
    _renderAdminPayroll(document.getElementById('main-content'));
  } catch(e) { toastError(e.message || 'Failed to cancel'); }
}

function _downloadRunCSV(runId, period) {
  const tk = localStorage.getItem('kodex_token') || localStorage.getItem('token') || '';
  window.open(`/api/payroll/${runId}/export?token=${tk}`, '_blank');
  toastSuccess(`Downloading payroll CSV for ${period}…`);
}

async function _viewPayrollRun(runId, period) {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading payroll run…</div>';
  try {
    const data  = await api(`/api/payroll/${runId}`);
    const run   = data.run;
    const slips = data.slips || [];

    const _sc = { draft:'#6b7280', approved:'#1d4ed8', paid:'#16a34a', cancelled:'#dc2626' };
    const _badge = s => { const c = _sc[s]||'#6b7280'; return `<span style="padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${c}22;color:${c};text-transform:capitalize">${s||'draft'}</span>`; };
    const _fmt   = n => (n != null && !isNaN(n)) ? Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';

    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" onclick="_renderAdminPayroll(document.getElementById('main-content'))">← Back</button>
          <h2 style="margin:0;font-size:18px;font-weight:800">Payroll Run — ${period}</h2>
          ${_badge(run.status)}
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
          <div class="card" style="text-align:center;padding:14px;border-top:3px solid #3b82f6">
            <div style="font-size:22px;font-weight:800;color:#3b82f6">${run.employeeCount ?? slips.length}</div>
            <div style="font-size:11px;color:var(--text-muted)">Employees</div>
          </div>
          <div class="card" style="text-align:center;padding:14px;border-top:3px solid #10b981">
            <div style="font-size:22px;font-weight:800;color:#10b981">${_fmt(run.totalGross)}</div>
            <div style="font-size:11px;color:var(--text-muted)">Gross Pay</div>
          </div>
          <div class="card" style="text-align:center;padding:14px;border-top:3px solid #ef4444">
            <div style="font-size:22px;font-weight:800;color:#ef4444">${_fmt(run.totalDeductions)}</div>
            <div style="font-size:11px;color:var(--text-muted)">Deductions</div>
          </div>
          <div class="card" style="text-align:center;padding:14px;border-top:3px solid #6366f1">
            <div style="font-size:22px;font-weight:800;color:#6366f1">${_fmt(run.totalNet)}</div>
            <div style="font-size:11px;color:var(--text-muted)">Net Pay</div>
          </div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${run.status==='draft'    ? `<button class="btn btn-primary btn-sm" onclick="_approvePayrollRun('${runId}')">✓ Approve Run</button>` : ''}
          ${run.status==='approved' ? `<button class="btn btn-sm" style="background:#16a34a;color:#fff" onclick="_markPayrollPaid('${runId}')">Mark Paid</button>` : ''}
          <button class="btn btn-secondary btn-sm" onclick="_downloadRunCSV('${runId}','${period}')">⬇ Export CSV</button>
          ${run.status!=='paid'&&run.status!=='cancelled' ? `<button class="btn btn-sm" style="background:#ef4444;color:#fff" onclick="_cancelPayrollRun('${runId}')">Cancel Run</button>` : ''}
        </div>

        <div class="card" style="overflow-x:auto">
          <div style="font-size:13px;font-weight:700;margin-bottom:12px">Individual Payslips (${slips.length})</div>
          ${slips.length ? `
            <table style="width:100%;border-collapse:collapse;font-size:12px">
              <thead>
                <tr style="border-bottom:2px solid var(--border)">
                  <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Employee</th>
                  <th style="padding:8px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Days Present</th>
                  <th style="padding:8px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Hrs Worked</th>
                  <th style="padding:8px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted)">OT Hrs</th>
                  <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Base Pay</th>
                  <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Gross</th>
                  <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Deductions</th>
                  <th style="padding:8px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Net Pay</th>
                  <th style="padding:8px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Status</th>
                </tr>
              </thead>
              <tbody>
                ${slips.map((s,i) => `
                  <tr style="border-bottom:1px solid var(--border);background:${i%2===0?'transparent':'var(--bg)'}">
                    <td style="padding:9px 12px">
                      <div style="font-weight:600">${s.employee?.name||'—'}</div>
                      <div style="font-size:11px;color:var(--text-muted)">${s.employee?.employeeId||s.employee?.email||''}</div>
                    </td>
                    <td style="padding:9px 8px;text-align:center">${s.daysPresent??'—'}</td>
                    <td style="padding:9px 8px;text-align:center">${s.hoursWorked??'—'}</td>
                    <td style="padding:9px 8px;text-align:center">${s.overtimeHours??'—'}</td>
                    <td style="padding:9px 12px;text-align:right">${_fmt(s.basePay)}</td>
                    <td style="padding:9px 12px;text-align:right;font-weight:600">${_fmt(s.grossPay)}</td>
                    <td style="padding:9px 12px;text-align:right;color:var(--danger)">${_fmt(s.totalDeductions)}</td>
                    <td style="padding:9px 12px;text-align:right;font-weight:700;color:var(--primary)">${_fmt(s.netPay)}</td>
                    <td style="padding:9px 8px;text-align:center">${_badge(s.status)}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          ` : '<div class="empty-state"><p>No payslips in this run</p></div>'}
        </div>
      </div>`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger)">Error: ${e.message}</p><button class="btn btn-secondary btn-sm" style="margin-top:12px" onclick="_renderAdminPayroll(document.getElementById('main-content'))">← Back</button></div>`;
  }
}

// ── Manager: read-only employee roster ───────────────────────────────────────
async function _renderManagerPayroll(content) {
  content.innerHTML = '<div class="loading">Loading payroll…</div>';
  try {
    const now    = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const [usersData, leavesData, analyticsData] = await Promise.all([
      api('/api/users').catch(() => ({ users: [] })),
      api('/api/leaves?status=approved').catch(() => ({ leaves: [] })),
      api('/api/advanced/analytics').catch(() => null),
    ]);

    const employees = (usersData.users || []).filter(u => u.role === 'employee' || u.role === 'manager');
    const leaves    = leavesData.leaves || [];
    const tsHours   = analyticsData?.timesheets?.totalHours || 0;

    const leaveMap = {};
    leaves.forEach(l => {
      const eid = l.employee?._id?.toString();
      if (!eid) return;
      const start = new Date(l.startDate);
      if (start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth())
        leaveMap[eid] = (leaveMap[eid]||0) + (l.days||0);
    });

    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px">
        <div>
          <h2 style="margin:0">Payroll Summary</h2>
          <p style="font-size:13px;color:var(--text-muted);margin:4px 0 0">Period: <strong>${period}</strong> · Read-only view</p>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px">
          <div class="card" style="text-align:center;padding:14px;border-top:3px solid #3b82f6">
            <div style="font-size:24px;font-weight:800;color:#3b82f6">${employees.length}</div>
            <div style="font-size:11px;color:var(--text-muted)">Employees</div>
          </div>
          <div class="card" style="text-align:center;padding:14px;border-top:3px solid #10b981">
            <div style="font-size:24px;font-weight:800;color:#10b981">${tsHours.toFixed(0)}h</div>
            <div style="font-size:11px;color:var(--text-muted)">Total Hours Logged</div>
          </div>
          <div class="card" style="text-align:center;padding:14px;border-top:3px solid #f59e0b">
            <div style="font-size:24px;font-weight:800;color:#f59e0b">${Object.values(leaveMap).reduce((s,v)=>s+v,0)}</div>
            <div style="font-size:11px;color:var(--text-muted)">Leave Days Used</div>
          </div>
        </div>

        <div class="card" style="overflow-x:auto">
          <div style="font-size:13px;font-weight:700;margin-bottom:12px">Employee Roster — ${period}</div>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="border-bottom:2px solid var(--border)">
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Employee</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Department</th>
                <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Employee ID</th>
                <th style="padding:8px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Leave Days</th>
                <th style="padding:8px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Status</th>
              </tr>
            </thead>
            <tbody>
              ${employees.length ? employees.map((emp,i) => {
                const leaveDays  = leaveMap[emp._id?.toString()] || 0;
                const statusColor = emp.isActive ? '#10b981' : '#ef4444';
                return `<tr style="border-bottom:1px solid var(--border);background:${i%2===0?'transparent':'var(--bg)'}">
                  <td style="padding:10px 12px">
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700">${(emp.name||'?')[0].toUpperCase()}</div>
                      <span style="font-weight:600">${emp.name}</span>
                    </div>
                  </td>
                  <td style="padding:10px 12px;color:var(--text-muted)">${emp.department||'—'}</td>
                  <td style="padding:10px 12px;font-family:monospace;font-size:12px">${emp.employeeId||'—'}</td>
                  <td style="padding:10px 8px;text-align:center;font-weight:${leaveDays>0?'700':'400'};color:${leaveDays>0?'#f59e0b':'var(--text-muted)'}">${leaveDays||'—'}</td>
                  <td style="padding:10px 8px;text-align:center">
                    <span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${statusColor}22;color:${statusColor}">${emp.isActive?'Active':'Inactive'}</span>
                  </td>
                </tr>`;
              }).join('') : '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-muted)">No employees found</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger)">Error: ${e.message}</p></div>`;
  }
}

// ── Employee/others: own payslips ─────────────────────────────────────────────
async function _renderMyPayroll(content) {
  content.innerHTML = '<div class="loading">Loading payroll…</div>';
  try {
    const data    = await api('/api/payroll/my');
    const slips   = data.slips || [];
    const _sc = { draft:'#6b7280', approved:'#1d4ed8', paid:'#16a34a', cancelled:'#dc2626' };
    const _badge = s => { const c = _sc[s]||'#6b7280'; return `<span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${c}22;color:${c};text-transform:capitalize">${s||'draft'}</span>`; };
    const _fmt   = n => (n != null && !isNaN(n)) ? Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';

    content.innerHTML = `
      <div class="page-header">
        <h2>My Payroll</h2>
        <p>Your payslip history</p>
      </div>
      <div class="card" style="overflow-x:auto">
        ${slips.length ? `
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="border-bottom:2px solid var(--border)">
                <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Period</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Gross Pay</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Deductions</th>
                <th style="padding:10px 12px;text-align:right;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Net Pay</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Hrs Worked</th>
                <th style="padding:10px 8px;text-align:center;font-size:11px;text-transform:uppercase;color:var(--text-muted)">Status</th>
              </tr>
            </thead>
            <tbody>
              ${slips.map((s,i) => {
                const period = s.payrollRun ? `${s.payrollRun.year}-${String(s.payrollRun.month).padStart(2,'0')}` : (s.year ? `${s.year}-${String(s.month).padStart(2,'0')}` : '—');
                return `<tr style="border-bottom:1px solid var(--border);background:${i%2===0?'transparent':'var(--bg)'}">
                  <td style="padding:10px 12px;font-weight:700">${period}</td>
                  <td style="padding:10px 12px;text-align:right">${_fmt(s.grossPay)}</td>
                  <td style="padding:10px 12px;text-align:right;color:var(--danger)">${_fmt(s.totalDeductions)}</td>
                  <td style="padding:10px 12px;text-align:right;font-weight:700;color:var(--primary)">${_fmt(s.netPay)}</td>
                  <td style="padding:10px 8px;text-align:center">${s.hoursWorked??'—'}</td>
                  <td style="padding:10px 8px;text-align:center">${_badge(s.status)}</td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        ` : '<div class="empty-state" style="padding:40px;text-align:center"><p>No payslips yet. Payslips appear after your admin runs payroll.</p></div>'}
      </div>`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:var(--danger)">Error: ${e.message}</p></div>`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BRANCHES (enhanced — overrides app.js version)
// ─────────────────────────────────────────────────────────────────────────────
async function renderBranches() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading branches…</div>';
  try {
    const [branchData, usersData] = await Promise.all([
      api('/api/advanced/branches'),
      api('/api/users').catch(() => ({ users: [] })),
    ]);
    const branches  = branchData.branches || [];
    const users     = usersData.users || [];
    const managers  = users.filter(u => u.role === 'manager' || u.role === 'admin');
    const canEdit   = ['admin','superadmin'].includes(currentUser.role);

    // Stats
    const totalStaff = branches.reduce((s,b) => s + (b.headcount||0), 0);

    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div>
            <h2>Branches & Locations</h2>
            <p style="font-size:13px;color:var(--text-muted)">${branches.length} branch${branches.length!==1?'es':''} · ${totalStaff} total staff</p>
          </div>
          ${canEdit ? `<button class="btn btn-primary btn-sm" onclick="showCreateBranchModal()">+ Add Branch</button>` : ''}
        </div>

        ${branches.length ? `
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">
            ${branches.map(b => `
              <div class="card" style="position:relative;border-top:3px solid #6366f1">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px">
                  <div>
                    <div style="font-size:16px;font-weight:700">${b.name}</div>
                    ${b.code ? `<div style="font-size:11px;font-family:monospace;color:#6366f1;font-weight:700;margin-top:2px">${b.code}</div>` : ''}
                  </div>
                  <span style="padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;background:${b.isActive?'#f0fdf4':'#f1f5f9'};color:${b.isActive?'#15803d':'#64748b'}">${b.isActive?'Active':'Inactive'}</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:12px">
                  ${(b.city||b.country) ? `<div style="font-size:12px;color:var(--text-muted)">📍 ${[b.city,b.country].filter(Boolean).join(', ')}</div>` : ''}
                  ${b.phone ? `<div style="font-size:12px;color:var(--text-muted)">📞 ${b.phone}</div>` : ''}
                  ${b.manager ? `<div style="font-size:12px;color:var(--text-muted)">👤 ${b.manager.name||'—'}</div>` : '<div style="font-size:12px;color:var(--text-muted)">👤 No manager assigned</div>'}
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between">
                  <div style="font-size:13px;font-weight:700;color:#6366f1">👥 ${b.headcount||0} staff</div>
                  ${canEdit ? `<div style="display:flex;gap:6px">
                    <button class="btn btn-sm btn-secondary" style="font-size:11px" onclick="showEditBranchModal('${b._id}','${esc(b.name)}','${b.code||''}','${b.city||''}','${b.country||''}','${b.phone||''}','${b.manager?._id||''}')">✏️ Edit</button>
                  </div>` : ''}
                </div>
              </div>`).join('')}
          </div>
        ` : '<div class="card"><div class="empty-state"><p>No branches yet. Add your first branch to get started.</p></div></div>'}
      </div>`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
  }
}

function showCreateBranchModal() {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:480px">
        <h3>Add Branch</h3>
        <div class="form-group"><label>Branch Name <span style="color:red">*</span></label><input type="text" id="branch-name" placeholder="e.g. Accra Head Office"></div>
        <div class="form-group"><label>Branch Code <span style="font-size:11px;color:var(--text-muted)">(optional)</span></label><input type="text" id="branch-code" placeholder="e.g. ACC01" style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group"><label>City</label><input type="text" id="branch-city" placeholder="Accra"></div>
          <div class="form-group"><label>Country</label><input type="text" id="branch-country" placeholder="Ghana"></div>
        </div>
        <div class="form-group"><label>Phone <span style="font-size:11px;color:var(--text-muted)">(optional)</span></label><input type="tel" id="branch-phone" placeholder="e.g. 0201234567"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="saveBranch()">Create Branch</button>
        </div>
      </div>
    </div>`;
}

async function saveBranch() {
  const name    = document.getElementById('branch-name').value.trim();
  const code    = document.getElementById('branch-code').value.trim().toUpperCase();
  const city    = document.getElementById('branch-city').value.trim();
  const country = document.getElementById('branch-country').value.trim();
  const phone   = document.getElementById('branch-phone').value.trim();
  if (!name) { toastWarning('Branch name is required'); return; }
  try {
    await api('/api/advanced/branches', { method:'POST', body: JSON.stringify({ name, code, city, country, phone }) });
    closeModal();
    toastSuccess('Branch created ✓');
    renderBranches();
  } catch(e) { toastError(e.message); }
}

function showEditBranchModal(id, name, code, city, country, phone, managerId) {
  const container = document.getElementById('modal-container');
  container.classList.remove('hidden');
  container.innerHTML = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()" style="max-width:480px">
        <h3>Edit Branch</h3>
        <div class="form-group"><label>Branch Name <span style="color:red">*</span></label><input type="text" id="edit-branch-name" value="${name}"></div>
        <div class="form-group"><label>Branch Code</label><input type="text" id="edit-branch-code" value="${code}" style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="form-group"><label>City</label><input type="text" id="edit-branch-city" value="${city}"></div>
          <div class="form-group"><label>Country</label><input type="text" id="edit-branch-country" value="${country}"></div>
        </div>
        <div class="form-group"><label>Phone</label><input type="tel" id="edit-branch-phone" value="${phone}"></div>
        <div class="modal-actions">
          <button class="btn btn-secondary btn-sm" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary btn-sm" onclick="updateBranch('${id}')">Save Changes</button>
          <button class="btn btn-danger btn-sm" onclick="deleteBranch('${id}','${name}')">Remove Branch</button>
        </div>
      </div>
    </div>`;
}

async function updateBranch(id) {
  const name    = document.getElementById('edit-branch-name').value.trim();
  const code    = document.getElementById('edit-branch-code').value.trim().toUpperCase();
  const city    = document.getElementById('edit-branch-city').value.trim();
  const country = document.getElementById('edit-branch-country').value.trim();
  const phone   = document.getElementById('edit-branch-phone').value.trim();
  if (!name) { toastWarning('Branch name is required'); return; }
  try {
    await api(`/api/advanced/branches/${id}`, { method:'PATCH', body: JSON.stringify({ name, code, city, country, phone }) });
    closeModal();
    toastSuccess('Branch updated ✓');
    renderBranches();
  } catch(e) { toastError(e.message); }
}

async function deleteBranch(id, name) {
  toastConfirm(`Remove "${name}"? Employees assigned here will be unlinked.`, async () => {
    try {
      await api(`/api/advanced/branches/${id}`, { method:'DELETE' });
      toastSuccess('Branch removed');
      renderBranches();
    } catch(e) { toastError(e.message); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERRIDE buildSidebar for manager to fix duplicate dashboard & add all items
// ─────────────────────────────────────────────────────────────────────────────
const _origBuildSidebarManager = buildSidebar;
buildSidebar = function() {
  // ✅ FIX: Check both role and mode before applying manager sidebar
  const role = currentUser?.role;
  const mode = currentUser?.company?.mode;
  
  if (role !== 'manager' || mode !== 'corporate') {
    return _origBuildSidebarManager();
  }

  // Manager-specific sidebar for corporate mode
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  
  const links = [
    { id: 'dashboard',       label: 'Dashboard',      icon: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>' },
    { id: 'live-attendance', label: 'Live Attendance', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
    { id: 'approvals',       label: 'Approvals',       icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
    { id: 'users',           label: 'Team',            icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
    { id: 'shifts',          label: 'Shifts',          icon: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
    { id: 'leave-requests',  label: 'Leave',           icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
    { id: 'timesheets',      label: 'Timesheets',      icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/>' },
    { id: 'expenses-mgr',    label: 'Expenses',        icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' },
    { id: 'performance',     label: 'Performance',     icon: '<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>' },
    { id: 'payroll',         label: 'Payroll',         icon: '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>' },
    { id: 'branches',        label: 'Branches',        icon: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
    { id: 'meetings',        label: 'Meetings',        icon: '<path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2"/>' },
    { id: 'announcements',   label: 'Announcements',   icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>' },
    { id: 'reports',         label: 'Reports',         icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' },
    { id: 'my-profile',      label: 'My Profile',      icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' },
  ];

  nav.innerHTML = links.map(l => `
    <a id="nav-${l.id}" onclick="navigateTo('${l.id}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${l.icon}</svg>
      <span>${l.label}</span>
    </a>`).join('');
};

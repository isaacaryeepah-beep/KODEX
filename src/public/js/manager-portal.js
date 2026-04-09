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
// PAYROLL (enhanced — overrides app.js version)
// ─────────────────────────────────────────────────────────────────────────────
async function renderPayroll() {
  const content = document.getElementById('main-content');
  if (!content) return;
  content.innerHTML = '<div class="loading">Loading payroll…</div>';
  try {
    const now    = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const [usersData, exportData, leavesData] = await Promise.all([
      api('/api/users').catch(() => ({ users: [] })),
      api(`/api/advanced/payroll-export?period=${period}`).catch(() => null),
      api('/api/leaves?status=approved').catch(() => ({ leaves: [] })),
    ]);

    const employees = (usersData.users || []).filter(u => u.role === 'employee' || u.role === 'manager');
    const leaves    = leavesData.leaves || [];
    const STANDARD  = 160;

    // Build payroll rows from employees + any timesheet data from export
    // The payroll-export endpoint returns CSV — we need the analytics endpoint instead
    const analyticsData = await api('/api/advanced/analytics').catch(() => null);
    const tsHours = analyticsData?.timesheets?.totalHours || 0;

    // Leave days per employee this month
    const leaveMap = {};
    leaves.forEach(l => {
      const eid = l.employee?._id?.toString();
      if (!eid) return;
      const start = new Date(l.startDate);
      const isThisMonth = start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth();
      if (isThisMonth) leaveMap[eid] = (leaveMap[eid]||0) + (l.days||0);
    });

    const rows = employees.map(emp => {
      // Without individual timesheet data in this view, show structure
      const leaveDays = leaveMap[emp._id.toString()] || 0;
      return { emp, leaveDays };
    });

    const exportCSV = () => {
      const csvRows = [['Name','Employee ID','Department','Leave Days (Month)','Status']];
      rows.forEach(r => csvRows.push([r.emp.name, r.emp.employeeId||'', r.emp.department||'', r.leaveDays, r.emp.isActive?'Active':'Inactive']));
      const blob = new Blob([csvRows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n')], {type:'text/csv'});
      const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`payroll_${period}.csv`; a.click();
    };
    window._exportPayrollCSV = exportCSV;

    const exportFull = () => {
      window.open(`/api/advanced/payroll-export?period=${period}`, '_blank');
    };
    window._exportPayrollFull = exportFull;

    content.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:16px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div>
            <h2>Payroll Summary</h2>
            <p style="font-size:13px;color:var(--text-muted)">Period: <strong>${period}</strong></p>
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-secondary btn-sm" onclick="window._exportPayrollCSV()">⬇ Export CSV</button>
            <button class="btn btn-primary btn-sm" onclick="window._exportPayrollFull()">⬇ Full Payroll Export</button>
          </div>
        </div>

        <!-- Summary cards -->
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
          <div class="card" style="text-align:center;padding:14px;border-top:3px solid #6366f1">
            <div style="font-size:24px;font-weight:800;color:#6366f1">${STANDARD}h</div>
            <div style="font-size:11px;color:var(--text-muted)">Standard Hours/Month</div>
          </div>
        </div>

        <!-- Note about full payroll -->
        <div class="card" style="background:#f0fdf4;border:1px solid #bbf7d0;padding:14px">
          <div style="font-size:13px;color:#15803d;font-weight:600">💡 Full Payroll Export</div>
          <div style="font-size:12px;color:#166534;margin-top:4px">
            Click "Full Payroll Export" to download a complete CSV with approved timesheet hours, overtime calculations, and expense reimbursements for ${period}.
            Only employees with <strong>approved timesheets</strong> appear in the full export.
          </div>
        </div>

        <!-- Employee table -->
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
              ${rows.length ? rows.map((r,i)=>{
                const statusColor = r.emp.isActive ? '#10b981' : '#ef4444';
                return `<tr style="border-bottom:1px solid var(--border);background:${i%2===0?'transparent':'var(--bg)'}">
                  <td style="padding:10px 12px">
                    <div style="display:flex;align-items:center;gap:8px">
                      <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px;font-weight:700">${(r.emp.name||'?')[0].toUpperCase()}</div>
                      <span style="font-weight:600">${r.emp.name}</span>
                    </div>
                  </td>
                  <td style="padding:10px 12px;color:var(--text-muted)">${r.emp.department||'—'}</td>
                  <td style="padding:10px 12px;font-family:monospace;font-size:12px">${r.emp.employeeId||'—'}</td>
                  <td style="padding:10px 8px;text-align:center;font-weight:${r.leaveDays>0?'700':'400'};color:${r.leaveDays>0?'#f59e0b':'var(--text-muted)'}">${r.leaveDays||'—'}</td>
                  <td style="padding:10px 8px;text-align:center">
                    <span style="padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;background:${statusColor}22;color:${statusColor}">${r.emp.isActive?'Active':'Inactive'}</span>
                  </td>
                </tr>`;
              }).join('') : '<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--text-muted)">No employees found</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch(e) {
    content.innerHTML = `<div class="card"><p style="color:#ef4444">Error: ${e.message}</p></div>`;
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
    { id: 'users',           label: 'Team',            icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
    { id: 'sessions',        label: 'Sessions',        icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
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
    <a class="nav-link" data-view="${l.id}" onclick="navigateTo('${l.id}')">
      <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${l.icon}</svg>
      <span>${l.label}</span>
    </a>`).join('');
};

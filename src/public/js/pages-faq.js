"use strict";
/**
 * pages-faq.js
 * Requires: app.js globals — api(), currentUser, toastError(), toastSuccess(), svgIcon()
 * Provides: renderFAQCenter(), renderSupport()
 */

// ════════════════════════════════════════════════════════════════════════════
// FAQ CENTER  (all roles)
// ════════════════════════════════════════════════════════════════════════════

async function renderFAQCenter() {
  const content = document.getElementById('main-content');
  if (!content) return;

  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'superadmin';

  content.innerHTML = `
    <div class="page-header">
      <h2>FAQ Center</h2>
      <p>Ask questions, browse answers, get instant AI help</p>
    </div>

    ${isAdmin ? `<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="navigateTo('faq-admin-stats')">
        ${svgIcon('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',14)} Admin Dashboard
      </button>
      <a href="/faq-admin.html" target="_blank" class="btn btn-secondary btn-sm">Open Full Admin Panel ↗</a>
    </div>` : ''}

    <div class="card" style="margin-bottom:16px">
      <div class="card-title">Ask a Question</div>
      <div style="display:flex;gap:8px">
        <input id="faq-ask-input" type="text" placeholder="e.g. How do I mark attendance?" style="flex:1;padding:10px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:14px;font-family:inherit;outline:none" onkeydown="if(event.key==='Enter')faqAsk()">
        <button class="btn btn-primary" onclick="faqAsk()" id="faq-ask-btn" style="white-space:nowrap">Ask AI</button>
      </div>
      <div id="faq-answer-area" style="margin-top:14px;display:none"></div>
    </div>

    <div class="card">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px">
        <div class="card-title" style="margin:0">Knowledge Base</div>
        <div style="display:flex;gap:8px;align-items:center">
          <select id="faq-cat-filter" onchange="loadFAQList()" style="padding:6px 10px;border:1.5px solid var(--border);border-radius:7px;font-size:12px;font-family:inherit;outline:none">
            <option value="">All categories</option>
            <option value="attendance">Attendance</option>
            <option value="snapquiz">SnapQuiz</option>
            <option value="assignments">Assignments</option>
            <option value="billing">Billing</option>
            <option value="hr">HR</option>
            <option value="meetings">Meetings</option>
            <option value="gps_attendance">GPS Attendance</option>
            <option value="password_reset">Password Reset</option>
            <option value="general">General</option>
          </select>
        </div>
      </div>
      <div id="faq-list-area"><div class="loading" style="padding:20px;text-align:center;font-size:13px">Loading…</div></div>
    </div>`;

  loadFAQList();
}

async function loadFAQList() {
  const area = document.getElementById('faq-list-area');
  if (!area) return;
  const cat = document.getElementById('faq-cat-filter')?.value || '';
  try {
    const params = cat ? `?category=${cat}` : '';
    const data = await api(`/api/faq${params}`);
    const faqs = data.faqs || data.items || [];
    if (!faqs.length) {
      area.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted);font-size:13px">No FAQs found for this category.</div>';
      return;
    }
    area.innerHTML = faqs.map(f => `
      <details style="border:1px solid var(--border);border-radius:9px;margin-bottom:8px;overflow:hidden">
        <summary style="padding:12px 16px;font-size:14px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:space-between;list-style:none;gap:10px">
          <span>${f.question}</span>
          <span style="font-size:10px;background:var(--primary-ultra-light);color:var(--primary);padding:2px 8px;border-radius:20px;white-space:nowrap;flex-shrink:0">${f.category || 'general'}</span>
        </summary>
        <div style="padding:0 16px 14px;font-size:13px;color:var(--text-secondary);line-height:1.6;border-top:1px solid var(--border-light)">${f.answer}</div>
      </details>`).join('');
  } catch(e) {
    area.innerHTML = `<div style="color:var(--danger);padding:12px;font-size:13px">Error: ${e.message}</div>`;
  }
}

let _faqLastQueryId = null;

async function faqAsk() {
  const input = document.getElementById('faq-ask-input');
  const btn   = document.getElementById('faq-ask-btn');
  const area  = document.getElementById('faq-answer-area');
  const q = input?.value.trim();
  if (!q) return;
  if (!area || !btn) return;

  btn.disabled = true;
  btn.textContent = 'Thinking…';
  area.style.display = 'block';
  area.innerHTML = '<div style="color:var(--text-muted);font-size:13px">Searching knowledge base…</div>';

  try {
    const data = await api('/api/faq/ask', {
      method: 'POST',
      body: JSON.stringify({ question: q }),
    });
    _faqLastQueryId = data.queryId;
    const sourceBadge = data.source === 'faq'
      ? '<span style="background:#dcfce7;color:#166534;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:8px">FROM FAQ</span>'
      : '<span style="background:#ede9fe;color:#5b21b6;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px;margin-left:8px">AI ANSWER</span>';

    area.innerHTML = `
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px 16px">
        <div style="font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:6px;display:flex;align-items:center">Answer ${sourceBadge}</div>
        <div style="font-size:14px;line-height:1.6;color:var(--text)">${data.answer || 'No answer found.'}</div>
        ${data.confidenceLow ? `<div style="margin-top:12px;padding:10px 12px;background:#fef9c3;border:1px solid #fde047;border-radius:8px;font-size:12px;color:#713f12">
          Not fully satisfied? <button class="btn btn-sm" onclick="faqEscalate()" style="margin-left:8px;font-size:11px;padding:3px 10px;background:#d97706;color:#fff;border:none">Escalate to Helpdesk</button>
        </div>` : ''}
        ${data.queryId ? `<div style="margin-top:10px;display:flex;gap:8px;align-items:center">
          <span style="font-size:11px;color:var(--text-muted)">Was this helpful?</span>
          <button onclick="faqRate(true)" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 10px;cursor:pointer;font-size:13px" title="Helpful">👍</button>
          <button onclick="faqRate(false)" style="background:none;border:1px solid var(--border);border-radius:6px;padding:3px 10px;cursor:pointer;font-size:13px" title="Not helpful">👎</button>
        </div>` : ''}
      </div>`;
  } catch(e) {
    area.innerHTML = `<div style="color:var(--danger);font-size:13px">Error: ${e.message}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ask AI';
  }
}

async function faqRate(helpful) {
  if (!_faqLastQueryId) return;
  try {
    await api(`/api/faq/rate/${_faqLastQueryId}`, { method: 'PATCH', body: JSON.stringify({ helpful }) });
    toastSuccess(helpful ? 'Thanks for the feedback!' : 'Noted — we\'ll improve this.');
  } catch(_) {}
}

async function faqEscalate() {
  if (!_faqLastQueryId) return;
  try {
    const data = await api(`/api/faq/escalate/${_faqLastQueryId}`, { method: 'POST' });
    toastSuccess('Escalated to helpdesk. Ticket #' + (data.ticket?.ticketNumber || ''));
    document.querySelector('[onclick="faqEscalate()"]')?.closest('div')?.remove();
  } catch(e) {
    toastError(e.message || 'Escalation failed');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SUPPORT / HELPDESK  (all roles)
// ════════════════════════════════════════════════════════════════════════════

async function renderSupport() {
  const content = document.getElementById('main-content');
  if (!content) return;

  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'superadmin' || currentUser.role === 'manager';

  content.innerHTML = `
    <div class="page-header">
      <h2>Support & Helpdesk</h2>
      <p>Submit and track support tickets</p>
    </div>
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="showNewTicketModal()">+ New Ticket</button>
    </div>
    <div id="support-tickets-area"><div class="loading" style="padding:20px;text-align:center;font-size:13px">Loading tickets…</div></div>`;

  loadSupportTickets();
}

async function loadSupportTickets() {
  const area = document.getElementById('support-tickets-area');
  if (!area) return;
  try {
    const data = await api('/api/support');
    const tickets = data.tickets || [];
    const statusColors = { open:'#2563eb', in_progress:'#d97706', resolved:'#16a34a', closed:'#6b7280' };
    area.innerHTML = tickets.length ? `
      <div class="card" style="overflow-x:auto">
        <table><thead><tr><th>#</th><th>Title</th><th>Status</th><th>Priority</th><th>Created</th></tr></thead>
        <tbody>${tickets.map(t => {
          const sc = statusColors[t.status] || 'var(--text-light)';
          return `<tr>
            <td style="font-size:12px;color:var(--text-muted)">#${t.ticketNumber || t._id?.slice(-6)}</td>
            <td style="font-weight:600;font-size:13px">${t.title || t.subject || 'Untitled'}</td>
            <td><span style="background:${sc}20;color:${sc};border:1px solid ${sc}40;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;text-transform:capitalize">${t.status}</span></td>
            <td style="font-size:12px;text-transform:capitalize">${t.priority || '—'}</td>
            <td style="font-size:12px;color:var(--text-muted)">${t.createdAt ? new Date(t.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : '—'}</td>
          </tr>`;
        }).join('')}</tbody></table>
      </div>` : '<div class="card"><div class="empty-state"><p>No support tickets yet. Click <strong>+ New Ticket</strong> to submit one.</p></div></div>';
  } catch(e) {
    area.innerHTML = `<div class="card"><p style="color:var(--danger);font-size:13px">Error: ${e.message}</p></div>`;
  }
}

async function showNewTicketModal() {
  const existing = document.getElementById('new-ticket-overlay');
  if (existing) existing.remove();
  const ol = document.createElement('div');
  ol.id = 'new-ticket-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px';
  ol.innerHTML = `
    <div style="background:var(--card);border-radius:14px;width:100%;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:15px;font-weight:700;margin:0">New Support Ticket</h3>
        <button onclick="document.getElementById('new-ticket-overlay').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer">✕</button>
      </div>
      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Title *</label>
          <input id="nt-title" type="text" placeholder="Brief description of the issue" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none"></div>
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Priority</label>
          <select id="nt-priority" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none">
            <option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select></div>
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Description</label>
          <textarea id="nt-body" rows="4" placeholder="Describe the issue in detail…" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none"></textarea></div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('new-ticket-overlay').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="submitNewTicket()">Submit Ticket</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
}

async function submitNewTicket() {
  const title    = document.getElementById('nt-title')?.value.trim();
  const priority = document.getElementById('nt-priority')?.value;
  const body     = document.getElementById('nt-body')?.value.trim();
  if (!title) return toastError('Title is required');
  try {
    await api('/api/support', { method: 'POST', body: JSON.stringify({ title, priority, description: body }) });
    document.getElementById('new-ticket-overlay')?.remove();
    toastSuccess('Ticket submitted!');
    loadSupportTickets();
  } catch(e) {
    toastError(e.message || 'Failed to submit ticket');
  }
}

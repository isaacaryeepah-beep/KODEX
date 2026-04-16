"use strict";
/**
 * pages-academic.js
 * Requires: app.js globals — api(), currentUser, toastError(), toastSuccess(), svgIcon()
 * Provides: renderCalendarEvents(), renderForums(), renderBadges(), renderTranscripts(), renderEvaluations()
 */

// ════════════════════════════════════════════════════════════════════════════
// CALENDAR EVENTS  (all roles)
// ════════════════════════════════════════════════════════════════════════════

async function renderCalendarEvents() {
  const content = document.getElementById('main-content');
  if (!content) return;

  const isAdmin = currentUser.role === 'admin' || currentUser.role === 'superadmin';

  content.innerHTML = `
    <div class="page-header">
      <h2>Calendar & Events</h2>
      <p>Upcoming academic and institutional events</p>
    </div>
    ${isAdmin ? `<div style="margin-bottom:16px">
      <button class="btn btn-primary btn-sm" onclick="showNewEventModal()">+ New Event</button>
    </div>` : ''}
    <div id="calendar-events-area"><div class="loading" style="padding:20px;text-align:center;font-size:13px">Loading events…</div></div>`;

  loadCalendarEvents();
}

async function loadCalendarEvents() {
  const area = document.getElementById('calendar-events-area');
  if (!area) return;
  try {
    const data = await api('/api/calendar-events');
    const events = data.events || data.items || [];

    if (!events.length) {
      area.innerHTML = '<div class="card"><div class="empty-state"><p>No upcoming events scheduled.</p></div></div>';
      return;
    }

    const typeColors = {
      exam: '#dc2626', holiday: '#16a34a', meeting: '#2563eb',
      assignment: '#d97706', lecture: '#7c3aed', other: '#6b7280',
    };

    const now = new Date();
    area.innerHTML = events.map(ev => {
      const start = ev.startDate ? new Date(ev.startDate) : null;
      const end   = ev.endDate   ? new Date(ev.endDate)   : null;
      const isPast = start && start < now;
      const tc = typeColors[ev.type?.toLowerCase()] || typeColors.other;
      return `
        <div class="card" style="margin-bottom:10px;opacity:${isPast ? '.6' : '1'}">
          <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
            <div style="width:52px;min-width:52px;background:${tc}15;border:1.5px solid ${tc}30;border-radius:10px;padding:8px 4px;text-align:center">
              ${start ? `<div style="font-size:20px;font-weight:800;color:${tc};line-height:1">${start.getDate()}</div>
              <div style="font-size:9px;text-transform:uppercase;color:${tc};font-weight:700">${start.toLocaleDateString('en-GB',{month:'short'})}</div>` : '<div style="font-size:12px;color:var(--text-muted)">TBD</div>'}
            </div>
            <div style="flex:1;min-width:200px">
              <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">
                <span style="font-size:14px;font-weight:700">${ev.title || 'Untitled Event'}</span>
                <span style="font-size:10px;background:${tc}20;color:${tc};padding:2px 8px;border-radius:20px;font-weight:700;text-transform:capitalize">${ev.type || 'other'}</span>
                ${isPast ? '<span style="font-size:10px;background:#f3f4f6;color:#9ca3af;padding:2px 8px;border-radius:20px">Past</span>' : ''}
              </div>
              ${ev.description ? `<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;margin-bottom:6px">${ev.description}</div>` : ''}
              <div style="font-size:11px;color:var(--text-muted)">
                ${start ? start.toLocaleString('en-GB',{weekday:'short',day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}
                ${end && end.getTime() !== start?.getTime() ? ` → ${end.toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}` : ''}
                ${ev.location ? ` · ${ev.location}` : ''}
              </div>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch(e) {
    area.innerHTML = `<div class="card"><p style="color:var(--danger);font-size:13px">Error: ${e.message}</p></div>`;
  }
}

async function showNewEventModal() {
  const existing = document.getElementById('new-event-overlay');
  if (existing) existing.remove();
  const ol = document.createElement('div');
  ol.id = 'new-event-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px';
  ol.innerHTML = `
    <div style="background:var(--card);border-radius:14px;width:100%;max-width:480px;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:15px;font-weight:700;margin:0">New Event</h3>
        <button onclick="document.getElementById('new-event-overlay').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer">✕</button>
      </div>
      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Title *</label>
          <input id="ne-title" type="text" placeholder="Event title" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Start *</label>
            <input id="ne-start" type="datetime-local" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none"></div>
          <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">End</label>
            <input id="ne-end" type="datetime-local" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none"></div>
        </div>
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Type</label>
          <select id="ne-type" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none">
            <option value="other">Other</option><option value="exam">Exam</option><option value="holiday">Holiday</option>
            <option value="meeting">Meeting</option><option value="assignment">Assignment</option><option value="lecture">Lecture</option>
          </select></div>
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Location</label>
          <input id="ne-loc" type="text" placeholder="Room, building or online link" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none"></div>
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Description</label>
          <textarea id="ne-desc" rows="3" placeholder="Optional details…" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none"></textarea></div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('new-event-overlay').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="submitNewEvent()">Create Event</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
}

async function submitNewEvent() {
  const title = document.getElementById('ne-title')?.value.trim();
  const start = document.getElementById('ne-start')?.value;
  const end   = document.getElementById('ne-end')?.value;
  const type  = document.getElementById('ne-type')?.value;
  const loc   = document.getElementById('ne-loc')?.value.trim();
  const desc  = document.getElementById('ne-desc')?.value.trim();
  if (!title) return toastError('Title is required');
  if (!start) return toastError('Start date is required');
  try {
    await api('/api/calendar-events', { method: 'POST', body: JSON.stringify({ title, startDate: start, endDate: end || start, type, location: loc, description: desc }) });
    document.getElementById('new-event-overlay')?.remove();
    toastSuccess('Event created!');
    loadCalendarEvents();
  } catch(e) {
    toastError(e.message || 'Failed to create event');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FORUMS  (all roles)
// ════════════════════════════════════════════════════════════════════════════

async function renderForums() {
  const content = document.getElementById('main-content');
  if (!content) return;

  content.innerHTML = `
    <div class="page-header">
      <h2>Discussion Forums</h2>
      <p>Ask questions, share knowledge, collaborate with peers</p>
    </div>
    <div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-primary btn-sm" onclick="showNewForumPostModal()">+ New Post</button>
      <select id="forum-cat-filter" onchange="loadForums()" style="padding:7px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;font-family:inherit;outline:none">
        <option value="">All categories</option>
        <option value="general">General</option>
        <option value="academic">Academic</option>
        <option value="technical">Technical</option>
        <option value="announcements">Announcements</option>
      </select>
    </div>
    <div id="forums-area"><div class="loading" style="padding:20px;text-align:center;font-size:13px">Loading discussions…</div></div>`;

  loadForums();
}

async function loadForums() {
  const area = document.getElementById('forums-area');
  if (!area) return;
  const cat = document.getElementById('forum-cat-filter')?.value || '';
  try {
    const params = cat ? `?category=${cat}` : '';
    const data = await api(`/api/forums${params}`);
    const posts = data.posts || data.items || [];

    if (!posts.length) {
      area.innerHTML = '<div class="card"><div class="empty-state"><p>No forum posts yet. Start a discussion!</p></div></div>';
      return;
    }

    area.innerHTML = posts.map(p => `
      <div class="card" style="margin-bottom:10px;cursor:pointer" onclick="openForumPost('${p._id}')">
        <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap">
          <div style="width:38px;min-width:38px;height:38px;background:var(--primary-ultra-light);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700;color:var(--primary)">
            ${(p.authorName || p.author?.name || '?')[0].toUpperCase()}
          </div>
          <div style="flex:1;min-width:180px">
            <div style="font-size:14px;font-weight:700;margin-bottom:3px">${p.title || 'Untitled Post'}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;line-height:1.4">${(p.body || p.content || '').slice(0,120)}${(p.body||p.content||'').length > 120 ? '…' : ''}</div>
            <div style="display:flex;gap:10px;align-items:center;font-size:11px;color:var(--text-muted);flex-wrap:wrap">
              <span>${p.authorName || p.author?.name || 'Unknown'}</span>
              <span>·</span>
              <span>${p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : '—'}</span>
              ${p.category ? `<span style="background:var(--primary-ultra-light);color:var(--primary);padding:1px 6px;border-radius:20px;font-size:10px">${p.category}</span>` : ''}
              <span style="margin-left:auto">${p.replyCount ?? 0} replies</span>
            </div>
          </div>
        </div>
      </div>`).join('');
  } catch(e) {
    area.innerHTML = `<div class="card"><p style="color:var(--danger);font-size:13px">Error: ${e.message}</p></div>`;
  }
}

async function openForumPost(postId) {
  // Navigate to post detail view
  navigateTo(`forum-post-${postId}`);
}

async function showNewForumPostModal() {
  const existing = document.getElementById('new-forum-overlay');
  if (existing) existing.remove();
  const ol = document.createElement('div');
  ol.id = 'new-forum-overlay';
  ol.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:500;display:flex;align-items:center;justify-content:center;padding:16px';
  ol.innerHTML = `
    <div style="background:var(--card);border-radius:14px;width:100%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,.2)">
      <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <h3 style="font-size:15px;font-weight:700;margin:0">New Discussion Post</h3>
        <button onclick="document.getElementById('new-forum-overlay').remove()" style="width:26px;height:26px;border-radius:6px;border:1px solid var(--border);background:var(--bg);cursor:pointer">✕</button>
      </div>
      <div style="padding:18px 20px;display:flex;flex-direction:column;gap:12px">
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Title *</label>
          <input id="nf-title" type="text" placeholder="What's your question or topic?" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none"></div>
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Category</label>
          <select id="nf-cat" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;outline:none">
            <option value="general">General</option><option value="academic">Academic</option>
            <option value="technical">Technical</option><option value="announcements">Announcements</option>
          </select></div>
        <div><label style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:block;margin-bottom:5px">Content *</label>
          <textarea id="nf-body" rows="5" placeholder="Share more details, context, or your question…" style="width:100%;padding:9px 13px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;outline:none"></textarea></div>
      </div>
      <div style="padding:12px 20px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end">
        <button class="btn btn-secondary btn-sm" onclick="document.getElementById('new-forum-overlay').remove()">Cancel</button>
        <button class="btn btn-primary btn-sm" onclick="submitForumPost()">Post</button>
      </div>
    </div>`;
  document.body.appendChild(ol);
}

async function submitForumPost() {
  const title = document.getElementById('nf-title')?.value.trim();
  const cat   = document.getElementById('nf-cat')?.value;
  const body  = document.getElementById('nf-body')?.value.trim();
  if (!title) return toastError('Title is required');
  if (!body)  return toastError('Content is required');
  try {
    await api('/api/forums', { method: 'POST', body: JSON.stringify({ title, category: cat, content: body }) });
    document.getElementById('new-forum-overlay')?.remove();
    toastSuccess('Post published!');
    loadForums();
  } catch(e) {
    toastError(e.message || 'Failed to post');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// BADGES  (students / employees)
// ════════════════════════════════════════════════════════════════════════════

async function renderBadges() {
  const content = document.getElementById('main-content');
  if (!content) return;

  content.innerHTML = `
    <div class="page-header">
      <h2>My Badges</h2>
      <p>Achievements and recognition you've earned</p>
    </div>
    <div id="badges-area"><div class="loading" style="padding:20px;text-align:center;font-size:13px">Loading badges…</div></div>`;

  try {
    const data = await api('/api/badges/my');
    const badges = data.badges || data.items || [];
    const area = document.getElementById('badges-area');
    if (!area) return;

    if (!badges.length) {
      area.innerHTML = '<div class="card"><div class="empty-state"><p>No badges earned yet. Keep up the great work!</p></div></div>';
      return;
    }

    area.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px">
      ${badges.map(b => `
        <div class="card" style="text-align:center;padding:20px 16px">
          <div style="font-size:36px;margin-bottom:10px">${b.icon || '🏅'}</div>
          <div style="font-size:13px;font-weight:700;margin-bottom:4px">${b.name || 'Badge'}</div>
          <div style="font-size:11px;color:var(--text-muted);line-height:1.4;margin-bottom:8px">${b.description || ''}</div>
          <div style="font-size:10px;color:var(--text-muted)">${b.awardedAt ? 'Earned ' + new Date(b.awardedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : ''}</div>
        </div>`).join('')}
    </div>`;
  } catch(e) {
    const area = document.getElementById('badges-area');
    if (area) area.innerHTML = `<div class="card"><p style="color:var(--danger);font-size:13px">Error: ${e.message}</p></div>`;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// TRANSCRIPTS  (students)
// ════════════════════════════════════════════════════════════════════════════

async function renderTranscripts() {
  const content = document.getElementById('main-content');
  if (!content) return;

  content.innerHTML = `
    <div class="page-header">
      <h2>My Transcript</h2>
      <p>Academic record and grade history</p>
    </div>
    <div id="transcripts-area"><div class="loading" style="padding:20px;text-align:center;font-size:13px">Loading transcript…</div></div>`;

  try {
    const data = await api('/api/transcripts/my');
    const area = document.getElementById('transcripts-area');
    if (!area) return;

    const records = data.records || data.courses || data.items || [];
    const summary = data.summary || {};

    area.innerHTML = `
      ${summary.gpa != null ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;margin-bottom:16px">
          <div class="card" style="text-align:center;padding:16px">
            <div style="font-size:28px;font-weight:800;color:var(--primary)">${(+summary.gpa).toFixed(2)}</div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-top:4px">Cumulative GPA</div>
          </div>
          ${summary.totalCredits != null ? `<div class="card" style="text-align:center;padding:16px">
            <div style="font-size:28px;font-weight:800;color:var(--success)">${summary.totalCredits}</div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-top:4px">Credits Earned</div>
          </div>` : ''}
          ${summary.totalCourses != null ? `<div class="card" style="text-align:center;padding:16px">
            <div style="font-size:28px;font-weight:800;color:#d97706">${summary.totalCourses}</div>
            <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:700;margin-top:4px">Courses</div>
          </div>` : ''}
        </div>` : ''}
      ${records.length ? `
        <div class="card" style="overflow-x:auto">
          <table>
            <thead><tr><th>Course</th><th>Code</th><th>Credits</th><th>Grade</th><th>Score</th><th>Semester</th></tr></thead>
            <tbody>${records.map(r => {
              const grade = r.grade || '—';
              const gradeColor = { A: '#16a34a', B: '#2563eb', C: '#d97706', D: '#ea580c', F: '#dc2626' }[grade?.[0]] || 'var(--text)';
              return `<tr>
                <td style="font-weight:600;font-size:13px">${r.courseName || r.course?.name || '—'}</td>
                <td style="font-size:12px;color:var(--text-muted)">${r.courseCode || r.course?.code || '—'}</td>
                <td style="font-size:13px;text-align:center">${r.credits ?? '—'}</td>
                <td style="text-align:center"><span style="font-size:13px;font-weight:800;color:${gradeColor}">${grade}</span></td>
                <td style="font-size:13px;text-align:center">${r.score != null ? r.score + '%' : '—'}</td>
                <td style="font-size:12px;color:var(--text-muted)">${r.semester || '—'}</td>
              </tr>`;
            }).join('')}</tbody>
          </table>
        </div>` : '<div class="card"><div class="empty-state"><p>No transcript records yet.</p></div></div>'}`;
  } catch(e) {
    const area = document.getElementById('transcripts-area');
    if (area) area.innerHTML = `<div class="card"><p style="color:var(--danger);font-size:13px">Error: ${e.message}</p></div>`;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EVALUATIONS  (lecturers / students)
// ════════════════════════════════════════════════════════════════════════════

async function renderEvaluations() {
  const content = document.getElementById('main-content');
  if (!content) return;

  const isLecturer = currentUser.role === 'lecturer' || currentUser.role === 'admin' || currentUser.role === 'superadmin';

  content.innerHTML = `
    <div class="page-header">
      <h2>Evaluations</h2>
      <p>${isLecturer ? 'Course evaluations and student feedback' : 'Evaluate your courses and lecturers'}</p>
    </div>
    <div id="evaluations-area"><div class="loading" style="padding:20px;text-align:center;font-size:13px">Loading evaluations…</div></div>`;

  try {
    const endpoint = isLecturer ? '/api/evaluations/received' : '/api/evaluations/my';
    const data = await api(endpoint);
    const area = document.getElementById('evaluations-area');
    if (!area) return;

    const evaluations = data.evaluations || data.items || [];

    if (!evaluations.length) {
      area.innerHTML = `<div class="card"><div class="empty-state"><p>${isLecturer ? 'No evaluations received yet.' : 'No evaluations submitted yet.'}</p></div></div>`;
      return;
    }

    area.innerHTML = evaluations.map(ev => {
      const score = ev.overallRating ?? ev.rating ?? ev.score;
      const stars = score ? '★'.repeat(Math.round(score)) + '☆'.repeat(5 - Math.round(score)) : null;
      return `
        <div class="card" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px">
            <div>
              <div style="font-size:14px;font-weight:700">${ev.courseName || ev.course?.name || 'Course Evaluation'}</div>
              <div style="font-size:12px;color:var(--text-muted)">${isLecturer ? '' : (ev.lecturerName || ev.lecturer?.name || '')}</div>
            </div>
            ${stars ? `<div style="color:#f59e0b;font-size:16px;letter-spacing:1px" title="${score}/5">${stars}</div>` : ''}
          </div>
          ${ev.feedback ? `<div style="font-size:13px;color:var(--text-secondary);line-height:1.5;padding:10px 12px;background:var(--bg);border-radius:8px;margin-bottom:8px">"${ev.feedback}"</div>` : ''}
          <div style="font-size:11px;color:var(--text-muted)">${ev.submittedAt ? new Date(ev.submittedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : (ev.createdAt ? new Date(ev.createdAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}) : '—')}</div>
        </div>`;
    }).join('');
  } catch(e) {
    const area = document.getElementById('evaluations-area');
    if (area) area.innerHTML = `<div class="card"><p style="color:var(--danger);font-size:13px">Error: ${e.message}</p></div>`;
  }
}

"use strict";
/**
 * faq-assistant.js
 * ChatGPT-style FAQ Assistant panel — flex sibling of #main-content inside
 * .main-layout. Width transition drives open/close; no margin hacks needed.
 * Requires: app.js globals — api(), token
 */

(function () {
  // ── Mode detection ────────────────────────────────────────────────────────
  function _getMode() {
    if (window.currentUser && window.currentUser.company && window.currentUser.company.mode) {
      return window.currentUser.company.mode;
    }
    try {
      var tok = localStorage.getItem('kodex_token') || '';
      var payload = JSON.parse(atob(tok.split('.')[1]));
      return payload.mode || (payload.company && payload.company.mode) || null;
    } catch (_) { return null; }
  }

  // ── Academic FAQ knowledge base ───────────────────────────────────────────
  const FAQ_ITEMS_ACADEMIC = [
    { q: 'How do I create a course?',         a: 'Go to <strong>Courses</strong> → click <strong>"+ Add Course"</strong> → fill in title, code, semester and level → assign a lecturer → Save.' },
    { q: 'How do I enroll students?',          a: 'Open a course → <strong>Enrolled Students</strong> tab → <strong>"Add Student"</strong> to search and enroll, or <strong>"Sync Roster"</strong> for bulk.' },
    { q: 'How do I take attendance?',          a: 'Go to <strong>Sessions</strong> → <strong>"+ New Session"</strong> → select course → Start. Students join via QR or GPS. Click <strong>"End Session"</strong> when done.' },
    { q: 'How does the Grade Book work?',      a: 'Go to <strong>Grade Book</strong> under Courses. Enter CA scores and exam marks. Final grades are computed automatically from configured weights.' },
    { q: 'How do I upload students in bulk?',  a: 'Go to <strong>Users → Students → Bulk Import</strong>. Download the CSV template, fill it in, upload — students get email invitations.' },
    { q: 'How do I run a SnapQuiz?',           a: 'Go to <strong>SnapQuiz → Sessions</strong> → select a question bank → set time limit → <strong>"Start Session"</strong>. Students join with the session code.' },
    { q: 'How do I post an announcement?',     a: 'Go to <strong>Announcements</strong> in the sidebar. Admins and lecturers can post text, images, or PDFs — visible on all dashboards.' },
    { q: 'How do I reset a user password?',    a: 'Open <strong>Users</strong>, find the user, click the menu → <strong>"Reset Password"</strong>. A temporary password is generated.' },
    { q: 'How do I generate reports?',         a: 'Click <strong>Reports</strong> in the sidebar. Choose attendance, course performance, or student reports. Filter by date or course and export.' },
    { q: 'What user roles are available?',     a: '<strong>Superadmin, Admin, HOD, Lecturer, Student</strong> — each role has scoped permissions and a tailored dashboard.' },
  ];

  // ── Corporate FAQ knowledge base ──────────────────────────────────────────
  const FAQ_ITEMS_CORPORATE = [
    { q: 'How do I clock in or out?',          a: 'Go to <strong>Clock In / Out</strong> in the sidebar and tap the button. Your location is recorded automatically if GPS is enabled.' },
    { q: 'How do I apply for leave?',          a: 'Go to <strong>Leave</strong> in the sidebar → click <strong>"+ New Request"</strong> → select type and dates → Submit. Your manager will approve or reject.' },
    { q: 'How do I view my timesheet?',        a: 'Open <strong>My Attendance</strong> in the sidebar. Your daily clock-in/out times, hours worked, and any late arrivals are listed there.' },
    { q: 'How do I submit expenses?',          a: 'Go to <strong>Expenses</strong> in the sidebar → click <strong>"+ Add Expense"</strong> → fill in amount, category, and attach a receipt → Submit for approval.' },
    { q: 'How does performance tracking work?', a: 'Open <strong>Performance</strong> in the sidebar. Your attendance rate, punctuality, and task completion are summarised. Managers set targets.' },
    { q: 'How do I join a meeting?',           a: 'Go to <strong>Meetings</strong> in the sidebar. Active meetings show a <strong>"Join"</strong> button. You will also see upcoming scheduled meetings.' },
    { q: 'How does messaging work?',           a: '<strong>Messages</strong> in the sidebar opens your inbox. Click <strong>+ New</strong> to message colleagues — you can only contact users in your team or role group.' },
    { q: 'How do I raise a support ticket?',   a: 'Go to <strong>Support</strong> in the sidebar → click <strong>"+ New Ticket"</strong> → describe the issue → Submit. Your admin will respond.' },
    { q: 'How do I reset my password?',        a: 'On the login screen click <strong>"Forgot password?"</strong> and enter your email. Or ask your admin to reset it from the Users panel.' },
    { q: 'How do I view my pay slip?',         a: 'Go to <strong>My Attendance → Pay Slips</strong> or ask your admin to share it from the Payroll section.' },
  ];

  // ── Quick-answer maps ─────────────────────────────────────────────────────
  const QUICK_ANSWERS_ACADEMIC = {
    'how to create a course':   'To create a course:<br>1. Go to <strong>Courses</strong><br>2. Click <strong>"+ Add Course"</strong><br>3. Fill in title, code, semester and level<br>4. Assign a lecturer<br>5. Click <strong>Save</strong>.',
    'how to upload students':   'To upload students in bulk:<br>1. Go to <strong>Users → Students</strong><br>2. Click <strong>"Bulk Import"</strong><br>3. Download the CSV template, fill it in<br>4. Upload — students get email invitations.',
    'how to start a session':   'To start an attendance session:<br>1. Go to <strong>Sessions</strong><br>2. Click <strong>"+ New Session"</strong><br>3. Select course and type<br>4. Click <strong>Start</strong> — students join via QR or GPS<br>5. Click <strong>"End Session"</strong> when done.',
    'how grade book works':     'The <strong>Grade Book</strong> is under Courses:<br>1. Open a course and select Grade Book<br>2. Enter CA scores and exam marks per student<br>3. Configure weights in Settings<br>4. Final grades calculate automatically.',
  };

  const QUICK_ANSWERS_CORPORATE = {
    'how to clock in':          'To clock in:<br>1. Go to <strong>Clock In / Out</strong> in the sidebar<br>2. Tap <strong>"Clock In"</strong><br>3. Your location and time are recorded automatically.',
    'how to apply for leave':   'To apply for leave:<br>1. Go to <strong>Leave</strong> in the sidebar<br>2. Click <strong>"+ New Request"</strong><br>3. Select leave type and dates<br>4. Add a reason and submit — your manager will approve or reject.',
    'how to view my timesheet': 'To view your timesheet:<br>1. Open <strong>My Attendance</strong> in the sidebar<br>2. Your daily clock-in/out times, hours worked, and late arrivals are all listed there.',
    'how to check performance': 'To check your performance:<br>1. Open <strong>Performance</strong> in the sidebar<br>2. You will see your attendance rate, punctuality score, and targets set by your manager.',
  };

  // ── Chip definitions per mode ─────────────────────────────────────────────
  const CHIPS_ACADEMIC   = ['How to create a course', 'How to upload students', 'How to start a session', 'How Grade Book works'];
  const CHIPS_CORPORATE  = ['How to clock in', 'How to apply for leave', 'How to view my timesheet', 'How to check performance'];

  // ── Resolved content (set at _init time based on mode) ───────────────────
  let FAQ_ITEMS    = FAQ_ITEMS_ACADEMIC;
  let QUICK_ANSWERS = QUICK_ANSWERS_ACADEMIC;

  // ── State ─────────────────────────────────────────────────────────────────
  let _open = false;
  let _initialized = false;
  let _initializedMode = null;

  // ── Public API ─────────────────────────────────────────────────────────────
  window.faqPanelToggle = function () { _open ? faqPanelClose() : faqPanelOpen(); };

  window.faqPanelOpen = function () {
    const panel = document.getElementById('faq-assistant-panel');
    if (!panel) return;
    panel.classList.add('fap-open');
    _open = true;
    _syncToggleBtn(true);
    localStorage.setItem('kodex_fap', '1');
    const currentMode = _getMode();
    if (!_initialized || currentMode !== _initializedMode) _init();
  };

  window.faqPanelClose = function () {
    const panel = document.getElementById('faq-assistant-panel');
    if (!panel) return;
    panel.classList.remove('fap-open');
    _open = false;
    _syncToggleBtn(false);
    localStorage.setItem('kodex_fap', '0');
  };

  window.faqPanelAsk = async function (preQ) {
    const inputEl = document.getElementById('fap-input');
    const sendBtn = document.getElementById('fap-send-btn');
    const q = (preQ || inputEl?.value || '').trim();
    if (!q) return;

    if (inputEl) inputEl.value = '';
    if (sendBtn) sendBtn.disabled = true;

    _addMsg('user', q);

    // Check local quick answers first (instant, no API)
    const key = q.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const local = QUICK_ANSWERS[key];
    if (local) {
      await _delay(350);
      _addMsg('assistant', local);
      if (sendBtn) sendBtn.disabled = false;
      return;
    }

    // Try API
    _showTyping();
    try {
      const data = await api('/api/faq/ask', {
        method: 'POST',
        body: JSON.stringify({ question: q }),
      });
      _hideTyping();
      _addMsg('assistant', data.answer || 'I couldn\'t find a specific answer. Browse the <strong>Common Questions</strong> below or visit the full FAQ Center.');
    } catch (_e) {
      _hideTyping();
      const fuzzy = _fuzzy(q);
      if (fuzzy) {
        _addMsg('assistant', fuzzy);
      } else {
        _addMsg('assistant',
          'I can\'t reach the knowledge base right now. Try the <strong>Common Questions</strong> below, or navigate to <strong>FAQ Center</strong> in the sidebar for the full database.');
      }
    }

    if (sendBtn) sendBtn.disabled = false;
  };

  window.faqPanelAskQ = function (q) {
    if (!_open) faqPanelOpen();
    const inputEl = document.getElementById('fap-input');
    if (inputEl) inputEl.value = '';
    faqPanelAsk(q);
  };

  // ── Internal helpers ───────────────────────────────────────────────────────
  function _init() {
    const mode = _getMode();
    _initialized = true;
    _initializedMode = mode;

    if (mode === 'corporate') {
      FAQ_ITEMS    = FAQ_ITEMS_CORPORATE;
      QUICK_ANSWERS = QUICK_ANSWERS_CORPORATE;
    } else {
      FAQ_ITEMS    = FAQ_ITEMS_ACADEMIC;
      QUICK_ANSWERS = QUICK_ANSWERS_ACADEMIC;
    }

    _renderChips(mode);
    _renderFAQ();
    _renderEmptyState();

    const inputEl = document.getElementById('fap-input');
    if (inputEl && !inputEl._kbBound) {
      inputEl._kbBound = true;
      inputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); faqPanelAsk(); }
      });
    }
  }

  function _renderChips(mode) {
    const container = document.getElementById('fap-chips');
    if (!container) return;
    const chips = (mode === 'corporate') ? CHIPS_CORPORATE : CHIPS_ACADEMIC;
    container.innerHTML = chips.map(c =>
      `<button class="fap-chip" onclick="faqPanelAskQ('${c}')">${c}</button>`
    ).join('');
  }

  function _syncToggleBtn(open) {
    const btn = document.getElementById('faq-panel-toggle-btn');
    if (!btn) return;
    btn.classList.toggle('fap-active', open);
  }

  function _addMsg(role, html) {
    const chat = document.getElementById('fap-chat');
    if (!chat) return;
    chat.querySelector('.fap-empty-chat')?.remove();

    const el = document.createElement('div');
    el.className = `fap-message fap-${role}`;
    el.innerHTML = `<div class="fap-bubble">${html}</div>`;
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
  }

  function _showTyping() {
    const chat = document.getElementById('fap-chat');
    if (!chat) return;
    const el = document.createElement('div');
    el.id = 'fap-typing';
    el.className = 'fap-message fap-assistant';
    el.innerHTML = '<div class="fap-bubble fap-typing"><span></span><span></span><span></span></div>';
    chat.appendChild(el);
    chat.scrollTop = chat.scrollHeight;
  }

  function _hideTyping() { document.getElementById('fap-typing')?.remove(); }

  function _renderEmptyState() {
    const chat = document.getElementById('fap-chat');
    if (!chat) return;
    chat.innerHTML = `
      <div class="fap-empty-chat">
        <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--border,#e5e7eb)"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <div style="font-weight:600;font-size:12px;color:var(--text-light,#6b7280)">Ask anything about KODEX</div>
        <div style="font-size:11px;color:var(--text-muted,#9ca3af);line-height:1.5">Use the quick chips above<br>or type your own question</div>
      </div>`;
  }

  function _renderFAQ() {
    const el = document.getElementById('fap-faq-list');
    if (!el) return;
    el.innerHTML = FAQ_ITEMS.map(item => `
      <details class="fap-faq-item">
        <summary class="fap-faq-summary">${item.q}</summary>
        <div class="fap-faq-answer">${item.a}</div>
      </details>`).join('');
  }

  function _fuzzy(query) {
    const q = query.toLowerCase();
    for (const item of FAQ_ITEMS) {
      const kw = item.q.toLowerCase().replace(/[^a-z0-9 ]/g, '');
      const words = kw.split(' ').filter(w => w.length > 3);
      if (words.some(w => q.includes(w))) return item.a;
    }
    return null;
  }

  function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Auto-init when dashboard becomes visible ───────────────────────────────
  function _boot() {
    const dashEl = document.getElementById('dashboard-page');
    if (!dashEl) return;

    const check = () => {
      if (!dashEl.classList.contains('hidden')) {
        const shouldOpen = localStorage.getItem('kodex_fap') !== '0';
        if (shouldOpen) faqPanelOpen();
        else _syncToggleBtn(false);
      }
    };

    check();
    new MutationObserver(check).observe(dashEl, { attributes: true, attributeFilter: ['class'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    _boot();
  }
})();

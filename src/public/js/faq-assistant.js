"use strict";
/**
 * faq-assistant.js
 * ChatGPT-style FAQ Assistant panel — flex sibling of #main-content inside
 * .main-layout. Width transition drives open/close; no margin hacks needed.
 * Requires: app.js globals — api(), token
 */

(function () {
  // ── Local FAQ knowledge base ──────────────────────────────────────────────
  const FAQ_ITEMS = [
    {
      q: 'How do I create a course?',
      a: 'Go to <strong>Courses</strong> in the sidebar → click <strong>"+ Add Course"</strong> → fill in the title, code, semester, and level → assign a lecturer → Save.',
    },
    {
      q: 'How do I enroll students in a course?',
      a: 'Open a course → go to <strong>Enrolled Students</strong> tab → click <strong>"Add Student"</strong> to search and enroll, or use <strong>"Sync Roster"</strong> for bulk enrollment.',
    },
    {
      q: 'How do I take attendance?',
      a: 'Under <strong>Sessions</strong> → click <strong>"+ New Session"</strong> → select course and type → Start. Students join via QR code or GPS. Click <strong>"End Session"</strong> when done.',
    },
    {
      q: 'How does the Grade Book work?',
      a: 'Go to <strong>Grade Book</strong> under Courses. Enter CA scores and exam marks per student. Final grades are computed automatically based on configured weights.',
    },
    {
      q: 'How do I upload students in bulk?',
      a: 'Go to <strong>Users → Students → Bulk Import</strong>. Download the CSV template, fill in student details, then upload. Students receive email invitations automatically.',
    },
    {
      q: 'How do I reset a user password?',
      a: 'Open <strong>Users</strong>, find the user, click the options menu, then choose <strong>"Reset Password"</strong>. A temporary password is generated and can be shared.',
    },
    {
      q: 'How do I generate reports?',
      a: 'Click <strong>Reports</strong> in the sidebar. Choose attendance, course performance, or student reports. Filter by date, level, or course and export as needed.',
    },
    {
      q: 'What user roles are available?',
      a: 'Academic: <strong>Superadmin, Admin, HOD, Lecturer, Student</strong>. Corporate: <strong>Manager, Employee</strong>. Each role has scoped permissions and a tailored dashboard.',
    },
    {
      q: 'How do I run a quiz (SnapQuiz)?',
      a: 'Go to <strong>SnapQuiz → Sessions</strong> → select a question bank → set time limit → click <strong>"Start Session"</strong>. Students join using the displayed session code.',
    },
    {
      q: 'How do I post an announcement?',
      a: 'Go to <strong>Announcements</strong> in the sidebar. Admins and lecturers can post text, attach images or PDFs. Announcements appear on all users\' dashboards.',
    },
    {
      q: 'How does KODEX Messaging work?',
      a: '<strong>Messages</strong> in the sidebar opens the inbox. Click <strong>+ New</strong> to start a conversation — you can only message users you are connected to by role (lecturer↔students, manager↔team). Students contact their HOD using the <strong>HOD Request</strong> button. You can attach images, PDFs, and Word documents.',
    },
  ];

  // ── Quick-answer map (instant local responses for chip questions) ──────────
  const QUICK_ANSWERS = {
    'how to create a course':
      'To create a course:<br>1. Go to <strong>Courses</strong> in the sidebar<br>2. Click <strong>"+ Add Course"</strong><br>3. Fill in title, code, semester and level<br>4. Assign a lecturer<br>5. Click <strong>Save</strong> — the course is now live.',
    'how to upload students':
      'To upload students in bulk:<br>1. Go to <strong>Users → Students</strong><br>2. Click <strong>"Bulk Import"</strong><br>3. Download the CSV template and fill in student data<br>4. Upload the file — students receive email invitations automatically.',
    'how to start a session':
      'To start an attendance session:<br>1. Go to <strong>Sessions</strong> in the sidebar<br>2. Click <strong>"+ New Session"</strong><br>3. Select the course and session type<br>4. Click <strong>Start</strong> — students join via QR code or GPS<br>5. Click <strong>"End Session"</strong> when done.',
    'how grade book works':
      'The <strong>Grade Book</strong> is under Courses:<br>1. Open a course and select Grade Book<br>2. Enter continuous assessment (CA) scores and exam marks per student<br>3. Configure assessment weights in Settings<br>4. Final grades calculate and display automatically.',
  };

  // ── State ─────────────────────────────────────────────────────────────────
  let _open = false;
  let _initialized = false;

  // ── Public API ─────────────────────────────────────────────────────────────
  window.faqPanelToggle = function () { _open ? faqPanelClose() : faqPanelOpen(); };

  window.faqPanelOpen = function () {
    const panel = document.getElementById('faq-assistant-panel');
    if (!panel) return;
    panel.classList.add('fap-open');
    _open = true;
    _syncToggleBtn(true);
    localStorage.setItem('kodex_fap', '1');
    if (!_initialized) _init();
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
    _initialized = true;
    _renderFAQ();
    _renderEmptyState();

    const inputEl = document.getElementById('fap-input');
    if (inputEl) {
      inputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); faqPanelAsk(); }
      });
    }
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

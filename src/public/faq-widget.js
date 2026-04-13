/**
 * KODEX AI FAQ Widget  v1.0
 * Drop-in floating chat assistant.
 *
 * Usage — add ONE line anywhere in your HTML <body>:
 *   <script src="/faq-widget.js"></script>
 *
 * The widget reads the JWT from localStorage key "token" (falls back to
 * sessionStorage). If no token is found the widget silently does not render.
 *
 * Public API (window.KodexFAQ):
 *   KodexFAQ.open()   — open the chat window programmatically
 *   KodexFAQ.close()  — close it
 */
(function () {
  "use strict";

  // ── Config ─────────────────────────────────────────────────────────────────
  var API_BASE = "";          // same-origin; override if needed

  // ── Token helper ───────────────────────────────────────────────────────────
  function getToken() {
    return (
      localStorage.getItem("token") ||
      sessionStorage.getItem("token") ||
      localStorage.getItem("kodex_token") ||
      ""
    );
  }

  // Don't render if not logged in
  if (!getToken()) return;

  // ── Inject CSS ─────────────────────────────────────────────────────────────
  var css = `
    #kfaq-wrap * { box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
    #kfaq-btn {
      position: fixed; bottom: 24px; right: 24px; z-index: 10000;
      width: 56px; height: 56px; border-radius: 50%;
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      border: none; cursor: pointer;
      box-shadow: 0 4px 20px rgba(99,102,241,0.45);
      display: flex; align-items: center; justify-content: center;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    #kfaq-btn:hover { transform: scale(1.08); box-shadow: 0 6px 28px rgba(99,102,241,0.55); }
    #kfaq-btn svg { width: 26px; height: 26px; fill: #fff; }
    #kfaq-badge {
      position: absolute; top: -3px; right: -3px;
      width: 18px; height: 18px; border-radius: 50%;
      background: #ef4444; color: #fff;
      font-size: 10px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      display: none;
    }

    #kfaq-popup {
      position: fixed; bottom: 90px; right: 24px; z-index: 10000;
      width: 360px; max-width: calc(100vw - 32px);
      height: 520px; max-height: calc(100vh - 120px);
      background: #fff; border-radius: 18px;
      box-shadow: 0 8px 48px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
      display: none; flex-direction: column; overflow: hidden;
      animation: kfaq-slide-in 0.22s cubic-bezier(0.16,1,0.3,1);
    }
    @keyframes kfaq-slide-in {
      from { opacity: 0; transform: translateY(16px) scale(0.97); }
      to   { opacity: 1; transform: translateY(0)   scale(1);     }
    }

    #kfaq-head {
      padding: 14px 16px;
      background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
      display: flex; align-items: center; gap: 10px;
    }
    #kfaq-head-icon {
      width: 34px; height: 34px; border-radius: 50%;
      background: rgba(255,255,255,0.2);
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    #kfaq-head-icon svg { width: 18px; height: 18px; fill: #fff; }
    #kfaq-head-text { flex: 1; }
    #kfaq-head-title { color: #fff; font-size: 14px; font-weight: 600; margin: 0; }
    #kfaq-head-sub   { color: rgba(255,255,255,0.75); font-size: 11px; margin: 0; }
    #kfaq-close-btn {
      background: none; border: none; cursor: pointer;
      color: rgba(255,255,255,0.7); font-size: 20px; line-height: 1;
      padding: 4px; border-radius: 6px;
      transition: color 0.15s;
    }
    #kfaq-close-btn:hover { color: #fff; }

    #kfaq-messages {
      flex: 1; overflow-y: auto; padding: 14px 14px 8px;
      display: flex; flex-direction: column; gap: 10px;
      scroll-behavior: smooth;
    }
    #kfaq-messages::-webkit-scrollbar { width: 4px; }
    #kfaq-messages::-webkit-scrollbar-track { background: transparent; }
    #kfaq-messages::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 4px; }

    .kfaq-msg { max-width: 85%; display: flex; flex-direction: column; gap: 3px; }
    .kfaq-msg.user { align-self: flex-end; align-items: flex-end; }
    .kfaq-msg.bot  { align-self: flex-start; align-items: flex-start; }

    .kfaq-bubble {
      padding: 9px 13px; border-radius: 14px;
      font-size: 13px; line-height: 1.5; word-break: break-word;
    }
    .kfaq-msg.user .kfaq-bubble {
      background: #6366f1; color: #fff;
      border-bottom-right-radius: 4px;
    }
    .kfaq-msg.bot .kfaq-bubble {
      background: #f1f5f9; color: #1e293b;
      border-bottom-left-radius: 4px;
    }
    .kfaq-msg.bot.error .kfaq-bubble { background: #fef2f2; color: #b91c1c; }

    .kfaq-source {
      font-size: 10px; color: #94a3b8;
      display: flex; align-items: center; gap: 4px;
    }
    .kfaq-source.faq-tag  { color: #10b981; }
    .kfaq-source.ai-tag   { color: #6366f1; }

    .kfaq-rating {
      display: flex; gap: 6px; margin-top: 2px;
    }
    .kfaq-rate-btn {
      background: none; border: 1px solid #e2e8f0;
      border-radius: 20px; padding: 2px 10px;
      font-size: 11px; cursor: pointer; color: #64748b;
      transition: all 0.15s;
    }
    .kfaq-rate-btn:hover { background: #f8fafc; border-color: #cbd5e1; }
    .kfaq-rate-btn.active-yes { background: #dcfce7; border-color: #86efac; color: #166534; }
    .kfaq-rate-btn.active-no  { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }

    .kfaq-typing {
      display: flex; gap: 4px; align-items: center;
      padding: 10px 14px; background: #f1f5f9;
      border-radius: 14px; border-bottom-left-radius: 4px;
      width: fit-content;
    }
    .kfaq-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #94a3b8; animation: kfaq-bounce 1.2s infinite ease-in-out;
    }
    .kfaq-dot:nth-child(2) { animation-delay: 0.2s; }
    .kfaq-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes kfaq-bounce {
      0%, 60%, 100% { transform: translateY(0); }
      30%           { transform: translateY(-5px); }
    }

    #kfaq-escalate-bar {
      padding: 8px 14px;
      background: #fffbeb; border-top: 1px solid #fde68a;
      display: none; align-items: center; gap: 8px;
    }
    #kfaq-escalate-bar span { font-size: 12px; color: #92400e; flex: 1; }
    #kfaq-ticket-btn {
      padding: 5px 12px; border-radius: 8px;
      background: #f59e0b; border: none; cursor: pointer;
      font-size: 12px; font-weight: 600; color: #fff;
      transition: background 0.15s; white-space: nowrap;
    }
    #kfaq-ticket-btn:hover { background: #d97706; }
    #kfaq-ticket-btn:disabled { background: #fcd34d; cursor: default; }

    #kfaq-footer {
      padding: 10px 12px;
      border-top: 1px solid #f1f5f9;
      display: flex; gap: 8px; align-items: flex-end;
    }
    #kfaq-input {
      flex: 1; border: 1px solid #e2e8f0; border-radius: 10px;
      padding: 8px 12px; font-size: 13px; color: #1e293b;
      resize: none; outline: none; line-height: 1.4;
      max-height: 80px; overflow-y: auto;
      transition: border-color 0.15s;
    }
    #kfaq-input:focus { border-color: #6366f1; }
    #kfaq-input::placeholder { color: #94a3b8; }
    #kfaq-send-btn {
      width: 36px; height: 36px; border-radius: 10px;
      background: #6366f1; border: none; cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; transition: background 0.15s;
    }
    #kfaq-send-btn:hover { background: #4f46e5; }
    #kfaq-send-btn:disabled { background: #c7d2fe; cursor: default; }
    #kfaq-send-btn svg { width: 16px; height: 16px; fill: #fff; }

    #kfaq-category-bar {
      padding: 6px 12px; border-bottom: 1px solid #f1f5f9;
      display: flex; gap: 6px; overflow-x: auto; flex-shrink: 0;
    }
    #kfaq-category-bar::-webkit-scrollbar { display: none; }
    .kfaq-cat-chip {
      padding: 3px 10px; border-radius: 20px; white-space: nowrap;
      font-size: 11px; font-weight: 500; cursor: pointer;
      background: #f8fafc; border: 1px solid #e2e8f0; color: #64748b;
      transition: all 0.15s;
    }
    .kfaq-cat-chip:hover   { background: #ede9fe; border-color: #c4b5fd; color: #4f46e5; }
    .kfaq-cat-chip.active  { background: #ede9fe; border-color: #a5b4fc; color: #4338ca; font-weight: 600; }

    /* Ticket success banner */
    .kfaq-ticket-created {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px; background: #dcfce7; border-radius: 10px;
      font-size: 12px; color: #166534; margin-top: 4px;
    }
  `;

  var styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  // ── Build DOM ──────────────────────────────────────────────────────────────
  var wrap = document.createElement("div");
  wrap.id  = "kfaq-wrap";
  wrap.innerHTML = `
    <!-- Floating button -->
    <button id="kfaq-btn" title="Ask AI Assistant" aria-label="Open help assistant">
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4C2.9 2 2 2.9 2 4v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-7 12h-2v-2h2v2zm0-4h-2c0-3.25 3-3 3-5 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 2.5-3 2.75-3 5z"/>
      </svg>
      <span id="kfaq-badge"></span>
    </button>

    <!-- Chat popup -->
    <div id="kfaq-popup" role="dialog" aria-label="KODEX AI Assistant">

      <!-- Header -->
      <div id="kfaq-head">
        <div id="kfaq-head-icon">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
        </div>
        <div id="kfaq-head-text">
          <p id="kfaq-head-title">KODEX AI Assistant</p>
          <p id="kfaq-head-sub">Ask me anything about the platform</p>
        </div>
        <button id="kfaq-close-btn" aria-label="Close">&#x2715;</button>
      </div>

      <!-- Category filter chips -->
      <div id="kfaq-category-bar">
        <span class="kfaq-cat-chip active" data-cat="">All</span>
        <span class="kfaq-cat-chip" data-cat="attendance">Attendance</span>
        <span class="kfaq-cat-chip" data-cat="snapquiz">SnapQuiz</span>
        <span class="kfaq-cat-chip" data-cat="assignments">Assignments</span>
        <span class="kfaq-cat-chip" data-cat="billing">Billing</span>
        <span class="kfaq-cat-chip" data-cat="hr">HR</span>
        <span class="kfaq-cat-chip" data-cat="meetings">Meetings</span>
        <span class="kfaq-cat-chip" data-cat="gps_attendance">GPS</span>
        <span class="kfaq-cat-chip" data-cat="password_reset">Password</span>
      </div>

      <!-- Messages -->
      <div id="kfaq-messages" role="log" aria-live="polite"></div>

      <!-- Escalation bar (shown when confidence is low) -->
      <div id="kfaq-escalate-bar">
        <span>Not the answer you needed?</span>
        <button id="kfaq-ticket-btn">&#x1F39F; Create Ticket</button>
      </div>

      <!-- Input -->
      <div id="kfaq-footer">
        <textarea id="kfaq-input" rows="1" placeholder="Ask a question…" aria-label="Type your question"></textarea>
        <button id="kfaq-send-btn" aria-label="Send">
          <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  // ── State ──────────────────────────────────────────────────────────────────
  var isOpen       = false;
  var isBusy       = false;
  var lastQueryId  = null;
  var activeCategory = "";

  var popup      = document.getElementById("kfaq-popup");
  var messages   = document.getElementById("kfaq-messages");
  var input      = document.getElementById("kfaq-input");
  var sendBtn    = document.getElementById("kfaq-send-btn");
  var escalateBar = document.getElementById("kfaq-escalate-bar");
  var ticketBtn   = document.getElementById("kfaq-ticket-btn");
  var badge       = document.getElementById("kfaq-badge");

  // ── Helpers ────────────────────────────────────────────────────────────────
  function scrollBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function addMessage(text, type) {
    // type: "user" | "bot" | "bot error"
    var div = document.createElement("div");
    div.className = "kfaq-msg " + type;
    var bubble = document.createElement("div");
    bubble.className = "kfaq-bubble";
    bubble.textContent = text;
    div.appendChild(bubble);
    messages.appendChild(div);
    scrollBottom();
    return div;
  }

  function addTypingIndicator() {
    var div = document.createElement("div");
    div.className = "kfaq-msg bot";
    div.id = "kfaq-typing";
    div.innerHTML = '<div class="kfaq-typing"><div class="kfaq-dot"></div><div class="kfaq-dot"></div><div class="kfaq-dot"></div></div>';
    messages.appendChild(div);
    scrollBottom();
    return div;
  }

  function removeTypingIndicator() {
    var t = document.getElementById("kfaq-typing");
    if (t) t.remove();
  }

  function addSourceTag(parentEl, source) {
    var tag = document.createElement("span");
    tag.className = "kfaq-source " + (source === "faq" ? "faq-tag" : "ai-tag");
    tag.textContent = source === "faq" ? "✓ From knowledge base" : "✦ AI answer";
    parentEl.appendChild(tag);
  }

  function addRatingButtons(parentEl, queryId) {
    var row = document.createElement("div");
    row.className = "kfaq-rating";

    var yes = document.createElement("button");
    yes.className = "kfaq-rate-btn";
    yes.textContent = "👍 Helpful";

    var no = document.createElement("button");
    no.className = "kfaq-rate-btn";
    no.textContent = "👎 Not helpful";

    function rate(helpful) {
      yes.className = "kfaq-rate-btn" + (helpful  ? " active-yes" : "");
      no.className  = "kfaq-rate-btn" + (!helpful ? " active-no"  : "");
      yes.disabled  = true;
      no.disabled   = true;
      apiRate(queryId, helpful);
    }

    yes.onclick = function () { rate(true);  };
    no.onclick  = function () { rate(false); };
    row.appendChild(yes);
    row.appendChild(no);
    parentEl.appendChild(row);
  }

  function setBusy(busy) {
    isBusy = busy;
    input.disabled  = busy;
    sendBtn.disabled = busy;
  }

  function showEscalate() {
    escalateBar.style.display = "flex";
  }

  function hideEscalate() {
    escalateBar.style.display = "none";
    ticketBtn.disabled = false;
    ticketBtn.textContent = "🎫 Create Ticket";
  }

  function incrementBadge() {
    badge.style.display = "flex";
    badge.textContent = (parseInt(badge.textContent || "0", 10) + 1).toString();
  }

  // ── API calls ──────────────────────────────────────────────────────────────
  function apiAsk(question) {
    return fetch(API_BASE + "/api/faq/ask", {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": "Bearer " + getToken(),
      },
      body: JSON.stringify({ question: question, category: activeCategory || undefined }),
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
  }

  function apiEscalate(queryId) {
    return fetch(API_BASE + "/api/faq/escalate/" + queryId, {
      method:  "POST",
      headers: { "Authorization": "Bearer " + getToken() },
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); });
  }

  function apiRate(queryId, helpful) {
    fetch(API_BASE + "/api/faq/rate/" + queryId, {
      method:  "PATCH",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": "Bearer " + getToken(),
      },
      body: JSON.stringify({ helpful: helpful }),
    }).catch(function () { /* silent */ });
  }

  // ── Send message ───────────────────────────────────────────────────────────
  async function sendMessage() {
    var question = input.value.trim();
    if (!question || isBusy) return;

    input.value = "";
    input.style.height = "auto";
    addMessage(question, "user");
    hideEscalate();
    setBusy(true);

    var typing = addTypingIndicator();

    try {
      var result = await apiAsk(question);
      removeTypingIndicator();

      if (!result.ok) {
        addMessage(result.data.error || "Something went wrong. Please try again.", "bot error");
        setBusy(false);
        return;
      }

      var data = result.data;
      lastQueryId = data.queryId;

      var msgEl = addMessage(data.answer, "bot");
      addSourceTag(msgEl, data.source);
      addRatingButtons(msgEl, data.queryId);

      if (data.confidenceLow) {
        showEscalate();
      }

      if (!isOpen) incrementBadge();

    } catch (err) {
      removeTypingIndicator();
      addMessage("Network error. Please check your connection and try again.", "bot error");
    }

    setBusy(false);
  }

  // ── Escalate to ticket ────────────────────────────────────────────────────
  ticketBtn.addEventListener("click", async function () {
    if (!lastQueryId) return;
    ticketBtn.disabled = true;
    ticketBtn.textContent = "Creating…";

    try {
      var result = await apiEscalate(lastQueryId);
      if (result.ok) {
        escalateBar.style.display = "none";
        var successEl = document.createElement("div");
        successEl.className = "kfaq-ticket-created";
        successEl.innerHTML = "✅ Ticket <strong>" + result.data.ticket.ticketNumber + "</strong> created. Our team will be in touch.";
        messages.appendChild(successEl);
        scrollBottom();
      } else {
        ticketBtn.disabled = false;
        ticketBtn.textContent = result.data.error || "Failed – try again";
        setTimeout(function () { ticketBtn.textContent = "🎫 Create Ticket"; }, 3000);
      }
    } catch (err) {
      ticketBtn.disabled = false;
      ticketBtn.textContent = "🎫 Create Ticket";
    }
  });

  // ── Toggle open/close ─────────────────────────────────────────────────────
  function openWidget() {
    isOpen = true;
    popup.style.display = "flex";
    badge.style.display = "none";
    badge.textContent   = "0";
    if (messages.children.length === 0) {
      addMessage("Hi! I'm your KODEX AI assistant. Ask me anything about attendance, quizzes, assignments, billing, or any other KODEX feature.", "bot");
    }
    input.focus();
  }

  function closeWidget() {
    isOpen = false;
    popup.style.display = "none";
  }

  document.getElementById("kfaq-btn").addEventListener("click", function () {
    isOpen ? closeWidget() : openWidget();
  });
  document.getElementById("kfaq-close-btn").addEventListener("click", closeWidget);

  // ── Category chips ────────────────────────────────────────────────────────
  document.getElementById("kfaq-category-bar").addEventListener("click", function (e) {
    var chip = e.target.closest(".kfaq-cat-chip");
    if (!chip) return;
    document.querySelectorAll(".kfaq-cat-chip").forEach(function (c) { c.classList.remove("active"); });
    chip.classList.add("active");
    activeCategory = chip.dataset.cat || "";
  });

  // ── Input auto-resize + keyboard shortcut ────────────────────────────────
  input.addEventListener("input", function () {
    this.style.height = "auto";
    this.style.height = Math.min(this.scrollHeight, 80) + "px";
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", sendMessage);

  // ── Close on outside click ────────────────────────────────────────────────
  document.addEventListener("click", function (e) {
    if (isOpen && !wrap.contains(e.target)) closeWidget();
  });

  // ── Public API ────────────────────────────────────────────────────────────
  window.KodexFAQ = { open: openWidget, close: closeWidget };

})();

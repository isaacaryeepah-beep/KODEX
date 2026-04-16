"use strict";
/**
 * faq-widget.js
 * Dashboard: floating FAQ button that opens the FAQ Center inline.
 * Auth page: toggleAuthHelp() opens a static help panel.
 */

// ── Auth-page help panel toggle ───────────────────────────────────────────────
window.toggleAuthHelp = function () {
  const panel = document.getElementById('auth-help-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
};

(function () {
  function mountWidget() {
    if (document.getElementById('faq-widget-btn')) return;
    if (!document.getElementById('dashboard-page')) return; // only show in app

    const btn = document.createElement('button');
    btn.id = 'faq-widget-btn';
    btn.title = 'Open FAQ & Help';
    btn.setAttribute('aria-label', 'Open FAQ help center');
    btn.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
    btn.style.cssText = [
      'position:fixed',
      'bottom:80px',
      'right:20px',
      'width:48px',
      'height:48px',
      'border-radius:50%',
      'border:none',
      'background:linear-gradient(135deg,#2563eb,#1d4ed8)',
      'color:#fff',
      'cursor:pointer',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'box-shadow:0 4px 20px rgba(37,99,235,.4)',
      'z-index:200',
      'transition:transform .2s,box-shadow .2s',
    ].join(';');

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'scale(1.1)';
      btn.style.boxShadow = '0 8px 28px rgba(37,99,235,.5)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'scale(1)';
      btn.style.boxShadow = '0 4px 20px rgba(37,99,235,.4)';
    });
    btn.addEventListener('click', () => {
      if (typeof navigateTo === 'function') {
        navigateTo('faq-center');
      }
    });

    document.body.appendChild(btn);
  }

  // Mount after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWidget);
  } else {
    mountWidget();
  }

  // Also try mounting after login when dashboard becomes visible
  const observer = new MutationObserver(() => {
    if (document.getElementById('dashboard-page')) mountWidget();
  });
  observer.observe(document.body, { childList: true, subtree: false });
})();

"use strict";
/**
 * faq-widget.js
 * Auth page: toggleAuthHelp() opens a static help panel.
 *
 * The old floating dashboard FAQ button has been replaced by the floating
 * Dikly AI assistant (#dai-fab in index.html, driven by faq-assistant.js).
 * FAQ Center remains available from the sidebar.
 */

// ── Auth-page help panel toggle ───────────────────────────────────────────────
window.toggleAuthHelp = function () {
  const panel = document.getElementById('auth-help-panel');
  if (!panel) return;
  panel.classList.toggle('hidden');
};

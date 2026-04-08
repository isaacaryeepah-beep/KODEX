// ══════════════════════════════════════════════════════════════════════════════
//  KODEX Attendance Code Service
//  Derives a rotating 6-digit code from a per-session HMAC seed.
//
//  Both the backend and the ESP32 firmware run this SAME formula independently
//  and arrive at the SAME code — no network round-trip needed. This is why
//  attendance can stay fast for 50+ students: the ESP32 just displays the code,
//  the backend verifies by re-deriving it, no DB lookup of issued codes.
//
//  Formula: HMAC-SHA256(seed, floor(unixSeconds / WINDOW_SECONDS)) → 6 digits
//
//  Anti-cheat properties:
//    - Code rotates every WINDOW_SECONDS (default 20s). A friend forwarding the
//      code over WhatsApp is racing the clock.
//    - We accept the CURRENT window and the PREVIOUS window so a student who
//      grabbed the code at second 19 isn't unfairly rejected at second 21.
//      That gives a ~20–40s real submission window.
//    - The seed is secret (per-session, never sent to the student). Without it
//      you can't brute-force the code — each code is one of 10^6 and each
//      window is independent.
// ══════════════════════════════════════════════════════════════════════════════

const crypto = require("crypto");

// How long each code is valid for, in seconds. 20s matches the spec
// ("rotate every 20-30 seconds"). Do NOT lower below ~10s: students on slow
// mobile data need time to type and submit.
const WINDOW_SECONDS = 20;

// How many previous windows to accept (grace period for slow networks / typing).
// 1 means: current window + 1 previous window = up to 40s effective validity.
const GRACE_WINDOWS = 1;

function _slotForTime(unixSeconds) {
  return Math.floor(unixSeconds / WINDOW_SECONDS);
}

function _deriveCode(seed, slot) {
  const h = crypto
    .createHmac("sha256", String(seed))
    .update(String(slot))
    .digest();
  // Take first 4 bytes as a 32-bit unsigned int, mod 1,000,000, zero-pad.
  const n = h.readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

/**
 * Return the current 6-digit code for a session.
 * Used by the lecturer dashboard endpoint and for debugging.
 */
function currentCodeForSession(session, nowMs = Date.now()) {
  if (!session || !session.esp32Seed) return null;
  const slot = _slotForTime(Math.floor(nowMs / 1000));
  return {
    code: _deriveCode(session.esp32Seed, slot),
    slot,
    windowSeconds: WINDOW_SECONDS,
    expiresInSeconds:
      WINDOW_SECONDS - (Math.floor(nowMs / 1000) % WINDOW_SECONDS),
  };
}

/**
 * Verify a student-submitted code against the session.
 * Returns { ok: true, slot } on success or { ok: false, reason } on failure.
 *
 * Accepts the current slot plus GRACE_WINDOWS previous slots. Never accepts
 * FUTURE slots (would let a student with a clock ahead of the server cheat).
 */
function verifyCodeForSession(session, submittedCode, nowMs = Date.now()) {
  if (!session || !session.esp32Seed) {
    return { ok: false, reason: "Session has no rotating code configured." };
  }
  if (!submittedCode || !/^\d{6}$/.test(String(submittedCode).trim())) {
    return { ok: false, reason: "Code must be 6 digits." };
  }

  const clean = String(submittedCode).trim();
  const currentSlot = _slotForTime(Math.floor(nowMs / 1000));

  for (let i = 0; i <= GRACE_WINDOWS; i++) {
    const slot = currentSlot - i;
    const expected = _deriveCode(session.esp32Seed, slot);
    // Timing-safe compare to avoid timing attacks on code guessing.
    if (
      expected.length === clean.length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(clean))
    ) {
      return { ok: true, slot, ageSlots: i };
    }
  }

  return { ok: false, reason: "Invalid or expired code. Ask your lecturer for the current code." };
}

module.exports = {
  WINDOW_SECONDS,
  GRACE_WINDOWS,
  currentCodeForSession,
  verifyCodeForSession,
};

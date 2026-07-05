"use strict";

/**
 * webPushProvider.js
 *
 * Provider implementation for browser Web Push (VAPID) — used for every
 * subscription created via `PushManager.subscribe()` in
 * src/public/js/app.js. Conforms to the provider interface consumed by
 * pushService.js: `{ isConfigured(), send(subscription, payloadString) }`.
 * `send` resolves on success and rejects with `.statusCode` set on
 * delivery failure (410/404 = subscription gone; the caller deletes it).
 */

const webpush = require("web-push");

let configured = false;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  // web-push validates the key format synchronously and throws if it's
  // malformed (wrong encoding, stray whitespace/quotes, standard base64
  // instead of URL-safe, etc.) — that must never crash the whole server at
  // boot. Treat a bad key the same as no key: push is skipped, everything
  // else keeps running.
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || "mailto:support@dikly.sbs",
      process.env.VAPID_PUBLIC_KEY.trim(),
      process.env.VAPID_PRIVATE_KEY.trim()
    );
    configured = true;
    console.log("[WebPush] ✓ Configured");
  } catch (err) {
    console.error("[WebPush] Invalid VAPID keys — push sends will be skipped:", err.message);
  }
} else {
  console.warn("[WebPush] VAPID keys not set — push sends will be skipped");
}

function send(subscription, payloadString) {
  return webpush.sendNotification(
    { endpoint: subscription.endpoint, keys: subscription.keys },
    payloadString
  );
}

module.exports = { name: "webpush", isConfigured: () => configured, send };

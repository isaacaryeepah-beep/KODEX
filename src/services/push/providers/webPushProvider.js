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
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:support@dikly.sbs",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  configured = true;
  console.log("[WebPush] ✓ Configured");
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

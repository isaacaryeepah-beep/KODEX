"use strict";

/**
 * fcmProvider.js
 *
 * Provider implementation for Firebase Cloud Messaging — used by any
 * subscription whose `provider` is `fcm-desktop` (the Electron desktop app,
 * registered via electron-push-receiver — see electron/main.js) or
 * `fcm-android` (reserved for a future native Android client). Conforms to
 * the same interface as webPushProvider.js: `{ isConfigured(), send(subscription, payloadString) }`.
 *
 * Unlike Web Push, FCM doesn't take an endpoint/keys pair — it takes a
 * single opaque registration token (`subscription.deviceToken`) obtained by
 * the client from Firebase and handed to POST /api/push/subscribe.
 */

// firebase-admin v9+ uses the modular API (separate subpath imports) rather
// than the old `admin.credential.cert()` / `admin.messaging()` namespace —
// require("firebase-admin") alone no longer exposes either.
const { initializeApp, cert } = require("firebase-admin/app");
const { getMessaging } = require("firebase-admin/messaging");

let configured = false;
let messaging = null;

if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
  try {
    // Render (and most hosts) store multi-line env vars with literal "\n"
    // sequences rather than real newlines — the private key PEM block needs
    // real ones or the key parses as garbage.
    const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n");
    const app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID.trim(),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL.trim(),
        privateKey,
      }),
    });
    messaging = getMessaging(app);
    configured = true;
    console.log("[FCM] ✓ Configured");
  } catch (err) {
    console.error("[FCM] Invalid Firebase Admin credentials — FCM sends will be skipped:", err.message);
  }
} else {
  console.warn("[FCM] FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY not set — FCM sends will be skipped");
}

// Errors that mean the token itself is dead — same 4xx-style contract
// pushService.js already expects from webPushProvider (statusCode 400-499
// means "delete the subscription, it will never succeed").
const DEAD_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
  "messaging/invalid-argument",
]);

async function send(subscription, payloadString) {
  if (!messaging) {
    const err = new Error("FCM is not configured");
    err.statusCode = 503;
    throw err;
  }
  if (!subscription.deviceToken) {
    const err = new Error("Subscription has no deviceToken");
    err.statusCode = 400;
    throw err;
  }

  const payload = JSON.parse(payloadString);
  try {
    // Data-only message: electron-push-receiver delivers the raw payload to
    // the renderer (NOTIFICATION_RECEIVED) rather than auto-displaying an OS
    // notification the way a browser's SW `push` event does, so every field
    // — including title/body — travels as `data` (FCM data payloads must be
    // flat string maps) and the client builds the notification itself.
    await messaging.send({
      token: subscription.deviceToken,
      data: {
        title: payload.title || "DIKLY",
        body: payload.body || "",
        url: payload.url || "/",
        tag: payload.tag || "dikly-notification",
        icon: payload.icon || "",
      },
    });
  } catch (err) {
    const mapped = new Error(err.message);
    mapped.statusCode = DEAD_TOKEN_CODES.has(err.code) ? 410 : 502;
    mapped.body = err.code || err.message;
    throw mapped;
  }
}

module.exports = { name: "fcm", isConfigured: () => configured, send };

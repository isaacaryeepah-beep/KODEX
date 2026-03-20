/**
 * webhooks.js
 * Public route — no auth middleware.
 * Paystack sends unauthenticated POST requests signed with HMAC-SHA512.
 */
const express = require("express");
const { paystackWebhook } = require("../controllers/webhookController");

const router = express.Router();

// Raw body is needed for signature verification — see server.js rawBody middleware
router.post("/paystack", paystackWebhook);

module.exports = router;

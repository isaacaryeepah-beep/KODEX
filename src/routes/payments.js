const express           = require("express");
const authenticate      = require("../middleware/auth");
const { requireRole }   = require("../middleware/role");
const paymentController = require("../controllers/paymentController");
const router            = express.Router();

// Webhook must be BEFORE authenticate (Paystack calls it without a token)
// and needs raw body — handled in app.js with express.raw for this path
router.post("/paystack/webhook", paymentController.paystackWebhook);

router.use(authenticate);

// Subscription info
router.get("/status",            paymentController.getSubscriptionStatus);
router.get("/plans",             paymentController.getPlans);
router.get("/user-subscription", paymentController.getUserSubscription);

// Paystack — semester plan only, GHS 300
router.get("/paystack/public-key", paymentController.getPaystackPublicKey);
router.post(
  "/paystack/initialize",
  requireRole("admin", "manager", "lecturer", "superadmin"),
  paymentController.initializePaystackSubscription
);
router.get(
  "/paystack/verify",
  requireRole("admin", "manager", "lecturer", "superadmin"),
  paymentController.verifyPaystackSubscription
);

module.exports = router;

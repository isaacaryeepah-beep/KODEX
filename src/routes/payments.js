const express = require("express");
const authenticate = require("../middleware/auth");
const { requireRole } = require("../middleware/role");
const paymentController = require("../controllers/paymentController");
const router = express.Router();

router.use(authenticate);

// ✅ ADD THESE TWO NEW ROUTES
router.get("/status", paymentController.getSubscriptionStatus);
router.get("/plans", paymentController.getPlans);

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
